import { describe, expect, it } from 'vitest'
import { etiquetaForma, leerImporte, numeroRecibo } from '@/lib/api/recibos'

describe('el recibo', () => {
  it('el número, con la serie y ocho cifras', () => {
    expect(numeroRecibo('0001', 12)).toBe('0001-00000012')
    expect(numeroRecibo('0001', 123456789)).toBe('0001-123456789')
  })
})

describe('el importe que escribe el vendedor', () => {
  it('con coma, con punto de miles o con punto decimal es el mismo número', () => {
    expect(leerImporte('1.250,50')).toBe(1250.5)
    expect(leerImporte('1250,5')).toBe(1250.5)
    expect(leerImporte('1250.5')).toBe(1250.5)
    expect(leerImporte('$ 125.000')).toBe(125000)
    expect(leerImporte('1.250')).toBe(1250)
  })

  it('cero, negativo o cualquier cosa no es un cobro', () => {
    for (const malo of ['', '0', '-100', 'mil', '1,2,3']) {
      expect(leerImporte(malo), malo).toBeNull()
    }
  })

  it('se queda en el centavo', () => {
    expect(leerImporte('10,005')).toBe(10.01)
  })
})

describe('las formas de cobro', () => {
  it('en palabras', () => {
    expect(etiquetaForma('transferencia')).toBe('Transferencia')
    expect(etiquetaForma('cheque')).toBe('Cheque')
  })
})
