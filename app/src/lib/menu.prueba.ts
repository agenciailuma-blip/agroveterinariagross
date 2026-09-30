import { describe, expect, it } from 'vitest'
import { SECCIONES, destinoDe, pestanasVisibles, seccionDe } from '@/lib/menu'
import type { Contexto } from '@/lib/menu'

const seccion = (id: string) => SECCIONES.find((s) => s.id === id)!

const todo: Contexto = { tienePermiso: () => true, variosDepositos: true }
const con = (permisos: string[], variosDepositos = false): Contexto => ({
  tienePermiso: (p) => permisos.includes(p),
  variosDepositos,
})

describe('a qué sección pertenece cada dirección', () => {
  it('cada pestaña, a la suya', () => {
    expect(seccionDe('/caja')?.seccion.id).toBe('ventas')
    expect(seccionDe('/inventario')?.seccion.id).toBe('stock')
    expect(seccionDe('/no-fiscales')?.seccion.id).toBe('comprobantes')
  })

  it('gana la dirección más larga: Cuentas proveedores no es Proveedores', () => {
    expect(seccionDe('/proveedores/cuentas')?.pestana.etiqueta).toBe('Cuentas proveedores')
    expect(seccionDe('/proveedores')?.pestana.etiqueta).toBe('Proveedores')
  })

  it('las pantallas de adentro siguen en su sección', () => {
    expect(seccionDe('/productos/importar')?.seccion.id).toBe('productos')
    expect(seccionDe('/proveedores/cuentas/importar')?.pestana.etiqueta).toBe('Cuentas proveedores')
    expect(seccionDe('/clientes/importar')?.seccion.id).toBe('clientes')
  })

  it('el Inicio, sólo con la dirección exacta', () => {
    expect(seccionDe('/')?.seccion.id).toBe('inicio')
    expect(seccionDe('/algo-que-no-existe')).toBeNull()
  })

  it('una dirección que empieza igual no se confunde: /stockeo no es Stock', () => {
    expect(seccionDe('/stockeo')).toBeNull()
  })

  it('ninguna dirección está en dos secciones', () => {
    const direcciones = SECCIONES.flatMap((s) => s.pestanas.map((p) => p.a))
    expect(new Set(direcciones).size).toBe(direcciones.length)
  })
})

describe('las pestañas que se ven', () => {
  it('un vendedor ve Ventas con una sola: el mostrador', () => {
    const vendedor = con(['ventas.crear'])
    expect(pestanasVisibles(seccion('ventas'), vendedor).map((p) => p.etiqueta)).toEqual(['Mostrador'])
  })

  it('Transferencias, sólo con más de un depósito', () => {
    const sinSegundo = { ...todo, variosDepositos: false }
    expect(pestanasVisibles(seccion('stock'), sinSegundo).map((p) => p.etiqueta)).toEqual(['Stock', 'Inventario'])
    expect(pestanasVisibles(seccion('stock'), todo)).toHaveLength(3)
  })

  it('sin ningún permiso de la sección, la sección no tiene pestañas', () => {
    expect(pestanasVisibles(seccion('administracion'), con(['ventas.crear']))).toEqual([])
  })
})

describe('adónde lleva tocar una sección', () => {
  it('a la última pestaña usada en esta computadora', () => {
    expect(destinoDe(seccion('ventas'), todo, '/caja')).toBe('/caja')
  })

  it('sin una última, a la primera', () => {
    expect(destinoDe(seccion('ventas'), todo, null)).toBe('/ventas')
  })

  it('si la última ya no se puede ver, a la primera que sí', () => {
    // Transferencias quedó guardada, pero se dio de baja el segundo depósito.
    expect(destinoDe(seccion('stock'), { ...todo, variosDepositos: false }, '/transferencias')).toBe('/stock')
    // Un cajero que usó la caja, y ahora entra un vendedor en la misma PC.
    expect(destinoDe(seccion('ventas'), con(['ventas.crear']), '/caja')).toBe('/ventas')
  })

  it('sin permiso para nada de la sección, a ningún lado', () => {
    expect(destinoDe(seccion('administracion'), con([]), null)).toBeNull()
  })
})
