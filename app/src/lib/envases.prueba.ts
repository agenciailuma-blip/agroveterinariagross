import { describe, expect, it } from 'vitest'
import {
  describirCadena,
  disponibleAbriendo,
  explicarErrorDeEnvase,
  precioDividido,
  totalEnLaMasChica,
} from '@/lib/envases'
import type { NivelDeCadena } from '@/lib/envases'

/*
  La caja y la suelta. Lo que abre la caja es la base
  (supabase/pruebas/caja-y-suelta.sql); acá se prueba que la pantalla
  cuente lo mismo, sobre todo el mostrador sin internet.
*/

const nivel = (nombre: string, cantidad: number, por: number | null, n: number): NivelDeCadena => ({
  producto_id: nombre,
  codigo: nombre,
  nombre_interno: nombre,
  precio_venta: 0,
  cantidad,
  cantidad_por_envase: por,
  nivel: n,
})

describe('lo disponible abriendo envases', () => {
  it('con la caja cerrada y ninguna suelta, cuenta lo que trae la caja', () => {
    expect(disponibleAbriendo(0, 10, 1)).toBe(10)
  })

  it('suma las sueltas a lo que se puede abrir', () => {
    expect(disponibleAbriendo(9, 10, 2)).toBe(29)
  })

  it('no abre medio envase', () => {
    expect(disponibleAbriendo(3, 15, 1.5)).toBe(18)
  })

  it('un envase vendido de más no resta de las sueltas que están', () => {
    expect(disponibleAbriendo(4, 10, -2)).toBe(4)
  })
})

describe('la cadena de la caja, la tableta y la pastilla', () => {
  // El ejemplo de Lucas después de vender una pastilla con todo cerrado.
  const despues = [nivel('CAJA', 1, null, 0), nivel('TABLETA', 9, 10, 1), nivel('PASTILLA', 9, 10, 2)]

  it('se lee de la caja a la pastilla', () => {
    expect(describirCadena(despues)).toBe('1 CAJA · 9 TABLETA · 9 PASTILLA')
  })

  it('contada en pastillas, sin contar dos veces la misma', () => {
    expect(totalEnLaMasChica(despues)).toBe(199)
  })

  it('con dos niveles: la bolsa de 15 kg y los kilos sueltos', () => {
    expect(totalEnLaMasChica([nivel('BOLSA', 2, null, 0), nivel('KG', 7.5, 15, 1)])).toBe(37.5)
  })

  it('una sola fila es un producto sin envase', () => {
    expect(totalEnLaMasChica([nivel('COLLAR', 4, null, 0)])).toBe(4)
  })
})

describe('el precio de la suelta', () => {
  it('se sugiere dividiendo, con centavos', () => {
    expect(precioDividido(20000, 3)).toBe(6666.67)
  })

  it('sin cuántas trae o sin precio no se sugiere nada', () => {
    expect(precioDividido(20000, 0)).toBeNull()
    expect(precioDividido(0, 10)).toBeNull()
  })
})

describe('lo que la base no deja atar', () => {
  it('cada error dice qué hacer', () => {
    expect(explicarErrorDeEnvase('duplicate key value violates unique constraint "producto_una_suelta_por_envase"'))
      .toMatch(/ya se abre en otra suelta/)
    expect(explicarErrorDeEnvase('new row violates check constraint "producto_envase_completo"'))
      .toBe('Falta decir cuántas trae el envase.')
    expect(explicarErrorDeEnvase('Ese producto ya sale de adentro de éste: la caja…')).toMatch(/uno adentro del otro/)
    expect(explicarErrorDeEnvase('otra cosa')).toBeNull()
  })
})
