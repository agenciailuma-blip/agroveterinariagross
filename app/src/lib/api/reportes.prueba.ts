import { describe, expect, it } from 'vitest'
import {
  diasQuieto,
  margen,
  masVendidos,
  mercaderiaParada,
  rangoDe,
  SIN_RUBRO,
  valorDelStock,
  valorPor,
  ventasPorCanal,
  ventasPorRubro,
  type LineaVendida,
  type Mercaderia,
  type ProductoEnStock,
} from '@/lib/api/reportes'

const producto = (o: Partial<ProductoEnStock>): ProductoEnStock => ({
  id: 'x', codigo: '1', nombre: 'Producto', categoria: null, rubro_arca_id: null, proveedor: null,
  cantidad: 0, costo: null, precio: null, ultima_venta: null, ultima_entrada: null,
  ...o,
})

const linea = (o: Partial<LineaVendida>): LineaVendida => ({
  producto_id: 'p', codigo: '1', descripcion: 'Producto', categoria: null, rubro_arca_id: null,
  canal: 'local', facturado: true, cantidad: 1, importe: 0, neto: 0, costo: null,
  ...o,
})

describe('el valor del stock', () => {
  const productos = [
    producto({ id: 'a', cantidad: 10, costo: 100, precio: 150 }),
    producto({ id: 'b', cantidad: 2, costo: null, precio: 1000 }),
    producto({ id: 'c', cantidad: -3, costo: 50, precio: 80 }),
    producto({ id: 'd', cantidad: 4, costo: 10, precio: null }),
  ]

  it('un producto sin costo no cuenta como costo cero, se cuenta aparte', () => {
    const v = valorDelStock(productos)
    expect(v.valor_costo).toBe(10 * 100 + 4 * 10)
    expect(v.sin_costo).toBe(1)
    expect(v.sin_precio).toBe(1)
  })

  it('la ganancia en el estante sólo mira los que tienen costo y precio', () => {
    const v = valorDelStock(productos)
    // Si restara el costo al valor de venta de todos, el producto sin
    // costo inflaría la ganancia en $2.000.
    expect(v.valor_venta).toBe(1500 + 2000)
    expect(v.ganancia).toBe(1500 - 1040)
  })

  it('el stock negativo no resta valor: se avisa', () => {
    const v = valorDelStock(productos)
    expect(v.negativos).toBe(1)
    expect(v.unidades).toBe(16)
  })

  it('agrupa por rubro con el nombre de ARCA', () => {
    const filas = valorPor(
      [producto({ cantidad: 1, precio: 10, rubro_arca_id: 750000 }), producto({ cantidad: 1, precio: 5 })],
      'rubro',
      [{ id: 750000, descripcion: 'Servicios veterinarios' }],
    )
    expect(filas.map((f) => f.nombre)).toEqual(['Servicios veterinarios', SIN_RUBRO])
  })
})

describe('la mercadería parada', () => {
  it('cuenta desde lo último que pasó: venta o entrada', () => {
    expect(diasQuieto({ ultima_venta: '2026-08-01', ultima_entrada: '2026-11-13' }, '2026-11-23', null)).toBe(10)
    expect(diasQuieto({ ultima_venta: '2026-11-20', ultima_entrada: '2026-08-01' }, '2026-11-23', null)).toBe(3)
  })

  it('sin nada registrado, cuenta desde la primera venta del sistema', () => {
    expect(diasQuieto({ ultima_venta: null, ultima_entrada: null }, '2026-11-23', '2026-08-13')).toBe(102)
    expect(diasQuieto({ ultima_venta: null, ultima_entrada: null }, '2026-11-23', null)).toBeNull()
  })

  it('no se corre un día por la zona horaria a fin de mes', () => {
    expect(diasQuieto({ ultima_venta: '2026-10-31', ultima_entrada: null }, '2026-11-01', null)).toBe(1)
  })

  it('deja afuera lo que se movió hace menos y lo que no tiene stock', () => {
    const m: Mercaderia = {
      hoy: '2026-11-23',
      primera_venta: '2026-08-13',
      depositos: [],
      productos: [
        producto({ id: 'quieto', cantidad: 5, costo: 100, ultima_venta: '2026-07-01' }),
        producto({ id: 'nuevo', cantidad: 5, costo: 100, ultima_entrada: '2026-11-01' }),
        producto({ id: 'vacio', cantidad: 0, costo: 100 }),
        producto({ id: 'caro', cantidad: 1, precio: 9000 }),
      ],
    }
    const filas = mercaderiaParada(m, 90)
    expect(filas.map((f) => f.id)).toEqual(['caro', 'quieto'])
    expect(filas[0].a_costo).toBe(false)
  })
})

