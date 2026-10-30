import { describe, expect, it } from 'vitest'
import { avisoDeTandas, limitarAjuste, numeroDeHoja, type TandaRemitoR } from '@/lib/api/remitoR'

const tanda = (o: Partial<TandaRemitoR>): TandaRemitoR => ({
  id: 't',
  punto_venta: 5,
  cai: '12345678901234',
  vencimiento: '2027-06-01',
  desde: 1,
  hasta: 1000,
  proxima: 1,
  quedan: 1000,
  usadas: 0,
  arruinadas: 0,
  vigente: true,
  ...o,
})
const HOY = '2026-10-30'

describe('el número de la hoja', () => {
  it('lleva punto de venta y número completos', () => {
    expect(numeroDeHoja(5, 95969)).toBe('0005-00095969')
  })
})

describe('el aviso para encargar hojas', () => {
  it('sin tandas ni problemas, no dice nada', () => {
    expect(avisoDeTandas([], HOY)).toBeNull()
    expect(avisoDeTandas([tanda({})], HOY)).toBeNull()
  })
  it('sin hojas vigentes, lo dice', () => {
    expect(avisoDeTandas([tanda({ vigente: false, quedan: 0 })], HOY)).toMatch(/No quedan hojas/)
  })
  it('avisa cuando quedan pocas, sumando las tandas', () => {
    expect(avisoDeTandas([tanda({ quedan: 30 })], HOY)).toBe('Quedan 30 hojas: conviene encargar más.')
    expect(avisoDeTandas([tanda({ quedan: 30 }), tanda({ quedan: 100 })], HOY)).toBeNull()
  })
  it('avisa antes del vencimiento', () => {
    expect(avisoDeTandas([tanda({ vencimiento: '2026-11-09' })], HOY)).toBe('El CAI de las hojas vence en 10 días.')
    expect(avisoDeTandas([tanda({ vencimiento: HOY })], HOY)).toBe('El CAI de las hojas vence hoy.')
  })
})

describe('el corrimiento de la impresora', () => {
  it('va de a medio milímetro y tiene un tope', () => {
    expect(limitarAjuste(1.3)).toBe(1.5)
    expect(limitarAjuste(99)).toBe(15)
    expect(limitarAjuste(-99)).toBe(-15)
    expect(limitarAjuste(Number.NaN)).toBe(0)
  })
})
