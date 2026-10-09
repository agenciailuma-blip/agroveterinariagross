import { describe, expect, it } from 'vitest'
import { problemaConAviso } from '@/lib/api/avisos'
import { nombreDelMovimiento, quienYDonde } from '@/lib/api/movimientos'
import type { Movimiento } from '@/lib/api/movimientos'

/*
  Los avisos de stock y el historial de movimientos. Lo de fondo —qué
  aviso gana, que quitar uno viaje a las PC, el saldo en orden— lo
  prueba la base (supabase/pruebas/avisos-y-movimientos.sql); acá, lo
  que la pantalla frena antes de guardar y cómo se lee el historial.
*/

describe('lo que se puede guardar como aviso', () => {
  it('dos números, el crítico menor o igual que el bajo', () => {
    expect(problemaConAviso('10', '3')).toBeNull()
    expect(problemaConAviso('2', '2')).toBeNull()
  })

  it('cero es un aviso válido: «avisame recién cuando no quede nada»', () => {
    expect(problemaConAviso('0', '0')).toBeNull()
  })

  it('frena antes de guardar lo que la base va a rechazar', () => {
    expect(problemaConAviso('2', '3')).toMatch(/crítico/)
    expect(problemaConAviso('', '3')).toMatch(/Faltan/)
    expect(problemaConAviso('-1', '0')).toMatch(/cero o más/)
    expect(problemaConAviso('diez', '3')).toMatch(/cero o más/)
  })
})

const movimiento = (parcial: Partial<Movimiento>): Movimiento => ({
  id: 'm',
  ocurrido_en: '2026-10-09T10:00:00Z',
  tipo: 'venta',
  cantidad: -1,
  saldo: 9,
  motivo: null,
  usuario: null,
  vendedor: null,
  terminal: null,
  deposito: null,
  registrado_offline: false,
  ...parcial,
})

describe('el historial de movimientos', () => {
  it('cada tipo tiene un nombre que se entiende, y uno nuevo no rompe', () => {
    expect(nombreDelMovimiento('retorno_remito')).toBe('Volvió del reparto')
    expect(nombreDelMovimiento('apertura')).toBe('Se abrió para vender suelto')
    expect(nombreDelMovimiento('algo_nuevo')).toBe('algo_nuevo')
  })

  it('dice quién cobró y quién vendió, y en qué máquina', () => {
    expect(quienYDonde(movimiento({ usuario: 'Ana', vendedor: 'Juan', terminal: 'Caja 1' }), false)).toBe(
      'Ana (vendió Juan) · Caja 1',
    )
  })

  it('el depósito sólo cuando hay más de uno', () => {
    const m = movimiento({ usuario: 'Ana', deposito: 'Local' })
    expect(quienYDonde(m, false)).toBe('Ana')
    expect(quienYDonde(m, true)).toBe('Ana · Local')
  })
})
