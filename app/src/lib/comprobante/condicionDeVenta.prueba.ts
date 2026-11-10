import { describe, expect, it } from 'vitest'
import { condicionDeVenta } from '@/lib/comprobante/condicionDeVenta'

describe('la condición de venta del comprobante', () => {
  it('es contado con efectivo, tarjeta, transferencia o cheque', () => {
    expect(condicionDeVenta(['efectivo'])).toBe('Contado')
    expect(condicionDeVenta(['tarjeta_credito', 'transferencia'])).toBe('Contado')
    expect(condicionDeVenta(['cheque'])).toBe('Contado')
  })

  it('es cuenta corriente si todo queda debiendo, también fiado', () => {
    expect(condicionDeVenta(['cuenta_corriente'])).toBe('Cuenta corriente')
    expect(condicionDeVenta(['fiado'])).toBe('Cuenta corriente')
  })

  it('dice las dos cuando una parte se paga y el resto queda debiendo', () => {
    expect(condicionDeVenta(['efectivo', 'cuenta_corriente'])).toBe('Contado / Cuenta corriente')
  })

  it('sin pagos conocidos no inventa nada', () => {
    expect(condicionDeVenta([])).toBe('')
    expect(condicionDeVenta([null, undefined])).toBe('')
  })
})
