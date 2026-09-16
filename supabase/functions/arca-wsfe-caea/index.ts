import { createClient } from "npm:@supabase/supabase-js@2";
import forge from "npm:node-forge@1.3.1";

// ═══════════════════════════════════════════════════════════════
// WSFEv1 — CAEA (contingencia)
//
// Cuatro operaciones, las cuatro contra el mismo web service:
//
//   solicitar      FECAEASolicitar            pedir el código de la quincena
//   consultar      FECAEAConsultar            recuperar uno ya otorgado
//   informar       FECAEARegInformativo       decirle a ARCA qué se emitió
//   sin_movimiento FECAEASinMovimientoInformar  decirle que no se usó
//
// Y una consulta que no cambia nada:
//
//   puntos_venta   FEParamGetPtosVenta        qué puntos de venta ve ARCA
//
// El orden importa en el tiempo: el CAEA se pide ANTES del corte, se
// usa DURANTE, y se informa DESPUÉS. Pedirlo mientras ARCA está caído
// no sirve — pedirlo también necesita a ARCA.
//
// La parte de WSAA está duplicada acá a propósito, igual que en
// arca-wsfe-solicitar-cae: son ~60 líneas, y tres líneas repetidas es
// mejor que una abstracción prematura entre Edge Functions que se
// despliegan por separado.
// ═══════════════════════════════════════════════════════════════

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tarea-secreto",
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

// ── WSAA ──

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

