import { describe, expect, it } from 'vitest'
import { conciliarCola, queHacerConLaGeneracion, TABLAS_DEL_SERVIDOR } from '@/lib/local/sync'
import { db } from '@/lib/local/db'

/*
  ─────────────────────────────────────────────────────────────
  Conciliación de la cola de la caja

  Decide, cada vez que vuelve la conexión, qué ventas siguen esperando
  cobro en esta terminal.

  El caso que justifica estas pruebas: la caja cobró sin conexión, la
  operación todavía no subió, y para el servidor esa venta sigue "en
  caja". Si se la trae de vuelta sin más, le reaparece al cajero en
  pantalla con la plata ya cobrada — y la cobra de nuevo.
  ─────────────────────────────────────────────────────────────
*/

const enCaja = (id: string) => ({ id, estado: 'en_caja' })
const cobrada = (id: string) => ({ id, estado: 'cobrada' })

describe('qué se trae del servidor', () => {
  it('trae las ventas que de verdad esperan cobro', () => {
    const r = conciliarCola([{ id: 'v1' }, { id: 'v2' }], [], new Set())
    expect([...r.idsAGuardar]).toEqual(['v1', 'v2'])
    expect(r.aBorrar).toEqual([])
  })

  it('actualiza una venta que ya tenía en cola', () => {
    const r = conciliarCola([{ id: 'v1' }], [enCaja('v1')], new Set())
    expect(r.idsAGuardar.has('v1')).toBe(true)
    expect(r.aBorrar).toEqual([])
  })
})

describe('protección contra el doble cobro', () => {
  it('NO trae de vuelta una venta cobrada acá que todavía no subió', () => {
    const r = conciliarCola([{ id: 'v1' }], [cobrada('v1')], new Set(['v1']))
    expect(r.idsAGuardar.has('v1')).toBe(false)
    expect(r.aBorrar).not.toContain('v1')
  })

  it('recién la limpia cuando su lote terminó de subir', () => {
    const r = conciliarCola([], [cobrada('v1')], new Set())
    expect(r.aBorrar).toContain('v1')
  })

  /*
    El servidor ya la procesó (no está más en cola) pero quedan
    operaciones del lote sin confirmar. Se espera: borrarla ahora dejaría
    la terminal sin rastro de algo que todavía puede fallar al subir.
  */
  it('no la limpia mientras queden operaciones del lote sin subir', () => {
    const r = conciliarCola([], [cobrada('v1')], new Set(['v1']))
    expect(r.aBorrar).not.toContain('v1')
  })

  it('el cobro de una venta no afecta a las demás', () => {
    const r = conciliarCola(
      [{ id: 'v1' }, { id: 'v2' }],
      [cobrada('v1'), enCaja('v2')],
      new Set(['v1']),
    )
    expect(r.idsAGuardar.has('v1')).toBe(false)
    expect(r.idsAGuardar.has('v2')).toBe(true)
    expect(r.aBorrar).toEqual([])
  })
})

describe('limpieza de lo que ya no espera cobro', () => {
  it('saca lo que el servidor ya no tiene en cola', () => {
    // La cobró otra caja, o alguien la anuló.
    const r = conciliarCola([], [enCaja('v1')], new Set())
    expect(r.aBorrar).toEqual(['v1'])
  })

  it('con la cola vacía en el servidor, se vacía la local', () => {
    const r = conciliarCola([], [enCaja('v1'), enCaja('v2')], new Set())
    expect(r.aBorrar).toEqual(['v1', 'v2'])
    expect(r.idsAGuardar.size).toBe(0)
  })
})

/*
  El día que se limpian los datos de prueba, el servidor cambia la
  generación y cada PC vacía su copia y la baja de nuevo. Nunca con algo
  por subir: lo hecho sin conexión manda.
*/
describe('empezar de nuevo cuando el servidor lo pide', () => {
  it('con la misma generación no hace nada', () => {
    expect(queHacerConLaGeneracion('1', '1', 0)).toBe('nada')
  })

  it('con otra generación y nada por subir, vacía y baja de nuevo', () => {
    expect(queHacerConLaGeneracion('1', '0', 0)).toBe('empezar_de_nuevo')
  })

  it('con algo por subir, espera', () => {
    expect(queHacerConLaGeneracion('1', '0', 3)).toBe('esperar')
  })

  it('vacía sólo tablas que existen, y nunca la cola de subida ni la seguridad', () => {
    const existentes = new Set(db.tables.map((t) => t.name))
    for (const t of TABLAS_DEL_SERVIDOR) expect(existentes.has(t)).toBe(true)
    for (const nunca of ['outbox', 'seguridad', 'contador', 'cursor']) {
      expect(TABLAS_DEL_SERVIDOR as readonly string[]).not.toContain(nunca)
    }
  })
})
