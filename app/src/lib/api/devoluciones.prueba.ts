import { describe, expect, it } from 'vitest'
import { quedaAlgoPorDevolver, totalADevolver } from '@/lib/api/devoluciones'
import type { LineaDevolvible } from '@/lib/api/devoluciones'

/*
  Devolver parte de una venta.

  El reparto del IVA, el reingreso del stock y la nota de crédito los
  hace la base, y se verificaron contra la base: dos devoluciones
  sucesivas agotan las dos unidades, la tercera se rechaza, y los totales
  devueltos suman exactamente el total de la venta.

  Lo que se prueba acá es el número que el cajero le dice al cliente
  antes de confirmar. Tiene que ser el mismo que después sale impreso en
  la nota de crédito: si la pantalla promete $50.000 y el comprobante
  dice otra cosa, la discusión es en el mostrador.
*/

function linea(extra: Partial<LineaDevolvible> = {}): LineaDevolvible {
  return {
    venta_linea_id: 'l1',
    orden: 1,
    producto_id: 'p1',
    codigo_producto: '001',
    descripcion: 'ALIM BAL PROPLAN CACH 15KG',
    vendida: 2,
    devuelta: 0,
    disponible: 2,
    precio_unitario: 50000,
    importe: 100000,
    alicuota: 21,
    condicion_iva: 'gravado',
    ...extra,
  }
}

describe('cuánta plata se le devuelve', () => {
  it('la mitad de una línea es la mitad del importe', () => {
    const total = totalADevolver([linea()], new Map([['l1', 1]]))

    expect(total).toBe(50000)
  })

  it('devolver todo lo de la línea devuelve su importe entero', () => {
    expect(totalADevolver([linea()], new Map([['l1', 2]]))).toBe(100000)
  })

  it('lo que no se marcó no suma', () => {
    const lineas = [linea(), linea({ venta_linea_id: 'l2', importe: 120000, vendida: 2 })]

    expect(totalADevolver(lineas, new Map([['l1', 1]]))).toBe(50000)
  })

  it('suma lo marcado de varias líneas', () => {
    const lineas = [linea(), linea({ venta_linea_id: 'l2', importe: 120000, vendida: 2 })]

    expect(totalADevolver(lineas, new Map([['l1', 1], ['l2', 2]]))).toBe(170000)
  })

  it('sin nada marcado, cero', () => {
    expect(totalADevolver([linea()], new Map())).toBe(0)
  })

  /*
    El caso que obliga a prorratear sobre el importe y no sobre el precio
    de lista.

    Una línea con descuento se cobró menos de lo que dice el precio
    unitario. Devolver `precio_unitario * cantidad` le daría al cliente
    más plata de la que pagó, y la diferencia sale del mostrador.
  */
  it('una línea con descuento devuelve lo que se cobró, no el precio de lista', () => {
    const conDescuento = linea({ precio_unitario: 50000, importe: 90000, vendida: 2 })

    expect(totalADevolver([conDescuento], new Map([['l1', 1]]))).toBe(45000)
  })

  /*
    Productos que se venden por peso: media bolsa es una cantidad válida.
  */
  it('acepta cantidades fraccionadas', () => {
    const granel = linea({ vendida: 2.5, disponible: 2.5, importe: 25000 })

    expect(totalADevolver([granel], new Map([['l1', 0.5]]))).toBe(5000)
  })

  /*
    Redondeo al centavo. Un tercio de $100 no da un número redondo, y el
    importe que se muestra tiene que ser el que se puede cobrar.
  */
  it('redondea al centavo', () => {
    const l = linea({ vendida: 3, disponible: 3, importe: 100 })
    const total = totalADevolver([l], new Map([['l1', 1]]))

    expect(total).toBe(33.33)
    expect(Number.isInteger(total * 100)).toBe(true)
  })

  it('una línea ya devuelta del todo no aporta nada aunque quede marcada', () => {
    const agotada = linea({ devuelta: 2, disponible: 0 })

    // El 0 marcado es lo que corresponde: la pantalla no deja poner más.
    expect(totalADevolver([agotada], new Map([['l1', 0]]))).toBe(0)
  })
})

describe('si todavía queda algo por devolver', () => {
  it('con una línea entera sin devolver, queda', () => {
    expect(quedaAlgoPorDevolver([linea()])).toBe(true)
  })

  it('con una parte devuelta, todavía queda', () => {
    expect(quedaAlgoPorDevolver([linea({ devuelta: 1, disponible: 1 })])).toBe(true)
  })

  /*
    Cuando no queda nada, la pantalla no tiene que ofrecer el botón. La
    base lo rechazaría igual, pero enterarse después de abrir el diálogo
    y marcar cantidades es peor que no ver el botón.
  */
  it('con todo devuelto, no queda nada', () => {
    expect(quedaAlgoPorDevolver([linea({ devuelta: 2, disponible: 0 })])).toBe(false)
  })

  it('alcanza con que quede algo en una sola línea', () => {
    const lineas = [
      linea({ devuelta: 2, disponible: 0 }),
      linea({ venta_linea_id: 'l2', devuelta: 1, disponible: 1 }),
    ]

    expect(quedaAlgoPorDevolver(lineas)).toBe(true)
  })

  it('una venta sin líneas no ofrece nada', () => {
    expect(quedaAlgoPorDevolver([])).toBe(false)
  })
})
