import { createClient } from "npm:@supabase/supabase-js@2";
import forge from "npm:node-forge@1.3.1";

// ═══════════════════════════════════════════════════════════════
// WSFEv1 — FECAESolicitar
//
// Toma un comprobante 'pendiente' (o 'rechazado', para reintentar
// con el mismo número), arma el pedido con sus datos y el desglose
// de IVA/tributos ya calculado por preparar_comprobante(), y le pide
// el CAE a ARCA. Guarda el resultado en el comprobante y deja
// registro del intento en intento_arca (exigido por la RG 5852/2026).
//
// La parte de WSAA (conseguir el token) está duplicada acá a
// propósito, igual que en la función arca-wsaa: son ~60 líneas, y
// tres líneas repetidas es mejor que una abstracción prematura entre
// dos Edge Functions que se despliegan por separado.
// ═══════════════════════════════════════════════════════════════

/*
  CORS.

  Sin esto la función anda desde la consola pero NO desde el navegador:
  antes del POST el navegador manda un OPTIONS preguntando si tiene
  permiso, y si nadie le contesta bloquea la llamada. El error que ve la
  persona es "Failed to send a request to the Edge Function", que no
  dice nada sobre la causa real.

  El origen va en '*' porque acá no hay cookies ni sesión de navegador:
  la autorización viaja en el token y se verifica adentro. Sin token
  válido y sin el permiso de facturar, la función no hace nada.
*/
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function responder(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const WSAA = {
  homologacion: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
  produccion: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
} as const;
const WSFE = {
  homologacion: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
  produccion: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
} as const;
type Ambiente = keyof typeof WSFE;

function xmlUnescape(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlEscape(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── WSAA: conseguir token+sign, cacheados en arca_ticket_acceso ──

function construirTRA(servicio: string): string {
  const ahora = Date.now();
  const generationTime = new Date(ahora - 10 * 60 * 1000).toISOString().replace(/\.\d+Z$/, "Z");
  const expirationTime = new Date(ahora + 10 * 60 * 1000).toISOString().replace(/\.\d+Z$/, "Z");
  const uniqueId = Math.floor(ahora / 1000);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<loginTicketRequest version="1.0">\n  <header>\n    <uniqueId>${uniqueId}</uniqueId>\n    <generationTime>${generationTime}</generationTime>\n    <expirationTime>${expirationTime}</expirationTime>\n  </header>\n  <service>${servicio}</service>\n</loginTicketRequest>`;
}

function firmarCms(xml: string, certPem: string, keyPem: string): string {
  const cert = forge.pki.certificateFromPem(certPem);
  const key = forge.pki.privateKeyFromPem(keyPem);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(xml, "utf8");
  p7.addCertificate(cert);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign({ detached: false });
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.encode64(der);
}

async function pedirTicketAArca(
  servicio: string,
  ambiente: Ambiente,
  certPem: string,
  keyPem: string,
  senal: AbortSignal,
) {
  const tra = construirTRA(servicio);
  const cms = firmarCms(tra, certPem, keyPem);
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cms}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;

  const respuesta = await fetch(WSAA[ambiente], {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
    body: envelope,
    signal: senal,
  });
  const texto = await respuesta.text();

  const fault = texto.match(/<faultstring>([\s\S]*?)<\/faultstring>/);
  if (fault) throw new Error(`ARCA (WSAA) rechazó el pedido: ${xmlUnescape(fault[1])}`);

  const contenedor = texto.match(/<loginCmsReturn>([\s\S]*?)<\/loginCmsReturn>/);
  if (!contenedor) throw new Error(`Respuesta de WSAA sin loginCmsReturn: ${texto.slice(0, 500)}`);
  const inner = xmlUnescape(contenedor[1]);

  const token = inner.match(/<token>([^<]+)<\/token>/)?.[1];
  const sign = inner.match(/<sign>([^<]+)<\/sign>/)?.[1];
  const expirationTime = inner.match(/<expirationTime>([^<]+)<\/expirationTime>/)?.[1];
  if (!token || !sign || !expirationTime) {
    throw new Error(`No se pudo leer token/sign/expirationTime de WSAA: ${inner.slice(0, 500)}`);
  }
  return { token, sign, expira_en: expirationTime };
}

type Ticket = { token: string; sign: string; expira_en: string };

// deno-lint-ignore no-explicit-any
async function leerTicket(supabase: any, servicio: string, ambiente: Ambiente): Promise<Ticket | null> {
  const { data } = await supabase
    .from("arca_ticket_acceso")
    .select("token, sign, expira_en")
    .eq("servicio", servicio)
    .eq("ambiente", ambiente)
    .maybeSingle();
  return data as Ticket | null;
}

function msHastaQueVence(t: Ticket | null): number {
  return t ? new Date(t.expira_en).getTime() - Date.now() : 0;
}

/** WSAA contesta así cuando ya entregó un permiso que todavía no venció. */
function esPermisoYaVigente(err: unknown): boolean {
  return /ya posee un TA valido|alreadyAuthenticated/i.test(err instanceof Error ? err.message : String(err));
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function obtenerTicket(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  servicio: string,
  ambiente: Ambiente,
  certPem: string,
  keyPem: string,
  plazo: number,
) {
  const cacheado = await leerTicket(supabase, servicio, ambiente);
  if (msHastaQueVence(cacheado) > 5 * 60 * 1000) return cacheado as Ticket;

  let nuevo: Ticket;
  try {
    nuevo = await pedirTicketAArca(servicio, ambiente, certPem, keyPem, senalHasta(plazo));
  } catch (e) {
    if (!esPermisoYaVigente(e)) throw e;
    /*
      ARCA no entrega un permiso nuevo mientras el anterior siga vigente,
      y contesta «ya posee un TA valido». Pasa en dos casos, y en los dos
      el permiso que sirve ya existe:

      - En los últimos cinco minutos del guardado. Acá se lo da por
        vencido antes de tiempo, pero para ARCA todavía vale: se lo usa
        hasta el final.
      - Cuando otro pedido lo renovó al mismo tiempo. El 01/10 a las 9 la
        tarea diaria mandó dos pedidos juntos y uno falló así; lo mismo
        le pasaría a la primera factura del día de dos computadoras a la
        vez. El que ganó lo guarda en un instante: se lo vuelve a leer.
    */
    if (msHastaQueVence(cacheado) > 10_000) return cacheado as Ticket;
    while (plazo - Date.now() > 1_500) {
      await esperar(1_000);
      const otro = await leerTicket(supabase, servicio, ambiente);
      if (otro && otro.token !== cacheado?.token && msHastaQueVence(otro) > 0) return otro;
    }
    throw new Error(
      "ARCA dice que el sistema ya tiene un permiso vigente, pero no quedó guardado: " +
        "se habrá cortado un pedido a mitad de camino. ARCA no entrega otro hasta que ese " +
        "venza, a más tardar en doce horas.",
    );
  }

  await supabase.from("arca_ticket_acceso").upsert({
    servicio,
    ambiente,
    token: nuevo.token,
    sign: nuevo.sign,
    generado_en: new Date().toISOString(),
    expira_en: nuevo.expira_en,
  });
  return nuevo;
}

/*
  Tiempo máximo de espera. Sin esto, un ARCA que acepta la conexión y
  no contesta deja al cajero mirando la pantalla sin fin, y —peor— no
  produce nunca el intento fallido que después habilita la
  contingencia con CAEA.
*/
let TIMEOUT_MS = 20000;

/*
  Y el plazo de todo el pedido, contado desde que llega.

  Cada llamada a ARCA tiene su tiempo máximo, pero son tres —el permiso
  de WSAA, el último autorizado y el CAE— y sumadas pasaban del minuto;
  el permiso, además, no tenía ninguno. La app no espera tanto: se
  rendía a los doce segundos y le mostraba al cajero «la factura quedó
  pendiente» mientras acá el CAE salía igual, sin nadie esperándolo. Y
  ese corte lo tomaba como caída de internet: la venta siguiente se
  cobraba sin subir y la caja la facturaba con CAEA.

  La regla es que esta función conteste SIEMPRE antes de que la app deje
  de esperar, así lo que ve el cajero es lo que pasó. Veinte segundos
  alcanzan para el peor caso medido el 01/10 —el permiso nuevo de WSAA
  de homologación tarda unos diez, y el resto del pedido tres y medio—,
  y la app espera treinta (LIMITE_ARCA_MS, en app/src/lib/funcionesDeArca.ts).
  Si este número sube, aquél tiene que subir también.

  No sale de la configuración a propósito: la app tiene que conocerlo de
  antemano, y un valor que cambia sin que la app se entere rompe la regla.
*/
const PLAZO_ARCA_MS = 20_000;

/*
  El CAE no se pide con lo que sobra.

  Si ARCA tardó tanto en los pasos previos que quedan menos de cinco
  segundos, mandarlo es arriesgarse a cortarlo mientras ARCA lo autoriza:
  quedaría autorizado allá y pendiente acá, y el reintento lo
  renumeraría y pediría otro. Mejor no mandarlo, anotarlo como demora
  de ARCA y que se reintente.
*/
const MINIMO_PARA_EL_CAE_MS = 5_000;

/** Lo que diga la configuración para cada llamada, pero nunca más allá del plazo. */
function senalHasta(plazo: number): AbortSignal {
  return AbortSignal.timeout(Math.max(0, Math.min(TIMEOUT_MS, plazo - Date.now())));
}

/*
  Distingue "ARCA no está" de "ARCA dijo que no".

  Es la distinción de la que depende todo el régimen de contingencia:
  el CAEA sólo se puede usar cuando el servicio no responde. Si ARCA
  contestó un rechazo, el problema es del comprobante y el CAEA no lo
  arregla.
*/
function esCaidaDeArca(err: unknown): boolean {
  if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) return true;
  if (err instanceof TypeError) return true;
  const m = err instanceof Error ? err.message : String(err);
  return /timeout|timed out|network|fetch failed|connection|ECONN|socket|abort/i.test(m);
}

function esTimeout(err: unknown): boolean {
  if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) return true;
  return /timeout|timed out/i.test(err instanceof Error ? err.message : String(err));
}

// ── WSFEv1: armar y mandar el pedido de CAE ──

function num2(n: unknown): string {
  return Number(n ?? 0).toFixed(2);
}

function fecha8(iso: string): string {
  return iso.replaceAll("-", "");
}

interface Alicuota {
  alicuota_iva_id: number;
  base_imponible: number;
  importe: number;
}
interface Tributo {
  tributo_id: number;
  descripcion: string;
  base_imponible: number;
  alicuota: number;
  importe: number;
}
interface Asociado {
  tipo_comprobante_id: number;
  punto_venta_numero: number;
  numero: number;
  fecha: string | null;
}
interface Comprobante {
  id: string;
  numero: number;
  tipo_comprobante_id: number;
  concepto: number;
  fecha: string;
  receptor_tipo_documento_id: number;
  receptor_documento: string | null;
  receptor_condicion_iva_id: number;
  neto_gravado: number;
  neto_no_gravado: number;
  exento: number;
  iva_total: number;
  tributos_total: number;
  total: number;
  moneda: string;
  cotizacion: number;
  punto_venta_id: string;
  punto_venta: { numero: number } | { numero: number }[];
}

function numeroPuntoVenta(comp: Comprobante): number {
  const pv = comp.punto_venta;
  return Array.isArray(pv) ? pv[0].numero : pv.numero;
}

function armarDetalle(
  comp: Comprobante,
  alicuotas: Alicuota[],
  tributos: Tributo[],
  asociados: Asociado[],
): string {
  const docNro = comp.receptor_documento?.trim() ? comp.receptor_documento.trim() : "0";
  let xml = "";
  xml += `<ar:Concepto>${comp.concepto}</ar:Concepto>`;
  xml += `<ar:DocTipo>${comp.receptor_tipo_documento_id}</ar:DocTipo>`;
  xml += `<ar:DocNro>${docNro}</ar:DocNro>`;
  xml += `<ar:CbteDesde>${comp.numero}</ar:CbteDesde>`;
  xml += `<ar:CbteHasta>${comp.numero}</ar:CbteHasta>`;
  xml += `<ar:CbteFch>${fecha8(comp.fecha)}</ar:CbteFch>`;
  xml += `<ar:ImpTotal>${num2(comp.total)}</ar:ImpTotal>`;
  xml += `<ar:ImpTotConc>${num2(comp.neto_no_gravado)}</ar:ImpTotConc>`;
  xml += `<ar:ImpNeto>${num2(comp.neto_gravado)}</ar:ImpNeto>`;
  xml += `<ar:ImpOpEx>${num2(comp.exento)}</ar:ImpOpEx>`;
  xml += `<ar:ImpTrib>${num2(comp.tributos_total)}</ar:ImpTrib>`;
  xml += `<ar:ImpIVA>${num2(comp.iva_total)}</ar:ImpIVA>`;
  xml += `<ar:MonId>${comp.moneda}</ar:MonId>`;
  xml += `<ar:MonCotiz>${comp.cotizacion}</ar:MonCotiz>`;
  xml += `<ar:CondicionIVAReceptorId>${comp.receptor_condicion_iva_id}</ar:CondicionIVAReceptorId>`;
  /*
    Comprobantes asociados. ARCA los exige en toda nota de crédito o
    débito: sin esto la nota se rechaza con el código 10062, porque para
    ARCA una nota que no dice qué factura corrige no corrige nada.

    Va antes de Tributos e Iva porque el orden del XSD no es negociable.
  */
  if (asociados.length) {
    xml += "<ar:CbtesAsoc>";
    for (const a of asociados) {
      xml += `<ar:CbteAsoc><ar:Tipo>${a.tipo_comprobante_id}</ar:Tipo>` +
        `<ar:PtoVta>${a.punto_venta_numero}</ar:PtoVta><ar:Nro>${a.numero}</ar:Nro>` +
        (a.fecha ? `<ar:CbteFch>${fecha8(a.fecha)}</ar:CbteFch>` : "") +
        `</ar:CbteAsoc>`;
    }
    xml += "</ar:CbtesAsoc>";
  }
  if (tributos.length) {
    xml += "<ar:Tributos>";
    for (const t of tributos) {
      xml +=
        `<ar:Tributo><ar:Id>${t.tributo_id}</ar:Id><ar:Desc>${xmlEscape(t.descripcion)}</ar:Desc>` +
        `<ar:BaseImp>${num2(t.base_imponible)}</ar:BaseImp><ar:Alic>${num2(t.alicuota)}</ar:Alic>` +
        `<ar:Importe>${num2(t.importe)}</ar:Importe></ar:Tributo>`;
    }
    xml += "</ar:Tributos>";
  }
  if (alicuotas.length) {
    xml += "<ar:Iva>";
    for (const a of alicuotas) {
      xml +=
        `<ar:AlicIva><ar:Id>${a.alicuota_iva_id}</ar:Id><ar:BaseImp>${num2(a.base_imponible)}</ar:BaseImp>` +
        `<ar:Importe>${num2(a.importe)}</ar:Importe></ar:AlicIva>`;
    }
    xml += "</ar:Iva>";
  }
  return xml;
}

async function pedirCae(
  comp: Comprobante,
  alicuotas: Alicuota[],
  tributos: Tributo[],
  asociados: Asociado[],
  ticket: { token: string; sign: string },
  cuit: string,
  ambiente: Ambiente,
  senal: AbortSignal,
) {
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECAESolicitar>
      <ar:Auth>
        <ar:Token>${ticket.token}</ar:Token>
        <ar:Sign>${ticket.sign}</ar:Sign>
        <ar:Cuit>${cuit}</ar:Cuit>
      </ar:Auth>
      <ar:FeCAEReq>
        <ar:FeCabReq>
          <ar:CantReg>1</ar:CantReg>
          <ar:PtoVta>${numeroPuntoVenta(comp)}</ar:PtoVta>
          <ar:CbteTipo>${comp.tipo_comprobante_id}</ar:CbteTipo>
        </ar:FeCabReq>
        <ar:FeDetReq>
          <ar:FECAEDetRequest>
            ${armarDetalle(comp, alicuotas, tributos, asociados)}
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>
  </soapenv:Body>
</soapenv:Envelope>`;

  const inicio = Date.now();
  const resp = await fetch(WSFE[ambiente], {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: '"http://ar.gov.afip.dif.FEV1/FECAESolicitar"',
    },
    body: envelope,
    signal: senal,
  });
  const texto = await resp.text();
  return { texto, duracion_ms: Date.now() - inicio, http: resp.status, request: envelope };
}

function bloque(texto: string, tag: string): string | null {
  const m = texto.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1] : null;
}

/*
  ARCA devuelve los motivos en dos lugares distintos: <Obs> adentro del
  detalle del comprobante, y <Err> en un bloque <Errors> aparte.

  Cuando rechaza por numeración usa el segundo. Como antes sólo se leía
  el primero, el comprobante quedaba "rechazado" sin ningún motivo, y la
  pantalla no podía decir qué había pasado.
*/
function observaciones(bloqueTexto: string): { codigo: string; mensaje: string }[] {
  const obs: { codigo: string; mensaje: string }[] = [];
  const re = /<(?:Obs|Err)>([\s\S]*?)<\/(?:Obs|Err)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bloqueTexto))) {
    const codigo = m[1].match(/<Code>([^<]*)<\/Code>/)?.[1] ?? "";
    const mensaje = xmlUnescape(m[1].match(/<Msg>([^<]*)<\/Msg>/)?.[1] ?? "");
    obs.push({ codigo, mensaje });
  }
  return obs;
}

