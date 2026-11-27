import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/local/db'
import { encolar, subirPendientes } from '@/lib/local/sync'
import { loQueFaltaEntregar } from '@/lib/local/red'

/*
  ─────────────────────────────────────────────────────────────
  La subida de la cola

  El 26/11 un mostrador mandó el mismo cobro dos veces a la vez: una
  entró, la otra volvió «ya está cobrada» y una copia quedó trabada en la
  caja. Estas pruebas cuidan que cada operación salga una sola vez.
  ─────────────────────────────────────────────────────────────
*/

const servidor = vi.hoisted(() => ({
  pedidos: [] as string[],
  /** Qué hace el servidor mientras atiende un pedido. */
  mientras: null as null | ((pedido: string) => Promise<void>),
  /** Los pedidos que el servidor rechaza, con su mensaje. */
  rechaza: {} as Record<string, string>,
  /** Las filas que el servidor ya tiene, por «tabla:id». */
  tiene: {} as Record<string, Record<string, unknown>>,
}))

vi.mock('@/lib/supabase', () => {
  const atender = async (pedido: string) => {
    servidor.pedidos.push(pedido)
    await new Promise((r) => setTimeout(r, 5))
    await servidor.mientras?.(pedido)
    const message = servidor.rechaza[pedido]
    return { error: message ? { code: 'P0001', message } : null }
  }
  return {
    supabase: {
      rpc: (nombre: string) => atender(nombre),
      from: (tabla: string) => ({
        insert: () => atender(tabla),
        select: () => ({
          eq: (_col: string, id: string) => ({
            maybeSingle: async () => ({ data: servidor.tiene[`${tabla}:${id}`] ?? null }),
          }),
        }),
      }),
    },
  }
})

const cobro = (venta: string) =>
  encolar(venta, [
    { tipo: 'insert', tabla: 'venta_pago', datos: { id: `${venta}-pago` }, descripcion: 'pago 1' },
    { tipo: 'rpc', tabla: 'cobrar_venta', datos: { p_venta_id: venta }, descripcion: 'cobro' },
  ])

beforeEach(async () => {
  await db.outbox.clear()
  servidor.pedidos = []
  servidor.mientras = null
  servidor.rechaza = {}
  servidor.tiene = {}
})

const CERRADA = 'La venta ya esta cobrada y no admite cambios.'
const cobrada = { 'venta:v-1': { estado: 'cobrada' } }

const lista = (id: string) => ({
  tipo: 'rpc' as const, tabla: 'aplicar_lista_a_venta',
  datos: { p_venta_id: 'v-1', p_lista_id: id }, descripcion: 'lista de precios',
})
const correccion = {
  tipo: 'rpc' as const, tabla: 'editar_venta_en_caja',
  datos: { p_venta_id: 'v-1' }, descripcion: 'corrección en la caja',
}

describe('lo que llega repetido a una venta ya cobrada', () => {
  it('un pago que ya estaba sale de la cola y sigue con el cobro', async () => {
    servidor.rechaza = { venta_pago: CERRADA }
    servidor.tiene = { 'venta_pago:v-1-pago': { id: 'v-1-pago' } }
    await cobro('v-1')

    await subirPendientes()

    expect(servidor.pedidos).toEqual(['venta_pago', 'cobrar_venta'])
    expect(await db.outbox.count()).toBe(0)
  })

  it('un pago que no estaba —otro cobro— queda a la vista', async () => {
    servidor.rechaza = { venta_pago: CERRADA }
    servidor.tiene = { ...cobrada, 'venta_pago:otro-pago': { id: 'otro-pago' } }
    await cobro('v-1')

    await subirPendientes()

    expect(servidor.pedidos).toEqual(['venta_pago'])
    const trabada = await db.outbox.where('estado').equals('error').toArray()
    expect(trabada.map((o) => o.ultimo_error)).toEqual([CERRADA])
    expect(await db.outbox.count()).toBe(2)
  })

  it('los renglones y las dos listas de una venta cobrada salen de la cola', async () => {
    servidor.rechaza = { venta_linea: CERRADA, aplicar_lista_a_venta: CERRADA }
    servidor.tiene = cobrada
    await encolar('v-1', [
      { tipo: 'insert', tabla: 'venta_linea', datos: { id: 'l-1', venta_id: 'v-1' }, descripcion: 'renglón' },
      lista('lp-1'),
      lista('lp-2'),
    ])

    await subirPendientes()

    expect(await db.outbox.count()).toBe(0)
  })

  it('si la venta no está cobrada, el rechazo queda a la vista', async () => {
    servidor.rechaza = { aplicar_lista_a_venta: 'La venta esta anulada y ya no admite cambios de precio.' }
    servidor.tiene = { 'venta:v-1': { estado: 'anulada' } }
    await encolar('v-1', [lista('lp-1')])

    await subirPendientes()

    expect(await db.outbox.count()).toBe(1)
  })

  it('una corrección con su cobro detrás sale de la cola', async () => {
    servidor.rechaza = { editar_venta_en_caja: CERRADA }
    servidor.tiene = { ...cobrada, 'venta_pago:v-1-pago': { id: 'v-1-pago' } }
    await encolar('v-1', [correccion])
    await cobro('v-1')

    await subirPendientes()

    expect(await db.outbox.count()).toBe(0)
  })

  it('una corrección sin cobro detrás queda a la vista', async () => {
    servidor.rechaza = { editar_venta_en_caja: CERRADA }
    servidor.tiene = cobrada
    await encolar('v-1', [correccion])

    await subirPendientes()

    expect(await db.outbox.count()).toBe(1)
  })
})

describe('una sola subida a la vez', () => {
  it('pedida dos veces juntas, manda cada operación una sola vez', async () => {
    await cobro('v-1')

    await Promise.all([subirPendientes(), subirPendientes(), subirPendientes()])

    expect(servidor.pedidos).toEqual(['venta_pago', 'cobrar_venta'])
    expect(await db.outbox.count()).toBe(0)
  })

  it('lo encolado mientras subía sale antes de que termine quien lo pidió', async () => {
    await cobro('v-1')
    const primera = subirPendientes()
    let segunda: Promise<unknown> | null = null
    servidor.mientras = async (pedido) => {
      if (pedido !== 'cobrar_venta' || segunda) return
      await encolar('v-2', [{ tipo: 'rpc', tabla: 'mandar_venta_a_caja', datos: {}, descripcion: 'a la caja' }])
      segunda = subirPendientes()
    }

    await primera
    await segunda

    expect(servidor.pedidos).toEqual(['venta_pago', 'cobrar_venta', 'mandar_venta_a_caja'])
    expect(await db.outbox.count()).toBe(0)
  })

  it('terminada una, la siguiente vuelve a arrancar', async () => {
    await cobro('v-1')
    await subirPendientes()
    await cobro('v-2')
    await subirPendientes()

    expect(servidor.pedidos).toHaveLength(4)
  })
})

describe('la entrega a la caja mientras sube', () => {
  it('en ningún momento se lleva el resto de una venta que está subiendo', async () => {
    await cobro('v-1')
    const entregables: number[] = []
    let mirando = true
    const mirar = (async () => {
      while (mirando) {
        const cola = await db.outbox.toArray()
        if (cola.some((o) => o.estado === 'enviando') || servidor.pedidos.length) {
          entregables.push(loQueFaltaEntregar(cola).length)
        }
      }
    })()

    await subirPendientes()
    mirando = false
    await mirar

    expect(entregables.length).toBeGreaterThan(0)
    expect(Math.max(...entregables)).toBe(0)
  })
})
