import { describe, expect, it } from 'vitest'
import {
  aCsv,
  comoFilaDeCompra,
  comoFilaDePercepcion,
  comoFilaDeVenta,
  comprasACsv,
  percepcionesACsv,
  totalesDeCompras,
  totalesDePercepciones,
} from '@/lib/api/libroIva'
import type { CrudoComprobante, CrudoCompra, CrudoTributo, FilaPercepcion } from '@/lib/api/libroIva'

/*
  El archivo de percepciones de IIBB para Rentas.

  Gross es agente de **percepción** en Misiones —régimen 14, confirmado
  por el contador por escrito— y no de retención. Lo que se presenta es
  el detalle de lo percibido, y del otro lado hay alguien que suma las
  columnas: si un número está mal, aparece como una diferencia en una
  declaración jurada.
*/

function fila(extra: Partial<FilaPercepcion> = {}): FilaPercepcion {
  return {
    signo: 1,
    fecha: '2026-09-03',
    tipo: 'Factura A',
    punto_venta: 1,
    numero: 48014,
    cliente: 'ESTANCIA LA ESPERANZA S.R.L.',
    documento: '30712234567',
    concepto: 'Percepción de IIBB',
    base_imponible: 1000000,
    alicuota: 3.31,
    importe: 33100,
    ...extra,
  }
}

/*
  Lo que devuelve la base: los importes SIEMPRE positivos, y el signo
  puesto por el tipo de comprobante. Armar la fila a mano con importes
  ya negativos probaría la suma y no la regla, que es lo que importa.
*/
function crudo(signo: number, descripcion = 'Factura A'): CrudoTributo {
  return {
    descripcion: 'Percepción de IIBB',
    base_imponible: 1000000,
    alicuota: 3.31,
    importe: 33100,
    comprobante: {
      fecha: '2026-09-03',
      numero: 48014,
      receptor_nombre: 'ESTANCIA LA ESPERANZA S.R.L.',
      receptor_documento: '30712234567',
      tipo: { descripcion, signo },
      punto: { numero: 1 },
    },
  }
}

describe('la percepción, como sale de la base', () => {
  /*
    El caso que hace falta que esté bien: una nota de crédito devuelve
    la percepción. La base guarda 33.100 en positivo en los dos casos, y
    lo que las distingue es el signo del tipo de comprobante. Si no se
    aplicara, la declaración diría que se percibió el doble — y esa
    diferencia se paga.
  */
  it('la nota de crédito resta lo que devolvió', () => {
    const factura = comoFilaDePercepcion(crudo(1))
    const notaDeCredito = comoFilaDePercepcion(crudo(-1, 'Nota de Crédito A'))

    expect(factura.importe).toBe(33100)
    expect(notaDeCredito.importe).toBe(-33100)
    expect(notaDeCredito.base_imponible).toBe(-1000000)

    const t = totalesDePercepciones([factura, notaDeCredito])
    expect(t.percibido).toBe(0)
    expect(t.base).toBe(0)
    expect(t.percepciones).toBe(2)
  })

  /*
    Los clientes se cuentan por documento y no por nombre: en la
    declaración lo que identifica al percibido es el CUIT, y el mismo
    cliente puede estar escrito de dos formas distintas.
  */
  it('cuenta los clientes por CUIT y no por nombre', () => {
    const t = totalesDePercepciones([
      fila({ cliente: 'ESTANCIA LA ESPERANZA SRL' }),
      fila({ cliente: 'Estancia La Esperanza S.R.L.', numero: 48015 }),
      fila({ cliente: 'OTRO', documento: '20111111112', numero: 48016 }),
    ])

    expect(t.clientes).toBe(2)
  })
})

describe('el archivo que abre en Excel', () => {
  it('lleva el CUIT, la base y la alícuota, que es lo que pide Rentas', () => {
    const csv = percepcionesACsv([fila()])
    const [encabezado, primera] = csv.split('\n')

    expect(encabezado).toContain('CUIT / DNI')
    expect(encabezado).toContain('Base imponible')
    expect(encabezado).toContain('Alícuota %')
    expect(primera).toContain('30712234567')
  })

  /*
    Coma decimal y punto y coma como separador: es lo que necesita el
    Excel que usan. Con punto decimal, "33100.5" entra como texto y no
    se puede sumar.
  */
  it('escribe los números como los espera el Excel de Gross', () => {
    const csv = percepcionesACsv([fila({ importe: 33100.5 })])

    expect(csv).toContain('33100,5')
    expect(csv.split('\n')[0]).toContain(';')
  })

  it('empieza con el BOM, para que Excel lea bien los acentos', () => {
    const csv = percepcionesACsv([fila()])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('Alícuota %')
  })

  it('un mes sin percepciones sale con encabezado y sin filas', () => {
    expect(percepcionesACsv([]).split('\n')).toHaveLength(1)
  })
})

