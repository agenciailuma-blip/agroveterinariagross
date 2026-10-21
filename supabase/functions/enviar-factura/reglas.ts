// ═══════════════════════════════════════════════════════════════
// Las reglas del mail de la factura, sin red: se prueban desde la app
// (app/src/lib/api/facturaPorMail.prueba.ts).
// ═══════════════════════════════════════════════════════════════

/** Una dirección de correo que vale la pena intentar: algo@algo.algo, sin espacios. */
export function correoValido(correo: string): boolean {
  const c = correo.trim();
  return c.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(c);
}

export interface DatosDelMail {
  tipo: string; // «Factura B»
  numero: string; // «0001-00000123»
  total: number;
  receptor: string;
  comercio: string; // nombre de fantasía
  domicilio: string;
  telefono: string;
}

const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

function escapar(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** El nombre del PDF: «Factura B 0001-00000123.pdf». */
export function nombreDelPdf(d: Pick<DatosDelMail, "tipo" | "numero">): string {
  return `${d.tipo} ${d.numero}.pdf`.replace(/[\\/:*?"<>|]/g, "-");
}

/*
  El mail: corto, con lo que el cliente busca —qué es, de cuánto— y de
  quién viene. La factura va adjunta; el cuerpo no la repite.
*/
export function armarMail(d: DatosDelMail): { asunto: string; html: string; texto: string } {
  const asunto = `${d.tipo} ${d.numero} · ${d.comercio}`;
  const saludo = d.receptor && !/consumidor final/i.test(d.receptor) ? `Hola, ${d.receptor}:` : "Hola:";
  const cuerpo = `Te mandamos tu ${d.tipo} ${d.numero} por ${pesos.format(d.total).replace(/ /g, " ")}. La encontrás adjunta en PDF.`;
  const pie = [d.comercio, d.domicilio, d.telefono ? `Tel. ${d.telefono}` : ""].filter(Boolean).join(" · ");

  const texto = `${saludo}\n\n${cuerpo}\n\nGracias por tu compra.\n\n${pie}\n`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1f2021;line-height:1.5">
<p>${escapar(saludo)}</p>
<p>${escapar(cuerpo)}</p>
<p>Gracias por tu compra.</p>
<p style="color:#6b6870;font-size:13px;margin-top:24px">${escapar(pie)}</p>
</div>`;
  return { asunto, html, texto };
}

/*
  Lo que contestó el servicio de correo, en palabras.

  El caso que más va a aparecer al principio: mientras el dominio no
  esté verificado en Resend, sólo deja mandar a la casilla de la cuenta.
*/
export function errorDelCorreo(status: number, mensaje: string): string {
  if (/only send testing emails|verify a domain/i.test(mensaje)) {
    return "Todavía no se puede mandar a clientes: el dominio no está verificado en Resend. Mientras tanto sólo llega a la casilla de la cuenta de Resend.";
  }
  if (status === 401 || (status === 403 && /api key/i.test(mensaje))) {
    return "Resend no aceptó la clave: revisá RESEND_API_KEY en los secretos del servidor.";
  }
  if (status === 429) return "Se mandaron demasiados mails seguidos. Probá en un minuto.";
  if (status === 422 && /to/i.test(mensaje)) return "Resend no acepta esa dirección de correo. Revisala.";
  return `El servicio de correo no lo mandó (${status}): ${mensaje}`;
}

/** Un PDF de verdad: empieza con %PDF y no es enorme. */
export function pdfValido(bytes: Uint8Array): boolean {
  return bytes.length > 100 && bytes.length <= 4 * 1024 * 1024 &&
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}
