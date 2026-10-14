import { describe, expect, it } from 'vitest'
import { numeroDeOrden, porProveedor, problemaConOrden } from '@/lib/api/ordenesInternas'
import type { RenglonOrden } from '@/lib/api/ordenesInternas'

/*
  La orden de compra interna. Lo de fondo —numerarla, corregirla
  mientras está pendiente, quién la marca pedida— lo prueba la base
  (supabase/pruebas/orden-de-compra-interna.sql); acá, lo que la
  pantalla frena antes de guardar y cómo se arma el papel.
*/

const renglon = (parcial: Partial<RenglonOrden>): RenglonOrden => ({
  producto_id: null,
  codigo: null,
  descripcion: 'Algo',
  proveedor_id: null,
  proveedor: null,
  cantidad: 1,
  ...parcial,
})

describe('lo que se frena antes de guardar', () => {
  const base = { emiteId: 'deposito', recibeId: 'compras', lineas: [renglon({})] }

  it('una orden completa pasa', () => {
    expect(problemaConOrden(base)).toBeNull()
  })

  it('los dos sectores, con las palabras de la base', () => {
    expect(problemaConOrden({ ...base, emiteId: '' })).toBe('Falta elegir qué sector la emite.')
    expect(problemaConOrden({ ...base, recibeId: '' })).toBe('Falta elegir qué sector la recibe.')
  })

  it('sin renglones no hay nada para pedir', () => {
    expect(problemaConOrden({ ...base, lineas: [] })).toBe('La orden no tiene nada para pedir.')
  })

  it('cada renglón con qué y cuánto, diciendo cuál', () => {
    expect(problemaConOrden({ ...base, lineas: [renglon({}), renglon({ descripcion: '  ' })] })).toBe(
      'Al renglón 2 le falta qué hay que comprar.',
    )
    expect(problemaConOrden({ ...base, lineas: [renglon({ descripcion: 'Pipeta', cantidad: 0 })] })).toBe(
      'Al renglón 1 («Pipeta») le falta la cantidad.',
    )
  })
})

describe('el papel', () => {
  it('un bloque por proveedor, y lo que no tiene proveedor al final', () => {
    const grupos = porProveedor([
      renglon({ descripcion: 'A', proveedor: 'Alfa' }),
      renglon({ descripcion: 'B', proveedor: 'Alfa' }),
      renglon({ descripcion: 'C', proveedor: 'Zeta' }),
      renglon({ descripcion: 'D', proveedor: null }),
    ])
    expect(grupos.map((g) => [g.proveedor, g.lineas.length])).toEqual([
      ['Alfa', 2],
      ['Zeta', 1],
      [null, 1],
    ])
  })

  it('el número con seis cifras, como un comprobante', () => {
    expect(numeroDeOrden(12)).toBe('000012')
  })
})
