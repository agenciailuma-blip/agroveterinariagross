import { supabase } from '@/lib/supabase'
import { db, normalizar } from '@/lib/local/db'
import type { OperacionPendiente } from '@/lib/local/db'

/*
  ─────────────────────────────────────────────────────────────
  Motor de sincronización

  Dos direcciones, con reglas distintas porque los datos son distintos:

  BAJADA — datos maestros. Manda el servidor. Se piden las filas
  cambiadas desde el último cursor y se pisan las locales. No hay
  conflicto posible: la terminal no los edita.

  SUBIDA — hechos. Manda la terminal, porque es donde ocurrieron. Se
  envían en el orden en que se crearon y con el id que ya traen, así un
  reenvío choca contra la clave primaria en vez de duplicar.

  El cursor sólo avanza cuando la tanda entra completa. Si falla a la
  mitad, el próximo intento vuelve a traer lo mismo: repetir es barato,
  perder un cambio no.
  ─────────────────────────────────────────────────────────────
*/

const LOTE = 500

interface Definicion {
  tabla: string
  origen: string
  columnas: string
  clave?: string
  /** Adapta la fila del servidor a la forma local. */
  mapear?: (fila: Record<string, unknown>) => Record<string, unknown>
}

const MAESTROS: Definicion[] = [
  {
    tabla: 'producto',
    origen: 'producto',
    columnas:
      'id, codigo, nombre_interno, nombre_publico, precio_venta, costo, margen_sobre_costo, unidad_medida, alicuota_iva_id, condicion_iva, categoria_id, marca_id, activo, revisado_en, actualizado_en, eliminado_en',
    mapear: (f) => ({
      ...f,
      busqueda: normalizar(`${f.codigo ?? ''} ${f.nombre_interno ?? ''} ${f.nombre_publico ?? ''}`),
    }),
  },
  {
    tabla: 'codigo_barra',
    origen: 'producto_codigo_barra',
    columnas: 'id, producto_id, codigo, eliminado_en, actualizado_en',
  },
  { tabla: 'saldo', origen: 'stock_saldo', columnas: 'producto_id, cantidad, actualizado_en' },
  {
    tabla: 'umbral',
    origen: 'umbral_stock',
    columnas: 'id, ambito, producto_id, categoria_id, bajo, critico, actualizado_en',
  },
  {
    tabla: 'cliente',
    origen: 'cliente',
    columnas:
      'id, codigo, nombre, numero_documento, condicion_iva_id, descuento_porcentaje, lista_precio_id, cuenta_corriente, limite_credito, dias_vencimiento, activo, actualizado_en, eliminado_en',
    mapear: (f) => ({
      ...f,
      busqueda: normalizar(`${f.nombre ?? ''} ${f.numero_documento ?? ''} ${f.codigo ?? ''}`),
    }),
  },
  {
    tabla: 'lista_precio',
    origen: 'lista_precio',
    columnas: 'id, nombre, ajuste_porcentaje, es_predeterminada, activo, actualizado_en, eliminado_en',
  },
  {
    tabla: 'medio_pago',
    origen: 'medio_pago',
    columnas:
      'id, nombre, tipo, lista_precio_id, admite_cuotas, cuotas_maximas, afecta_caja, orden, activo, actualizado_en, eliminado_en',
  },
  {
    tabla: 'cuota',
    origen: 'medio_pago_cuota',
    columnas: 'medio_pago_id, cuotas, recargo_porcentaje, activo, actualizado_en',
    mapear: (f) => ({ ...f, clave: `${f.medio_pago_id}-${f.cuotas}` }),
  },
  { tabla: 'configuracion', origen: 'configuracion', columnas: 'clave, valor, actualizado_en' },
]

/*
  Las clasificaciones viven en cinco tablas iguales. Se guardan en una
  sola local con un campo tipo: son pocas filas y así el motor no
  necesita cinco definiciones que sólo cambian de nombre.
*/
const REFERENCIAS = ['categoria', 'marca', 'presentacion', 'animal', 'etapa_vida']

const INICIO = '1970-01-01T00:00:00Z'

async function leerCursor(tabla: string) {
  const c = await db.cursor.get(tabla)
  return c?.cursor ?? INICIO
}

async function guardarCursor(tabla: string, cursor: string) {
  await db.cursor.put({ tabla, cursor, sincronizado_en: new Date().toISOString() })
}

