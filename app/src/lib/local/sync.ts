import { supabase } from '@/lib/supabase'
import { db, normalizar } from '@/lib/local/db'
import type { ClienteLocal, OperacionAbierta, OperacionPendiente, VentaLocal } from '@/lib/local/db'
import {
  BaseLocalBloqueada,
  cifrarObjeto,
  descifrarObjeto,
  sellarCliente,
  sellarVenta,
} from '@/lib/local/cifrado'

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
  /** Adapta la fila del servidor a la forma local. Puede cifrar, por eso es asíncrona. */
  mapear?: (fila: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>
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
      'id, codigo, nombre, numero_documento, tipo_documento_id, calle, numero, localidad, condicion_iva_id, iibb_percepcion_excluido, descuento_porcentaje, lista_precio_id, cuenta_corriente, limite_credito, dias_vencimiento, activo, actualizado_en, eliminado_en',
    /*
      La búsqueda se arma con el nombre en claro y después se cifra junto
      con él: es una copia del nombre, y dejarla legible sería dejar el
      nombre legible con otro nombre de campo.

      El domicilio se arma acá de la misma manera que lo arma el
      servidor al emitir —calle, número y localidad, y nulo si no hay
      nada—, para que la factura que sale sin internet diga exactamente
      lo mismo que la que sale con internet.
    */
    mapear: (f) => {
      /*
        Las tres partes de la dirección se descartan después de juntarlas.

        Si se guardaran tal como vienen quedarían en claro en el disco de
        la terminal, al lado del domicilio cifrado: el mismo dato
        personal, dos veces, una de ellas legible. Es exactamente el
        error que ya apareció el 14/09 con el nombre para llamar.
      */
      const { calle, numero, localidad, ...resto } = f
      return sellarCliente({
        ...resto,
        domicilio:
          [calle, numero, localidad]
            .map((p) => String(p ?? '').trim())
            .filter(Boolean)
            .join(' ') || null,
        busqueda: normalizar(`${f.nombre ?? ''} ${f.numero_documento ?? ''} ${f.codigo ?? ''}`),
      } as unknown as ClienteLocal) as unknown as Promise<Record<string, unknown>>
    },
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
  {
    tabla: 'punto_venta',
    origen: 'punto_venta',
    columnas:
      'id, numero, nombre, es_respaldo, regimen_caea, activo, actualizado_en, eliminado_en',
  },
  /*
    El CAEA de la quincena, antes del corte.

    Se baja como cualquier otra tabla porque es lo que permite facturar
    sin internet: el código tiene que estar en la máquina ANTES de que
    se caiga la conexión. Bajarlo durante el corte no se puede, y
    pedírselo a ARCA tampoco.
  */
  {
    tabla: 'caea',
    origen: 'caea',
    columnas:
      'id, codigo, periodo, quincena, fecha_desde, fecha_hasta, fecha_tope_informar, estado, ambiente, actualizado_en',
  },
  {
    tabla: 'saldo_cuenta_corriente',
    origen: 'cuenta_corriente_saldo',
    columnas: 'cliente_id, saldo, actualizado_en',
  },
  /*
    Hasta dónde llegó la numeración de cada serie.

    Es el piso desde el que numera la terminal cuando emite sin
    conexión. Sin esto empezaría de cero y pisaría comprobantes que ya
    existen — y un comprobante emitido con CAEA ya se entregó impreso,
    así que no se puede renumerar después.
  */
  {
    tabla: 'secuencia',
    origen: 'secuencia_comprobante',
    columnas: 'punto_venta_id, tipo_comprobante_id, ultimo_numero, actualizado_en',
    mapear: (f) => ({ ...f, clave: `${f.punto_venta_id}-${f.tipo_comprobante_id}` }),
  },
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

    // Se adapta —y se cifra— antes de escribir: esperar el cifrado con la
    // escritura ya empezada es lo que cierra las transacciones de IndexedDB.
    const listas = await Promise.all(filas.map((f) => (def.mapear ? def.mapear(f) : f)))
    await db.table(def.tabla).bulkPut(listas)

    cursor = String(filas[filas.length - 1].actualizado_en)
    total += filas.length
    if (filas.length < LOTE) break
  }

  if (total) await guardarCursor(def.tabla, cursor)
  return total
}

