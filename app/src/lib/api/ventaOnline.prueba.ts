import { describe, expect, it } from 'vitest'
import {
  cambiaLoQueVeLaTienda,
  describirEnTienda,
  normalizarColchon,
  type EstadoEnTienda,
  type LoQueMiraLaTienda,
} from '@/lib/api/ventaOnline'
import { moneda } from '@/lib/tipos'

/*
  ─────────────────────────────────────────────────────────────
  La línea de la ficha que dice qué ve la tienda

  Lo que se cuida: que nunca diga «se vende online» de algo que la
  tienda no ve, y que no describa lo guardado cuando en pantalla hay
  cambios sin guardar que lo cambiarían. Las reglas de publicación se
  prueban en la base (supabase/pruebas/vender-online.sql); acá, que la
  pantalla las cuente bien.
  ─────────────────────────────────────────────────────────────
*/

const SALE: EstadoEnTienda = {
  producto_id: 'p1',
  vender_online: true,
  colchon_propio: null,
  colchon_canal: 2,
  stock: 3,
  precio: 6900,
  motivo: null,
}

const opciones = { esNuevo: false, pendiente: false, unidad: 'unidad' }

describe('la línea de la ficha', () => {
  it('cuando sale, dice cuánto ve la tienda y a qué precio', () => {
    expect(describirEnTienda(SALE, opciones)).toEqual({
      tono: 'sale',
      texto: `Se vende online: la tienda ve 3 unidades a ${moneda.format(6900)}.`,
    })
  })

  it('con una sola, en singular; y con la unidad del producto', () => {
    expect(describirEnTienda({ ...SALE, stock: 1 }, opciones).texto).toContain('ve 1 unidad a')
    expect(describirEnTienda({ ...SALE, stock: 4 }, { ...opciones, unidad: 'bolsa' }).texto).toContain('ve 4 bolsas a')
    expect(describirEnTienda({ ...SALE, stock: 12 }, { ...opciones, unidad: 'kg' }).texto).toContain('ve 12 kg a')
  })

  it('con stock cero sigue diciendo que se vende: la tienda lo muestra sin stock', () => {
    expect(describirEnTienda({ ...SALE, stock: 0 }, opciones)).toMatchObject({ tono: 'sale' })
  })

  it('prendido pero sin cumplir las condiciones, dice por qué no sale', () => {
    expect(describirEnTienda({ ...SALE, motivo: 'Le falta el nombre público' }, opciones)).toEqual({
      tono: 'no_sale',
      texto: 'Prendido, pero no sale: le falta el nombre público.',
    })
  })

  it('apagado, lo dice sin más, aunque además le falte algo', () => {
    expect(
      describirEnTienda({ ...SALE, vender_online: false, motivo: 'No está marcado para vender online' }, opciones),
    ).toEqual({ tono: 'apagado', texto: 'No se vende online.' })
  })

  /*
    Esta es la que importa: con el nombre público recién escrito y sin
    guardar, lo guardado dice «le falta el nombre público». Mostrar eso
    confundiría; mostrar «se vende» sería mentir.
  */
  it('con cambios sin guardar no describe lo guardado', () => {
    expect(
      describirEnTienda({ ...SALE, motivo: 'Le falta el nombre público' }, { ...opciones, pendiente: true }),
    ).toEqual({ tono: 'pendiente', texto: 'Guardá para ver cómo queda en la tienda.' })
  })

  it('un producto nuevo todavía no está en la tienda', () => {
    expect(describirEnTienda(null, { ...opciones, esNuevo: true }).tono).toBe('pendiente')
  })
})

describe('qué cambios afectan a la tienda', () => {
  const guardado: LoQueMiraLaTienda = {
    vender: true,
    colchon: '',
    nombre_publico: 'Comedero de acero 1 L',
    precio_venta: 6900,
    activo: true,
    es_fitosanitario: false,
  }

  it('sin cambios, nada', () => {
    expect(cambiaLoQueVeLaTienda(guardado, { ...guardado })).toBe(false)
  })

  it.each([
    ['el interruptor', { vender: false }],
    ['el colchón', { colchon: '4' }],
    ['el nombre público', { nombre_publico: 'Comedero 1 L' }],
    ['borrar el nombre público', { nombre_publico: null }],
    ['el precio', { precio_venta: 7200 }],
    ['desactivarlo', { activo: false }],
    ['marcarlo fitosanitario', { es_fitosanitario: true }],
  ])('%s cambia lo que ve la tienda', (_, cambio) => {
    expect(cambiaLoQueVeLaTienda(guardado, { ...guardado, ...cambio })).toBe(true)
  })

  it('espacios de más en el nombre no cuentan: la tienda los recibe recortados', () => {
    expect(cambiaLoQueVeLaTienda(guardado, { ...guardado, nombre_publico: '  Comedero de acero 1 L ' })).toBe(false)
  })

  it('"3" y "3.0" son el mismo colchón; vacío es el del canal', () => {
    expect(cambiaLoQueVeLaTienda({ ...guardado, colchon: '3' }, { ...guardado, colchon: '3.0' })).toBe(false)
    expect(normalizarColchon('')).toBeNull()
    expect(normalizarColchon(' 2,5 ')).toBe(2.5)
  })
})
