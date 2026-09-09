import type { NoFiscalCompleto } from '@/lib/api/noFiscal'
import { LEYENDA_NO_FISCAL, numeroNoFiscal } from '@/lib/api/noFiscal'
import { Cinta } from '@/lib/comprobante/escpos'
import { fechaCorta } from '@/lib/comprobante/presentacion'
import { moneda, numero } from '@/lib/tipos'

/*
  El no fiscal en el idioma que entiende la impresora del mostrador.

  Archivo aparte de escpos.ts por la misma razón que TicketNoFiscal es un
  componente aparte: acá no hay ninguna llamada a `qr()` ni ningún campo
  de CAE que imprimir, porque `NoFiscalCompleto` no los tiene. La
  imposibilidad de imprimir algo con aspecto de factura no depende de que
  alguien se acuerde de no hacerlo.

  Lo que sí se comparte es la Cinta: la forma de hablarle a la impresora
  —dónde centrar, dónde poner negrita, cómo cortar el papel, y que los
  acentos van en latin1— es la misma para los dos papeles.
*/

const ESC = 0x1b
const ANCHO = 48

/** Centra un texto dentro del ancho del rollo. */
function centrado(t: string): string {
  const sobra = ANCHO - t.length
  return sobra > 0 ? ' '.repeat(Math.floor(sobra / 2)) + t : t
}

export function ticketNoFiscalEscPos(d: NoFiscalCompleto): Uint8Array {
  const c = new Cinta()
  const esRemito = d.tipo_clave === 'remito'

  c.crudo(ESC, 0x40) // reiniciar

  // ── La leyenda, primero y en grande ──
  c.alinear(1).negrita(true)
  c.linea(LEYENDA_NO_FISCAL)
  c.negrita(false)
  c.linea()

  /*
    Sin datos del emisor.

    CUIT, domicilio e inicio de actividades son obligatorios en una
    factura y no acá: este papel no es un comprobante fiscal. En el rollo
    de 80 mm eran seis renglones que no le servían a nadie.
  */
  c.alinear(0)

  // ── Identificación ──
  c.separador()
  c.negrita(true)
  c.columnas(d.tipo_descripcion.toUpperCase(), numeroNoFiscal(d.tipo_clave, d.serie, d.numero))
  c.negrita(false)
  c.columnas('Fecha', fechaCorta(d.fecha))
  if (d.tipo_clave === 'presupuesto' && d.valido_hasta) {
    c.columnas('Válido hasta', fechaCorta(d.valido_hasta))
  }
  if (d.estado === 'anulado') {
    c.negrita(true).alinear(1).linea('*** ANULADO ***').alinear(0).negrita(false)
  }

  // ── Receptor ──
  c.separador()
  c.linea(`Cliente: ${d.receptor_nombre}`)
  c.linea(`Domicilio: ${d.receptor_domicilio || 'n/n'}`)
  if (d.receptor_documento) {
    c.linea(`${d.receptor_documento_sigla || 'CUIT/DNI'}: ${d.receptor_documento}`)
  }

  // ── Entrega: sólo el remito ──
  if (esRemito) {
    c.separador()
    c.negrita(true).linea('ENTREGA').negrita(false)
    c.linea(`Domicilio: ${d.entrega_domicilio || 'n/n'}`)
    if (d.entrega_localidad) c.linea(`Localidad: ${d.entrega_localidad}`)
    if (d.entrega_contacto) c.linea(`Contacto: ${d.entrega_contacto}`)
    if (d.transportista) c.linea(`Transporte: ${d.transportista}`)
  }

  /*
    ── Detalle ──

    En el remito no van precios. Lucas, 07/09: el remito acompaña a la
    factura, o la factura sale después si es cuenta corriente, así que
    el precio va en la factura. Los precios se siguen guardando —son lo
    que permite valorizar lo que salió sin cobrarse— pero no se
    imprimen.

    Vale para los tres formatos: rollo en pantalla, hoja A4 y estos
    bytes. Los tres tienen que decir lo mismo, y por eso la condición
    está escrita igual en los tres.
  */
  const conPrecios = !esRemito

  c.separador()
  for (const l of d.lineas) {
    c.linea(l.descripcion)
    const muestraPrecio = conPrecios && l.precio_unitario > 0
    const izq = muestraPrecio
      ? `  ${numero.format(l.cantidad)} x ${moneda.format(l.precio_unitario)}`
      : `  ${numero.format(l.cantidad)}`
    c.columnas(izq, muestraPrecio ? moneda.format(l.importe) : '')
  }
  if (d.lineas.length === 0) c.linea('Sin detalle de líneas.')

  // ── Total, sin desglose de IVA ──
  if (conPrecios && d.total > 0) {
    c.separador()
    c.negrita(true).columnas('TOTAL:', moneda.format(d.total)).negrita(false)
  }

  /*
    El remito cierra con bultos. Sin total en pesos hace falta algún
    número para verificar la entrega, y ese número es cuántas unidades
    salieron — que además es lo que se cuenta al recibir.
  */
  if (esRemito && d.lineas.length > 0) {
    c.separador()
    c.negrita(true)
      .columnas(
        'TOTAL DE UNIDADES:',
        numero.format(d.lineas.reduce((s, l) => s + Number(l.cantidad), 0)),
      )
      .negrita(false)
  }

  if (d.observaciones) {
    c.separador()
    c.linea(d.observaciones)
  }

  // ── Recibí conforme ──
  if (esRemito) {
    c.separador()
    c.linea()
    c.linea('Recibí conforme')
    c.linea()
    c.linea('Firma: ..............................')
    c.linea()
    c.linea('Aclaración: .........................')
    c.linea()
    c.linea('Fecha: ...../...../...........')
  }

  c.separador()
  c.negrita(true).linea(centrado(LEYENDA_NO_FISCAL)).negrita(false)
  if (d.venta_codigo) c.linea(centrado(`Operación ${d.venta_codigo}`))

  c.cortar()
  return c.bytes()
}
