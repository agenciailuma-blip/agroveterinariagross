import { describe, expect, it } from 'vitest'
import { loQueFaltaEntregar, loQueSeGuarda } from '@/lib/local/red'
import type { OperacionAbierta } from '@/lib/local/db'

/*
  La venta que llega por la red del local.

  El transporte se prueba del lado del Rust. Lo que se prueba acá es la
  regla que decide qué se guarda de lo que llegó, que es donde un error
  no se ve: la venta aparece o no aparece en la pantalla del cajero, y
  las dos formas de equivocarse cuestan plata.
*/

function operacion(extra: Partial<OperacionAbierta> = {}): OperacionAbierta {
  return {
    id: crypto.randomUUID(),
    lote: 'v-1',
    orden: 0,
    tipo: 'insert',
    tabla: 'venta',
    datos: {},
    descripcion: '',
    creado_en: '2026-09-10T12:00:00.000Z',
    intentos: 0,
    ultimo_error: null,
    estado: 'pendiente',
    ...extra,
  }
}

function venta(id: string, estado = 'en_caja') {
  return operacion({
    lote: id,
    tabla: 'venta',
    datos: { id, estado, codigo: `MOS1-${id}`, total: 1000 },
  })
}

function linea(ventaId: string, descripcion: string) {
  return operacion({
    lote: ventaId,
    orden: 1,
    tabla: 'venta_linea',
    datos: { id: `l-${descripcion}`, venta_id: ventaId, descripcion, cantidad: 1 },
  })
}

describe('qué se guarda de lo que llega por la red', () => {
  it('muestra en la caja la venta que viene esperando cobro, con sus líneas', () => {
    const { ventas, lineas } = loQueSeGuarda(
      [venta('v1'), linea('v1', 'Bravecto'), linea('v1', 'Collar')],
      new Set(),
    )

    expect(ventas.map((v) => v.id)).toEqual(['v1'])
    expect(lineas.map((l) => l.descripcion)).toEqual(['Bravecto', 'Collar'])
  })

  /*
    El caso caro, y es el mismo que ya tenía la cola de la caja: el
    mostrador reenvía sus operaciones —para él siguen pendientes hasta
    que lleguen al servidor— y la venta que el cajero YA COBRÓ volvería
    a aparecerle en pantalla, con la plata adentro. La cobraría dos
    veces.
  */
  it('no resucita una venta que esta caja ya cobró', () => {
    const { ventas, lineas } = loQueSeGuarda(
      [venta('v1'), linea('v1', 'Bravecto')],
      new Set(['v1']),
    )

    expect(ventas).toEqual([])
    expect(lineas).toEqual([])
  })

  /*
    Un mostrador también manda presupuestos y remitos para que suban.
    Tienen que viajar, pero no tienen que aparecerle al cajero como algo
    para cobrar.
  */
  it('no le pone en la cola al cajero lo que no viene a cobrarse', () => {
    const { ventas, paraLaCola } = loQueSeGuarda([venta('v9', 'borrador')], new Set())

    expect(ventas).toEqual([])
    expect(paraLaCola).toHaveLength(1)
  })

  /*
    Y lo que sí tiene que pasar siempre: todo lo que llegó va a la cola
    de subida, incluso lo que no se muestra y lo que ya se cobró. Si la
    máquina del mostrador no vuelve a encenderse, esa venta tiene que
    poder subir igual desde la caja.
  */
  it('manda a subir todo lo que llegó, se muestre o no', () => {
    const { paraLaCola } = loQueSeGuarda(
      [venta('v1'), linea('v1', 'Bravecto'), venta('v2')],
      new Set(['v1']),
    )

    expect(paraLaCola).toHaveLength(3)
  })
})

describe('qué le falta entregar al mostrador', () => {
  it('lo que todavía no llegó al servidor ni se le pasó a la caja', () => {
    const falta = loQueFaltaEntregar([
      operacion({ id: 'a' }),
      operacion({ id: 'b', estado: 'error' }),
      operacion({ id: 'c', entregado_en: '2026-09-10T12:05:00.000Z' }),
      operacion({ id: 'd', estado: 'enviando' }),
    ])

    expect(falta.map((o) => o.id)).toEqual(['a', 'b'])
  })

  /*
    Entregarla no la saca de la cola: la caja la va a subir, pero si esa
    máquina se apaga antes de conseguir internet, ésta también tiene que
    poder. Las dos suben y la segunda choca contra la clave primaria.
  */
  it('no vuelve a mandar lo mismo dos veces', () => {
    const yaEntregada = operacion({ id: 'a', entregado_en: '2026-09-10T12:05:00.000Z' })

    expect(loQueFaltaEntregar([yaEntregada])).toEqual([])
  })
})
