import { describe, expect, it } from 'vitest'
import { resumenDeVentas, tituloDeVentas } from '@/lib/api/metricas'
import type { MetricasDeVenta } from '@/lib/api/metricas'

/*
  Los números de venta de Inicio.

  Las cuentas las hace la base y se verifican contra la base. Lo que se
  prueba acá es lo otro, que es donde un número correcto se vuelve una
  pantalla que miente: de quién son las ventas que se están mostrando, y
  que la etiqueta diga lo que de verdad se contó.
*/

function metricas(extra: Partial<MetricasDeVenta> = {}): MetricasDeVenta {
  return {
    alcance: 'todo',
    primero_del_mes: '2026-09-01',
    hoy: { ventas: 0, total: 0 },
    semana: { ventas: 14, total: 1213599.99 },
    mes: { ventas: 14, total: 1213599.99 },
    mas_vendidos: [],
    por_vendedor: [],
    ...extra,
  }
}

describe('de quién son estos números', () => {
  /*
    El caso que importa: quien no tiene permiso para ver todas las ventas
    recibe SÓLO las suyas. Si el cartel dijera "Ventas del local", el
    vendedor leería su propio día como si fuera el del mostrador entero y
    no habría forma de que se diera cuenta.
  */
  it('avisa cuando los números son sólo los de quien mira', () => {
    expect(tituloDeVentas('propio')).toBe('Tus ventas')
  })

  it('dice que son los del local cuando se ven todas', () => {
    expect(tituloDeVentas('todo')).toBe('Ventas del local')
  })
})

describe('las tres tarjetas de venta', () => {
  it('van en orden y con la etiqueta de lo que de verdad se contó', () => {
    const tarjetas = resumenDeVentas(metricas())

    expect(tarjetas.map((t) => t.titulo)).toEqual(['Hoy', 'Últimos 7 días', 'Este mes'])
  })

  it('muestra el importe con signo de pesos y el conteo abajo', () => {
    const [, semana] = resumenDeVentas(metricas())

    expect(semana.importe).toContain('1.213.599,99')
    expect(semana.detalle).toBe('14 ventas cobradas')
  })

  /*
    Un día con una sola venta no dice "1 ventas". Es lo primero que ve
    Lucas a la mañana y lo que más se mira de toda la pantalla.
  */
  it('no dice «1 ventas»', () => {
    const [hoy] = resumenDeVentas(metricas({ hoy: { ventas: 1, total: 48000 } }))

    expect(hoy.detalle).toBe('1 venta cobrada')
  })

  /*
    Y a la mañana temprano, antes de la primera venta, tiene que leerse
    como lo que es y no como un cero suelto que parece un error.
  */
  it('el día todavía sin ventas se lee como tal', () => {
    const [hoy] = resumenDeVentas(metricas())

    expect(hoy.detalle).toBe('sin ventas todavía')
    expect(hoy.importe).toContain('0,00')
  })
})
