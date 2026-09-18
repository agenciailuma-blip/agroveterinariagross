import { describe, expect, it } from 'vitest'
import {
  armarComprobante,
  desglosarIva,
  percepcionIibb,
  totalExento,
} from '@/lib/local/factura'
import type { LineaFiscal } from '@/lib/local/factura'

/*
  ─────────────────────────────────────────────────────────────
  La cuenta fiscal hecha en la terminal

  Esto es lo que va a salir impreso y entregado durante un corte de
  internet, sin ningún servidor que lo revise. Un error acá no se ve:
  se ve cuando el contador cruza el mes, o cuando ARCA rechaza el lote
  entero al informarlo.

  Los números de referencia salen de las funciones del servidor
  —`vista_venta_iva`, `calcular_percepcion_iibb`, `preparar_comprobante`—
  y están verificados contra la base real. Si alguna vez se toca alguna
  de esas funciones, estas pruebas tienen que fallar: para eso están.
  ─────────────────────────────────────────────────────────────
*/

/** Las de Gross: 21% y 10,5% —el alimento balanceado va al 10,5—. */
const PORCENTAJES = new Map([
  [5, 21],
  [4, 10.5],
  [3, 0],
])

function linea(importe: number, alicuota = 5, condicion = 'gravado'): LineaFiscal {
  return { importe, alicuota_iva_id: alicuota, condicion_iva: condicion }
}

describe('el IVA que viene adentro del precio', () => {
  /*
    El ticket del local del 17/09: un collar de $6.400 al 21%.
    Impreso decía neto $5.289,26 e IVA $1.110,74.
  */
  it('saca el neto y el IVA de un precio con IVA adentro', () => {
    const [a] = desglosarIva([linea(6400)], PORCENTAJES)
    expect(a.base_imponible).toBe(5289.26)
    expect(a.importe).toBe(1110.74)
    expect(a.base_imponible + a.importe).toBe(6400)
  })

  /*
    El otro ticket del local: alimento al 10,5% ($62.300) y un
    antiparasitario al 21% ($7.600). Impreso decía 10,50% neto
    $56.380,09 · IVA $5.919,91, y 21% neto $6.280,99 · IVA $1.319,01.
  */
  it('separa una venta con dos alícuotas, como la del local', () => {
    const d = desglosarIva([linea(62300, 4), linea(7600, 5)], PORCENTAJES)

    expect(d).toHaveLength(2)
    const diez = d.find((x) => x.alicuota_iva_id === 4)!
    const veintiuno = d.find((x) => x.alicuota_iva_id === 5)!

    expect(diez.base_imponible).toBe(56380.09)
    expect(diez.importe).toBe(5919.91)
    expect(veintiuno.base_imponible).toBe(6280.99)
    expect(veintiuno.importe).toBe(1319.01)
  })

  /*
    Se suma primero y se redondea después, igual que la vista del
    servidor. Al revés —redondear cada línea y sumar— da un centavo de
    más o de menos, y ese centavo hace que la factura no cierre contra
    lo que el cliente pagó.
  */
  it('agrupa antes de redondear, no al revés', () => {
    const juntas = desglosarIva([linea(0.1), linea(0.1), linea(0.1)], PORCENTAJES)
    const total = juntas[0].base_imponible + juntas[0].importe
    expect(total).toBe(0.3)
  })

  it('lo exento no entra en el desglose de IVA', () => {
    const d = desglosarIva([linea(1000), linea(500, 3, 'exento')], PORCENTAJES)
    expect(d).toHaveLength(1)
    expect(totalExento([linea(1000), linea(500, 3, 'exento')])).toBe(500)
  })

  /*
    Sin la alícuota bajada no se inventa un número: se para y se dice
    qué hacer. Facturar con la alícuota equivocada es peor que no
    facturar, porque queda entregado.
  */
  it('se planta si no bajó una alícuota a esta computadora', () => {
    expect(() => desglosarIva([linea(1000, 99)], PORCENTAJES)).toThrow(/Sincronizá con internet/)
  })
})