/*
  Los catálogos fiscales de ARCA.

  Son los códigos con los que se arma un comprobante: las alícuotas de
  IVA, qué clase de factura le corresponde a cada condición frente al
  IVA, los tipos de comprobante y los tipos de documento. Sin esto, la
  terminal no puede armar una factura sin internet.

  Se bajan ENTEROS y no por cursor: no tienen fecha de actualización
  —son códigos de ARCA, no datos nuestros— y entre las cuatro no llegan
  a treinta filas. Pedirlas cada vez cuesta menos que llevarles la
  cuenta de qué cambió.
*/
const CATALOGOS_FISCALES = [
  { tabla: 'alicuota_iva', columnas: 'id, descripcion, porcentaje, activo' },
  { tabla: 'condicion_iva', origen: 'condicion_iva_receptor', columnas: 'id, descripcion, tipo_comprobante, activo' },
  { tabla: 'tipo_comprobante', columnas: 'id, descripcion, clase, familia, activo' },
  { tabla: 'tipo_documento', columnas: 'id, descripcion, sigla, activo' },
] as const

async function bajarCatalogosFiscales() {
  let total = 0
  for (const c of CATALOGOS_FISCALES) {
    const origen = 'origen' in c ? c.origen : c.tabla
    // El cliente de Supabase no puede deducir el tipo de una lista de
    // columnas que se arma acá arriba: se le dice que es texto y listo.
    const { data, error } = await supabase.from(origen).select(c.columnas as string)
    if (error) throw new Error(`${origen}: ${error.message}`)

    const filas = (data ?? []) as unknown as Record<string, unknown>[]
    if (!filas.length) continue

    await db.table(c.tabla).bulkPut(filas)
    total += filas.length
  }
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

/*
  ─────────────────────────────────────────────────────────────
  La cola de la caja

  No usa cursor como los maestros, y es a propósito. La cola es chica
  —lo que espera cobro en un momento dado— y lo que importa no es qué
  cambió sino qué sigue esperando. Se trae la lista completa y se
  reemplaza la local.

  Lo delicado es no resucitar una venta ya cobrada. Si la caja cobró sin
  conexión, la venta quedó marcada 'cobrada' localmente pero el servidor
  todavía la ve 'en_caja' hasta que suba la operación. Traerla de vuelta
  la pondría otra vez en la pantalla del cajero, con la plata ya
  cobrada. Por eso las cobradas localmente se respetan y sólo se borran
  cuando su lote terminó de subir.
  ─────────────────────────────────────────────────────────────
*/
/*
  Decide qué hacer con cada venta de la cola.

  Está separada del acceso a la base a propósito: es la regla que evita
  que una venta ya cobrada vuelva a aparecerle al cajero, y esa regla se
  puede equivocar de formas silenciosas y caras. Aparte, se puede probar
  sin servidor ni IndexedDB de por medio.

  Las tres situaciones:
    · Está en el servidor y no la cobramos → se guarda, es la cola real.
    · La cobramos acá y todavía no subió → se respeta, no se toca.
      Traerla de vuelta la pondría otra vez en pantalla con la plata ya
      cobrada, y el cajero la cobraría dos veces.
    · Ya no está en el servidor, o ya subió lo nuestro → se borra.
*/
export function conciliarCola(
  enServidor: { id: string }[],
  locales: { id: string; estado: string }[],
  lotesPendientes: Set<string>,
): { idsAGuardar: Set<string>; aBorrar: string[] } {
  const idsServidor = new Set(enServidor.map((v) => v.id))
  const cobradasAcá = new Set(locales.filter((v) => v.estado === 'cobrada').map((v) => v.id))

  const idsAGuardar = new Set(enServidor.filter((v) => !cobradasAcá.has(v.id)).map((v) => v.id))

  const aBorrar = locales
    .filter((v) => {
      // Cobrada acá: sólo se va cuando su lote terminó de subir.
      if (cobradasAcá.has(v.id)) return !lotesPendientes.has(v.id)
      // El resto: se va si el servidor ya no la tiene en cola.
      return !idsServidor.has(v.id)
    })
    .map((v) => v.id)

  return { idsAGuardar, aBorrar }
}

async function bajarColaCaja() {
  const { data, error } = await supabase
    .from('venta')
    .select(
      'id, codigo, estado, cliente_id, vendedor_id, total, descuento_total, lista_precio_id, recargo_porcentaje, ' +
        'medio_pago_previsto_id, cuotas_previstas, observaciones, ocurrido_en, enviada_caja_en, actualizado_en',
    )
    .eq('estado', 'en_caja')
    .order('enviada_caja_en')
    .limit(200)

  if (error) throw new Error(`cola de caja: ${error.message}`)
  const enServidor = (data ?? []) as unknown as VentaLocal[]

  const locales = await db.venta.toArray()
  const lotesPendientes = new Set(
    (await db.outbox.toArray()).map((o) => o.lote),
  )

  const { idsAGuardar, aBorrar } = conciliarCola(enServidor, locales, lotesPendientes)

  const aGuardar = enServidor.filter((v) => idsAGuardar.has(v.id))
  if (aGuardar.length) {
    await db.venta.bulkPut(await Promise.all(aGuardar.map(sellarVenta)))
  }

  if (aBorrar.length) {
    await db.venta.bulkDelete(aBorrar)
    await db.venta_linea.where('venta_id').anyOf(aBorrar).delete()
  }

  // Las líneas de lo que quedó en cola. Se piden sólo para las ventas
  // que todavía no las tienen: no cambian una vez enviada la venta,
  // salvo por el precio, que se recalcula al aplicar la lista.
  const vigentes = aGuardar.map((v) => v.id)
  if (vigentes.length) {
    const { data: lineas, error: errorLineas } = await supabase
      .from('venta_linea')
      .select(
        'id, venta_id, orden, producto_id, codigo_producto, descripcion, cantidad, ' +
          'precio_original, precio_acordado, precio_unitario, motivo_modificacion, ' +
          'alicuota_iva_id, condicion_iva, actualizado_en',
      )
      .in('venta_id', vigentes)

    if (errorLineas) throw new Error(`líneas de la cola: ${errorLineas.message}`)
    if (lineas?.length) {
      await db.venta_linea.bulkPut(lineas as unknown as import('@/lib/local/db').VentaLineaLocal[])
    }
  }

  return enServidor.length
}

/*
  Cuando una tabla empieza a bajar columnas nuevas, hay que volver a
  bajarla entera.

  El cursor guarda hasta qué fecha se bajó, no qué columnas. Una
  terminal que ya sincronizó los clientes no los vuelve a pedir nunca
  —salvo los que cambien—, así que los campos nuevos quedarían vacíos
  para siempre en las filas viejas. Y se notaría tarde y feo: una
  factura emitida sin internet, sin domicilio ni tipo de documento del
  cliente, ya entregada.

  Por eso cada cambio de columnas sube este número y borra el cursor de
  las tablas afectadas, que es una bajada completa más y nada más.

  2 — 18/09: el cliente suma tipo de documento, domicilio y la
      exclusión de percepción, para poder facturar sin conexión.
*/
const VERSION_BAJADA = 2
const TABLAS_DE_LA_VERSION_2 = ['cliente']

async function rebajarLoQueCambio() {
  const marca = await db.cursor.get('version_bajada')
  const guardada = Number(marca?.cursor ?? 1)
  if (guardada >= VERSION_BAJADA) return

  if (guardada < 2) await db.cursor.bulkDelete(TABLAS_DE_LA_VERSION_2)

  await db.cursor.put({
    tabla: 'version_bajada',
    cursor: String(VERSION_BAJADA),
    sincronizado_en: new Date().toISOString(),
  })
}

export async function bajarCambios() {
  let total = 0
  await rebajarLoQueCambio()
  for (const def of MAESTROS) total += await bajarTabla(def)
  total += await bajarReferencias()
  total += await bajarCatalogosFiscales()
  total += await bajarColaCaja()
  return total
}

/*
  ─────────────────────────────────────────────────────────────
  Subida
  ─────────────────────────────────────────────────────────────
*/

export async function encolar(
  lote: string,
  operaciones: Omit<OperacionAbierta, 'id' | 'lote' | 'orden' | 'creado_en' | 'intentos' | 'ultimo_error' | 'estado'>[],
) {
  const ahora = new Date().toISOString()

  // Cifrado primero, y recién después se toca la base.
  const selladas = await Promise.all(
    operaciones.map(async (op) => ({ ...op, datos: await cifrarObjeto(op.datos) })),
  )

  /*
    El orden sigue donde quedó el lote, no vuelve a cero.

    Un lote puede llenarse en varias tandas: la caja corrige la venta, y
    después la cobra. Si cada llamada empezara a numerar de cero, las dos
    tandas tendrían un `orden` 0 y el orden de subida dependería de que
    `sort` sea estable y de que la consulta viniera ordenada por fecha.
    Funciona hoy, pero por dos casualidades encadenadas.

    Y el orden acá no es un detalle: subir el cobro antes que la
    corrección haría que el servidor cobre la venta vieja.
  */
  const previas = await db.outbox.where('lote').equals(lote).toArray()
  const desde = previas.length ? Math.max(...previas.map((o) => o.orden)) + 1 : 0

  await db.outbox.bulkAdd(
    selladas.map((op, i) => ({
      ...op,
      id: crypto.randomUUID(),
      lote,
      orden: desde + i,
      creado_en: ahora,
      intentos: 0,
      ultimo_error: null,
      estado: 'pendiente' as const,
    })),
  )
}

async function enviarOperacion(op: OperacionPendiente) {
  const datos = await descifrarObjeto(op.datos)

  if (op.tipo === 'rpc') {
    const { error } = await supabase.rpc(op.tabla, datos)
    if (error) throw new Error(error.message)

    /*
      Una factura emitida durante un corte deja de estar "esperando
      subir" recién cuando el servidor la acepta. Se anota en la copia
      local para que la pantalla lo muestre sin tener que adivinarlo
      mirando la cola, que viaja cifrada.
    */
    if (op.tabla === 'registrar_comprobante_caea') {
      const id = (datos as { p_datos?: { id?: string } }).p_datos?.id
      if (id) {
        const guardado = await db.comprobante.get(id)
        if (guardado) await db.comprobante.put({ ...guardado, subido_en: new Date().toISOString() })
      }
    }
    return
  }

  const { error } = await supabase.from(op.tabla).insert(datos)
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
        /*
          Sin llave no se puede leer ninguna: marcar cada venta como
          fallida sumaría intentos y mensajes que no dicen qué pasa. Se
          devuelve como estaba y se para la subida entera, para que la
          pantalla muestre el problema de verdad.
        */
        if (e instanceof BaseLocalBloqueada) {
          await db.outbox.update(op.id, { estado: op.estado })
          throw e
        }
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

/*
  Rescata operaciones huérfanas.

  Si la página se recarga —o se corta la luz— mientras una operación
  estaba en vuelo, queda marcada "enviando" y nadie la vuelve a mirar:
  el reintento sólo busca pendientes y con error. Quedaría una venta
  guardada que jamás sube, sin aparecer en ningún contador.

  Reenviar es seguro: el id lo generó la terminal, así que si el
  servidor ya la tenía responde con clave duplicada y se descarta.
*/
export async function recuperarHuerfanas() {
  const huerfanas = await db.outbox.where('estado').equals('enviando').toArray()
  if (!huerfanas.length) return 0
  await db.outbox.bulkPut(huerfanas.map((o) => ({ ...o, estado: 'pendiente' as const })))
  return huerfanas.length
}

export async function pendientes() {
  return db.outbox.where('estado').anyOf('pendiente', 'error', 'enviando').count()
}

export async function listarPendientes() {
  return db.outbox.orderBy('creado_en').toArray()
}

export async function conError() {
  return db.outbox.where('estado').equals('error').toArray()
}

export async function descartarOperacion(id: string) {
  await db.outbox.delete(id)
}

/*
  Alinea el contador de numeración con el servidor.

  Una terminal recién configurada arrancaría en uno y chocaría con toda
  la numeración anterior. Se consulta el mayor número ya emitido con ese
  prefijo y se sube el contador local si hace falta.
*/
async function alinearNumeracion(prefijo: string) {
  const { alinearContador } = await import('@/lib/local/consultas')
  const { data } = await supabase
    .from('venta')
    .select('codigo')
    .like('codigo', `${prefijo}-%`)
    .order('codigo', { ascending: false })
    .limit(1)

  const ultimo = data?.[0]?.codigo
  if (!ultimo) return
  await alinearContador(prefijo, Number(String(ultimo).split('-').pop()) || 0)
}

/*
  Y lo mismo para los comprobantes que numera Gross.

  Una terminal reinstalada perdió su contador y volvería a empezar en
  uno. El número ya está impreso en papeles que están en la calle, así
  que no se puede repetir: se le pregunta al servidor cuál es el mayor
  de esa serie y se sube el contador local si hace falta.
*/
async function alinearNumeracionNoFiscal(prefijo: string) {
  const { alinearNumeroNoFiscal } = await import('@/lib/local/consultas')

  for (const tipo of ['presupuesto', 'remito', 'comprobante_interno']) {
    const { data } = await supabase
      .from('comprobante_no_fiscal')
      .select('numero')
      .eq('tipo_clave', tipo)
      .ilike('serie', prefijo)
      .order('numero', { ascending: false })
      .limit(1)

    const ultimo = Number(data?.[0]?.numero ?? 0)
    if (ultimo > 0) await alinearNumeroNoFiscal(tipo, prefijo, ultimo)
  }
}

export async function sincronizar(prefijoTerminal?: string | null) {
  const inicio = performance.now()
  const subida = await subirPendientes()
  const bajados = await bajarCambios()
  if (prefijoTerminal) {
    await alinearNumeracion(prefijoTerminal)
    await alinearNumeracionNoFiscal(prefijoTerminal)
  }
  return {
    ...subida,
    bajados,
    duracion: Math.round(performance.now() - inicio),
  }
}
