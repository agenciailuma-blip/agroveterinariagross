import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/local/db'
import { bajarCambios } from '@/lib/local/sync'
import { huellaDeLaCola } from '@/lib/local/novedades'

/*
  ─────────────────────────────────────────────────────────────
  La cola de la caja cuando sólo se baja lo que cambió (28/11)

  Preguntar, bajar y dar por visto son tres momentos, y entre uno y otro
  la cola se mueve. Una venta cobrada que queda en la pantalla del cajero
  se cobra dos veces.
  ─────────────────────────────────────────────────────────────
*/

type Fila = Record<string, unknown> & { id: string; actualizado_en: string }

const servidor = vi.hoisted(() => ({
  ventas: [] as Fila[],
  /** La huella que contesta que_cambio. */
  huella: '',
  falla: false,
  colasPedidas: 0,
}))

vi.mock('@/lib/supabase', () => {
  // Una consulta que acepta cualquier filtro y contesta según la tabla.
  const consulta = (tabla: string) => {
    let esLaCola = false
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'gt', 'order', 'limit', 'range', 'in', 'like', 'ilike']) q[m] = () => q
    q.eq = (columna: string) => {
      if (tabla === 'venta' && columna === 'estado') esLaCola = true
      return q
    }
    q.maybeSingle = async () => ({ data: null, error: null })
    q.then = (listo: (r: unknown) => unknown) => {
      if (esLaCola) servidor.colasPedidas++
      return Promise.resolve({ data: esLaCola ? servidor.ventas : [], error: null }).then(listo)
    }
    return q
  }
  return {
    supabase: {
      from: consulta,
      rpc: async () =>
        servidor.falla
          ? { data: null, error: { message: 'no existe' } }
          : {
              data: { cambiaron: [], generacion: '0', cola: servidor.huella, venta: null, no_fiscal: {} },
              error: null,
            },
    },
  }
})

const venta = (id: string): Fila => ({
  id,
  estado: 'en_caja',
  total: 100,
  actualizado_en: '2026-11-28T10:00:00+00:00',
})

const enLaPantalla = async () => (await db.venta.toArray()).map((v) => v.id).sort()

beforeEach(async () => {
  await Promise.all([db.venta.clear(), db.venta_linea.clear(), db.outbox.clear(), db.cursor.clear()])
  servidor.ventas = []
  servidor.huella = ''
  servidor.falla = false
  servidor.colasPedidas = 0
})

describe('la cola de la caja', () => {
  it('sin cambios no se vuelve a pedir', async () => {
    servidor.ventas = [venta('a')]
    servidor.huella = huellaDeLaCola(servidor.ventas, [])
    await bajarCambios()
    await bajarCambios()
    expect(servidor.colasPedidas).toBe(1)
  })

  it('una venta que entra y sale entre dos vueltas no queda en la pantalla', async () => {
    // Se preguntó con la cola vacía y para cuando se bajó ya había entrado B.
    servidor.huella = ''
    servidor.ventas = [venta('b')]
    await bajarCambios()
    expect(await enLaPantalla()).toEqual(['b'])

    // B se cobró en otra caja: la huella vuelve a ser la de la cola vacía.
    servidor.ventas = []
    await bajarCambios()
    expect(await enLaPantalla()).toEqual([])
  })

  it('una venta llegada por la red del local mientras se bajaba no se da por vista', async () => {
    servidor.huella = ''
    await bajarCambios()
    await db.venta.put(venta('red') as never)
    await bajarCambios()
    expect(await enLaPantalla()).toEqual([])
  })

  it('si la pregunta falla, se baja la cola igual', async () => {
    servidor.falla = true
    servidor.ventas = [venta('a')]
    await bajarCambios()
    await bajarCambios()
    expect(servidor.colasPedidas).toBe(2)
    expect(await enLaPantalla()).toEqual(['a'])
  })
})
