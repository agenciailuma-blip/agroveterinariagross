// ═══════════════════════════════════════════════════════════════
// Las reglas del mail de la factura, el recibo y el pedido, sin red: se
// prueban desde la app (app/src/lib/api/facturaPorMail.prueba.ts).
// ═══════════════════════════════════════════════════════════════

/** Una dirección de correo que vale la pena intentar: algo@algo.algo, sin espacios. */
export function correoValido(correo: string): boolean {
  const c = correo.trim();
  return c.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(c);
}

export interface DatosDelMail {
  tipo: string; // «Factura B»
  numero: string; // «0001-00000123»
  fecha: string; // «2026-10-16»
  total: number;
  receptor: string;
  comercio: string; // nombre de fantasía
  domicilio: string;
  telefono: string;
  /** El isotipo en blanco, publicado con la web: los correos no muestran SVG. */
  logo: string;
  /** Si hay una casilla del local para las respuestas. */
  respondible: boolean;
  /** Un recibo de pago en vez de una factura: cambian las palabras, no el diseño. */
  esRecibo?: boolean;
}

const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const importe = (n: number) => pesos.format(n).replace(/\u00a0/g, " ");
const fechaCorta = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
};

function escapar(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** El nombre del PDF: «Factura B 0001-00000123.pdf». */
export function nombreDelPdf(d: Pick<DatosDelMail, "tipo" | "numero">): string {
  return `${d.tipo} ${d.numero}.pdf`.replace(/[\\/:*?"<>|]/g, "-");
}

/*
  El mail, con la marca de Gross —pedido del 21/10: «se ve muy plano»—.

  Hecho como se hacen los mails: tablas y estilos escritos en cada
  elemento, porque Gmail, Outlook y los celulares ignoran casi todo lo
  demás. La banda magenta con el isotipo y el nombre, la línea verde de
  la marca, y el resumen de la factura —qué es, de qué día, cuánto— en
  un recuadro, con el total en grande. La factura va adjunta; el mail no
  la repite.

  Si el isotipo no se ve —un correo que bloquea imágenes—, queda el
  nombre escrito, que es texto.
*/
export function armarMail(d: DatosDelMail): { asunto: string; html: string; texto: string } {
  const asunto = `${d.tipo} ${d.numero} · ${d.comercio}`;
  const nombre = d.receptor && !/consumidor final/i.test(d.receptor) ? d.receptor.trim() : "";
  const saludo = nombre ? `Hola, ${nombre}:` : "Hola:";
  const adjunto = d.esRecibo ? "Lo encontrás adjunto en PDF." : "La encontrás adjunta en PDF.";
  const gracias = d.esRecibo ? "Gracias por tu pago." : "Gracias por tu compra.";
  const cuerpo = d.esRecibo
    ? `Te mandamos el recibo ${d.numero} de tu pago por ${importe(d.total)}. ${adjunto}`
    : `Te mandamos tu ${d.tipo} ${d.numero} por ${importe(d.total)}. ${adjunto}`;
  const pie = [d.comercio, d.domicilio, d.telefono ? `Tel. ${d.telefono}` : ""].filter(Boolean).join(" · ");
  const consulta = d.respondible ? "Si tenés alguna consulta, respondé este mail." : "";

  const texto = [saludo, "", cuerpo, "", gracias, "", pie, ...(consulta ? [consulta] : []), ""].join("\n");

  const fila = (k: string, v: string) =>
    `<tr><td style="${F};font-size:13px;color:#554f59;padding:6px 0">${escapar(k)}</td>` +
    `<td align="right" style="${F};font-size:14px;color:#1f2021;padding:6px 0;font-weight:bold">${escapar(v)}</td></tr>`;

  const contenido = `<p style="margin:0 0 10px">${escapar(saludo)}</p>
<p style="margin:0 0 22px">${d.esRecibo ? "Te mandamos el recibo de tu pago." : "Te mandamos tu factura."} ${adjunto}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f5f7;border:1px solid #d1e2e8;border-radius:10px">
<tr><td style="padding:14px 18px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${fila("Comprobante", `${d.tipo} ${d.numero}`)}
${fila("Fecha", fechaCorta(d.fecha))}
<tr><td colspan="2" style="border-top:1px solid #d1e2e8;font-size:0;line-height:0;padding-top:8px">&nbsp;</td></tr>
<tr><td style="${F};font-size:13px;color:#554f59">Total</td>
<td align="right" style="${F};font-size:26px;font-weight:bold;color:#8d0b7b;white-space:nowrap">${escapar(importe(d.total))}</td></tr>
</table>
</td></tr></table>
<p style="margin:24px 0 0">${gracias}</p>`;

  const html = marco(d, asunto, `Tu ${d.esRecibo ? "recibo" : d.tipo} por ${importe(d.total)}, en PDF.`, contenido, consulta);
  return { asunto, html, texto };
}

export interface DatosDelPedido {
  numero: number;
  fecha: string; // «2026-10-29»
  receptor: string;
  /** Quién lo armó, para que el cliente lo reconozca. */
  vendedor: string | null;
  lineas: { nombre: string; cantidad: number; precio: number }[];
  total: number;
  observaciones: string | null;
  comercio: string;
  domicilio: string;
  telefono: string;
  logo: string;
  respondible: boolean;
}

const cantidad = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });

/*
  El pedido mayorista (Fase 03, 5.3): al cliente le llega lo que pidió
  apenas el pedido llega al local. Sin PDF: el detalle va en el mail,
  que es lo que el cliente quiere mirar en el teléfono.
*/
export function armarMailPedido(d: DatosDelPedido): { asunto: string; html: string; texto: string } {
  const asunto = `Pedido N.º ${d.numero} · ${d.comercio}`;
  const saludo = d.receptor.trim() ? `Hola, ${d.receptor.trim()}:` : "Hola:";
  const vendedor = d.vendedor?.trim() ? ` con ${d.vendedor.trim()}` : "";
  const cuerpo = `Recibimos el pedido N.º ${d.numero} que armaste${vendedor} el ${fechaCorta(d.fecha)}. Este es el detalle.`;
  const nota = d.observaciones?.trim() ?? "";
  const pie = [d.comercio, d.domicilio, d.telefono ? `Tel. ${d.telefono}` : ""].filter(Boolean).join(" · ");
  const consulta = d.respondible ? "Si algo no está bien, respondé este mail." : "";
  const subtotal = (l: { cantidad: number; precio: number }) => Math.round(l.cantidad * l.precio * 100) / 100;

  const texto = [
    saludo, "", cuerpo, "",
    ...d.lineas.map((l) => `${cantidad.format(l.cantidad)} × ${l.nombre} (${importe(l.precio)} c/u): ${importe(subtotal(l))}`),
    "", `Total: ${importe(d.total)}`,
    ...(nota ? ["", `Nota: ${nota}`] : []),
    "", "Gracias por tu pedido.", "", pie, ...(consulta ? [consulta] : []), "",
  ].join("\n");

  const renglones = d.lineas.map((l) =>
    `<tr><td style="${F};font-size:14px;color:#1f2021;padding:8px 12px 8px 0;border-bottom:1px solid #d1e2e8">${escapar(l.nombre)}` +
    `<div style="font-size:12px;color:#554f59">${escapar(`${cantidad.format(l.cantidad)} × ${importe(l.precio)}`)}</div></td>` +
    `<td align="right" style="${F};font-size:14px;color:#1f2021;padding:8px 0;border-bottom:1px solid #d1e2e8;white-space:nowrap;vertical-align:top">${escapar(importe(subtotal(l)))}</td></tr>`
  ).join("\n");

  const contenido = `<p style="margin:0 0 10px">${escapar(saludo)}</p>
<p style="margin:0 0 22px">${escapar(cuerpo)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f5f7;border:1px solid #d1e2e8;border-radius:10px">
<tr><td style="padding:10px 18px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${renglones}
<tr><td style="${F};font-size:13px;color:#554f59;padding-top:12px">Total</td>
<td align="right" style="${F};font-size:26px;font-weight:bold;color:#8d0b7b;white-space:nowrap;padding-top:12px">${escapar(importe(d.total))}</td></tr>
</table>
</td></tr></table>
${nota ? `<p style="margin:18px 0 0;font-size:14px;color:#554f59">Nota: ${escapar(nota)}</p>` : ""}
<p style="margin:24px 0 0">Gracias por tu pedido.</p>`;

  const html = marco(d, asunto, `Tu pedido N.º ${d.numero} por ${importe(d.total)}.`, contenido, consulta);
  return { asunto, html, texto };
}

const F = "font-family:Ubuntu,'Segoe UI',Arial,Helvetica,sans-serif";

type DelComercio = Pick<DatosDelMail, "comercio" | "domicilio" | "telefono" | "logo">;

/* La banda magenta con la marca, la línea verde y el pie con los datos del local. */
function marco(d: DelComercio, asunto: string, preheader: string, contenido: string, consulta: string): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<title>${escapar(asunto)}</title></head>
<body style="margin:0;padding:0;background:#f0f5f7">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapar(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f5f7">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #d1e2e8;border-radius:14px;overflow:hidden">
<tr><td style="background:#8d0b7b;padding:22px 28px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="vertical-align:middle"><img src="${escapar(d.logo)}" width="44" height="44" alt="" style="display:block;border:0"></td>
<td style="vertical-align:middle;padding-left:14px;${F};color:#ffffff">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#f3d6ee">Agroveterinaria</div>
<div style="font-size:24px;line-height:1.1;font-weight:bold;letter-spacing:2px;color:#ffffff">GROSS</div>
</td></tr></table>
</td></tr>
<tr><td style="background:#64b32e;height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
<tr><td style="padding:30px 28px 6px;${F};font-size:15px;line-height:1.6;color:#1f2021">
${contenido}
</td></tr>
<tr><td style="padding:22px 28px 26px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="border-top:1px solid #d1e2e8;padding-top:16px;${F};font-size:12px;line-height:1.6;color:#554f59">
<strong style="color:#8d0b7b">${escapar(d.comercio)}</strong><br>
${[d.domicilio ? escapar(d.domicilio) : "", d.telefono ? `<span style="white-space:nowrap">Tel. ${escapar(d.telefono)}</span>` : "", consulta ? escapar(consulta) : ""].filter(Boolean).join("<br>")}
</td></tr></table>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
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
