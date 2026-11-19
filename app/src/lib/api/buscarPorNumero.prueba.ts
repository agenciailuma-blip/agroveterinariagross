import { describe, expect, it } from 'vitest'
import { leerPapel, mismaSerie } from '@/lib/api/buscarComprobantes'
import { numeroDePresupuesto } from '@/lib/api/noFiscal'
import { siglaDe } from '@/lib/api/buscarPorNumero'

/*
  Auditoría de integralidad, puntos 8 y 9: el número se escribe como
  sale impreso o como lo dice la gente, con o sin la sigla.
*/

describe('buscar cualquier papel por número', () => {
  it('ignora la sigla y respeta la serie del puesto', () => {
    expect(leerPapel('PRE CAJA1-00000010')).toEqual({ serie: 'CAJA1', numero: 10 })
    expect(leerPapel('rem caja1 12')).toEqual({ serie: 'CAJA1', numero: 12 })
    expect(leerPapel('FAC B 1-23')).toEqual({ serie: '1', numero: 23 })
    expect(leerPapel('Recibo N° 4')).toEqual({ serie: null, numero: 4 })
  })

  it('acepta el número solo', () => {
    expect(leerPapel('123')).toEqual({ serie: null, numero: 123 })
    expect(leerPapel('00001-00000016')).toEqual({ serie: '00001', numero: 16 })
  })

  it('sin números no busca nada', () => {
    expect(leerPapel('factura')).toBeNull()
    expect(leerPapel('1-2-3')).toBeNull()
  })

  it('«1» y «0001» son la misma serie; «CAJA1» va tal cual', () => {
    expect(mismaSerie('0001', '1')).toBe(true)
    expect(mismaSerie('CAJA1', 'CAJA1')).toBe(true)
    expect(mismaSerie('CAJA1', '1')).toBe(false)
    expect(mismaSerie('CAJA2', null)).toBe(true)
  })
})

describe('la sigla elige el tipo', () => {
  it('con sigla, sólo ese tipo', () => {
    expect(siglaDe('PRE CAJA1-10')).toBe('presupuesto')
    expect(siglaDe('rem 4')).toBe('remito')
    expect(siglaDe('Proforma 3')).toBe('comprobante_interno')
    expect(siglaDe('Recibo N° 4')).toBe('recibo')
    expect(siglaDe('FAC B 1-23')).toBe('factura')
    expect(siglaDe('NC 1-4')).toBe('factura')
  })

  it('sin sigla, todos', () => {
    expect(siglaDe('0001-00000004')).toBeNull()
    expect(siglaDe('B 1-23')).toBeNull()
  })
})

describe('el presupuesto desde el mostrador', () => {
  it('lo reconoce con «pre» y un número', () => {
    expect(numeroDePresupuesto('pre 12')).toBe('12')
    expect(numeroDePresupuesto('PRE 0001-00000012')).toBe('0001-00000012')
    expect(numeroDePresupuesto('PRE CAJA1-00000010')).toBe('CAJA1-00000010')
    expect(numeroDePresupuesto('presupuesto 7')).toBe('7')
    expect(numeroDePresupuesto('PRE-15')).toBe('15')
  })

  it('no se confunde con un producto que empieza con «pre»', () => {
    expect(numeroDePresupuesto('premium')).toBeNull()
    expect(numeroDePresupuesto('pre')).toBeNull()
    expect(numeroDePresupuesto('prednisolona 20')).toBeNull()
    expect(numeroDePresupuesto('pre 12 kg')).toBeNull()
  })
})