describe('las ventas por rubro', () => {
  it('separa neto, IVA, con y sin factura, y deja «sin rubro» al final', () => {
    const filas = ventasPorRubro(
      [
        linea({ rubro_arca_id: null, importe: 99999, neto: 82644.63 }),
        linea({ rubro_arca_id: 477470, importe: 121, neto: 100 }),
        linea({ rubro_arca_id: 477470, importe: 110.5, neto: 100, facturado: false }),
      ],
      [{ id: 477470, descripcion: 'Venta al por menor de productos veterinarios' }],
    )
    expect(filas.map((f) => f.id)).toEqual([477470, null])
    expect(filas[0]).toMatchObject({ neto: 200, facturado: 121, sin_factura: 110.5 })
    expect(filas[0].iva).toBeCloseTo(31.5)
  })
})

describe('las ventas por canal', () => {
  it('resta lo devuelto y calcula el ticket sobre lo cobrado', () => {
    const filas = ventasPorCanal([
      { canal: 'local', ventas: 4, vendido: 1000, devuelto: 100 },
      { canal: 'online', ventas: 2, vendido: 200, devuelto: 100 },
    ])
    expect(filas.find((f) => f.canal === 'online')).toMatchObject({ neto: 100, ticket: 100 })
    expect(filas.find((f) => f.canal === 'mayorista')).toMatchObject({ ventas: 0, ticket: null, parte: 0 })
    expect(filas.find((f) => f.canal === 'local')!.parte).toBe(90)
  })

  it('lo más vendido online no mezcla el local', () => {
    const top = masVendidos(
      [
        linea({ producto_id: 'a', canal: 'online', importe: 50 }),
        linea({ producto_id: 'b', canal: 'local', importe: 500 }),
      ],
      'online',
    )
    expect(top.map((t) => t.producto_id)).toEqual(['a'])
  })
})

describe('el margen', () => {
  it('es de cada $100 vendidos, y lo sin costo queda afuera y se informa', () => {
    const m = margen(
      [
        linea({ producto_id: 'a', cantidad: 2, importe: 300, costo: 100 }),
        linea({ producto_id: 'b', cantidad: 1, importe: 700, costo: null }),
      ],
      'producto',
    )
    expect(m.total).toMatchObject({ vendido: 300, costo: 200, margen: 100 })
    expect(m.total.porcentaje).toBeCloseTo(33.33, 1)
    expect(m.sin_costo).toBe(700)
    expect(m.cobertura).toBe(30)
  })

  it('una devolución resta cantidad y costo, no sólo el importe', () => {
    const m = margen(
      [
        linea({ producto_id: 'a', cantidad: 3, importe: 300, costo: 50 }),
        linea({ producto_id: 'a', cantidad: -1, importe: -100, costo: 50, facturado: false }),
      ],
      'producto',
    )
    expect(m.filas[0]).toMatchObject({ cantidad: 2, vendido: 200, costo: 100, margen: 100 })
  })
})

describe('el período', () => {
  it('el mes pasado termina su último día, también en enero', () => {
    expect(rangoDe('mes_pasado', '2026-01-15')).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' })
    expect(rangoDe('tres_meses', '2026-11-23')).toEqual({ desde: '2026-09-01', hasta: '2026-11-23' })
  })
})
