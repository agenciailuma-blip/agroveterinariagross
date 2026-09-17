import { obtenerComprobanteCompleto, registrarImpresion } from '@/lib/api/comprobante'
import type { ComprobanteCompleto } from '@/lib/api/comprobante'
import { obtenerNoFiscalCompleto } from '@/lib/api/noFiscal'
import { ticketEscPos } from '@/lib/comprobante/escpos'
import { ticketNoFiscalEscPos } from '@/lib/comprobante/escposNoFiscal'
import { destinoDeImpresion } from '@/lib/comprobante/destino'
import { enEscritorio, imprimirTicket } from '@/lib/escritorio'
import { urlQrComprobante } from '@/lib/arca/qr'
import type { Terminal } from '@/lib/terminal'

/*
  Imprimir sin que nadie apriete nada.

  Pedido de Francisco el 17/09, probando la caja en el local: hoy hay que
  cobrar, después abrir el comprobante y recién ahí imprimir. Son tres
  pasos con el cliente parado adelante, y los tres los hace la misma
  persona para el mismo papel.

  Lo que se usa acá es exactamente lo mismo que usa la ventana del
  comprobante — los mismos bytes, la misma impresora, el mismo registro
  de impresión—, así que el ticket que sale solo no puede ser distinto
  del que sale a mano. Por eso está en un archivo compartido y no
  copiado adentro de la caja.
*/

/** La dirección del QR de ARCA. La impresora dibuja el suyo con el texto. */
export function urlQrDe(c: ComprobanteCompleto): string | null {
  if (!c.cae) return null
  return urlQrComprobante({
    fecha: c.fecha,
    cuitEmisor: c.emisor.cuit ?? '',
    puntoVenta: c.punto_venta,
    tipoComprobante: c.tipo_comprobante_id,
    numero: c.numero,
    importeTotal: c.total,
    moneda: c.moneda,
    cotizacion: c.cotizacion,
    tipoDocumentoReceptor: c.receptor_tipo_documento_id,
    documentoReceptor: c.receptor_documento,
    tipoAutorizacion: c.modalidad === 'caea' ? 'A' : 'E',
    codigoAutorizacion: c.cae,
  })
}

/*
  Si esta computadora puede imprimir sola.

  Desde el navegador no: ninguna página web puede mandarle bytes a una
  impresora del local. Y sin impresora elegida tampoco, que es el caso
  de los puestos que no tienen una al lado.
*/
export function puedeImprimirSolo(
  terminal: Terminal | null | undefined,
  emisor?: { impresora_host?: string | null; impresora_puerto?: string | number | null },
): boolean {
  return enEscritorio && !!destinoDeImpresion(terminal, emisor)
}

export async function imprimirComprobante(
  comprobanteId: string,
  terminal: Terminal | null | undefined,
): Promise<void> {
  const c = await obtenerComprobanteCompleto(comprobanteId)
  const destino = destinoDeImpresion(terminal, c.emisor)
  if (!destino) throw new Error('Esta computadora todavía no tiene impresora del mostrador.')

  await imprimirTicket(ticketEscPos(c, urlQrDe(c)), destino)

  /*
    El contador de impresiones se actualiza después de imprimir, y si
    falla no se avisa: el papel ya salió. Un error acá le haría creer al
    cajero que tiene que imprimir de nuevo.
  */
  await registrarImpresion(comprobanteId).catch(() => {})
}

export async function imprimirNoFiscal(
  noFiscalId: string,
  terminal: Terminal | null | undefined,
): Promise<void> {
  const d = await obtenerNoFiscalCompleto(noFiscalId)
  const destino = destinoDeImpresion(terminal, d.emisor)
  if (!destino) throw new Error('Esta computadora todavía no tiene impresora del mostrador.')

  await imprimirTicket(ticketNoFiscalEscPos(d), destino)
}
