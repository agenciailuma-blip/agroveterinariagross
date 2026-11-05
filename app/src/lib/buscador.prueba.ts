import { describe, expect, it } from 'vitest'
import { esTeclaQueEscribe, moverMarca, primeroElCodigoExacto } from '@/lib/buscador'
import { esFraccionable, leerCantidad } from '@/lib/api/ventas'

/*
  El teclado del mostrador, pedido en la reunión del 05/11: las flechas
  recorren, Enter elige, una letra vuelve a buscar, y la cantidad acepta
  0,374 escrito con coma.
*/
describe('la marca de la lista', () => {
  it('baja y sube de a uno', () => {
    expect(moverMarca(0, 5, 'ArrowDown')).toBe(1)
    expect(moverMarca(3, 5, 'ArrowUp')).toBe(2)
  })

  it('da la vuelta en las puntas', () => {
    expect(moverMarca(4, 5, 'ArrowDown')).toBe(0)
    expect(moverMarca(0, 5, 'ArrowUp')).toBe(4)
  })

  it('sin resultados se queda arriba', () => {
    expect(moverMarca(0, 0, 'ArrowDown')).toBe(0)
  })
})

describe('el código exacto va primero', () => {
  const lista = [
    { codigo: '13680', nombre: 'otro' },
    { codigo: '1368', nombre: 'LIVRA CACH x kg' },
    { codigo: '21368', nombre: 'otro más' },
  ]

  it('sube el que tiene el código escrito, y el resto queda en su orden', () => {
    expect(primeroElCodigoExacto(lista, ' 1368 ').map((p) => p.codigo)).toEqual(['1368', '13680', '21368'])
  })

  it('si ninguno coincide, la lista no cambia', () => {
    expect(primeroElCodigoExacto(lista, 'livra').map((p) => p.codigo)).toEqual(['13680', '1368', '21368'])
  })
})

describe('qué tecla vuelve al buscador', () => {
  const tecla = (key: string, extra: Partial<{ ctrlKey: boolean; altKey: boolean; metaKey: boolean }> = {}) => ({
    key,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    ...extra,
  })

  it('una letra o un número sí', () => {
    expect(esTeclaQueEscribe(tecla('a'))).toBe(true)
    expect(esTeclaQueEscribe(tecla('7'))).toBe(true)
  })

  it('las de función, las flechas y los atajos con Ctrl no', () => {
    expect(esTeclaQueEscribe(tecla('F10'))).toBe(false)
    expect(esTeclaQueEscribe(tecla('ArrowDown'))).toBe(false)
    expect(esTeclaQueEscribe(tecla('c', { ctrlKey: true }))).toBe(false)
  })
})

describe('la cantidad escrita', () => {
  it('acepta la coma y el punto', () => {
    expect(leerCantidad('0,374')).toBe(0.374)
    expect(leerCantidad('0.5')).toBe(0.5)
    expect(leerCantidad('2')).toBe(2)
    expect(leerCantidad(',5')).toBe(0.5)
  })

  it('lo que todavía no es un número da nulo', () => {
    expect(leerCantidad('')).toBeNull()
    expect(leerCantidad(',')).toBeNull()
    expect(leerCantidad('1,2,3')).toBeNull()
    expect(leerCantidad('dos')).toBeNull()
  })

  it('la unidad no se parte, salvo con los decimales en todos', () => {
    expect(esFraccionable('unidad')).toBe(false)
    expect(esFraccionable('kg')).toBe(true)
    expect(esFraccionable('unidad', true)).toBe(true)
  })
})
