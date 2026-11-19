import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { cambiosDe, filasParaExcel, nombreDeCampo, rangoDeFechas } from '@/lib/api/auditoria'
import type { Evento } from '@/lib/api/auditoria'

/*
  El registro de auditoría. Qué se anota y quién lo ve lo prueba la base
  (supabase/pruebas/registro-de-auditoria.sql); acá, cómo se lee.
*/

describe('las fechas del filtro', () => {
  it('toma el día entero en Oberá, con el «hasta» incluido', () => {
    expect(rangoDeFechas('2026-11-12', '2026-11-19')).toEqual({
      desde: '2026-11-12T00:00:00-03:00',
      hasta: '2026-11-20T00:00:00-03:00',
    })
  })
  it('el fin de mes pasa al mes siguiente', () => {
    expect(rangoDeFechas('', '2026-11-30').hasta).toBe('2026-12-01T00:00:00-03:00')
  })
  it('sin fechas, sin límite', () => {
    expect(rangoDeFechas('', '')).toEqual({ desde: null, hasta: null })
  })
})

describe('lo que cambió', () => {
  it('en un cambio, antes y después con el nombre que usa Gross', () => {
    expect(cambiosDe({ antes: { limite_credito: 100000 }, despues: { limite_credito: 150000.5 } })).toEqual([
      { campo: 'límite de crédito', antes: '100000', despues: '150000,5' },
    ])
  })
  it('sí y no en vez de true y false', () => {
    expect(cambiosDe({ antes: { activo: true }, despues: { activo: false } })[0]).toMatchObject({ antes: 'sí', despues: 'no' })
  })
  it('en un alta, sólo lo que se cargó', () => {
    const c = cambiosDe({ antes: null, despues: { nombre: 'Juan', telefono: null, mayorista: false, id: 'x' } })
    expect(c).toEqual([{ campo: 'nombre', antes: null, despues: 'Juan' }])
  })
  it('un identificador suelto se dice «(otro)»', () => {
    const c = cambiosDe({
      antes: { rol_id: '11111111-2222-3333-4444-555555555555' },
      despues: { rol_id: '66666666-7777-8888-9999-000000000000' },
    })
    expect(c[0]).toEqual({ campo: 'rol', antes: '(otro)', despues: '(otro)' })
  })
  it('lo que no tiene nombre propio pierde los guiones bajos', () => {
    expect(nombreDeCampo('codigo_barras')).toBe('codigo barras')
  })
})

describe('el Excel', () => {
  it('un renglón por evento, con los cambios resumidos', () => {
    const e: Evento = {
      momento: '2026-11-19T15:00:00Z',
      tipo: 'ficha',
      que: 'Cliente modificado',
      detalle: 'Juan Pérez',
      usuario_id: 'u',
      usuario: 'Lucas',
      puesto: 'Caja 1',
      referencia: 'cliente',
      referencia_id: 'c',
      antes: { limite_credito: 1 },
      despues: { limite_credito: 2 },
    }
    const filas = filasParaExcel([e])
    expect(filas).toHaveLength(2)
    expect(filas[1].slice(1)).toEqual([
      'Productos y clientes',
      'Cliente modificado',
      'Juan Pérez',
      'límite de crédito: 1 → 2',
      'Lucas',
      'Caja 1',
    ])
  })
})