describe('la percepción de IIBB de Misiones', () => {
  const RI = { condicion_iva_id: 1, excluido: false, alicuota: 3.31, minimo: 24000 }

  /*
    El número que Lucas describió: "percibo cada factura mayor a
    setecientos y pico mil netos". Con 3,31% y mínimo $24.000, el corte
    cae en $725.075 de neto.
  */
  it('no percibe si la percepción no supera el mínimo', () => {
    expect(percepcionIibb(700000, RI)).toBe(0)
    expect(percepcionIibb(725000, RI)).toBe(0)
  })

  it('percibe cuando lo supera', () => {
    expect(percepcionIibb(800000, RI)).toBe(26480)
  })

  /*
    El mínimo se mira contra la percepción, no contra la venta. Si se
    comparara contra la venta, una de $30.000 ya percibiría.
  */
  it('el mínimo se compara contra la percepción, no contra la venta', () => {
    expect(percepcionIibb(30000, RI)).toBe(0)
  })

  /*
    El borde justo: cuando la percepción da exactamente el mínimo, NO se
    percibe. La base dice `<=` y acá tiene que decir lo mismo; con `<`,
    una venta de $725.075,53 percibiría en la terminal y no en el
    servidor, y la misma venta tendría dos totales distintos.
  */
  it('en el borde exacto no percibe, igual que la base', () => {
    // 725.075,53 × 3,31% redondea a 24.000,00 exactos: no percibe.
    expect(percepcionIibb(725075.53, RI)).toBe(0)
    // Un peso más arriba ya lo supera, y ahí sí.
    expect(percepcionIibb(725100, RI)).toBe(24000.81)
  })

  it('no se le percibe a quien no es Responsable Inscripto', () => {
    expect(percepcionIibb(800000, { ...RI, condicion_iva_id: 5 })).toBe(0)
  })

  it('no se le percibe a quien tiene certificado de exclusión', () => {
    expect(percepcionIibb(800000, { ...RI, excluido: true })).toBe(0)
  })

  it('sin alícuota cargada no percibe', () => {
    expect(percepcionIibb(800000, { ...RI, alicuota: 0 })).toBe(0)
  })
})

describe('el comprobante armado en la terminal', () => {
  const base = {
    porcentajes: PORCENTAJES,
    clase: 'B',
    tipo_comprobante_id: 6,
    percepcion: { condicion_iva_id: 5, excluido: false, alicuota: 3.31, minimo: 24000 },
  }

  it('arma una Factura B como la del local', () => {
    const c = armarComprobante({
      ...base,
      lineas: [linea(62300, 4), linea(7600, 5)],
      totalVenta: 69900,
    })

    expect(c.neto_gravado).toBe(62661.08)
    expect(c.iva_total).toBe(7238.92)
    expect(c.total).toBe(69900)
    expect(c.alicuotas).toHaveLength(2)
    expect(c.tributos).toEqual([])
  })

  /*
    Con percepción, el total de la factura es MÁS que el total de la
    venta: el cliente paga la mercadería y además la percepción.
  */
  it('a un Responsable Inscripto le suma la percepción al total', () => {
    const c = armarComprobante({
      ...base,
      clase: 'A',
      tipo_comprobante_id: 1,
      lineas: [linea(1000000)],
      totalVenta: 1000000,
      percepcion: { condicion_iva_id: 1, excluido: false, alicuota: 3.31, minimo: 24000 },
    })

    expect(c.neto_gravado).toBe(826446.28)
    expect(c.tributos_total).toBe(27355.37)
    expect(c.total).toBe(1027355.37)
    expect(c.tributos[0]).toMatchObject({
      tributo_id: 2,
      descripcion: 'Percepción IIBB Misiones',
      base_imponible: 826446.28,
    })
  })

  /*
    El total sale del total de la VENTA, no de sumar el desglose. Es lo
    que hace el servidor, y es lo correcto: el cliente ya pagó ese
    número y el desglose sólo lo explica.

    El caso está forzado a propósito —en una venta normal los dos dan lo
    mismo— porque lo que se quiere fijar es de dónde sale el número. Si
    alguna vez difieren por un redondeo, el comprobante tiene que decir
    lo que se cobró: es lo que después se informa a ARCA y lo que el
    cliente tiene en la mano.
  */
  it('el total es el de la venta, no la suma del desglose', () => {
    const c = armarComprobante({ ...base, lineas: [linea(1000)], totalVenta: 999.99 })
    expect(c.total).toBe(999.99)
    expect(c.neto_gravado + c.iva_total).toBe(1000)
  })

  it('una venta con exento lo lleva en su propio renglón', () => {
    const c = armarComprobante({
      ...base,
      lineas: [linea(1000), linea(500, 3, 'exento')],
      totalVenta: 1500,
    })
    expect(c.exento).toBe(500)
    expect(c.neto_gravado).toBe(826.45)
    expect(c.total).toBe(1500)
  })
})
