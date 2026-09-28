import { describe, expect, it } from 'vitest'
import { nombreSugerido, prefijoSugerido } from '@/lib/api/terminales'

/*
  Lo que se propone al dar de alta una caja o un mostrador. Las reglas
  que importan —prefijo único y que no cambia— las pone la base
  (supabase/pruebas/alta-de-terminales.sql).
*/
describe('el prefijo que se propone', () => {
  it('sigue a los de su tipo', () => {
    expect(prefijoSugerido('mostrador', ['CAJA1', 'MOS1', 'MOS2'])).toBe('MOS3')
    expect(prefijoSugerido('caja', ['CAJA1', 'MOS1', 'MOS2'])).toBe('CAJA2')
  })

  it('llena el primer hueco en vez de saltarlo', () => {
    expect(prefijoSugerido('mostrador', ['MOS1', 'MOS3'])).toBe('MOS2')
  })

  it('no le importa si están en minúsculas', () => {
    expect(prefijoSugerido('mostrador', ['mos1'])).toBe('MOS2')
  })

  it('arranca en 1 si no hay ninguno de ese tipo', () => {
    expect(prefijoSugerido('oficina', ['CAJA1', null])).toBe('OFI1')
  })
})

describe('el nombre que se propone', () => {
  it('lleva el mismo número que el prefijo', () => {
    expect(nombreSugerido('mostrador', 'MOS3')).toBe('Mostrador 3')
    expect(nombreSugerido('caja', 'CAJA2')).toBe('Caja 2')
  })

  it('sin número en el prefijo, sólo el tipo', () => {
    expect(nombreSugerido('oficina', 'ADMIN')).toBe('Oficina')
  })
})
