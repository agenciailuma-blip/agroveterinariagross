import { describe, expect, it } from 'vitest'
import { explicarErrorDelProducto } from '@/lib/api/catalogo'

/*
  Lo que la base no acepta de la ficha se dice con palabras, no con el
  nombre de una restricción.
*/
describe('los errores al guardar un producto', () => {
  it('el peso y el bulto en cero', () => {
    expect(explicarErrorDelProducto('new row violates check constraint "producto_peso_positivo"')).toMatch(
      /peso tiene que ser más que cero/,
    )
    expect(
      explicarErrorDelProducto('new row violates check constraint "producto_unidades_por_bulto_positivas"'),
    ).toMatch(/unidades por bulto tienen que ser más que cero/)
  })

  it('sigue explicando los del envase, y no inventa nada para lo demás', () => {
    expect(explicarErrorDelProducto('violates check constraint "producto_envase_completo"')).toMatch(/cuántas trae/)
    expect(explicarErrorDelProducto('otra cosa')).toBeNull()
  })
})
