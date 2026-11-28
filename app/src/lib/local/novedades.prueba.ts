import { describe, expect, it } from 'vitest'
import funcion from '../../../../supabase/migrations/20261128130000_preguntar_una_sola_vez_que_cambio.sql?raw'
import {
  CADA_CUANTO_LOS_CATALOGOS_MS,
  hayQueBajar,
  leerNovedades,
  marcaDeLaCola,
  tocanLosCatalogos,
} from '@/lib/local/novedades'
import { ORIGENES_QUE_SE_PREGUNTAN } from '@/lib/local/sync'

const respuesta = {
  cambiaron: ['producto'],
  generacion: '3',
  cola: 'abc',
  venta: 'CAJA1-000010',
  no_fiscal: { presupuesto: 12 },
}

describe('qué se baja', () => {
  it('sólo las tablas que cambiaron', () => {
    const n = leerNovedades(respuesta)
    expect(hayQueBajar(n, 'producto')).toBe(true)
    expect(hayQueBajar(n, 'cliente')).toBe(false)
  })

  it('todo, si no hubo respuesta', () => {
    expect(hayQueBajar(null, 'cliente')).toBe(true)
  })

  it.each([
    ['nada', null],
    ['un texto', 'error'],
    ['sin la lista', { ...respuesta, cambiaron: undefined }],
    ['sin generación', { ...respuesta, generacion: undefined }],
    ['sin la huella de la cola', { ...respuesta, cola: null }],
    ['sin la numeración', { ...respuesta, no_fiscal: null }],
  ])('una respuesta rara (%s) no vale: se baja todo', (_, data) => {
    expect(leerNovedades(data)).toBeNull()
  })

  it('lee la numeración de la terminal', () => {
    const n = leerNovedades(respuesta)
    expect(n?.venta).toBe('CAJA1-000010')
    expect(n?.noFiscal.presupuesto).toBe(12)
    expect(leerNovedades({ ...respuesta, venta: null })?.venta).toBeNull()
  })

  it('la función conoce todas las tablas que sincroniza la app', () => {
    const lista = funcion.slice(funcion.indexOf('v_conocidas constant'), funcion.indexOf('];'))
    const conocidas = [...lista.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect([...conocidas].sort()).toEqual([...ORIGENES_QUE_SE_PREGUNTAN].sort())
  })
})

describe('cuándo se vuelve a bajar la cola de la caja', () => {
  const venta = { id: 'v1', estado: 'en_caja', total: 100, actualizado_en: 't1' }
  const linea = { id: 'l1', cantidad: 1, precio_unitario: 100 }
  const base = marcaDeLaCola('h1', [venta], [linea], new Set())

  it('no, si nada cambió, venga en el orden que venga', () => {
    const otra = { ...venta, id: 'v2' }
    expect(marcaDeLaCola('h1', [venta, otra], [], new Set())).toBe(marcaDeLaCola('h1', [otra, venta], [], new Set()))
  })

  it('sí, si cambió en el servidor', () => {
    expect(marcaDeLaCola('h2', [venta], [linea], new Set())).not.toBe(base)
  })

  it('sí, si acá se cobró, se corrigió un renglón o llegó una venta', () => {
    expect(marcaDeLaCola('h1', [{ ...venta, estado: 'cobrada' }], [linea], new Set())).not.toBe(base)
    expect(marcaDeLaCola('h1', [venta], [{ ...linea, precio_unitario: 90 }], new Set())).not.toBe(base)
    expect(marcaDeLaCola('h1', [venta, { ...venta, id: 'v2' }], [linea], new Set())).not.toBe(base)
  })

  it('sí, cuando termina de subir un cobro: recién ahí se limpia', () => {
    const cobrada = { ...venta, estado: 'cobrada' }
    expect(marcaDeLaCola('h1', [cobrada], [], new Set(['v1']))).not.toBe(
      marcaDeLaCola('h1', [cobrada], [], new Set()),
    )
  })
})

describe('los catálogos de ARCA', () => {
  it('se piden al abrir y cada seis horas', () => {
    const ahora = Date.now()
    expect(tocanLosCatalogos(0, ahora)).toBe(true)
    expect(tocanLosCatalogos(ahora, ahora + 60_000)).toBe(false)
    expect(tocanLosCatalogos(ahora, ahora + CADA_CUANTO_LOS_CATALOGOS_MS)).toBe(true)
  })
})
