import { describe, expect, it } from 'vitest'
import { agruparLineas, agruparPorCliente, esPrecioAConvenir } from '@/lib/api/remitoInterno'
import type { LineaDeRemito, RemitoPorFacturar } from '@/lib/api/remitoInterno'

/*
  Las reglas —mismo cliente, que no se facture dos veces, que no vuelva a
  descontar stock— las cuida la base y se probaron contra la base. Acá:
  cómo se juntan los productos para ponerles precio y cómo se agrupan los
  remitos en la pantalla.
*/

const linea = (remito: string, orden: string, producto: string, cantidad: number, precio: number): LineaDeRemito => ({
  remito_id: remito,
  remito_orden: orden,
  producto_id: producto,
  codigo: producto.toUpperCase(),
  descripcion: `Producto ${producto}`,
  cantidad,
  precio_unitario: precio,
})

const remito = (id: string, cliente: string, dias: number): RemitoPorFacturar => ({
  id,
  serie: 'T',
  numero: 1,
  fecha: '2026-10-29',
  cliente_id: cliente,
  cliente: `Cliente ${cliente}`,
  observaciones: null,
  total_sugerido: 0,
  unidades: 1,
  dias,
})

describe('el remito interno', () => {
  it('el mismo producto en dos remitos es una sola línea, con el precio del más nuevo', () => {
    const productos = agruparLineas([
      linea('r2', '2026-10-29|00000002', 'a', 2, 1100),
      linea('r1', '2026-10-28|00000001', 'a', 3, 1000),
      linea('r1', '2026-10-28|00000001', 'b', 1, 500),
    ])
    expect(productos).toEqual([
      expect.objectContaining({ producto_id: 'a', cantidad: 5, sugerido: 1100 }),
      expect.objectContaining({ producto_id: 'b', cantidad: 1, sugerido: 500 }),
    ])
  })

  it('agrupa por cliente, primero el que espera hace más', () => {
    const grupos = agruparPorCliente([remito('r1', 'x', 1), remito('r2', 'y', 9), remito('r3', 'x', 3)])
    expect(grupos.map((g) => [g.cliente_id, g.remitos.length])).toEqual([
      ['y', 1],
      ['x', 2],
    ])
  })
})

describe('la marca «Precio a convenir»', () => {
  it('vale con cuenta corriente', () => {
    expect(esPrecioAConvenir({ cuenta_corriente: true, precio_a_convenir: true })).toBe(true)
  })
  it('sin la marca o sin cuenta corriente, no', () => {
    expect(esPrecioAConvenir({ cuenta_corriente: true, precio_a_convenir: false })).toBe(false)
    expect(esPrecioAConvenir({ cuenta_corriente: true })).toBe(false)
    expect(esPrecioAConvenir({ cuenta_corriente: false, precio_a_convenir: true })).toBe(false)
    expect(esPrecioAConvenir(null)).toBe(false)
  })
})
