// ═══════════════════════════════════════════════════════════════
// WSFEv1 — FECompConsultar: qué tiene ARCA con un número
//
// Antes de renumerar un comprobante hay que saber si ARCA ya le
// autorizó el número que tiene. Pasa cuando ARCA autoriza y la
// respuesta se corta en el camino: acá el comprobante sigue pendiente,
// allá está emitido. Sin preguntar, el reintento ve que el último
// autorizado es justo ese número, lo corre al siguiente y pide otro
// CAE: dos facturas en ARCA para una sola venta.
//
// Está aparte de index.ts para poder probarlo sin ARCA: son funciones
// que reciben texto y devuelven datos, sin red ni base.
// ═══════════════════════════════════════════════════════════════

/** Lo que ARCA tiene registrado con un número. */
export interface ComprobanteEnArca {
  numero: number;
  docTipo: number;
  docNro: string;
  /** AAAA-MM-DD */
  fecha: string;
  total: number;
  /** 'A' aprobado, 'R' rechazado. */
  resultado: string;
  /** 'CAE' o 'CAEA'. */
  emisionTipo: string;
  codAutorizacion: string | null;
  /** AAAA-MM-DD */
  vencimiento: string | null;
  observaciones: { codigo: string; mensaje: string }[];
}

export type RespuestaConsulta =
  | { encontrado: true; comprobante: ComprobanteEnArca }
  | { encontrado: false };

/*
  El código con que ARCA dice «no tengo nada con ese número». No es un
  error: es la respuesta que se espera cuando el pedido anterior no
  llegó a autorizarse.
*/
export const SIN_RESULTADOS = "602";

function xmlUnescape(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function bloque(texto: string, tag: string): string | null {
  const m = texto.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1] : null;
}

function mensajes(texto: string, tag: "Obs" | "Err"): { codigo: string; mensaje: string }[] {
  const lista: { codigo: string; mensaje: string }[] = [];
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    lista.push({
      codigo: m[1].match(/<Code>([^<]*)<\/Code>/)?.[1] ?? "",
      mensaje: xmlUnescape(m[1].match(/<Msg>([^<]*)<\/Msg>/)?.[1] ?? ""),
    });
  }
  return lista;
}

function fechaIso(aaaammdd: string | null | undefined): string | null {
  if (!aaaammdd || !/^\d{8}/.test(aaaammdd)) return null;
  return `${aaaammdd.slice(0, 4)}-${aaaammdd.slice(4, 6)}-${aaaammdd.slice(6, 8)}`;
}

