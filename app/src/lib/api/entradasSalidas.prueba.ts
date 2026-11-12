import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MOTIVOS, motivoValido, problemaDelAjuste, quedaDespues } from './entradasSalidas'

const linea = (cantidad: string) => ({ nombre_interno: 'Bolsa 20 kg', cantidad })

describe('entradas y salidas de stock', () => {
  it('un motivo de salida no sirve para una entrada, y «Otro» sirve para las dos', () => {
    expect(motivoValido('salida', 'rotura')).toBe(true)
    expect(motivoValido('entrada', 'rotura')).toBe(false)
    expect(motivoValido('entrada', 'cambio')).toBe(true)
    expect(motivoValido('salida', 'cambio')).toBe(false)
    expect(motivoValido('salida', 'otro')).toBe(true)
    expect(motivoValido('entrada', 'otro')).toBe(true)
    expect(motivoValido('salida', null)).toBe(false)
  })

  it('pide motivo, observación con «Otro», productos y cantidades', () => {
    expect(problemaDelAjuste('salida', null, '', [linea('1')])).toBe('Elegí el motivo.')
    expect(problemaDelAjuste('salida', 'otro', '  ', [linea('1')])).toMatch(/Otro/)
    expect(problemaDelAjuste('salida', 'otro', 'Se la llevó el perro', [linea('1')])).toBeNull()
    expect(problemaDelAjuste('salida', 'rotura', '', [])).toMatch(/ningún producto/)
    expect(problemaDelAjuste('salida', 'rotura', '', [linea('0')])).toMatch(/Bolsa 20 kg/)
    expect(problemaDelAjuste('entrada', 'cambio', '', [linea('2')])).toBeNull()
  })

  it('no frena una salida que deja el stock en negativo: sólo la calcula', () => {
    expect(quedaDespues('salida', { hay: 1, cantidad: '3' })).toBe(-2)
    expect(quedaDespues('entrada', { hay: 1, cantidad: '3' })).toBe(4)
    expect(problemaDelAjuste('salida', 'rotura', '', [linea('3')])).toBeNull()
  })

  it('los motivos de la app son los mismos que nombra la base', () => {
    const sql = readFileSync(
      new URL('../../../../supabase/migrations/20261112120000_entradas_y_salidas_de_stock.sql', import.meta.url),
      'utf-8',
    )
    for (const m of [...MOTIVOS.salida, ...MOTIVOS.entrada]) {
      expect(sql).toMatch(new RegExp(`when '${m.valor}'\\s+then '${m.nombre}'`))
    }
  })
})
