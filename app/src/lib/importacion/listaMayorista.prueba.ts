import { describe, expect, it } from 'vitest'
import { hojaDeLista, leerPlanillaDeLista, type ProductoDeLaPlanilla } from '@/lib/importacion/listaMayorista'

const producto = (o: Partial<ProductoDeLaPlanilla>): ProductoDeLaPlanilla => ({
  id: 'id',
  codigo: 'A',
  nombre: 'Producto',
  precio_venta: 100,
  activo: true,
  precio: null,
  ...o,
})

const catalogo = [
  producto({ id: '1', codigo: 'LIV-1', nombre: 'Livra 20 kg', precio: 1000 }),
  producto({ id: '2', codigo: '7010', nombre: 'Pipeta' }),
  producto({ id: '3', codigo: 'BAJA', nombre: 'Viejo', activo: false }),
]
const ENC = ['Código', 'Producto', 'Precio de mostrador', 'Precio mayorista']
const leer = (...filas: unknown[][]) => leerPlanillaDeLista([ENC, ...filas], catalogo)!

describe('la planilla que se baja', () => {
  it('trae el catálogo con el precio de los que ya están en la lista', () => {
    const h = hojaDeLista(catalogo)
    expect(h[0]).toEqual(ENC)
    expect(h[1]).toEqual(['LIV-1', 'Livra 20 kg', 100, 1000])
    expect(h[2]).toEqual(['7010', 'Pipeta', 100, null])
  })
  it('sin los dados de baja, salvo que sigan en la lista', () => {
    expect(hojaDeLista(catalogo).some((f) => f[0] === 'BAJA')).toBe(false)
    expect(hojaDeLista([producto({ codigo: 'B', activo: false, precio: 5 })])).toHaveLength(2)
  })
  it('lo que se baja, subido sin tocar, no cambia nada', () => {
    const r = leerPlanillaDeLista(hojaDeLista(catalogo), catalogo)!
    expect(r).toEqual({ entran: [], cambian: [], salen: [], iguales: 1, problemas: [] })
  })
})

describe('la planilla que se sube', () => {
  it('separa lo que entra y lo que cambia', () => {
    const r = leer(['LIV-1', '', 100, 1200], ['7010', '', 100, 500])
    expect(r.cambian).toMatchObject([{ producto_id: '1', antes: 1000, precio: 1200 }])
    expect(r.entran).toMatchObject([{ producto_id: '2', antes: null, precio: 500 }])
  })
  it('entiende el precio escrito a la argentina y el código que Excel leyó como número', () => {
    expect(leer([7010, '', '', '12.500'])).toMatchObject({ entran: [{ producto_id: '2', precio: 12500 }] })
    expect(leer(['7010', '', '', '1.250,50'])).toMatchObject({ entran: [{ precio: 1250.5 }] })
  })
  it('sin tocar el precio, no cuenta como cambio', () => {
    expect(leer(['LIV-1', '', '', 1000])).toMatchObject({ cambian: [], iguales: 1 })
  })
  it('un precio borrado es de los que salen; lo que no está en el archivo no se toca', () => {
    expect(leer(['LIV-1', '', '', ''])).toMatchObject({ salen: [{ producto_id: '1', precio: null }] })
    expect(leer(['7010', '', '', 5]).salen).toEqual([])
  })
  it('un producto sin precio y sin lista se ignora', () => {
    expect(leer(['7010', '', '', ''])).toEqual({ entran: [], cambian: [], salen: [], iguales: 0, problemas: [] })
  })
  it('dice qué no se entendió y en qué fila', () => {
    const r = leer(['NADA', '', '', 5], ['7010', '', '', 'caro'], ['7010', '', '', 0], ['BAJA', '', '', 5], ['', '', '', 5])
    expect(r.problemas.map((p) => [p.fila, p.motivo])).toEqual([
      [2, 'No está en el catálogo.'],
      [3, 'El precio no se entiende.'],
      [4, 'El código está repetido en la planilla.'],
      [5, 'El producto está dado de baja.'],
      [6, 'Tiene precio pero no código.'],
    ])
    expect(r.entran).toEqual([])
  })
  it('encuentra el encabezado aunque tenga títulos arriba, y sin importar los acentos', () => {
    const r = leerPlanillaDeLista([['Lista'], [], ['CODIGO', 'PRECIO MAYORISTA'], ['7010', 5]], catalogo)!
    expect(r.entran).toHaveLength(1)
    expect(r.entran[0].codigo).toBe('7010')
  })
  it('sin las columnas, no es esta planilla', () => {
    expect(leerPlanillaDeLista([['Nombre', 'Precio'], ['x', 1]], catalogo)).toBeNull()
  })
})
