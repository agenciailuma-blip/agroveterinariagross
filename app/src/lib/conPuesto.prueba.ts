import { afterEach, describe, expect, it, vi } from 'vitest'
import { conPuesto } from '@/lib/supabase'

/*
  El puesto viaja en cada pedido a la base para que el registro de
  auditoría sepa desde dónde se cambió algo. Sólo a /rest/v1/: las Edge
  Functions rechazarían un encabezado que no conocen.
*/

const guardado = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => guardado.get(k) ?? null,
  setItem: (k: string, v: string) => void guardado.set(k, v),
  removeItem: (k: string) => void guardado.delete(k),
})

afterEach(() => guardado.clear())

const BASE = 'https://x.supabase.co'

describe('el puesto en cada pedido', () => {
  it('va a las tablas y funciones', () => {
    guardado.set('gross.terminal', JSON.stringify({ id: 'abc' }))
    const h = new Headers(conPuesto(`${BASE}/rest/v1/cliente`, { apikey: 'k' }))
    expect(h.get('x-gross-terminal')).toBe('abc')
    expect(h.get('apikey')).toBe('k')
  })
  it('no va a las Edge Functions ni a la sesión', () => {
    guardado.set('gross.terminal', JSON.stringify({ id: 'abc' }))
    expect(conPuesto(`${BASE}/functions/v1/arca`, { a: '1' })).toEqual({ a: '1' })
    expect(conPuesto(`${BASE}/auth/v1/token`)).toBeUndefined()
  })
  it('sin puesto elegido, o con lo guardado roto, no agrega nada', () => {
    expect(conPuesto(`${BASE}/rest/v1/cliente`)).toBeUndefined()
    guardado.set('gross.terminal', '{roto')
    expect(conPuesto(`${BASE}/rest/v1/cliente`)).toBeUndefined()
  })
})
