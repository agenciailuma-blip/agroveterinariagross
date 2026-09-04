/*
  QR obligatorio en los comprobantes — RG 4892/2020.

  El QR no lleva un texto libre: lleva una URL de ARCA con los datos
  del comprobante en JSON codificados en Base64. Al escanearlo, ARCA
  muestra el comprobante y confirma que existe. Si el JSON no respeta
  la especificación al pie de la letra, el QR "funciona" (el celular
  abre el link) pero ARCA responde que el comprobante no es válido —
  y eso se descubre recién con un cliente o un inspector adelante.

  Especificación: https://www.afip.gob.ar/fe/qr/documentos/QRespecificaciones.pdf
*/

const URL_QR = 'https://www.arca.gob.ar/fe/qr/'

export interface DatosQr {
  fecha: string // 'YYYY-MM-DD'
  cuitEmisor: string
  puntoVenta: number
  tipoComprobante: number
  numero: number
  importeTotal: number
  moneda: string
  cotizacion: number
  tipoDocumentoReceptor: number | null
  documentoReceptor: string | null
  /** 'E' para CAE, 'A' para CAEA. */
  tipoAutorizacion: 'E' | 'A'
  codigoAutorizacion: string
}

/**
 * Base64 de un texto, pasando por UTF-8.
 *
 * `btoa` sólo acepta latin1 y explota con cualquier acento. El JSON del
 * QR hoy es todo ASCII, pero un cambio de la especificación que sume un
 * campo de texto no tiene por qué romper la facturación.
 */
function aBase64(texto: string): string {
  const bytes = new TextEncoder().encode(texto)
  let binario = ''
  for (const b of bytes) binario += String.fromCharCode(b)
  return btoa(binario)
}

export function urlQrComprobante(d: DatosQr): string {
  // El orden y los nombres son los de la especificación, y los tipos
  // importan: ARCA espera números sin comillas donde dice numérico.
  const datos: Record<string, string | number> = {
    ver: 1,
    fecha: d.fecha,
    cuit: Number(d.cuitEmisor),
    ptoVta: d.puntoVenta,
    tipoCmp: d.tipoComprobante,
    nroCmp: d.numero,
    importe: Number(d.importeTotal),
    moneda: d.moneda,
    ctz: Number(d.cotizacion),
  }

  // "De corresponder": en una Factura B a mostrador no hay receptor
  // identificado, y mandar tipo 99 con documento 0 es peor que omitirlo.
  if (d.tipoDocumentoReceptor && d.tipoDocumentoReceptor !== 99 && d.documentoReceptor) {
    datos.tipoDocRec = d.tipoDocumentoReceptor
    datos.nroDocRec = Number(d.documentoReceptor)
  }

  datos.tipoCodAut = d.tipoAutorizacion
  datos.codAut = Number(d.codigoAutorizacion)

  return `${URL_QR}?p=${aBase64(JSON.stringify(datos))}`
}
