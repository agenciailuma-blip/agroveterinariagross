import { describe, expect, it } from 'vitest'
import { agruparSinEnviar, traducirError, type OperacionVista } from '@/lib/sinEnviar'

let n = 0
function op(p: Partial<OperacionVista>): OperacionVista {
  n++
  return {
    id: `op-${n}`,
    lote: 'l1',
    orden: n,
    descripcion: '',
    creado_en: `2026-11-19T16:0${n % 10}:00Z`,
    estado: 'pendiente',
    ultimo_error: null,
    ...p,
  }
}

describe('bandeja de sin enviar', () => {
  it('junta una venta con su renglón trabado y lo que espera detrás', () => {
    const cosas = agruparSinEnviar([
      op({
        lote: 'v52',
        orden: 3,
        descripcion: 'CAJA1-000052 · ROYAL CAT URINARY x kg suelto',
        estado: 'error',
        ultimo_error: 'new row for relation "venta_linea" violates check constraint "venta_linea_cantidad_check"',
      }),
      op({ lote: 'v52', orden: 4, descripcion: 'CAJA1-000052 · cobro' }),
      op({ lote: 'v52', orden: 5, descripcion: 'CAJA1-000052 · pago 1' }),
    ])
    expect(cosas).toHaveLength(1)
    expect(cosas[0]).toMatchObject({
      titulo: 'Venta CAJA1-000052',
      estado: 'trabada',
      parteTrabada: 'el renglón «ROYAL CAT URINARY x kg suelto»',
      detras: 2,
    })
    expect(cosas[0].motivo?.que).toMatch(/cantidad cero/)
  })

  it('la proforma que la base rechazaba ya no figura como trabada', () => {
    const [cosa] = agruparSinEnviar([
      op({
        lote: 'p1',
        descripcion: 'PRO CAJA2-00000001',
        estado: 'error',
        ultimo_error:
          'new row for relation "comprobante_no_fiscal" violates check constraint "comprobante_no_fiscal_entrega_solo_remito"',
      }),
    ])
    expect(cosa.titulo).toBe('Proforma CAJA2-00000001')
    expect(cosa.estado).toBe('esperando')
    expect(cosa.motivo?.seArreglaSola).toBe(true)
  })

  it('pone primero lo que necesita a alguien', () => {
    const cosas = agruparSinEnviar([
      op({ lote: 'a', descripcion: 'ENT CAJA2-00000004' }),
      op({ lote: 'b', descripcion: 'Venta CAJA1-000060', estado: 'error', ultimo_error: 'permission denied for table venta' }),
    ])
    expect(cosas.map((c) => c.titulo)).toEqual(['Venta CAJA1-000060', 'Comprobante de entrega CAJA2-00000004'])
  })

  it('un mensaje nuestro en castellano se muestra tal cual', () => {
    expect(traducirError('La venta ya está cobrada.').que).toBe('La venta ya está cobrada.')
    expect(traducirError('TypeError: Failed to fetch').seArreglaSola).toBe(true)
  })
})
