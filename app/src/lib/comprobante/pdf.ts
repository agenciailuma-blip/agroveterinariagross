import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import QRCode from 'qrcode'
import type { ComprobanteCompleto } from '@/lib/api/comprobante'
import { LEYENDA_NO_FISCAL } from '@/lib/api/noFiscal'
import { numeroRecibo, type ReciboCompleto } from '@/lib/api/recibos'
import { importeEnLetras } from '@/lib/enLetras'
import { presentacionDe } from '@/lib/comprobante/presentacion'
import { moneda, numero } from '@/lib/tipos'

/*
  ─────────────────────────────────────────────────────────────
  La factura en PDF, para mandarla por mail

  Es la hoja A4 de ComprobanteImprimible dibujada en un PDF: los mismos
  datos, el mismo orden y las mismas cuentas (presentacionDe), para que
  la que se manda por mail y la que se imprime sean la misma factura.

  Se arma acá y no con «Guardar como PDF» porque ese diálogo necesita a
  una persona apretando botones; el mail de un pedido de la tienda sale
  solo.

  Las letras son las estándar del PDF (Helvetica), que traen los acentos
  y la ñ pero no cualquier símbolo: lo que no se puede escribir se
  cambia antes de dibujarlo, para que una descripción con un emoji no
  deje a nadie sin su factura.
  ─────────────────────────────────────────────────────────────
*/

const A4 = { ancho: 595.28, alto: 841.89 }
const MARGEN = 34
const NEGRO = rgb(0.12, 0.13, 0.13)

/** Lo que Helvetica puede escribir (WinAnsi). Lo demás, cambiado o sacado. */
export function seguro(texto: string): string {
  return texto
    .replace(/[   ]/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7e\xa1-\xff–—…€•]/g, '')
}

interface Pincel {
  pagina: PDFPage
  normal: PDFFont
  negrita: PDFFont
}

function escribir(p: Pincel, texto: string, x: number, y: number, tam = 8.5, negrita = false) {
  p.pagina.drawText(seguro(texto), { x, y, size: tam, font: negrita ? p.negrita : p.normal, color: NEGRO })
}

function aLaDerecha(p: Pincel, texto: string, xDerecha: number, y: number, tam = 8.5, negrita = false) {
  const t = seguro(texto)
  const ancho = (negrita ? p.negrita : p.normal).widthOfTextAtSize(t, tam)
  p.pagina.drawText(t, { x: xDerecha - ancho, y, size: tam, font: negrita ? p.negrita : p.normal, color: NEGRO })
}

/** «Clave: valor», con la clave en negrita. */
function dato(p: Pincel, clave: string, valor: string, x: number, y: number, tam = 8.5) {
  const k = seguro(`${clave}: `)
  escribir(p, k, x, y, tam, true)
  // Un punto y medio de aire: con un número pegado, la etiqueta y el dato se leían juntos.
  escribir(p, valor, x + p.negrita.widthOfTextAtSize(k, tam) + 1.5, y, tam)
}

