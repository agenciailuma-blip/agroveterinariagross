import { describe, expect, it } from 'vitest'
import { ordenarCostos, puntosDeLaLinea, textoDeVariacion, variacion } from '@/lib/api/costos'
import type { CostoPorProveedor } from '@/lib/api/costos'

/*
  El historial de costos.

  Qué costó cada compra y contra qué se compara lo decide la base
  (supabase/pruebas/historial-de-costos.sql). Acá se prueba lo que
  decide la pantalla: cómo se dice una variación, en qué orden sale el
  reporte y la línea chica de la ficha.
*/

describe('la variación', () => {
  it('en porcentaje, al centésimo', () => {
    expect(variacion(1331, 1210)).toBe(10)
    expect(variacion(1000, 1210)).toBe(-17.36)
  })

  it('sin anterior, no hay variación', () => {
    expect(variacion(1000, null)).toBeNull()
    expect(variacion(1000, 0)).toBeNull()
  })

  it('se escribe con signo, y lo que no cambió dice «igual»', () => {
    expect(textoDeVariacion(10)).toBe('+10%')
    expect(textoDeVariacion(-17.36)).toBe('−17,4%')
    expect(textoDeVariacion(0)).toBe('igual')
    expect(textoDeVariacion(null)).toBe('')
  })
})

describe('el orden del reporte', () => {
  const fila = (producto: string, v: number | null, fecha = '2026-09-01'): CostoPorProveedor => ({
    proveedor_id: 'p',
    proveedor: 'P',
    producto_id: producto,
    codigo: producto,
    producto,
    ultima_fecha: fecha,
    ultima_factura: '',
    ultimo_costo: 100,
    costo_anterior: v === null ? null : 90,
    variacion: v,
    compras: v === null ? 1 : 2,
    otro_costo: null,
    otro_proveedor: null,
    otro_fecha: null,
  })

  it('por aumento: lo que más subió arriba, y lo que no se puede comparar al final', () => {
    const orden = ordenarCostos([fila('A', null), fila('B', 5), fila('C', 30), fila('D', -10)], 'aumento')
    expect(orden.map((f) => f.producto)).toEqual(['C', 'B', 'D', 'A'])
  })

  it('por fecha, lo más reciente arriba', () => {
    const orden = ordenarCostos([fila('A', 1, '2026-09-01'), fila('B', 1, '2026-09-20')], 'reciente')
    expect(orden.map((f) => f.producto)).toEqual(['B', 'A'])
  })

  it('por producto, en orden alfabético castellano', () => {
    const orden = ordenarCostos([fila('Ñandú', 1), fila('Collar', 1), fila('Alimento', 1)], 'producto')
    expect(orden.map((f) => f.producto)).toEqual(['Alimento', 'Collar', 'Ñandú'])
  })
})

describe('la línea chica de la ficha', () => {
  it('con una sola compra no hay línea', () => {
    expect(puntosDeLaLinea([1000], 100, 20)).toBe('')
  })

  it('va de la izquierda a la derecha, y el más caro arriba', () => {
    expect(puntosDeLaLinea([100, 200], 100, 20)).toBe('2,18 98,2')
  })

  it('si no cambió, la línea va por el medio', () => {
    expect(puntosDeLaLinea([500, 500, 500], 100, 20)).toBe('2,10 50,10 98,10')
  })
})
