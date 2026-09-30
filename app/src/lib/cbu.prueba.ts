import { describe, expect, it } from 'vitest'
import { aliasValido, bancoDelCbu, cbuLegible, cbuValido, esCvu, problemaConAlias, problemaConCbu } from '@/lib/cbu'

/*
  Los datos para transferirle a un proveedor.

  La base controla lo mismo (app.cbu_valido); acá se prueba que la
  pantalla avise antes de guardar, y con palabras que sirvan.
*/

const CBU_MACRO = '2850590940090418135201'
const CVU = '0000003100010000000009'

describe('el CBU', () => {
  it('con sus dos dígitos verificadores', () => {
    expect(cbuValido(CBU_MACRO)).toBe(true)
    expect(cbuValido(CVU)).toBe(true)
  })

  it('un dígito cambiado no pasa, en cualquiera de los dos bloques', () => {
    expect(cbuValido('2850590940090418135202')).toBe(false)
    expect(cbuValido('2850591940090418135201')).toBe(false)
  })

  it('se acepta pegado con espacios o guiones', () => {
    expect(cbuValido('2850590-9 4009041813520-1')).toBe(true)
  })

  it('dice qué banco es, o si es una billetera', () => {
    expect(bancoDelCbu(CBU_MACRO)).toBe('Macro')
    expect(bancoDelCbu(CVU)).toBe('Billetera virtual')
    expect(esCvu(CVU)).toBe(true)
    expect(bancoDelCbu('9990000000000000000000')).toBeNull()
  })

  it('se muestra en grupos, para leerlo sin perderse', () => {
    expect(cbuLegible(CBU_MACRO)).toBe('2850 5909 4009 0418 1352 01')
  })

  it('el aviso dice qué está mal', () => {
    expect(problemaConCbu('')).toBeNull()
    expect(problemaConCbu('285059094009')).toBe('Tiene 12 dígitos y un CBU o CVU tiene 22.')
    expect(problemaConCbu('2850590940090418135202')).toMatch(/número cambiado/)
    expect(problemaConCbu(CBU_MACRO)).toBeNull()
  })
})

describe('el alias', () => {
  it('de 6 a 20 letras, números, puntos o guiones', () => {
    expect(aliasValido('MESA.SOL.CASA')).toBe(true)
    expect(aliasValido('gross-agro.pagos')).toBe(true)
    expect(aliasValido('corto')).toBe(false)
    expect(aliasValido('con espacio')).toBe(false)
    expect(aliasValido('ñandu.campo')).toBe(false)
  })

  it('el aviso dice qué está mal', () => {
    expect(problemaConAlias('')).toBeNull()
    expect(problemaConAlias('abc')).toBe('Un alias tiene entre 6 y 20 caracteres.')
    expect(problemaConAlias('mesa sol casa')).toBe('Un alias sólo lleva letras, números, puntos y guiones.')
  })
})