async function bajarTabla(def: Definicion) {
  const desde = await leerCursor(def.tabla)
  let cursor = desde
  let total = 0

  // Se pagina por cursor y no por offset: si algo cambia mientras se
  // baja, offset saltea filas y el cursor no.
  for (;;) {
    const { data, error } = await supabase
      .from(def.origen)
      .select(def.columnas)
      .gt('actualizado_en', cursor)
      .order('actualizado_en')
      .limit(LOTE)

    if (error) throw new Error(`${def.origen}: ${error.message}`)
    const filas = (data ?? []) as unknown as Record<string, unknown>[]
    if (!filas.length) break

    const tabla = db.table(def.tabla)
    await tabla.bulkPut(filas.map((f) => (def.mapear ? def.mapear(f) : f)))

    cursor = String(filas[filas.length - 1].actualizado_en)
    total += filas.length
    if (filas.length < LOTE) break
  }

  if (total) await guardarCursor(def.tabla, cursor)
  return total
}

async function bajarReferencias() {
  let total = 0
  for (const tipo of REFERENCIAS) {
    const clave = `referencia:${tipo}`
    const desde = await leerCursor(clave)
    const { data, error } = await supabase
      .from(tipo)
      .select('id, nombre, actualizado_en, eliminado_en')
      .gt('actualizado_en', desde)
      .order('actualizado_en')
      .limit(LOTE)

    if (error) throw new Error(`${tipo}: ${error.message}`)
    const filas = (data ?? []) as Record<string, unknown>[]
    if (!filas.length) continue

    await db.referencia.bulkPut(filas.map((f) => ({ ...f, tipo })) as never)
    await guardarCursor(clave, String(filas[filas.length - 1].actualizado_en))
    total += filas.length
  }
  return total
}

export async function bajarCambios() {
  let total = 0
  for (const def of MAESTROS) total += await bajarTabla(def)
  total += await bajarReferencias()
  return total
}

/*
  ─────────────────────────────────────────────────────────────
  Subida
  ─────────────────────────────────────────────────────────────
*/

export async function encolar(
  lote: string,
  operaciones: Omit<OperacionPendiente, 'id' | 'lote' | 'orden' | 'creado_en' | 'intentos' | 'ultimo_error' | 'estado'>[],
) {
  const ahora = new Date().toISOString()
  await db.outbox.bulkAdd(
    operaciones.map((op, i) => ({
      ...op,
      id: crypto.randomUUID(),
      lote,
      orden: i,
      creado_en: ahora,
      intentos: 0,
      ultimo_error: null,
      estado: 'pendiente' as const,
    })),
  )
}

async function enviarOperacion(op: OperacionPendiente) {
  if (op.tipo === 'rpc') {
    const { error } = await supabase.rpc(op.tabla, op.datos)
    if (error) throw new Error(error.message)
    return
  }

  const { error } = await supabase.from(op.tabla).insert(op.datos)
  if (!error) return

  // 23505 es clave duplicada: el registro ya había llegado en un intento
  // anterior que no alcanzamos a confirmar. Es exactamente el caso que
  // los id generados en la terminal vienen a resolver.
  if (error.code === '23505') return

  throw new Error(error.message)
}

export async function subirPendientes() {
  const pendientes = await db.outbox
    .where('estado')
    .anyOf('pendiente', 'error')
    .sortBy('creado_en')

  if (!pendientes.length) return { enviadas: 0, fallidas: 0 }

  // Se agrupan por lote y se respeta el orden: la cabecera de una venta
  // tiene que entrar antes que sus líneas.
  const lotes = new Map<string, OperacionPendiente[]>()
  for (const op of pendientes) {
    if (!lotes.has(op.lote)) lotes.set(op.lote, [])
    lotes.get(op.lote)!.push(op)
  }

  let enviadas = 0
  let fallidas = 0

  for (const [, operaciones] of lotes) {
    operaciones.sort((a, b) => a.orden - b.orden)
    for (const op of operaciones) {
      try {
        await db.outbox.update(op.id, { estado: 'enviando' })
        await enviarOperacion(op)
        await db.outbox.delete(op.id)
        enviadas++
      } catch (e) {
        await db.outbox.update(op.id, {
          estado: 'error',
          intentos: op.intentos + 1,
          ultimo_error: e instanceof Error ? e.message : String(e),
        })
        fallidas++
        // Si falla una operación del lote, las siguientes dependen de
        // ella. Se corta y se reintenta entero la próxima vez.
        break
      }
    }
  }

  return { enviadas, fallidas }
}

export async function pendientes() {
  return db.outbox.where('estado').anyOf('pendiente', 'error').count()
}

export async function conError() {
  return db.outbox.where('estado').equals('error').toArray()
}

export async function descartarOperacion(id: string) {
  await db.outbox.delete(id)
}

export async function sincronizar() {
  const inicio = performance.now()
  const subida = await subirPendientes()
  const bajados = await bajarCambios()
  return {
    ...subida,
    bajados,
    duracion: Math.round(performance.now() - inicio),
  }
}
