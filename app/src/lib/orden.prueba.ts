import { describe, expect, it } from 'vitest'
import { claveOrden, compararValores, guardarOrden, leerOrden, ordenarFilas, siguienteOrden } from './orden'

describe('siguienteOrden', () => {
  it('ascendente, descendente y vuelve al original', () => {
    const a = siguienteOrden(null, 'fecha')
    expect(a).toEqual({ columna: 'fecha', sentido: 'asc' })
    const b = siguienteOrden(a, 'fecha')
    expect(b).toEqual({ columna: 'fecha', sentido: 'desc' })
    expect(siguienteOrden(b, 'fecha')).toBeNull()
  })
  it('tocar otra columna arranca ascendente', () => {
    expect(siguienteOrden({ columna: 'fecha', sentido: 'desc' }, 'cliente')).toEqual({ columna: 'cliente', sentido: 'asc' })
  })
})

describe('compararValores', () => {
  it('nombres sin importar mayúsculas ni acentos', () => {
    const nombres = ['benítez', 'ÁLVAREZ', 'alvarez', 'Ñandú', 'nuñez', 'Zárate']
    expect([...nombres].sort(compararValores)).toEqual(['ÁLVAREZ', 'alvarez', 'benítez', 'nuñez', 'Ñandú', 'Zárate'])
  })
  it('los números adentro del texto como números', () => {
    const n = ['REM CAJA1-00000010', 'REM CAJA1-00000009', 'REM CAJA2-00000001']
    expect([...n].sort(compararValores)).toEqual(['REM CAJA1-00000009', 'REM CAJA1-00000010', 'REM CAJA2-00000001'])
    expect(['Caja 10', 'Caja 2'].sort(compararValores)).toEqual(['Caja 2', 'Caja 10'])
  })
  it('importes como número', () => {
    expect([1500, 200, -30, 10000].sort(compararValores)).toEqual([-30, 200, 1500, 10000])
  })
  it('fechas ISO por fecha, con hora o sin ella', () => {
    expect(compararValores('2026-11-03', '2026-11-19')).toBeLessThan(0)
    expect(compararValores('2026-11-19T10:00:00Z', '2026-11-03T23:00:00Z')).toBeGreaterThan(0)
    expect(compararValores(new Date(2026, 0, 2), new Date(2026, 0, 1))).toBeGreaterThan(0)
  })
  it('lo vacío al final', () => {
    expect([null, 'b', '', 'a', undefined].sort(compararValores).slice(0, 2)).toEqual(['a', 'b'])
  })
})

describe('ordenarFilas', () => {
  const filas = [
    { id: 1, cliente: 'Volkmer Diego', total: 300, localidad: 'San Vicente' },
    { id: 2, cliente: 'DON ENRIQUE SECPA', total: 1200, localidad: null },
    { id: 3, cliente: 'Administrador Gross', total: 50, localidad: 'Posadas' },
    { id: 4, cliente: 'don enrique secpa', total: 1200, localidad: 'Oberá' },
  ]
  const columnas = {
    cliente: (f: (typeof filas)[number]) => f.cliente,
    total: (f: (typeof filas)[number]) => f.total,
    localidad: (f: (typeof filas)[number]) => f.localidad,
  }
  it('sin orden queda como vino, y no toca la lista original', () => {
    const r = ordenarFilas(filas, null, columnas)
    expect(r.map((f) => f.id)).toEqual([1, 2, 3, 4])
    expect(r).not.toBe(filas)
  })
  it('ascendente y descendente; los iguales conservan su orden', () => {
    expect(ordenarFilas(filas, { columna: 'cliente', sentido: 'asc' }, columnas).map((f) => f.id)).toEqual([3, 2, 4, 1])
    expect(ordenarFilas(filas, { columna: 'total', sentido: 'desc' }, columnas).map((f) => f.id)).toEqual([2, 4, 1, 3])
  })
  it('lo vacío queda al final también en descendente', () => {
    expect(ordenarFilas(filas, { columna: 'localidad', sentido: 'asc' }, columnas).map((f) => f.id)).toEqual([4, 3, 1, 2])
    expect(ordenarFilas(filas, { columna: 'localidad', sentido: 'desc' }, columnas).map((f) => f.id)).toEqual([1, 3, 4, 2])
  })
  it('una columna que ya no existe deja la lista como vino', () => {
    expect(ordenarFilas(filas, { columna: 'vieja', sentido: 'asc' }, columnas).map((f) => f.id)).toEqual([1, 2, 3, 4])
  })
})

describe('el orden recordado', () => {
  function almacen() {
    const m = new Map<string, string>()
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      m,
    }
  }
  it('la clave lleva el usuario y la tabla', () => {
    expect(claveOrden('u1', 'remitos')).toBe('gross.orden.u1.remitos')
    expect(claveOrden('u2', 'remitos')).not.toBe(claveOrden('u1', 'remitos'))
    expect(claveOrden(null, 'remitos')).toBe('gross.orden.sin-usuario.remitos')
  })
  it('guarda, lee y «como vino» borra', () => {
    const a = almacen()
    guardarOrden('k', { columna: 'fecha', sentido: 'desc' }, a)
    expect(leerOrden('k', a)).toEqual({ columna: 'fecha', sentido: 'desc' })
    guardarOrden('k', null, a)
    expect(a.m.has('k')).toBe(false)
    expect(leerOrden('k', a)).toBeNull()
  })
  it('lo roto o raro se lee como «como vino»', () => {
    const a = almacen()
    a.setItem('k', '{no es json')
    expect(leerOrden('k', a)).toBeNull()
    a.setItem('k', JSON.stringify({ columna: 'fecha', sentido: 'arriba' }))
    expect(leerOrden('k', a)).toBeNull()
  })
  it('si la PC no deja guardar ni leer, no rompe', () => {
    const roto = {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('sin lugar')
      },
      removeItem: () => {
        throw new Error('bloqueado')
      },
    }
    expect(() => guardarOrden('k', { columna: 'a', sentido: 'asc' }, roto)).not.toThrow()
    expect(leerOrden('k', roto)).toBeNull()
    expect(leerOrden('k', null)).toBeNull()
  })
})