function mensajesDe(bloqueTexto: string): string {
  return observaciones(bloqueTexto)
    .map((o) => `${o.codigo}: ${o.mensaje}`)
    .join(" | ");
}

/*
  Le pregunta a ARCA cuál fue el último comprobante que autorizó.

  Es el método que la propia ARCA nombra en el error 10016. Sin esta
  consulta, nuestro contador y el de ARCA se separan apenas falla un
  pedido y no se vuelven a juntar solos: el comprobante siguiente pide
  un número que ARCA no espera, y se rechaza también.
*/
async function ultimoAutorizado(
  ptoVta: number,
  cbteTipo: number,
  ticket: { token: string; sign: string },
  cuit: string,
  ambiente: Ambiente,
  senal: AbortSignal,
): Promise<number> {
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Body>
    <ar:FECompUltimoAutorizado>
      <ar:Auth><ar:Token>${ticket.token}</ar:Token><ar:Sign>${ticket.sign}</ar:Sign><ar:Cuit>${cuit}</ar:Cuit></ar:Auth>
      <ar:PtoVta>${ptoVta}</ar:PtoVta>
      <ar:CbteTipo>${cbteTipo}</ar:CbteTipo>
    </ar:FECompUltimoAutorizado>
  </soapenv:Body>
</soapenv:Envelope>`;

  const resp = await fetch(WSFE[ambiente], {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: '"http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado"',
    },
    body: envelope,
    signal: senal,
  });
  const texto = await resp.text();

  const errores = bloque(texto, "Errors");
  if (errores) {
    throw new Error(`ARCA no pudo decir cuál fue el último comprobante: ${mensajesDe(errores)}`);
  }

  const nro = texto.match(/<CbteNro>(\d+)<\/CbteNro>/)?.[1];
  if (nro === undefined) throw new Error("ARCA no devolvió el último comprobante autorizado.");
  return Number(nro);
}

Deno.serve(async (req: Request) => {
  // El navegador pregunta primero si puede. Va antes que todo lo demas.
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Desde que llega, no desde la primera llamada a ARCA: la app cuenta
  // su espera desde que manda el pedido.
  const plazo = Date.now() + PLAZO_ARCA_MS;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let comprobanteId: string | undefined;
  try {
    /*
      AUTORIZACIÓN — no alcanza con que el JWT sea válido.

      Esta función habla con la base usando la service role, que ignora
      RLS por diseño (tiene que escribir el CAE sin depender de quién
      llamó). Supabase solo verifica que el token sea legítimo, no que
      quien lo trae pueda facturar. Sin este chequeo, un vendedor
      autenticado podría emitir comprobantes fiscales.

      Se abre un segundo cliente con el token de quien llama, y se le
      pregunta a la base por su propio permiso.
    */
    const authHeader = req.headers.get("Authorization") ?? "";
    const comoUsuario = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: puedeEmitir } = await comoUsuario.rpc("tiene_permiso", {
      p_clave: "facturacion.emitir",
    });
    if (!puedeEmitir) {
      return responder({ ok: false, error: "No tenés permiso para emitir comprobantes." }, 403);
    }

    // Quién pidió el CAE. La RG 5852/2026 exige dejar asentado el
    // responsable de cada intento, no solo la fecha y la causa.
    const { data: auth } = await comoUsuario.auth.getUser();
    const { data: usuario } = auth?.user
      ? await supabase.from("usuario").select("id").eq("auth_user_id", auth.user.id).maybeSingle()
      : { data: null };
    const usuarioId = usuario?.id ?? null;

    const body = await req.json().catch(() => ({}));
    comprobanteId = body.comprobante_id;
    if (!comprobanteId) {
      return responder({ ok: false, error: "Falta comprobante_id." }, 400);
    }

    const certPem = Deno.env.get("ARCA_CERT_PEM");
    const keyPem = Deno.env.get("ARCA_KEY_PEM");
    if (!certPem || !keyPem) {
      throw new Error("Faltan los secrets ARCA_CERT_PEM / ARCA_KEY_PEM en el proyecto.");
    }

    const { data: config } = await supabase
      .from("configuracion")
      .select("clave, valor")
      .in("clave", ["comercio.cuit", "arca.ambiente", "arca.timeout_segundos"]);
    const cuit = config?.find((c) => c.clave === "comercio.cuit")?.valor as string;
    const ambiente = (config?.find((c) => c.clave === "arca.ambiente")?.valor ?? "homologacion") as Ambiente;
    if (!cuit) throw new Error("Falta 'comercio.cuit' en configuracion.");
    const segundos = Number(config?.find((c) => c.clave === "arca.timeout_segundos")?.valor ?? 20);
    if (Number.isFinite(segundos) && segundos > 0) TIMEOUT_MS = segundos * 1000;

    const { data: comp, error: errComp } = await supabase
      .from("comprobante")
      .select(
        "id, numero, tipo_comprobante_id, concepto, fecha, receptor_tipo_documento_id, " +
          "receptor_documento, receptor_condicion_iva_id, neto_gravado, neto_no_gravado, exento, " +
          "iva_total, tributos_total, total, moneda, cotizacion, estado, punto_venta_id, " +
          "punto_venta:punto_venta_id(numero)",
      )
      .eq("id", comprobanteId)
      .single();
    if (errComp || !comp) throw new Error(`No se encontró el comprobante: ${errComp?.message ?? comprobanteId}`);
    if (!["pendiente", "rechazado"].includes(comp.estado)) {
      throw new Error(`El comprobante está en estado '${comp.estado}', no corresponde pedir CAE.`);
    }

    const [{ data: alicuotas }, { data: tributos }, { data: asociados }] = await Promise.all([
      supabase
        .from("comprobante_alicuota")
        .select("alicuota_iva_id, base_imponible, importe")
        .eq("comprobante_id", comprobanteId),
      supabase
        .from("comprobante_tributo")
        .select("tributo_id, descripcion, base_imponible, alicuota, importe")
        .eq("comprobante_id", comprobanteId),
      supabase
        .from("vista_comprobante_asociado")
        .select("tipo_comprobante_id, punto_venta_numero, numero, fecha")
        .eq("comprobante_id", comprobanteId),
    ]);

    /*
      Toda llamada a ARCA que falle POR CAÍDA queda anotada.

      Antes, si ARCA no respondía, la función devolvía el error y no
      dejaba rastro: el intento sólo se registraba cuando ARCA
      contestaba algo. Justo al revés de lo que hace falta — la
      RG 5852/2026 pide poder demostrar la indisponibilidad, y la
      contingencia con CAEA se habilita contando estos intentos.
    */
    const conRegistro = async <T>(operacion: string, fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } catch (e) {
        if (esCaidaDeArca(e)) {
          await supabase.from("intento_arca").insert({
            comprobante_id: comprobanteId,
            punto_venta_id: comp.punto_venta_id,
            operacion,
            resultado: esTimeout(e) ? "timeout" : "error",
            error_mensaje: e instanceof Error ? e.message : String(e),
            usuario_id: usuarioId,
          });
        }
        throw e;
      }
    };

    const ticket = await conRegistro(
      "WSAA",
      () => obtenerTicket(supabase, "wsfe", ambiente, certPem, keyPem, plazo),
    );

    /*
      Antes de pedir nada, alinear con ARCA.

      ARCA exige numeración estricta y sin huecos, y rechaza cualquier
      comprobante que no sea el siguiente al último que autorizó. Basta
      que un pedido falle para que los dos contadores se separen y todo
      lo que venga después se rechace en cadena.

      Preguntarle a ARCA y usar su número + 1 hace que la numeración se
      corrija sola, sin que nadie tenga que intervenir. De paso se
      corrige la fecha si la venta es vieja: ARCA no toma una fecha de
      hace once días, y el comprobante se está emitiendo hoy.
    */
    const pvNumero = numeroPuntoVenta(comp as unknown as Comprobante);
    const ultimo = await conRegistro(
      "FECompUltimoAutorizado",
      () =>
        ultimoAutorizado(
          pvNumero,
          comp.tipo_comprobante_id as number,
          ticket,
          cuit,
          ambiente,
          senalHasta(plazo),
        ),
    );

    const { data: alineado, error: errAlinear } = await supabase
      .rpc("alinear_numeracion_comprobante", {
        p_comprobante_id: comprobanteId,
        p_ultimo_arca: ultimo,
      })
      .single();

    if (errAlinear) throw new Error(`No se pudo alinear la numeración: ${errAlinear.message}`);

    const compAlineado = {
      ...comp,
      numero: (alineado as { numero: number }).numero,
      fecha: (alineado as { fecha: string }).fecha,
    };

    const resultado = await conRegistro(
      "FECAESolicitar",
      () => {
        const restante = plazo - Date.now();
        if (restante < MINIMO_PARA_EL_CAE_MS) {
          // Cuenta como demora de ARCA, que es lo que fue: no se mandó nada.
          return Promise.reject(
            new DOMException(
              `ARCA tardó demasiado en los pasos anteriores y no quedó tiempo para pedir el CAE ` +
                `sin arriesgar cortarlo a mitad de camino (quedaban ${Math.max(0, restante)} ms). ` +
                `No se mandó: se puede reintentar.`,
              "TimeoutError",
            ),
          );
        }
        return pedirCae(
          compAlineado as unknown as Comprobante,
          alicuotas ?? [],
          tributos ?? [],
          asociados ?? [],
          ticket,
          cuit,
          ambiente,
          senalHasta(plazo),
        );
      },
    );

    const fault = resultado.texto.match(/<faultstring>([\s\S]*?)<\/faultstring>/);
    if (fault) throw new Error(`ARCA (WSFEv1) rechazó el pedido: ${xmlUnescape(fault[1])}`);

    const detalleResp = bloque(resultado.texto, "FECAEDetResponse");
    if (!detalleResp) {
      // Error sistémico (auth, formato, etc.), no una autorización/rechazo puntual.
      const erroresBloque = bloque(resultado.texto, "Errors") ?? "";
      const errores = observaciones(erroresBloque.replace(/<Err>/g, "<Obs>").replace(/<\/Err>/g, "</Obs>"));
      await supabase.from("intento_arca").insert({
        comprobante_id: comprobanteId,
        punto_venta_id: comp.punto_venta_id,
        operacion: "FECAESolicitar",
        resultado: "error",
        error_mensaje: errores.map((e) => `${e.codigo}: ${e.mensaje}`).join(" | ") || "Respuesta sin FECAEDetResponse",
        request: { xml: resultado.request },
        response: { xml: resultado.texto },
        duracion_ms: resultado.duracion_ms,
        usuario_id: usuarioId,
      });
      throw new Error(errores.map((e) => `${e.codigo}: ${e.mensaje}`).join(" | ") || "ARCA no devolvió un detalle de respuesta.");
    }

    const resultadoDetalle = detalleResp.match(/<Resultado>([^<]+)<\/Resultado>/)?.[1] ?? "";
    const cae = detalleResp.match(/<CAE>([^<]+)<\/CAE>/)?.[1] ?? null;
    const caeFchVto = detalleResp.match(/<CAEFchVto>([^<]+)<\/CAEFchVto>/)?.[1] ?? null;

    /*
      Los motivos pueden venir en el detalle o en el bloque <Errors>
      que va aparte. Se juntan los dos: si sólo se mira uno, un rechazo
      queda sin explicación y no hay forma de saber qué corregir.
    */
    const obs = [
      ...observaciones(detalleResp),
      ...observaciones(bloque(resultado.texto, "Errors") ?? ""),
    ];

    const aprobado = resultadoDetalle === "A" && !!cae;

    await supabase.from("intento_arca").insert({
      comprobante_id: comprobanteId,
      punto_venta_id: comp.punto_venta_id,
      operacion: "FECAESolicitar",
      resultado: aprobado ? "ok" : "rechazado",
      error_codigo: aprobado ? null : obs.map((o) => o.codigo).join(","),
      error_mensaje: aprobado ? null : obs.map((o) => o.mensaje).join(" | "),
      request: { xml: resultado.request },
      response: { xml: resultado.texto },
      duracion_ms: resultado.duracion_ms,
      usuario_id: usuarioId,
    });

    /*
      Se escribe sólo si el comprobante sigue esperando ESTE pedido: el
      mismo estado y el mismo número que tenía cuando se le preguntó a
      ARCA.

      Mientras ARCA contestaba pudo pasar otra cosa: que se lo emitiera
      por contingencia con CAEA, o que otro pedido lo renumerara o lo
      autorizara antes. Pisarlo dejaría un comprobante con el número de
      un punto de venta y el CAE de otro, o un autorizado vuelto a
      «rechazado» por una respuesta que llegó tarde. Lo que ARCA contestó
      ya quedó en intento_arca, con el pedido y la respuesta enteros.
    */
    const caeVenc = caeFchVto
      ? `${caeFchVto.slice(0, 4)}-${caeFchVto.slice(4, 6)}-${caeFchVto.slice(6, 8)}`
      : null;
    const { data: escrito, error: errEscribir } = await supabase
      .from("comprobante")
      .update(
        aprobado
          ? {
            estado: "autorizado",
            cae,
            cae_vencimiento: caeVenc,
            arca_resultado: "A",
            arca_observaciones: obs.length ? obs : null,
            autorizado_en: new Date().toISOString(),
          }
          : {
            estado: "rechazado",
            arca_resultado: "R",
            arca_observaciones: obs.length ? obs : null,
          },
      )
      .eq("id", comprobanteId)
      .eq("numero", compAlineado.numero)
      .in("estado", ["pendiente", "rechazado"])
      .select("id");
    if (errEscribir) throw new Error(`ARCA contestó pero no se pudo guardar: ${errEscribir.message}`);

    if (!escrito?.length) {
      const { data: actual } = await supabase
        .from("comprobante")
        .select("estado, numero, cae")
        .eq("id", comprobanteId)
        .single();
      if (aprobado) {
        throw new Error(
          `ARCA autorizó el número ${compAlineado.numero} con el CAE ${cae}, pero mientras tanto ` +
            `el comprobante pasó a '${actual?.estado}' con el número ${actual?.numero}. No se lo tocó: ` +
            `hay que revisarlo, porque para ARCA ese número quedó emitido.`,
        );
      }
      // Un rechazo que llega tarde no cambia lo que ya se resolvió por otro lado.
      if (actual?.estado === "autorizado") {
        return responder({ ok: true, aprobado: true, cae: actual.cae, observaciones: [] });
      }
      throw new Error(`El comprobante ya está '${actual?.estado}': esta respuesta de ARCA llegó tarde y no cambia nada.`);
    }

    return responder({ ok: true, aprobado, cae, observaciones: obs });
  } catch (err) {
    return responder({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