/** Corta un texto para que entre en un ancho, con «…» si no entra. */
export function recortar(texto: string, fuente: PDFFont, tam: number, ancho: number): string {
  let t = seguro(texto)
  if (fuente.widthOfTextAtSize(t, tam) <= ancho) return t
  while (t.length > 1 && fuente.widthOfTextAtSize(`${t}…`, tam) > ancho) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

function caja(p: Pincel, x: number, y: number, ancho: number, alto: number, grosor = 1.2) {
  p.pagina.drawRectangle({ x, y, width: ancho, height: alto, borderColor: NEGRO, borderWidth: grosor })
}

const fecha = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR')

/** El QR de ARCA, dibujado cuadradito por cuadradito: sale nítido a cualquier tamaño. */
function dibujarQr(p: Pincel, url: string, x: number, y: number, lado: number) {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  const celda = lado / n
  for (let fila = 0; fila < n; fila++) {
    for (let col = 0; col < n; col++) {
      if (qr.modules.get(fila, col)) {
        p.pagina.drawRectangle({
          x: x + col * celda,
          y: y + lado - (fila + 1) * celda,
          width: celda + 0.05,
          height: celda + 0.05,
          color: NEGRO,
        })
      }
    }
  }
}

export async function facturaEnPdf(c: ComprobanteCompleto, urlQr: string | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(seguro(`${c.tipo_descripcion} ${String(c.punto_venta).padStart(4, '0')}-${String(c.numero).padStart(8, '0')}`))
  doc.setAuthor(seguro(c.emisor.razon_social ?? ''))
  doc.setCreator('Sistema de gestión Gross')
  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold)
  const { esA, porcentajeDe, sinIva, codigo, identificado } = presentacionDe(c)

  const izq = MARGEN
  const der = A4.ancho - MARGEN
  const ancho = der - izq
  const medio = izq + ancho / 2

  let p: Pincel = { pagina: doc.addPage([A4.ancho, A4.alto]), normal, negrita }
  let y = A4.alto - MARGEN

  /* ── Encabezado, con la letra al medio ── */
  const altoEnc = 112
  caja(p, izq, y - altoEnc, ancho, altoEnc, 1.6)
  p.pagina.drawLine({ start: { x: medio, y }, end: { x: medio, y: y - altoEnc }, thickness: 1.6, color: NEGRO })
  escribir(p, recortar(c.emisor.nombre_fantasia || c.emisor.razon_social || '', negrita, 14, ancho / 2 - 50), izq + 10, y - 24, 14, true)
  let yl = y - 46
  dato(p, 'Razón social', c.emisor.razon_social ?? '', izq + 10, yl)
  yl -= 12
  dato(p, 'Domicilio comercial', [c.emisor.domicilio, c.emisor.localidad].filter(Boolean).join(' — '), izq + 10, yl)
  yl -= 12
  dato(p, 'Condición frente al IVA', 'IVA Responsable Inscripto', izq + 10, yl)
  if (c.emisor.telefono) {
    yl -= 12
    dato(p, 'Teléfono', c.emisor.telefono, izq + 10, yl)
  }

  escribir(p, c.tipo_descripcion, medio + 34, y - 24, 14, true)
  let yr = y - 46
  dato(p, 'Punto de Venta', `${String(c.punto_venta).padStart(5, '0')}    Comp. Nro: ${String(c.numero).padStart(8, '0')}`, medio + 34, yr)
  yr -= 12
  dato(p, 'Fecha de emisión', fecha(c.fecha), medio + 34, yr)
  yr -= 12
  dato(p, 'CUIT', c.emisor.cuit ?? '', medio + 34, yr)
  yr -= 12
  dato(p, 'Ingresos Brutos', c.emisor.ingresos_brutos || '—', medio + 34, yr)
  yr -= 12
  dato(p, 'Inicio de actividades', c.emisor.inicio_actividades || '—', medio + 34, yr)

  // La letra, en su recuadro, montada sobre la división.
  p.pagina.drawRectangle({ x: medio - 21, y: y - 44, width: 42, height: 44, color: rgb(1, 1, 1), borderColor: NEGRO, borderWidth: 1.6 })
  const letra = esA ? 'A' : c.clase
  escribir(p, letra, medio - negrita.widthOfTextAtSize(letra, 26) / 2, y - 28, 26, true)
  const cod = `COD. ${codigo}`
  escribir(p, cod, medio - normal.widthOfTextAtSize(cod, 6.5) / 2, y - 39, 6.5)

  y -= altoEnc + 6

  /* ── Receptor ── */
  const altoRec = 40
  caja(p, izq, y - altoRec, ancho, altoRec, 1.6)
  const colDer = medio + 10
  dato(p, identificado ? c.receptor_documento_sigla : 'Documento', identificado ? c.receptor_documento! : 'Consumidor final sin identificar', izq + 10, y - 15)
  dato(p, 'Apellido y Nombre / Razón social', recortar(c.receptor_nombre, normal, 8.5, ancho / 2 - 160), colDer, y - 15)
  dato(p, 'Condición frente al IVA', c.receptor_condicion, izq + 10, y - 29)
  dato(p, 'Domicilio', recortar(c.receptor_domicilio || '—', normal, 8.5, ancho / 2 - 60), colDer, y - 29)
  y -= altoRec + 6

  /* ── Detalle ── */
  const cols = esA
    ? [
        { t: 'Código', a: 62, d: false },
        { t: 'Producto / Servicio', a: 0, d: false },
        { t: 'Cantidad', a: 48, d: true },
        { t: 'Precio Unit. (sin IVA)', a: 92, d: true },
        { t: '% IVA', a: 38, d: true },
        { t: 'Subtotal', a: 72, d: true },
      ]
    : [
        { t: 'Código', a: 62, d: false },
        { t: 'Producto / Servicio', a: 0, d: false },
        { t: 'Cantidad', a: 48, d: true },
        { t: 'Precio Unit.', a: 80, d: true },
        { t: 'Subtotal', a: 80, d: true },
      ]
  const fijo = cols.reduce((s, x) => s + x.a, 0)
  cols[1].a = ancho - fijo
  const xs: number[] = []
  cols.reduce((x, col) => (xs.push(x), x + col.a), izq)

  const FILA = 12
  const reservaFinal = 190
  let inicioTabla = y

  const encabezadoTabla = () => {
    cols.forEach((col, i) => {
      if (col.d) aLaDerecha(p, col.t, xs[i] + col.a - 5, y - 12, 8, true)
      else escribir(p, col.t, xs[i] + 5, y - 12, 8, true)
    })
    y -= 17
    p.pagina.drawLine({ start: { x: izq, y: y + 1 }, end: { x: der, y: y + 1 }, thickness: 1.2, color: NEGRO })
  }
  const cerrarTabla = () => caja(p, izq, y - 4, ancho, inicioTabla - y + 4, 1.6)

  encabezadoTabla()
  const lineas = c.lineas.length ? c.lineas : null
  for (const [i, l] of (lineas ?? []).entries()) {
    const quedan = (lineas!.length - i) * FILA
    if (y - FILA < MARGEN + (quedan <= FILA ? reservaFinal : 20)) {
      cerrarTabla()
      p = { pagina: doc.addPage([A4.ancho, A4.alto]), normal, negrita }
      y = A4.alto - MARGEN
      inicioTabla = y
      encabezadoTabla()
    }
    y -= FILA
    escribir(p, recortar(l.codigo_producto, normal, 8, cols[0].a - 8), xs[0] + 5, y + 2, 8)
    escribir(p, recortar(l.descripcion, normal, 8, cols[1].a - 10), xs[1] + 5, y + 2, 8)
    aLaDerecha(p, numero.format(l.cantidad), xs[2] + cols[2].a - 5, y + 2, 8)
    aLaDerecha(p, moneda.format(sinIva(l.precio_unitario, l.alicuota_iva_id)), xs[3] + cols[3].a - 5, y + 2, 8)
    if (esA) aLaDerecha(p, `${porcentajeDe(l.alicuota_iva_id)}%`, xs[4] + cols[4].a - 5, y + 2, 8)
    const ultima = cols.length - 1
    aLaDerecha(p, moneda.format(sinIva(l.importe, l.alicuota_iva_id)), xs[ultima] + cols[ultima].a - 5, y + 2, 8)
  }
  if (!lineas) {
    y -= FILA
    escribir(p, 'Sin detalle de líneas.', xs[1] + 5, y + 2, 8)
  }
  y -= 4
  cerrarTabla()

  if (y < MARGEN + reservaFinal) {
    p = { pagina: doc.addPage([A4.ancho, A4.alto]), normal, negrita }
    y = A4.alto - MARGEN
  }

  /* ── Totales ── */
  const filasTot: [string, number][] = []
  if (esA) {
    filasTot.push(['Subtotal', c.neto_gravado + c.exento + c.neto_no_gravado])
    if (c.exento > 0) filasTot.push(['Importe exento', c.exento])
    for (const a of c.alicuotas) filasTot.push([`IVA ${a.porcentaje}%`, a.importe])
  } else {
    filasTot.push(['Subtotal', c.total - c.tributos_total])
  }
  for (const t of c.tributos) filasTot.push([`${t.descripcion} ${t.alicuota}%`, t.importe])

  const anchoTot = 230
  const altoTot = filasTot.length * 12 + 30
  y -= 6
  caja(p, der - anchoTot, y - altoTot, anchoTot, altoTot, 1.6)
  let yt = y - 14
  for (const [k, v] of filasTot) {
    escribir(p, k, der - anchoTot + 10, yt)
    aLaDerecha(p, moneda.format(v), der - 10, yt)
    yt -= 12
  }
  p.pagina.drawLine({ start: { x: der - anchoTot + 8, y: yt + 7 }, end: { x: der - 8, y: yt + 7 }, thickness: 1.2, color: NEGRO })
  escribir(p, 'Importe Total', der - anchoTot + 10, yt - 6, 10, true)
  aLaDerecha(p, moneda.format(c.total), der - 10, yt - 6, 10, true)
  y -= altoTot + 6

  if (!esA) {
    caja(p, izq, y - 20, ancho, 20, 1.6)
    escribir(p, 'Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)', izq + 8, y - 13.5, 8.5, true)
    aLaDerecha(p, `IVA Contenido: ${moneda.format(c.iva_total)}`, der - 8, y - 13.5, 8.5, true)
    y -= 26
  }

  /* ── Pie: QR y CAE ── */
  y -= 8
  p.pagina.drawLine({ start: { x: izq, y }, end: { x: der, y }, thickness: 1.6, color: NEGRO })
  const ladoQr = 80
  if (urlQr) dibujarQr(p, urlQr, izq, y - 8 - ladoQr, ladoQr)
  escribir(p, 'ARCA — Comprobante Autorizado', izq + ladoQr + 14, y - 8 - ladoQr / 2, 9, true)
  aLaDerecha(p, `${c.modalidad === 'caea' ? 'CAEA' : 'CAE'} N°: ${c.cae ?? '—'}`, der, y - 8 - ladoQr / 2 + 6, 9, true)
  aLaDerecha(p, `Fecha de Vto.: ${c.cae_vencimiento ? fecha(c.cae_vencimiento) : '—'}`, der, y - 8 - ladoQr / 2 - 7, 9, true)

  return doc.save()
}