/*
  El libro de compras, con el formato que mandó el contador el 16/11:
  una fila por comprobante, cada percepción en su columna y las notas de
  crédito en negativo, para que sumar una columna dé el mes.
*/
describe('las compras para el contador', () => {
  const factura: CrudoCompra = {
    fecha: '2026-09-10',
    punto_venta: 3,
    numero: 45678,
    neto_gravado: 1100,
    neto_no_gravado: 20,
    exento: 50,
    iva_total: 220.5,
    total: 1475.5,
    proveedor: { nombre: 'Laboratorio', numero_documento: '30111111118' },
    tipo: { descripcion: 'Factura A', clase: 'A', familia: 'factura', signo: 1 },
    compra_tributo: [
      { descripcion: 'Percepción de IVA', importe: 30 },
      { descripcion: 'Percepción de IIBB', importe: 50 },
      { descripcion: 'Impuestos internos', importe: 5 },
    ],
  }

  it('una fila por factura, con el tipo abreviado y cada percepción en su columna', () => {
    const f = comoFilaDeCompra(factura)
    expect([f.fecha, f.tipo, f.letra, f.suc, f.numero]).toEqual(['10/09/2026', 'Fac', 'A', 3, 45678])
    expect([f.neto, f.iva, f.exento_no_gravado]).toEqual([1100, 220.5, 70])
    expect([f.perc_iva, f.perc_dgr, f.imp_internos, f.perc_ganancias, f.ret_suss, f.otros]).toEqual([30, 50, 5, 0, 0, 0])
  })

  it('un concepto sin columna en su planilla va a «Otros» y no se pierde', () => {
    const f = comoFilaDeCompra({ ...factura, compra_tributo: [{ descripcion: 'Otro', importe: 7 }] })
    expect(f.otros).toBe(7)
  })

  it('la nota de crédito resta, así la suma da el mes', () => {
    const nota: CrudoCompra = {
      ...factura,
      numero: 45679,
      neto_gravado: 100,
      neto_no_gravado: 0,
      exento: 0,
      iva_total: 21,
      total: 121,
      tipo: { descripcion: 'Nota de Crédito A', clase: 'A', familia: 'nota_credito', signo: -1 },
      compra_tributo: [],
    }
    expect(comoFilaDeCompra(nota).tipo).toBe('N.C.')
    const t = totalesDeCompras([comoFilaDeCompra(factura), comoFilaDeCompra(nota)])
    expect(t.comprobantes).toBe(2)
    expect(t.neto).toBe(1000)
    expect(t.iva).toBe(199.5)
    expect(t.total).toBe(1354.5)
  })

  it('el archivo arranca con el comercio, el CUIT y el período', () => {
    const csv = comprasACsv([comoFilaDeCompra(factura)], {
      nombre: 'Agroveterinaria Gross',
      razonSocial: 'GROSS ERNESTO HUGO',
      cuit: '20146369767',
      desde: '2026-10-01',
      hasta: '2026-10-31',
    })
    const renglones = csv.replace('﻿', '').split('\n')
    expect(renglones.slice(0, 5)).toEqual([
      'AGROVETERINARIA GROSS',
      'GROSS ERNESTO HUGO Cuit: 20-14636976-7',
      '',
      'Mis comprobantes recibidos',
      'Periodo Desde: 01/10/2026 Hasta: 31/10/2026',
    ])
    expect(renglones[5]).toBe(
      'Fecha;Tipo Comp.;Letra;Suc;Numero;Proveedor;Cuit;Neto;Iva;Imp.Int.;Exento y No Grabado;Perc.DGR;Perc.IVA;Perc.GAN.;Ret.Sus.;Otros;Total',
    )
  })
})

/*
  Las ventas, con las columnas de Mis Comprobantes Emitidos de ARCA, que
  es como las tiene el contador.
*/
describe('las ventas para el contador', () => {
  const factura: CrudoComprobante = {
    fecha: '2026-10-08',
    numero: 3250,
    neto_gravado: 1000,
    neto_no_gravado: 0,
    exento: 0,
    iva_total: 210,
    tributos_total: 33.1,
    total: 1243.1,
    cae: '86406248981739',
    moneda: 'PES',
    cotizacion: '1.000000',
    receptor_nombre: 'VITALE ANALIA',
    receptor_tipo_documento_id: 80,
    receptor_documento: '27348262551',
    tipo: { id: 1, descripcion: 'Factura A', signo: 1 },
    punto: { numero: 5 },
  }

  it('el tipo con su código, el documento y la moneda como en ARCA', () => {
    const f = comoFilaDeVenta(factura)
    expect([f.fecha, f.tipo, f.punto_venta, f.numero, f.numero_hasta, f.cae]).toEqual([
      '08/10/2026', '1 - Factura A', 5, 3250, '', '86406248981739',
    ])
    expect([f.tipo_documento, f.documento, f.tipo_cambio, f.moneda]).toEqual(['CUIT', '27348262551', 1, '$'])
  })

  it('el consumidor final sin identificar va con 99 y documento 0', () => {
    const f = comoFilaDeVenta({ ...factura, receptor_tipo_documento_id: 99, receptor_documento: null })
    expect([f.tipo_documento, f.documento]).toEqual(['99', '0'])
  })

  it('la nota de crédito resta', () => {
    const f = comoFilaDeVenta({ ...factura, tipo: { id: 3, descripcion: 'Nota de Crédito A', signo: -1 } })
    expect([f.tipo, f.neto_gravado, f.iva, f.total]).toEqual(['3 - Nota de Crédito A', -1000, -210, -1243.1])
  })

  it('las columnas son las de ARCA y las percepciones no van', () => {
    const [encabezado] = aCsv([comoFilaDeVenta(factura)]).replace('﻿', '').split('\n')
    expect(encabezado).toBe(
      'Fecha;Tipo;Punto de venta;Número Desde;Número hasta;Cód. Autorización;Tipo Doc. Receptor;Nro. Doc. Receptor;Denominación Receptor;Tipo Cambio;Moneda;Imp. Neto Gravado;Imp. Neto No Gravado;Imp. Op. Exentas;IVA;Imp. Total',
    )
  })
})
