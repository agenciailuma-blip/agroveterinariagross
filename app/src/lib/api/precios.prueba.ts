import { describe, expect, it } from 'vitest'
import { mediosParaElegir, type MedioPago } from '@/lib/api/precios'

/*
  Los medios que se ofrecen al cobrar.

  «Tienda online» está inactivo a propósito: es con lo que queda
  registrado lo que se cobró por la web, y nadie lo tiene que elegir en
  el local. Hasta el 15/10 aparecía igual en el Mostrador, la Caja y la
  cobranza.
*/

function medio(nombre: string, activo: boolean, orden: number): MedioPago {
  return {
    id: nombre,
    nombre,
    tipo: 'otro',
    lista_precio_id: null,
    admite_cuotas: false,
    cuotas_maximas: 1,
    afecta_caja: false,
    orden,
    activo,
    medio_pago_cuota: [],
  }
}

const todos = [
  medio('Efectivo', true, 10),
  medio('Tarjeta de debito', true, 20),
  medio('Tienda online', false, 90),
  medio('Cheque', true, 41),
]

describe('los medios para elegir', () => {
  it('no ofrece un medio inactivo, como «Tienda online»', () => {
    expect(mediosParaElegir(todos).map((m) => m.nombre)).toEqual(['Efectivo', 'Tarjeta de debito', 'Cheque'])
  })

  it('deja la lista completa como estaba: una venta que ya trae el inactivo lo sigue encontrando', () => {
    mediosParaElegir(todos)
    expect(todos.find((m) => m.id === 'Tienda online')?.activo).toBe(false)
    expect(todos).toHaveLength(4)
  })

  it('sin medios activos, no ofrece ninguno', () => {
    expect(mediosParaElegir([medio('Tienda online', false, 90)])).toEqual([])
  })
})
