import type { ComprobanteCompleto } from '@/lib/api/comprobante'

/*
  Cómo se muestran los importes según la clase de comprobante.

  En la Factura A los precios van SIN IVA y el IVA se discrimina abajo;
  en la B van con IVA incluido. No es una preferencia de formato: es
  cómo tiene que estar hecha cada una.

  Adentro del sistema los precios se guardan con IVA —es el precio de
  mostrador, el que lee el vendedor— así que para la A hay que
  desarmarlos.

  Esto vive acá y no adentro de una pantalla porque lo usan los dos
  formatos de impresión, el ticket y la hoja A4. Si cada uno lo
  calculara por su lado, el día que se toque uno los dos dejarían de
  coincidir, y serían dos versiones del mismo comprobante con números
  distintos.
*/
export function presentacionDe(c: ComprobanteCompleto) {
  const esA = c.clase === 'A'

  const porcentajeDe = (alicuotaId: number) =>
    c.alicuotas.find((a) => a.alicuota_iva_id === alicuotaId)?.porcentaje ?? 0

  const sinIva = (importe: number, alicuotaId: number) =>
    esA ? importe / (1 + porcentajeDe(alicuotaId) / 100) : importe

  // El código de ARCA del tipo de comprobante es el propio id.
  const codigo = String(c.tipo_comprobante_id).padStart(3, '0')
  const identificado = c.receptor_tipo_documento_id !== 99 && !!c.receptor_documento
  const comprobante = `${String(c.punto_venta).padStart(4, '0')} ${String(c.numero).padStart(8, '0')}`

  return { esA, porcentajeDe, sinIva, codigo, identificado, comprobante }
}

export function fechaCorta(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR')
}

/** La hora de emisión, como la imprime la Hasar. */
export function horaDe(c: ComprobanteCompleto): string {
  const cuando = c.autorizado_en ?? c.creado_en
  return new Date(cuando).toLocaleTimeString('es-AR', { hour12: false })
}
