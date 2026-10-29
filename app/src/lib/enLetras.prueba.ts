import { describe, expect, it } from 'vitest'
import { enteroEnLetras, importeEnLetras } from '@/lib/enLetras'

describe('el importe en letras', () => {
  it('los casos que se escriben distinto', () => {
    expect(enteroEnLetras(0)).toBe('cero')
    expect(enteroEnLetras(1)).toBe('uno')
    expect(enteroEnLetras(16)).toBe('dieciséis')
    expect(enteroEnLetras(21)).toBe('veintiuno')
    expect(enteroEnLetras(31)).toBe('treinta y uno')
    expect(enteroEnLetras(100)).toBe('cien')
    expect(enteroEnLetras(101)).toBe('ciento uno')
    expect(enteroEnLetras(500)).toBe('quinientos')
    expect(enteroEnLetras(1000)).toBe('mil')
    expect(enteroEnLetras(1001)).toBe('mil uno')
  })

  it('«uno» se acorta delante de mil y de millón', () => {
    expect(enteroEnLetras(21_000)).toBe('veintiún mil')
    expect(enteroEnLetras(31_000)).toBe('treinta y un mil')
    expect(enteroEnLetras(101_000)).toBe('ciento un mil')
    expect(enteroEnLetras(1_000_000)).toBe('un millón')
    expect(enteroEnLetras(21_000_000)).toBe('veintiún millones')
  })

  it('números grandes, como los de una cuenta corriente', () => {
    expect(enteroEnLetras(1_250)).toBe('mil doscientos cincuenta')
    expect(enteroEnLetras(2_345_678)).toBe('dos millones trescientos cuarenta y cinco mil seiscientos setenta y ocho')
    expect(enteroEnLetras(100_100)).toBe('cien mil cien')
  })

  it('con los centavos en número, como en un cheque', () => {
    expect(importeEnLetras(1250.5)).toBe('mil doscientos cincuenta con 50/100')
    expect(importeEnLetras(1000)).toBe('mil con 00/100')
    expect(importeEnLetras(0.07)).toBe('cero con 07/100')
    // Lo que deja la coma flotante no corre un centavo.
    expect(importeEnLetras(0.1 + 0.2)).toBe('cero con 30/100')
  })
})