/*
  El recibo en PDF: la misma hoja que ReciboImprimible, para mandarla
  por mail. Una página: quién pagó, cuánto —también en letras—, con qué,
  y cómo quedó la cuenta.
*/
export async function reciboEnPdf(r: ReciboCompleto): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const nro = numeroRecibo(r.serie, r.numero)
  doc.setTitle(seguro(`Recibo ${nro}`))
  doc.setAuthor(seguro(r.emisor.razon_social ?? ''))
  doc.setCreator('Sistema de gestión Gross')
  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold)

  const izq = MARGEN
  const der = A4.ancho - MARGEN
  const ancho = der - izq
  const p: Pincel = { pagina: doc.addPage([A4.ancho, A4.alto]), normal, negrita }
  let y = A4.alto - MARGEN

  const leyenda = () => {
    caja(p, izq, y - 20, ancho, 20, 1.6)
    const t = seguro(LEYENDA_NO_FISCAL)
    escribir(p, t, izq + ancho / 2 - negrita.widthOfTextAtSize(t, 10) / 2, y - 14, 10, true)
    y -= 28
  }

  leyenda()

  /* ── Encabezado ── */
  const altoEnc = 78
  caja(p, izq, y - altoEnc, ancho, altoEnc, 1.6)
  escribir(p, recortar(r.emisor.nombre_fantasia || r.emisor.razon_social || '', negrita, 14, ancho / 2), izq + 10, y - 22, 14, true)
  let yl = y - 40
  if (r.emisor.razon_social) {
    dato(p, 'Razón social', r.emisor.razon_social, izq + 10, yl)
    yl -= 12
  }
  const domicilio = [r.emisor.domicilio, r.emisor.localidad].filter(Boolean).join(' — ')
  if (domicilio) {
    dato(p, 'Domicilio', recortar(domicilio, normal, 8.5, ancho / 2 - 60), izq + 10, yl)
    yl -= 12
  }
  if (r.emisor.cuit) dato(p, 'CUIT', r.emisor.cuit, izq + 10, yl)

  aLaDerecha(p, 'RECIBO', der - 10, y - 24, 16, true)
  aLaDerecha(p, `N° ${nro}`, der - 10, y - 42, 11, true)
  aLaDerecha(p, `Fecha: ${fecha(r.fecha)}`, der - 10, y - 57, 9)
  y -= altoEnc + 10

  /* ── Quién pagó y cuánto ── */
  const altoRec = 74
  caja(p, izq, y - altoRec, ancho, altoRec, 1.2)
  dato(p, 'Recibimos de', recortar(r.cliente_nombre, normal, 10, ancho - 110), izq + 10, y - 17, 10)
  let yr = y - 31
  const ident = [r.cliente_documento ? `CUIT/DNI ${r.cliente_documento}` : '', r.cliente_domicilio ?? '']
    .filter(Boolean)
    .join(' · ')
  if (ident) escribir(p, recortar(ident, normal, 8.5, ancho - 20), izq + 10, yr)
  yr -= 16
  dato(p, 'La suma de pesos', recortar(importeEnLetras(r.total), normal, 9, ancho - 110), izq + 10, yr, 9)
  yr -= 14
  dato(p, 'En concepto de', recortar(r.concepto || 'Pago a cuenta', normal, 9, ancho - 110), izq + 10, yr, 9)
  y -= altoRec + 10

  /* ── Con qué ── */
  const FILA = 14
  const inicio = y
  escribir(p, 'Forma de pago', izq + 8, y - 12, 8.5, true)
  escribir(p, 'Detalle', izq + 130, y - 12, 8.5, true)
  aLaDerecha(p, 'Importe', der - 8, y - 12, 8.5, true)
  y -= 17
  p.pagina.drawLine({ start: { x: izq, y: y + 1 }, end: { x: der, y: y + 1 }, thickness: 1.2, color: NEGRO })
  for (const pago of r.pagos) {
    y -= FILA
    escribir(p, recortar(pago.medio, normal, 8.5, 115), izq + 8, y + 3)
    const detalle = pago.cheque
      ? `${pago.cheque.banco} N° ${pago.cheque.numero}${pago.cheque.fecha_pago ? ` · al ${fecha(pago.cheque.fecha_pago)}` : ''}`
      : ''
    if (detalle) escribir(p, recortar(detalle, normal, 8.5, ancho - 230), izq + 130, y + 3)
    aLaDerecha(p, moneda.format(pago.importe), der - 8, y + 3)
  }
  y -= 8
  caja(p, izq, y, ancho, inicio - y, 1.2)
  y -= 8

  const anchoTot = 230
  caja(p, der - anchoTot, y - 26, anchoTot, 26, 1.6)
  escribir(p, 'Total recibido', der - anchoTot + 10, y - 17, 11, true)
  aLaDerecha(p, moneda.format(r.total), der - 10, y - 17, 11, true)
  y -= 40

  const saldo = Math.round(r.saldo_despues * 100) / 100
  escribir(
    p,
    saldo > 0
      ? `Saldo de la cuenta después de este pago: ${moneda.format(saldo)}`
      : saldo < 0
        ? `La cuenta queda con ${moneda.format(-saldo)} a favor.`
        : 'La cuenta queda al día.',
    izq,
    y,
    9,
  )
  y -= 14
  if (r.orden_numero) {
    escribir(p, `Cobrado por ${r.orden_vendedor ?? 'el vendedor'} · orden ${r.orden_numero}`, izq, y, 8)
    y -= 12
  }

  /* ── Firma ── */
  y -= 50
  p.pagina.drawLine({ start: { x: der - 200, y }, end: { x: der, y }, thickness: 0.8, color: NEGRO })
  escribir(p, 'Firma y aclaración', der - 200, y - 11, 8)
  y -= 34

  leyenda()

  return doc.save()
}

/** Para mandarlo por la red: el PDF en base64. */
export function aBase64(bytes: Uint8Array): string {
  let binario = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binario)
}
