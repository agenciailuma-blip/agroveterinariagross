import { describe, expect, it } from 'vitest'
import { ultimaPorRemito } from '@/lib/api/remitoFirmado'

/*
  Las reglas —quién sube, que el archivo esté, la fecha, que no se borre—
  las cuida la base y se probaron contra la base. Acá: que de varias
  fotos de un remito se muestre la última y se sepa cuántas hay.
*/

const foto = (id: string, remito: string, subido: string) => ({
  id,
  remito_id: remito,
  ruta: `${remito}/${id}.webp`,
  firmo: 'Juan Pérez',
  firmado_el: '2026-10-29',
  subido_en: subido,
  usuario: [{ nombre: 'Lucas Gross' }],
})

describe('el remito firmado', () => {
  it('de varias fotos se ve la última, y cuenta cuántas hay', () => {
    // Vienen de la base ordenadas, la más nueva primero.
    const firmas = ultimaPorRemito([
      foto('nueva', 'r1', '2026-10-29T18:00:00Z'),
      foto('vieja', 'r1', '2026-10-29T15:00:00Z'),
      foto('unica', 'r2', '2026-10-28T12:00:00Z'),
    ])
    expect(firmas.get('r1')).toMatchObject({ id: 'nueva', fotos: 2, subido_por: 'Lucas Gross' })
    expect(firmas.get('r2')).toMatchObject({ id: 'unica', fotos: 1 })
  })

  it('un remito sin foto no aparece', () => {
    expect(ultimaPorRemito([]).size).toBe(0)
  })
})
