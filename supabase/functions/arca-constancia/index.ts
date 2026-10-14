import { createClient } from "npm:@supabase/supabase-js@2";
import forge from "npm:node-forge@1.3.1";
import { cuitValido, interpretarConstancia } from "./constancia.ts";

// ═══════════════════════════════════════════════════════════════
// Consulta de Constancia de Inscripción — lo que ARCA sabe de un CUIT
//
// Con el CUIT del cliente devuelve su nombre o razón social, el
// domicilio fiscal y la condición frente al IVA. Es lo que permite no
// preguntarle nunca al cliente si es responsable inscripto: dice
// «factura A», da su CUIT, y el resto lo sabe ARCA.
//
// No guarda nada: devuelve los datos y quien llama decide qué hacer
// con ellos —completar la ficha, dar de alta al cliente, comparar—.
//
// La parte de WSAA está duplicada de arca-wsfe-solicitar-cae a
// propósito: cada función se despliega por separado.
// ═══════════════════════════════════════════════════════════════

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

const SERVICIO = "ws_sr_constancia_inscripcion";

const WSAA = {
  homologacion: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
  produccion: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
} as const;
const PADRON = {
  homologacion: "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5",
  produccion: "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5",
} as const;
type Ambiente = keyof typeof PADRON;

/*
  Más corto que el de facturar: acá hay una persona esperando con el
  cliente adelante, y si ARCA no contesta la salida es cargar a mano.
*/
const TIMEOUT_MS = 12000;

function xmlUnescape(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
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

/** ARCA dijo que este certificado no puede usar el servicio: falta la autorización. */
class SinAutorizacion extends Error {}

async function pedirTicketAArca(ambiente: Ambiente, certPem: string, keyPem: string) {
  const cms = firmarCms(construirTRA(SERVICIO), certPem, keyPem);
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
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const texto = await respuesta.text();

  const fault = texto.match(/<faultstring>([\s\S]*?)<\/faultstring>/);
  if (fault) {
    const motivo = xmlUnescape(fault[1]);
    // Así contesta cuando falta la relación en WSASS o en el
    // Administrador de Relaciones: «Computador no autorizado a acceder
    // al servicio». Se probó el 01/10 con el certificado de pruebas.
    if (/no autorizado/i.test(motivo)) throw new SinAutorizacion(motivo);
    throw new Error(`ARCA (WSAA) rechazó el pedido: ${motivo}`);
  }

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
async function obtenerTicket(supabase: any, ambiente: Ambiente, certPem: string, keyPem: string) {
  const { data: cacheado } = await supabase
    .from("arca_ticket_acceso")
    .select("token, sign, expira_en")
    .eq("servicio", SERVICIO)
    .eq("ambiente", ambiente)
    .maybeSingle();

  const vigente = !!cacheado && new Date(cacheado.expira_en).getTime() - Date.now() > 5 * 60 * 1000;
  if (vigente) return cacheado as { token: string; sign: string };

  const nuevo = await pedirTicketAArca(ambiente, certPem, keyPem);
  await supabase.from("arca_ticket_acceso").upsert({
    servicio: SERVICIO,
    ambiente,
    token: nuevo.token,
    sign: nuevo.sign,
    generado_en: new Date().toISOString(),
    expira_en: nuevo.expira_en,
  });
  return nuevo;
}

async function consultarPadron(
  cuit: string,
  ticket: { token: string; sign: string },
  cuitRepresentada: string,
  ambiente: Ambiente,
): Promise<string> {
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a5="http://a5.soap.ws.server.puc.sr/">
  <soapenv:Header/>
  <soapenv:Body>
    <a5:getPersona_v2>
      <token>${ticket.token}</token>
      <sign>${ticket.sign}</sign>
      <cuitRepresentada>${cuitRepresentada}</cuitRepresentada>
      <idPersona>${cuit}</idPersona>
    </a5:getPersona_v2>
  </soapenv:Body>
</soapenv:Envelope>`;

  const respuesta = await fetch(PADRON[ambiente], {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
    body: envelope,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return await respuesta.text();
}

function esCaidaDeArca(err: unknown): boolean {
  if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) return true;
  if (err instanceof TypeError) return true;
  const m = err instanceof Error ? err.message : String(err);
  return /timeout|timed out|network|fetch failed|connection|ECONN|socket|abort/i.test(m);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    /*
      Puede consultar quien puede dar de alta o editar un cliente: todos
      los roles, incluido el vendedor, que es el que tiene al cliente
      adelante cuando dice «factura A».
    */
    const comoUsuario = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const [crear, editar] = await Promise.all([
      comoUsuario.rpc("tiene_permiso", { p_clave: "clientes.crear" }),
      comoUsuario.rpc("tiene_permiso", { p_clave: "clientes.editar" }),
    ]);
    if (!crear.data && !editar.data) {
      return responder({ ok: false, motivo: "sin_permiso", error: "No tenés permiso para cargar clientes." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const cuit = String(body.cuit ?? "").replace(/\D/g, "");
    if (!cuitValido(cuit)) {
      return responder({ ok: false, motivo: "cuit_invalido", error: "Ese CUIT no es válido: revisá los números." }, 400);
    }

    const certPem = Deno.env.get("ARCA_CERT_PEM");
    const keyPem = Deno.env.get("ARCA_KEY_PEM");
    if (!certPem || !keyPem) throw new Error("Faltan los secrets ARCA_CERT_PEM / ARCA_KEY_PEM en el proyecto.");

    const { data: config } = await supabase
      .from("configuracion")
      .select("clave, valor")
      .in("clave", ["comercio.cuit", "arca.ambiente"]);
    const cuitGross = String(config?.find((c) => c.clave === "comercio.cuit")?.valor ?? "").replace(/\D/g, "");
    const ambiente = (config?.find((c) => c.clave === "arca.ambiente")?.valor ?? "homologacion") as Ambiente;
    if (!cuitGross) throw new Error("Falta 'comercio.cuit' en configuracion.");

    const ticket = await obtenerTicket(supabase, ambiente, certPem, keyPem);
    const xml = await consultarPadron(cuit, ticket, cuitGross, ambiente);
    const r = interpretarConstancia(xml, cuit);

    if (!r.encontrado) {
      if (/no existe/i.test(r.motivo)) {
        return responder({ ok: false, motivo: "no_existe", error: "ARCA no tiene ningún contribuyente con ese CUIT." }, 404);
      }
      return responder({ ok: false, motivo: "arca_rechazo", error: `ARCA no devolvió los datos: ${r.motivo}` }, 502);
    }
    return responder({ ok: true, datos: r.datos });
  } catch (err) {
    if (err instanceof SinAutorizacion) {
      return responder({
        ok: false,
        motivo: "sin_autorizacion",
        error: "ARCA todavía no autorizó al sistema a consultar CUITs. Mientras tanto, los datos se cargan a mano.",
      }, 503);
    }
    if (esCaidaDeArca(err)) {
      return responder({
        ok: false,
        motivo: "arca_no_responde",
        error: "ARCA no contesta. Probá en un rato, o cargá los datos a mano.",
      }, 503);
    }
    console.error("arca-constancia:", err);
    return responder({ ok: false, motivo: "error", error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
