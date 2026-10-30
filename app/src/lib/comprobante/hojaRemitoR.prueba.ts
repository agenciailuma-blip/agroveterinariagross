import { describe, expect, it } from 'vitest'
import { RENGLONES_POR_HOJA, enRenglones, recortar, repartirEnHojas, textosDeHoja, type DatosDeHoja, type Medir } from '@/lib/comprobante/hojaRemitoR'

// Cada letra mide un milímetro: las cuentas se ven a ojo.
const medir: Medir = (t) => t.length

const datos = (o: Partial<DatosDeHoja> = {}): DatosDeHoja => ({
  fecha: '2026-10-30',
  nombre: 'Cliente de prueba',
  documento: '20-11111111-1',
  condicion: 'Responsable Inscripto',
  domicilio: 'Calle 123',
  localidad: 'Oberá',
  transportista: null,
  pedido: 7,
  asociado: '0001-00000037',
  lineas: [
    { codigo: 'A1', descripcion: 'Alimento', cantidad: 3 },
    { codigo: 'B2', descripcion: 'Pipeta', cantidad: 1.5 },
  ],
  ...o,
})

const un = (l: number) => Array.from({ length: l }, (_, i) => ({ codigo: `C${i}`, descripcion: 'Producto', cantidad: 1 }))

describe('los renglones', () => {
  it('lo que entra queda igual', () => {
    expect(recortar('Hola', 10, 9, false, medir)).toBe('Hola')
    expect(enRenglones('Corto', 134, 9, medir)).toEqual(['Corto'])
  })
  it('lo que no entra se corta con puntos', () => {
    expect(recortar('Larguísimo', 5, 9, false, medir)).toBe('Larg…')
  })
  it('una descripción larga ocupa dos renglones, cortada entre palabras', () => {
    expect(enRenglones('uno dos tres cuatro', 8, 9, medir)).toEqual(['uno dos', 'tres cu…'])
  })
})

describe('las hojas', () => {
  it('lo que entra en una, va en una', () => {
    expect(repartirEnHojas(un(RENGLONES_POR_HOJA), medir)).toHaveLength(1)
  })
  it('el renglón que no entra pasa a otra hoja', () => {
    const r = repartirEnHojas(un(RENGLONES_POR_HOJA + 1), medir)
    expect(r.map((h) => h.length)).toEqual([RENGLONES_POR_HOJA, 1])
  })
  it('no separa los dos renglones de un producto', () => {
    const largo = 'x'.repeat(100) + ' ' + 'y'.repeat(100)
    const r = repartirEnHojas([...un(RENGLONES_POR_HOJA - 1), { codigo: 'L', descripcion: largo, cantidad: 1 }], medir)
    expect(r[1][0].codigo).toBe('L')
    expect(r[1][0].textos).toHaveLength(2)
  })
})

describe('lo que se imprime', () => {
  const textos = (d: DatosDeHoja, indice = 0, total = 1) => {
    const r = repartirEnHojas(d.lineas, medir)
    return textosDeHoja(d, r[indice] ?? [], indice, total, medir)
  }
  const dice = (d: DatosDeHoja, ...resto: [number?, number?]) => textos(d, ...resto).map((t) => t.texto)

  it('la fecha va separada en sus tres casilleros', () => {
    expect(dice(datos()).slice(0, 3)).toEqual(['30', '10', '2026'])
  })
  it('el cliente, el pedido, los renglones y lo asociado', () => {
    expect(dice(datos())).toEqual(expect.arrayContaining(['Cliente de prueba', '7', 'A1', 'Alimento', '3', '1,5', '0001-00000037']))
  })
  it('no lleva precios: nada con signo de pesos', () => {
    expect(dice(datos()).some((t) => t.includes('$'))).toBe(false)
  })
  it('suma las unidades, al final', () => {
    expect(dice(datos())).toContain('4,5')
    const largo = datos({ lineas: un(RENGLONES_POR_HOJA + 1) })
    expect(dice(largo, 0, 2)).not.toContain(String(RENGLONES_POR_HOJA + 1))
    expect(dice(largo, 1, 2)).toContain(String(RENGLONES_POR_HOJA + 1))
  })
  it('con más de una hoja, dice cuál es', () => {
    expect(dice(datos({ lineas: un(RENGLONES_POR_HOJA + 1) }), 1, 2)).toContain('Hoja 2 de 2')
    expect(dice(datos()).some((t) => t.startsWith('Hoja'))).toBe(false)
  })
  it('lo que falta no se imprime', () => {
    const t = dice(datos({ domicilio: null, localidad: '', pedido: null, asociado: null }))
    expect(t).not.toContain('null')
    expect(t).not.toContain('')
  })
  it('todo cae adentro de la hoja', () => {
    for (const t of textos(datos({ lineas: un(RENGLONES_POR_HOJA) }))) {
      expect(t.x).toBeGreaterThan(8)
      expect(t.x).toBeLessThan(202)
      expect(t.y).toBeGreaterThan(8)
      expect(t.y).toBeLessThan(270)
    }
  })
})
