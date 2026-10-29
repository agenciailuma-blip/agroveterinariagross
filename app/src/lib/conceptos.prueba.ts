import { describe, expect, it } from 'vitest'
import { agruparPorConcepto, totalesPorConcepto } from '@/lib/conceptos'

/*
  El ejemplo de Lucas: Octaderm $15.000 + Royal Canin $65.000 se imprimen
  como «Repuestos pulverizadora» $80.000, y los productos reales siguen
  estando para ver qué se llevó.
*/

const linea = (orden: number, descripcion: string, importe: number, concepto: string | null, alicuota = 5) => ({
  orden,
  codigo_producto: `C${orden}`,
  descripcion,
  cantidad: 1,
  precio_unitario: importe,
  importe,
  alicuota_iva_id: alicuota,
  concepto,
})

describe('los productos asociados', () => {
  it('los renglones del mismo concepto salen en uno, por el total, en el lugar del primero', () => {
    const impresos = agruparPorConcepto(
      [
        linea(1, 'Octaderm', 15000, 'Repuestos pulverizadora'),
        linea(2, 'Collar', 3000, null),
        linea(3, 'Royal Canin', 65000, 'Repuestos pulverizadora'),
      ],
      { porAlicuota: true },
    )
    expect(impresos.map((l) => [l.descripcion, l.cantidad, l.precio_unitario, l.importe])).toEqual([
      ['Repuestos pulverizadora', 1, 80000, 80000],
      ['Collar', 1, 3000, 3000],
    ])
    expect(impresos[0].asociados?.map((l) => l.descripcion)).toEqual(['Octaderm', 'Royal Canin'])
  })

  it('en la factura, un renglón por alícuota; en el comprobante interno, uno solo', () => {
    const lineas = [
      linea(1, 'Octaderm', 15000, 'Fumigación', 5),
      linea(2, 'Alimento', 10000, 'Fumigación', 4),
    ]
    expect(agruparPorConcepto(lineas, { porAlicuota: true }).map((l) => [l.importe, l.alicuota_iva_id])).toEqual([
      [15000, 5],
      [10000, 4],
    ])
    expect(agruparPorConcepto(lineas, { porAlicuota: false }).map((l) => l.importe)).toEqual([25000])
  })

  it('sin conceptos, los renglones quedan como estaban', () => {
    const lineas = [linea(1, 'Collar', 3000, null), linea(2, 'Correa', 2000, '  ')]
    expect(agruparPorConcepto(lineas, { porAlicuota: true })).toEqual(lineas)
  })

  it('cuánto va bajo cada concepto, para el mostrador', () => {
    expect(
      totalesPorConcepto([
        { concepto: 'Veneno', cantidad: 2, precio_unitario: 1500.5 },
        { concepto: null, cantidad: 1, precio_unitario: 999 },
        { concepto: 'Veneno', cantidad: 1, precio_unitario: 1000 },
      ]),
    ).toEqual([{ concepto: 'Veneno', total: 4001 }])
  })
})
