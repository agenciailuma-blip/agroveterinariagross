import { describe, expect, it } from 'vitest'
import {
  comparar,
  resumenDeVentas,
  tituloDeVentas,
  tramoEnPalabras,
  ventasComparadas,
} from '@/lib/api/metricas'
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
    hoy_anterior: { ventas: 0, total: 0 },
    semana_anterior: { ventas: 2, total: 146100 },
    mes_anterior: { ventas: 12, total: 1104800 },
    tramo_del_mes_anterior: { desde: '2026-08-01', hasta: '2026-08-11' },
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

describe('la comparación contra el período anterior', () => {
  /*
    El caso que obliga a que `comparar` exista.

    El primer día con ventas después de un feriado largo, o el primer mes
    del sistema, el período anterior es cero. La cuenta da infinito y la
    tarjeta escribiría «+Infinity%» arriba del numero de ventas.
  */
  it('no inventa un porcentaje cuando no había con qué comparar', () => {
    const c = comparar(480000, 0, 'que ayer')

    expect(c.porcentaje).toBeNull()
    expect(c.sentido).toBe('sin_base')
    expect(c.texto).toBe('sin ventas ayer')
  })

  it('el período anterior en cero no se lee como una caída', () => {
    expect(comparar(0, 0, 'que ayer').sentido).toBe('sin_base')
  })

  /*
    El «que» sirve para comparar y estorba para constatar. Con el texto
    armado de una sola forma la pantalla decía «sin ventas que el 1 al 11
    de agosto», y así se vio al abrirla por primera vez.
  */
  it('sin base, el texto no arrastra el «que» de la comparación', () => {
    expect(comparar(500, 0, 'que el 1 al 11 de agosto').texto)
      .toBe('sin ventas el 1 al 11 de agosto')
    expect(comparar(500, 0, 'que los 7 previos').texto)
      .toBe('sin ventas los 7 previos')
  })

  it('marca la suba con su porcentaje', () => {
    const c = comparar(150, 100, 'que ayer')

    expect(c.sentido).toBe('sube')
    expect(c.texto).toBe('+50% que ayer')
  })

  it('marca la baja con el signo menos, no con un guión', () => {
    const c = comparar(50, 100, 'que ayer')

    expect(c.sentido).toBe('baja')
    expect(c.texto).toBe('−50% que ayer')
  })

  /*
    Vender todo un día y después nada no es «−100% más o menos»: es que
    no se vendió. El número tiene que ser exacto.
  */
  it('el día sin ventas contra uno que sí tuvo da −100%', () => {
    expect(comparar(0, 240000, 'que ayer').texto).toBe('−100% que ayer')
  })

  /*
    Un cambio de medio punto redondea a cero y «+0%» se lee como un error
    de cuentas. Por debajo de ese umbral el período está igual.
  */
  it('no escribe «+0%»', () => {
    const c = comparar(100.2, 100, 'que ayer')

    expect(c.sentido).toBe('igual')
    expect(c.texto).toBe('igual que ayer')
  })

  it('medio punto para arriba ya es una suba', () => {
    expect(comparar(101, 100, 'que ayer').sentido).toBe('sube')
  })
})

describe('contra qué tramo se compara el mes', () => {
  /*
    Es lo que hace discutible el número: «−12%» sin decir contra qué días
    no se puede defender ante nadie.
  */
  it('lo dice con todas las letras', () => {
    expect(tramoEnPalabras({ desde: '2026-08-01', hasta: '2026-08-11' }))
      .toBe('el 1 al 11 de agosto')
  })

  /*
    El primer día del mes el tramo es un solo día. «el 1 al 1 de agosto»
    está mal escrito.
  */
  it('el primer día del mes no dice «del 1 al 1»', () => {
    expect(tramoEnPalabras({ desde: '2026-08-01', hasta: '2026-08-01' }))
      .toBe('el 1 de agosto')
  })

  /*
    Una fecha suelta parseada con new Date() se interpreta en UTC y en
    Argentina cae el día anterior: el 1 de agosto se leería «31 de
    julio». El mes de la comparación saldría equivocado.
  */
  it('no corre el mes un día para atrás', () => {
    expect(tramoEnPalabras({ desde: '2026-08-01', hasta: '2026-08-05' }))
      .toContain('agosto')
  })

  it('en enero compara contra diciembre', () => {
    expect(tramoEnPalabras({ desde: '2025-12-01', hasta: '2025-12-05' }))
      .toBe('el 1 al 5 de diciembre')
  })
})

describe('las tarjetas comparadas', () => {
  it('cada una dice contra qué período se mide', () => {
    const [hoy, semana, mes] = ventasComparadas(metricas())

    expect(hoy.comparacion.texto).toContain('ayer')
    expect(semana.comparacion.texto).toContain('los 7 previos')
    expect(mes.comparacion.texto).toContain('agosto')
  })

  it('el mes se compara contra el mismo tramo y no contra el mes entero', () => {
    const [, , mes] = ventasComparadas(metricas())

    expect(mes.comparacion.sentido).toBe('sube')
    expect(mes.comparacion.texto).toBe('+10% que el 1 al 11 de agosto')
  })

  it('sigue mostrando el importe y el conteo de siempre', () => {
    const [, semana] = ventasComparadas(metricas())

    expect(semana.importe).toContain('1.213.599,99')
    expect(semana.detalle).toBe('14 ventas cobradas')
  })
})
