import { describe, expect, it } from 'vitest'
import { agruparVencidos } from '@/lib/api/vencidos'
import type { ComprobanteVencido } from '@/lib/api/vencidos'

/*
  Lo que queda impago de cada comprobante lo calcula la base, y se
  verificó contra la base: por cliente, la suma da el vencido de la deuda
  por antigüedad y el que frena en la caja. Acá se prueba el armado de la
  pestaña: un cliente por fila y el orden en que se llama.
*/

function vencido(extra: Partial<ComprobanteVencido>): ComprobanteVencido {
  return {
    movimiento_id: 'm',
    cliente_id: 'uno',
    nombre: 'Granja Tres Colonias',
    telefono: '3755-466001',
    concepto: 'Factura B 0001-00000901',
    ocurrido_en: '2026-09-01T12:00:00Z',
    vencimiento: '2026-10-01',
    importe: 1000,
    pendiente: 1000,
    dias: 28,
    ...extra,
  }
}

describe('la pestaña Vencidos', () => {
  it('junta los comprobantes de cada cliente, con el total y el atraso más viejo', () => {
    const [c] = agruparVencidos([
      vencido({ movimiento_id: 'a', pendiente: 1500.1, dias: 12 }),
      vencido({ movimiento_id: 'b', pendiente: 300.2, dias: 40 }),
    ])
    expect(c.total).toBe(1800.3)
    expect(c.dias).toBe(40)
    expect(c.comprobantes.map((x) => x.movimiento_id)).toEqual(['b', 'a'])
  })

  it('primero el que debe hace más tiempo, aunque deba menos', () => {
    const clientes = agruparVencidos([
      vencido({ cliente_id: 'mucho', nombre: 'Debe mucho', pendiente: 90000, dias: 5 }),
      vencido({ cliente_id: 'viejo', nombre: 'Debe de hace rato', pendiente: 2000, dias: 75 }),
    ])
    expect(clientes.map((c) => c.cliente_id)).toEqual(['viejo', 'mucho'])
  })

  it('a igual atraso, el que debe más', () => {
    const clientes = agruparVencidos([
      vencido({ cliente_id: 'poco', pendiente: 100, dias: 10 }),
      vencido({ cliente_id: 'mas', pendiente: 900, dias: 10 }),
    ])
    expect(clientes.map((c) => c.cliente_id)).toEqual(['mas', 'poco'])
  })

  it('sin vencidos, nadie', () => {
    expect(agruparVencidos([])).toEqual([])
  })
})