async function pedirTicketAArca(servicio: string, ambiente: Ambiente, certPem: string, keyPem: string) {
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

// deno-lint-ignore no-explicit-any
async function obtenerTicket(supabase: any, servicio: string, ambiente: Ambiente, certPem: string, keyPem: string) {
  const { data: cacheado } = await supabase
    .from("arca_ticket_acceso")
    .select("token, sign, expira_en")
    .eq("servicio", servicio)
    .eq("ambiente", ambiente)
    .maybeSingle();

  const vigente = !!cacheado && new Date(cacheado.expira_en).getTime() - Date.now() > 5 * 60 * 1000;
  if (vigente) return cacheado as { token: string; sign: string; expira_en: string };

  const nuevo = await pedirTicketAArca(servicio, ambiente, certPem, keyPem);
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

// ── Utilidades ──

function num2(n: unknown): string {
  return Number(n ?? 0).toFixed(2);
}

function fecha8(iso: string): string {
  return iso.replaceAll("-", "");
}

/** '20260901' → '2026-09-01'. ARCA devuelve las fechas pegadas. */
function fechaIso(f: string | null | undefined): string | null {
  if (!f || f.length < 8) return null;
  return `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}`;
}

function bloque(texto: string, tag: string): string | null {
  const m = texto.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1] : null;
}

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

function mensajesDe(obs: { codigo: string; mensaje: string }[]): string {
  return obs.map((o) => `${o.codigo}: ${o.mensaje}`).join(" | ");
}

/*
  Comparación que no delata el secreto por el tiempo que tarda.

  Comparar con === corta apenas encuentra el primer carácter distinto,
  y esa diferencia de microsegundos, medida muchas veces, permite ir
  adivinando el secreto de a un carácter. Acá siempre se recorre todo.
*/
function igualesEnTiempoConstante(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diferencia = 0;
  for (let i = 0; i < ea.length; i++) diferencia |= ea[i] ^ eb[i];
  return diferencia === 0;
}

function auth(ticket: { token: string; sign: string }, cuit: string): string {
  return `<ar:Auth><ar:Token>${ticket.token}</ar:Token><ar:Sign>${ticket.sign}</ar:Sign><ar:Cuit>${cuit}</ar:Cuit></ar:Auth>`;
}

async function llamar(ambiente: Ambiente, operacion: string, cuerpo: string) {
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Header/>
  <soapenv:Body>${cuerpo}</soapenv:Body>
</soapenv:Envelope>`;

  const inicio = Date.now();
  const resp = await fetch(WSFE[ambiente], {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: `"http://ar.gov.afip.dif.FEV1/${operacion}"`,
    },
    body: envelope,
  });
  const texto = await resp.text();

  const fault = texto.match(/<faultstring>([\s\S]*?)<\/faultstring>/);
  if (fault) throw new Error(`ARCA (WSFEv1) rechazó el pedido: ${xmlUnescape(fault[1])}`);

  return { texto, duracion_ms: Date.now() - inicio, request: envelope };
}

// ── La quincena a la que pertenece una fecha ──

interface Quincena {
  periodo: number;
  orden: 1 | 2;
}

function quincenaDe(f: Date): Quincena {
  const periodo = f.getUTCFullYear() * 100 + (f.getUTCMonth() + 1);
  return { periodo, orden: f.getUTCDate() <= 15 ? 1 : 2 };
}

function quincenaSiguiente(q: Quincena): Quincena {
  if (q.orden === 1) return { periodo: q.periodo, orden: 2 };
  const anio = Math.floor(q.periodo / 100);
  const mes = q.periodo % 100;
  return mes === 12 ? { periodo: (anio + 1) * 100 + 1, orden: 1 } : { periodo: anio * 100 + mes + 1, orden: 1 };
}

// ── FECAEASolicitar / FECAEAConsultar ──

interface DatosCaea {
  codigo: string;
  periodo: number;
  orden: number;
  fecha_desde: string;
  fecha_hasta: string;
  fecha_tope_informar: string | null;
  fecha_proceso: string | null;
}

function leerResultGet(texto: string): DatosCaea | null {
  const rg = bloque(texto, "ResultGet");
  if (!rg) return null;
  const codigo = rg.match(/<CAEA>([^<]+)<\/CAEA>/)?.[1];
  if (!codigo) return null;
  const desde = fechaIso(rg.match(/<FchVigDesde>([^<]+)<\/FchVigDesde>/)?.[1]);
  const hasta = fechaIso(rg.match(/<FchVigHasta>([^<]+)<\/FchVigHasta>/)?.[1]);
  if (!desde || !hasta) return null;
  return {
    codigo,
    periodo: Number(rg.match(/<Periodo>([^<]+)<\/Periodo>/)?.[1] ?? 0),
    orden: Number(rg.match(/<Orden>([^<]+)<\/Orden>/)?.[1] ?? 0),
    fecha_desde: desde,
    fecha_hasta: hasta,
    fecha_tope_informar: fechaIso(rg.match(/<FchTopeInf>([^<]+)<\/FchTopeInf>/)?.[1]),
    fecha_proceso: rg.match(/<FchProceso>([^<]+)<\/FchProceso>/)?.[1] ?? null,
  };
}

// ── FECAEARegInformativo ──

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
  caea_id: string | null;
  punto_venta: { numero: number } | { numero: number }[];
  caea: { codigo: string } | { codigo: string }[] | null;
}

/*
  Le pregunta a ARCA cuál fue el último comprobante que registró para
  ese punto de venta y tipo.

  Es el método que la propia ARCA nombra en el error 703, igual que
  nombra el 10016 en el circuito del CAE.
*/
async function ultimoRegistrado(
  ptoVta: number,
  cbteTipo: number,
  ticket: { token: string; sign: string },
  cuit: string,
  ambiente: Ambiente,
): Promise<number | null> {
  try {
    const r = await llamar(
      ambiente,
      "FECompUltimoAutorizado",
      `<ar:FECompUltimoAutorizado>${auth(ticket, cuit)}` +
        `<ar:PtoVta>${ptoVta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo>` +
        `</ar:FECompUltimoAutorizado>`,
    );
    if (bloque(r.texto, "Errors")) return null;
    const nro = r.texto.match(/<CbteNro>(\d+)<\/CbteNro>/)?.[1];
    return nro === undefined ? null : Number(nro);
  } catch {
    // Si no se puede preguntar, se sigue igual: el peor caso es que
    // ARCA conteste el 703, que es lo que pasaba antes de todos modos.
    return null;
  }
}

function unoDe<T>(v: T | T[] | null): T | null {
  if (v === null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/*
  El detalle del informativo es el mismo que el del pedido de CAE, más
  el CAEA al final. El orden de los elementos lo fija el XSD de ARCA y
  no es negociable: CbtesAsoc, Tributos, Iva y recién después CAEA.
*/
function armarDetalleInformativo(
  comp: Comprobante,
  codigoCaea: string,
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
  xml += `<ar:CAEA>${codigoCaea}</ar:CAEA>`;
  return xml;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    /*
      Dos maneras legítimas de llegar acá, y ninguna más.

      1. Una PERSONA con el permiso de contingencia, desde el sistema.
      2. La TAREA PROGRAMADA que pide y rinde los CAEA todos los días.
         No tiene sesión ni permisos —no es nadie— así que se identifica
         con un secreto que vive cifrado en el Vault y que sólo esta
         función puede leer.

      Cualquier otra cosa se va con un 403 sin haber tocado ARCA.
    */
    const secretoRecibido = req.headers.get("x-tarea-secreto");
    let esTareaProgramada = false;

    if (secretoRecibido) {
      const { data: esperado } = await supabase.rpc("secreto_de_tarea", {
        p_nombre: "arca_tarea_secreto",
      });
      esTareaProgramada =
        typeof esperado === "string" &&
        esperado.length > 0 &&
        igualesEnTiempoConstante(secretoRecibido, esperado);
    }

    let usuarioId: string | null = null;

    if (!esTareaProgramada) {
      // La service role ignora RLS, así que el permiso hay que
      // preguntárselo a la base con el token de quien llama.
      const authHeader = req.headers.get("Authorization") ?? "";
      const comoUsuario = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );

      const { data: puede } = await comoUsuario.rpc("tiene_permiso", {
        p_clave: "facturacion.contingencia",
      });
      if (!puede) {
        return responder(
          { ok: false, error: "No tenés permiso para operar la contingencia de ARCA." },
          403,
        );
      }

      const { data: sesion } = await comoUsuario.auth.getUser();
      const { data: usuario } = sesion?.user
        ? await supabase.from("usuario").select("id").eq("auth_user_id", sesion.user.id).maybeSingle()
        : { data: null };
      usuarioId = usuario?.id ?? null;
    }

    const body = await req.json().catch(() => ({}));
    const accion: string = body.accion ?? "solicitar";

    const certPem = Deno.env.get("ARCA_CERT_PEM");
    const keyPem = Deno.env.get("ARCA_KEY_PEM");
    if (!certPem || !keyPem) {
      throw new Error("Faltan los secrets ARCA_CERT_PEM / ARCA_KEY_PEM en el proyecto.");
    }

    const { data: config } = await supabase
      .from("configuracion")
      .select("clave, valor")
      .in("clave", ["comercio.cuit", "arca.ambiente"]);
    const cuit = config?.find((c) => c.clave === "comercio.cuit")?.valor as string;
    const ambiente = (config?.find((c) => c.clave === "arca.ambiente")?.valor ?? "homologacion") as Ambiente;
    if (!cuit) throw new Error("Falta 'comercio.cuit' en configuracion.");

    const ticket = await obtenerTicket(supabase, "wsfe", ambiente, certPem, keyPem);

    // ───────────────────────────────────────────────────────────
    // solicitar / consultar
    // ───────────────────────────────────────────────────────────
    if (accion === "solicitar" || accion === "consultar") {
      const hoy = new Date();
      const porDefecto = body.proxima ? quincenaSiguiente(quincenaDe(hoy)) : quincenaDe(hoy);
      const periodo = Number(body.periodo ?? porDefecto.periodo);
      const orden = Number(body.orden ?? porDefecto.orden);

      const consultar = async () => {
        const r = await llamar(
          ambiente,
          "FECAEAConsultar",
          `<ar:FECAEAConsultar>${auth(ticket, cuit)}<ar:Periodo>${periodo}</ar:Periodo><ar:Orden>${orden}</ar:Orden></ar:FECAEAConsultar>`,
        );
        return r;
      };

      let respuesta = accion === "consultar"
        ? await consultar()
        : await llamar(
          ambiente,
          "FECAEASolicitar",
          `<ar:FECAEASolicitar>${auth(ticket, cuit)}<ar:Periodo>${periodo}</ar:Periodo><ar:Orden>${orden}</ar:Orden></ar:FECAEASolicitar>`,
        );

      let datos = leerResultGet(respuesta.texto);
      let obs = observaciones(bloque(respuesta.texto, "Errors") ?? "");

      /*
        Si ARCA dice que el CAEA de esa quincena ya existe, no es un
        error: es que alguien ya lo pidió. Se lo consulta y se sigue.
        Sin esto, pedirlo dos veces —dos terminales, o un reintento—
        rompería en vez de devolver el código que ya está otorgado.
      */
      if (!datos && accion === "solicitar" && obs.some((o) => /ya\s+(existe|fue)/i.test(o.mensaje))) {
        respuesta = await consultar();
        datos = leerResultGet(respuesta.texto);
        obs = observaciones(bloque(respuesta.texto, "Errors") ?? "");
      }

      await supabase.from("intento_arca").insert({
        operacion: accion === "consultar" ? "FECAEAConsultar" : "FECAEASolicitar",
        resultado: datos ? "ok" : "rechazado",
        error_codigo: datos ? null : obs.map((o) => o.codigo).join(","),
        error_mensaje: datos ? null : mensajesDe(obs),
        request: { xml: respuesta.request },
        response: { xml: respuesta.texto },
        duracion_ms: respuesta.duracion_ms,
        usuario_id: usuarioId,
      });

      if (!datos) {
        return responder({
          ok: false,
          error: mensajesDe(obs) || "ARCA no devolvió un CAEA para esa quincena.",
        }, 500);
      }

      const { data: guardado, error: errGuardar } = await supabase
        .from("caea")
        .upsert({
          codigo: datos.codigo,
          periodo: datos.periodo || periodo,
          quincena: datos.orden || orden,
          fecha_desde: datos.fecha_desde,
          fecha_hasta: datos.fecha_hasta,
          fecha_tope_informar: datos.fecha_tope_informar,
          fecha_proceso: datos.fecha_proceso,
          ambiente,
          estado: "vigente",
        }, { onConflict: "periodo,quincena,ambiente" })
        .select("id, codigo, fecha_desde, fecha_hasta, fecha_tope_informar")
        .single();
      if (errGuardar) throw new Error(`El CAEA llegó pero no se pudo guardar: ${errGuardar.message}`);

      return responder({ ok: true, caea: guardado, observaciones: obs });
    }

    // ───────────────────────────────────────────────────────────
    // informar — FECAEARegInformativo
    // ───────────────────────────────────────────────────────────
    if (accion === "informar") {
      let q = supabase
        .from("comprobante")
        .select(
          "id, numero, tipo_comprobante_id, concepto, fecha, receptor_tipo_documento_id, " +
            "receptor_documento, receptor_condicion_iva_id, neto_gravado, neto_no_gravado, exento, " +
            "iva_total, tributos_total, total, moneda, cotizacion, punto_venta_id, caea_id, " +
            "punto_venta:punto_venta_id(numero), caea:caea_id(codigo)",
        )
        .eq("estado", "contingencia")
        .order("numero", { ascending: true });

      if (body.caea_id) q = q.eq("caea_id", body.caea_id);
      if (body.comprobante_id) q = q.eq("id", body.comprobante_id);

      const { data: pendientes, error: errPend } = await q;
      if (errPend) throw new Error(`No se pudo leer la cola de contingencia: ${errPend.message}`);
      if (!pendientes?.length) {
        return responder({ ok: true, informados: 0, fallidos: 0, detalle: [] });
      }

      const detalle: { comprobante: string; ok: boolean; motivo: string | null }[] = [];
      let informados = 0;
      let fallidos = 0;

      /*
        Antes de mandar nada, verificar que la numeración no tenga un
        hueco.

        ARCA exige que cada comprobante informado sea exactamente el
        siguiente al último que registró para ese punto de venta y tipo
        (error 703). Y acá hay una diferencia grande con el circuito del
        CAE: un comprobante emitido con CAEA YA SE LE ENTREGÓ AL CLIENTE
        con su número impreso. No se puede renumerar.

        Así que si falta un número en el medio —típicamente porque otro
        comprobante reservó ese número y terminó anulado— esto no se
        arregla solo. Hay que decirlo con todas las letras una vez, en
        vez de reintentar el mismo 703 todos los días.
      */
      const esperadoPorGrupo = new Map<string, number>();
      for (const fila of pendientes) {
        const comp = fila as unknown as Comprobante;
        const pv = unoDe(comp.punto_venta)?.numero;
        if (!pv) continue;
        const clave = `${pv}-${comp.tipo_comprobante_id}`;
        if (esperadoPorGrupo.has(clave)) continue;
        const ultimo = await ultimoRegistrado(pv, comp.tipo_comprobante_id, ticket, cuit, ambiente);
        if (ultimo !== null) esperadoPorGrupo.set(clave, ultimo + 1);
      }

      for (const fila of pendientes) {
        const comp = fila as unknown as Comprobante;
        const pv = unoDe(comp.punto_venta)?.numero;
        const codigoCaea = unoDe(comp.caea)?.codigo;
        const etiqueta = `${String(pv ?? 0).padStart(5, "0")}-${String(comp.numero).padStart(8, "0")}`;

        if (pv) {
          const clave = `${pv}-${comp.tipo_comprobante_id}`;
          const esperado = esperadoPorGrupo.get(clave);
          if (esperado !== undefined && comp.numero !== esperado) {
            fallidos++;
            detalle.push({
              comprobante: etiqueta,
              ok: false,
              motivo:
                `ARCA espera el número ${String(esperado).padStart(8, "0")} y este es el ` +
                `${String(comp.numero).padStart(8, "0")}. Falta informar el que va en el medio, ` +
                `o quedó anulado. Un comprobante ya entregado no se puede renumerar: ` +
                `hay que resolverlo con ARCA.`,
            });
            continue;
          }
          // El siguiente de este grupo tiene que ser uno más
          if (esperado !== undefined) esperadoPorGrupo.set(clave, esperado + 1);
        }

        if (!pv || !codigoCaea) {
          fallidos++;
          detalle.push({ comprobante: etiqueta, ok: false, motivo: "El comprobante no tiene CAEA asociado." });
          continue;
        }

        const [{ data: alicuotas }, { data: tributos }, { data: asociados }] = await Promise.all([
          supabase.from("comprobante_alicuota")
            .select("alicuota_iva_id, base_imponible, importe").eq("comprobante_id", comp.id),
          supabase.from("comprobante_tributo")
            .select("tributo_id, descripcion, base_imponible, alicuota, importe").eq("comprobante_id", comp.id),
          supabase.from("vista_comprobante_asociado")
            .select("tipo_comprobante_id, punto_venta_numero, numero, fecha").eq("comprobante_id", comp.id),
        ]);

        const cuerpo = `<ar:FECAEARegInformativo>${auth(ticket, cuit)}` +
          `<ar:FeCAEARegInfReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg>` +
          `<ar:PtoVta>${pv}</ar:PtoVta><ar:CbteTipo>${comp.tipo_comprobante_id}</ar:CbteTipo></ar:FeCabReq>` +
          `<ar:FeDetReq><ar:FECAEADetRequest>` +
          armarDetalleInformativo(comp, codigoCaea, alicuotas ?? [], tributos ?? [], asociados ?? []) +
          `</ar:FECAEADetRequest></ar:FeDetReq></ar:FeCAEARegInfReq></ar:FECAEARegInformativo>`;

        let respuesta;
        try {
          respuesta = await llamar(ambiente, "FECAEARegInformativo", cuerpo);
        } catch (e) {
          fallidos++;
          const motivo = e instanceof Error ? e.message : String(e);
          detalle.push({ comprobante: etiqueta, ok: false, motivo });
          await supabase.from("intento_arca").insert({
            comprobante_id: comp.id,
            punto_venta_id: comp.punto_venta_id,
            operacion: "FECAEARegInformativo",
            resultado: "error",
            error_mensaje: motivo,
            usuario_id: usuarioId,
          });
          continue;
        }

        const det = bloque(respuesta.texto, "FECAEADetResponse");
        const resultado = det?.match(/<Resultado>([^<]+)<\/Resultado>/)?.[1] ?? "";
        const obs = [
          ...observaciones(det ?? ""),
          ...observaciones(bloque(respuesta.texto, "Errors") ?? ""),
        ];
        const aceptado = resultado === "A";

        await supabase.from("intento_arca").insert({
          comprobante_id: comp.id,
          punto_venta_id: comp.punto_venta_id,
          operacion: "FECAEARegInformativo",
          resultado: aceptado ? "ok" : "rechazado",
          error_codigo: aceptado ? null : obs.map((o) => o.codigo).join(","),
          error_mensaje: aceptado ? null : mensajesDe(obs),
          request: { xml: respuesta.request },
          response: { xml: respuesta.texto },
          duracion_ms: respuesta.duracion_ms,
          usuario_id: usuarioId,
        });

        if (aceptado) {
          informados++;
          await supabase.from("comprobante").update({
            estado: "informado",
            arca_resultado: "A",
            arca_observaciones: obs.length ? obs : null,
          }).eq("id", comp.id);
          detalle.push({ comprobante: etiqueta, ok: true, motivo: null });
        } else {
          fallidos++;
          await supabase.from("comprobante").update({
            arca_observaciones: obs.length ? obs : null,
          }).eq("id", comp.id);
          detalle.push({ comprobante: etiqueta, ok: false, motivo: mensajesDe(obs) || "ARCA no aceptó el informe." });
        }
      }

      /*
        Un CAEA se da por cerrado sólo cuando ya no le queda nada por
        informar. Cerrarlo antes escondería comprobantes que ARCA
        todavía no vio, que es exactamente lo que la norma castiga.
      */
      const { data: aunPendientes } = await supabase
        .from("comprobante")
        .select("caea_id")
        .eq("estado", "contingencia")
        .not("caea_id", "is", null);
      const conPendientes = new Set((aunPendientes ?? []).map((c) => c.caea_id as string));

      const usados = new Set(pendientes.map((p) => (p as { caea_id: string | null }).caea_id).filter(Boolean) as string[]);
      for (const id of usados) {
        if (!conPendientes.has(id)) {
          await supabase.from("caea")
            .update({ estado: "informado", informado_en: new Date().toISOString() })
            .eq("id", id);
        }
      }

      return responder({ ok: true, informados, fallidos, detalle });
    }

    // ───────────────────────────────────────────────────────────
    // sin_movimiento — FECAEASinMovimientoInformar
    // ───────────────────────────────────────────────────────────
    if (accion === "sin_movimiento") {
      const caeaId: string | undefined = body.caea_id;
      if (!caeaId) throw new Error("Falta caea_id.");

      const { data: caea } = await supabase
        .from("caea").select("id, codigo").eq("id", caeaId).single();
      if (!caea) throw new Error("No se encontró ese CAEA.");

      /*
        Sólo los puntos de venta del régimen CAEA. Informar "sin
        movimiento" por uno que no está en ese régimen es un pedido que
        ARCA rechaza, y que además no corresponde: ese punto de venta
        nunca pudo emitir con CAEA.
      */
      const { data: puntos } = body.punto_venta_id
        ? await supabase.from("punto_venta").select("id, numero").eq("id", body.punto_venta_id)
        : await supabase.from("punto_venta").select("id, numero")
          .eq("activo", true).eq("regimen_caea", true);

      if (!puntos?.length) {
        throw new Error("No hay ningún punto de venta habilitado en ARCA bajo el régimen CAEA.");
      }

      const detalle: { punto_venta: number; ok: boolean; motivo: string | null }[] = [];

      for (const pv of puntos ?? []) {
        const respuesta = await llamar(
          ambiente,
          "FECAEASinMovimientoInformar",
          `<ar:FECAEASinMovimientoInformar>${auth(ticket, cuit)}` +
            `<ar:PtoVta>${pv.numero}</ar:PtoVta><ar:CAEA>${caea.codigo}</ar:CAEA>` +
            `</ar:FECAEASinMovimientoInformar>`,
        );

        const obs = observaciones(bloque(respuesta.texto, "Errors") ?? "");
        const resultado = respuesta.texto.match(/<Resultado>([^<]+)<\/Resultado>/)?.[1] ?? "";
        const aceptado = resultado === "A";

        await supabase.from("intento_arca").insert({
          punto_venta_id: pv.id,
          operacion: "FECAEASinMovimientoInformar",
          resultado: aceptado ? "ok" : "rechazado",
          error_codigo: aceptado ? null : obs.map((o) => o.codigo).join(","),
          error_mensaje: aceptado ? null : mensajesDe(obs),
          request: { xml: respuesta.request },
          response: { xml: respuesta.texto },
          duracion_ms: respuesta.duracion_ms,
          usuario_id: usuarioId,
        });

        if (aceptado) {
          await supabase.from("caea_sin_movimiento").upsert({
            caea_id: caea.id,
            punto_venta_id: pv.id,
            fecha_proceso: respuesta.texto.match(/<FchProceso>([^<]+)<\/FchProceso>/)?.[1] ?? null,
          }, { onConflict: "caea_id,punto_venta_id" });
        }

        detalle.push({
          punto_venta: pv.numero,
          ok: aceptado,
          motivo: aceptado ? null : mensajesDe(obs) || "ARCA no aceptó el aviso.",
        });
      }

      return responder({ ok: true, detalle });
    }

    // ───────────────────────────────────────────────────────────
    // puntos_venta — FEParamGetPtosVenta
    //
    // Que el punto de venta figure en la constancia de alta no quiere
    // decir que el web service lo vea: homologación tiene su propio
    // padrón, y el 16/09 rechazó el 9 con el 1204 aunque en producción
    // estaba dado de alta desde el 11/09. Esta consulta es la manera de
    // saber qué ve ARCA en el ambiente configurado, antes de depender
    // de eso el día que se caiga.
    // ───────────────────────────────────────────────────────────
    if (accion === "puntos_venta") {
      const respuesta = await llamar(
        ambiente,
        "FEParamGetPtosVenta",
        `<ar:FEParamGetPtosVenta>${auth(ticket, cuit)}</ar:FEParamGetPtosVenta>`,
      );

      const puntos: { numero: number; emision: string; bloqueado: boolean; baja: string | null }[] = [];
      const re = /<PtoVenta>([\s\S]*?)<\/PtoVenta>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(respuesta.texto))) {
        const baja = m[1].match(/<FchBaja>([^<]*)<\/FchBaja>/)?.[1] ?? "";
        puntos.push({
          numero: Number(m[1].match(/<Nro>([^<]*)<\/Nro>/)?.[1] ?? 0),
          emision: m[1].match(/<EmisionTipo>([^<]*)<\/EmisionTipo>/)?.[1] ?? "",
          bloqueado: m[1].match(/<Bloqueado>([^<]*)<\/Bloqueado>/)?.[1] === "S",
          baja: baja && baja !== "NULL" ? baja : null,
        });
      }
      const obs = observaciones(bloque(respuesta.texto, "Errors") ?? "");

      // 'FEParamGet' es el nombre que la tabla admite para toda la familia
      // de consultas de parámetros.
      await supabase.from("intento_arca").insert({
        operacion: "FEParamGet",
        resultado: obs.length ? "rechazado" : "ok",
        error_codigo: obs.length ? obs.map((o) => o.codigo).join(",") : null,
        error_mensaje: obs.length ? mensajesDe(obs) : null,
        request: { operacion: "FEParamGetPtosVenta" },
        response: { xml: respuesta.texto },
        duracion_ms: respuesta.duracion_ms,
        usuario_id: usuarioId,
      });

      // Sin puntos de venta ARCA contesta con un error ("sin resultados"),
      // que acá no es una falla: es la respuesta.
      return responder({ ok: true, ambiente, puntos, observaciones: obs });
    }

    return responder({ ok: false, error: `Acción desconocida: ${accion}` }, 400);
  } catch (err) {
    return responder({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
