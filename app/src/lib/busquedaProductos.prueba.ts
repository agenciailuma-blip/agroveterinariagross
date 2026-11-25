import { describe, expect, it } from 'vitest'
import { MAXIMO_RESULTADOS, ordenarPorParecido, palabrasDeBusqueda, textoDeBusqueda } from '@/lib/busquedaProductos'

/*
  El pedido de Lucas del 25/11: «shampoo trad» no encontraba
  «SHAMPOO  TRADIC PULG» y la lista cortaba a 20 sin ordenar.
*/
type P = { codigo: string; nombre: string; publico?: string }
const datos = (p: P) => ({
  busqueda: textoDeBusqueda(p.codigo, p.nombre, p.publico ?? null),
  codigo: p.codigo,
  nombre: p.nombre,
})
const buscar = (items: P[], texto: string, maximo?: number) =>
  ordenarPorParecido(items, texto, datos, maximo).map((p) => p.nombre)

const catalogo: P[] = [
  { codigo: '62', nombre: 'ROYAL CAT CASTRADOS x 7,5 W.CONT' },
  { codigo: '2315', nombre: 'CAT CHOW x kg castrados' },
  { codigo: '14', nombre: 'SHAMPOO  TRADIC PULG' },
  { codigo: '1662', nombre: 'REPELENTE a otra parte x 1 Lt' },
  { codigo: '140', nombre: 'SHAMPOO NEUTRO' },
]

describe('palabras de la búsqueda', () => {
  it('ignora espacios de más, acentos y mayúsculas', () => {
    expect(palabrasDeBusqueda('  Champú   TRAD ')).toEqual(['champu', 'trad'])
  })
})

describe('buscar por palabras', () => {
  it('encuentra con espacios dobles en el nombre', () => {
    expect(buscar(catalogo, 'shampoo trad')).toEqual(['SHAMPOO  TRADIC PULG'])
  })

  it('en cualquier orden y con espacios de más en lo escrito', () => {
    expect(buscar(catalogo, 'trad   sham')).toEqual(['SHAMPOO  TRADIC PULG'])
  })

  it('todas las palabras tienen que estar', () => {
    expect(buscar(catalogo, 'shampoo gato')).toEqual([])
  })

  it('busca también en el nombre público', () => {
    const items = [{ codigo: '9', nombre: 'PIPETA X', publico: 'Antipulgas para perros' }]
    expect(buscar(items, 'antipul')).toEqual(['PIPETA X'])
  })
})

describe('el orden', () => {
  it('la palabra que empieza con lo escrito va antes que la que lo contiene', () => {
    expect(buscar(catalogo, 'trad')[0]).toBe('SHAMPOO  TRADIC PULG')
  })

  it('a igual parecido, por nombre', () => {
    expect(buscar(catalogo, 'shampoo')).toEqual(['SHAMPOO  TRADIC PULG', 'SHAMPOO NEUTRO'])
  })

  it('el código exacto va primero aunque otros también coincidan', () => {
    expect(buscar(catalogo, '14')[0]).toBe('SHAMPOO  TRADIC PULG')
    expect(buscar(catalogo, '140')[0]).toBe('SHAMPOO NEUTRO')
  })
})

describe('cuántos', () => {
  it(`corta a ${MAXIMO_RESULTADOS}`, () => {
    const muchos = Array.from({ length: 60 }, (_, i) => ({ codigo: String(1000 + i), nombre: `SHAMPOO ${i}` }))
    expect(buscar(muchos, 'shampoo')).toHaveLength(MAXIMO_RESULTADOS)
  })

  it('lo que mejor coincide no queda afuera del corte', () => {
    const muchos: P[] = Array.from({ length: 60 }, (_, i) => ({ codigo: String(1000 + i), nombre: `AAA CASTRADOS ${i}` }))
    muchos.push({ codigo: '14', nombre: 'ZZZ TRADIC' })
    expect(buscar(muchos, 'trad')[0]).toBe('ZZZ TRADIC')
  })
})