export function armarPedidoConsulta(
  ticket: { token: string; sign: string },
  cuit: string,
  ptoVta: number,
  cbteTipo: number,
  numero: number,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soapenv:Body>
    <ar:FECompConsultar>
      <ar:Auth><ar:Token>${ticket.token}</ar:Token><ar:Sign>${ticket.sign}</ar:Sign><ar:Cuit>${cuit}</ar:Cuit></ar:Auth>
      <ar:FeCompConsReq>
        <ar:CbteTipo>${cbteTipo}</ar:CbteTipo>
        <ar:CbteNro>${numero}</ar:CbteNro>
        <ar:PtoVta>${ptoVta}</ar:PtoVta>
      </ar:FeCompConsReq>
    </ar:FECompConsultar>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/*
  Lee la respuesta de FECompConsultar.

  «No tengo nada» (602) vuelve como no encontrado. Cualquier otro error
  —el permiso vencido, un pedido mal armado— es una excepción: no saber
  qué tiene ARCA no es lo mismo que saber que no tiene nada, y renumerar
  sobre una duda es justo lo que se quiere evitar.
*/
export function leerConsulta(texto: string): RespuestaConsulta {
  const fault = texto.match(/<faultstring>([\s\S]*?)<\/faultstring>/);
  if (fault) throw new Error(`ARCA (WSFEv1) rechazó la consulta: ${xmlUnescape(fault[1])}`);

  const resultGet = bloque(texto, "ResultGet");
  if (!resultGet) {
    const errores = mensajes(bloque(texto, "Errors") ?? "", "Err");
    if (errores.some((e) => e.codigo === SIN_RESULTADOS)) return { encontrado: false };
    throw new Error(
      errores.length
        ? `ARCA no pudo decir qué tiene con ese número: ${errores.map((e) => `${e.codigo}: ${e.mensaje}`).join(" | ")}`
        : "ARCA no devolvió el comprobante consultado.",
    );
  }

  /*
    Cada dato se toma de la primera etiqueta con ese nombre. Los bloques
    de adentro —comprobantes asociados, tributos, IVA— repiten algunos
    nombres, como CbteFch, pero ARCA los manda siempre después de la
    cabecera: el orden lo fija su esquema.
  */
  const observaciones = mensajes(bloque(resultGet, "Observaciones") ?? "", "Obs");
  const dato = (tag: string) => resultGet.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`))?.[1] ?? null;

  return {
    encontrado: true,
    comprobante: {
      numero: Number(dato("CbteDesde") ?? 0),
      docTipo: Number(dato("DocTipo") ?? 0),
      docNro: dato("DocNro") ?? "0",
      fecha: fechaIso(dato("CbteFch")) ?? "",
      total: Number(dato("ImpTotal") ?? 0),
      resultado: dato("Resultado") ?? "",
      emisionTipo: dato("EmisionTipo") ?? "",
      codAutorizacion: dato("CodAutorizacion") || null,
      vencimiento: fechaIso(dato("FchVto")),
      observaciones,
    },
  };
}

/** Los datos del comprobante local que se comparan con lo que tiene ARCA. */
export interface ComprobanteLocal {
  receptor_tipo_documento_id: number;
  receptor_documento: string | null;
  /** AAAA-MM-DD */
  fecha: string;
  total: number;
}

/*
  ¿Lo que ARCA tiene con ese número es este comprobante?

  Se compara lo que identifica a una factura para quien la recibe: a
  quién, de qué día y por cuánto. Tiene que estar autorizado con CAE: un
  número que ARCA tiene por CAEA es de un comprobante emitido sin
  conexión, no de un pedido de CAE que se cortó.

  Si algo no coincide, el número es de otro y se renumera, como antes.
  Equivocarse para este lado —no reconocer el propio— deja el riesgo
  de siempre; equivocarse para el otro le pondría a esta venta el CAE
  de otra. Por eso se exige que coincida todo.
*/
export function esElMismoComprobante(
  local: ComprobanteLocal,
  enArca: ComprobanteEnArca,
): { mismo: boolean; diferencias: string[] } {
  const diferencias: string[] = [];
  if (enArca.resultado !== "A") diferencias.push(`ARCA lo tiene con resultado '${enArca.resultado}'`);
  if (enArca.emisionTipo !== "CAE") diferencias.push(`ARCA lo tiene emitido por ${enArca.emisionTipo || "otro medio"}`);
  if (!enArca.codAutorizacion || !enArca.vencimiento) diferencias.push("ARCA no devolvió el CAE y su vencimiento");
  if (Number(local.receptor_tipo_documento_id) !== enArca.docTipo) {
    diferencias.push(`tipo de documento ${enArca.docTipo} en ARCA, ${local.receptor_tipo_documento_id} acá`);
  }
  const docLocal = local.receptor_documento?.trim() ? local.receptor_documento.trim() : "0";
  if (Number(docLocal.replace(/\D/g, "") || 0) !== Number(enArca.docNro.replace(/\D/g, "") || 0)) {
    diferencias.push(`documento ${enArca.docNro} en ARCA, ${docLocal} acá`);
  }
  if (local.fecha !== enArca.fecha) diferencias.push(`fecha ${enArca.fecha} en ARCA, ${local.fecha} acá`);
  if (Math.abs(Number(local.total) - enArca.total) >= 0.005) {
    diferencias.push(`total ${enArca.total} en ARCA, ${Number(local.total)} acá`);
  }
  return { mismo: diferencias.length === 0, diferencias };
}
