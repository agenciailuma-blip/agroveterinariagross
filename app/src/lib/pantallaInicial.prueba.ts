import { describe, expect, it } from 'vitest'
import { pantallaInicial } from '@/lib/pantallaInicial'

const con =
  (...permisos: string[]) =>
  (clave: string) =>
    permisos.includes(clave)
const todo = con('ventas.crear', 'ventas.cobrar')

describe('con qué pantalla se abre el sistema', () => {
  it('quien vende abre en el Mostrador', () => {
    expect(pantallaInicial('Vendedor', 'mostrador', todo)).toBe('/ventas')
    expect(pantallaInicial('Vendedor', 'oficina', todo)).toBe('/ventas')
  })

  it('sin puesto elegido todavía, quien vende abre en el Mostrador', () => {
    expect(pantallaInicial('Vendedor', undefined, todo)).toBe('/ventas')
  })

  it('quien vende en la PC de la caja abre en la Caja', () => {
    expect(pantallaInicial('Vendedor', 'caja', todo)).toBe('/caja')
  })

  it('sin permiso de cobrar, en la PC de la caja abre en el Mostrador', () => {
    expect(pantallaInicial('Vendedor', 'caja', con('ventas.crear'))).toBe('/ventas')
  })

  it('el Cajero abre en la Caja en cualquier PC', () => {
    expect(pantallaInicial('Cajero', 'caja', todo)).toBe('/caja')
    expect(pantallaInicial('Cajero', 'mostrador', todo)).toBe('/caja')
    expect(pantallaInicial('Cajero', undefined, todo)).toBe('/caja')
  })

  it('el resto se queda en el Inicio, aun en la PC de la caja', () => {
    for (const rol of ['Administrador', 'Encargado', 'Vendedor de calle', 'Sin rol']) {
      expect(pantallaInicial(rol, 'caja', todo)).toBeNull()
    }
  })

  it('sin permisos de venta no se manda a nadie a una pantalla que no puede usar', () => {
    expect(pantallaInicial('Vendedor', 'caja', con())).toBeNull()
    expect(pantallaInicial('Cajero', 'caja', con())).toBeNull()
  })
})
