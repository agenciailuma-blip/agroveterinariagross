import { supabase } from '@/lib/supabase'
import type { EstadoStock } from '@/lib/tipos'
import {
  buscarClientesLocal,
  buscarProductosLocal,
  consumidorFinalLocal,
  hayDatosLocales,
  reservarCodigoVenta,
} from '@/lib/local/consultas'
import { encolar, subirPendientes } from '@/lib/local/sync'
import { db } from '@/lib/local/db'
import { sellarVenta } from '@/lib/local/cifrado'
import { aplicarListaLocal } from '@/lib/local/caja'

export interface Operador {
  usuario_id: string
  nombre: string
  rol: string
}

export interface ProductoVenta {
  producto_id: string
  codigo: string
  nombre_interno: string
  precio_venta: number
  unidad_medida: string
  alicuota_iva_id: number
  condicion_iva: 'gravado' | 'exento' | 'no_gravado'
  cantidad: number
  estado: EstadoStock
}

export interface ClienteVenta {
  id: string
  codigo: string | null
  nombre: string
  numero_documento: string | null
  condicion_iva_id: number
  descuento_porcentaje: number
  cuenta_corriente: boolean
  limite_credito: number | null
}

/*
  Unidades que no se pueden partir. Una correa, un frasco o una bolsa se
  venden enteros: el paso de la flecha tiene que ser 1 y no aceptar
  decimales. El alimento suelto o el caño por metro, al revés.
*/
const UNIDADES_ENTERAS = new Set(['unidad', 'bolsa', 'caja'])

export function esFraccionable(unidad: string) {
  return !UNIDADES_ENTERAS.has(unidad)
}

export function pasoCantidad(unidad: string) {
  return esFraccionable(unidad) ? 0.01 : 1
}

export interface LineaVenta {
  /** Id local, generado en el cliente. Sobrevive a la sincronización. */
  id: string
  /*
    Nulo en una LÍNEA LIBRE — el "producto comodín" que pidió Lucas el
    07/09: un renglón escrito para la ocasión, que no existe en el
    catálogo y que no se crea.

    Es lo único que la distingue, acá y en la base, y es también lo que
    hace que no mueva stock: `cobrar_venta()`, el remito y la anulación
    filtran todos por `producto_id is not null`.
  */
  producto_id: string | null
  codigo_producto: string
  descripcion: string
  unidad_medida: string
  cantidad: number
  precio_original: number
  precio_unitario: number
  motivo_modificacion: string | null
  /*
    Quién autorizó la rebaja de esta línea, si hubo una.

    Es distinto del vendedor a propósito. El vendedor arma la venta; la
    rebaja la autoriza quien puso el PIN en ese momento, que puede ser
    un encargado que se acercó al mostrador. Sin esta distinción, el
    registro diría siempre que el vendedor se autorizó solo, que es
    exactamente lo que el PIN existe para evitar.

    Sin rebaja queda en null y `modificado_por` tampoco se escribe.
  */
  autorizado_por: string | null
  alicuota_iva_id: number
  condicion_iva: 'gravado' | 'exento' | 'no_gravado'
  /** Existencia al momento de agregarlo, para avisar si no alcanza. */
  stock_disponible: number
}

/*
  Identifica al operador.

  Con conexión pregunta al servidor, que es la única fuente autorizada, y
  guarda un verificador local para poder reconocerlo después sin
  internet. Sin conexión usa ese verificador.

  Alguien que nunca se identificó en esta computadora no va a poder
  hacerlo sin conexión, y está bien: la terminal no tiene forma honesta
  de saber quién es.
*/
export async function verificarPin(pin: string, terminalId: string): Promise<Operador | null> {
  const { recordarPin, verificarPinLocal, hayPinesGuardados } = await import('@/lib/local/pin')

  if (navigator.onLine) {
    try {
      const { data, error } = await supabase.rpc('verificar_pin', { p_pin: pin })
      if (error) throw new Error(error.message)
      const operador = ((data ?? []) as Operador[])[0] ?? null
      if (operador) await recordarPin(pin, operador, terminalId)
      return operador
    } catch (e) {
      // Si el servidor no contesta se sigue por el camino local en vez
      // de dejar al mostrador sin poder trabajar.
      const mensaje = e instanceof Error ? e.message : String(e)
      if (!/failed to fetch|networkerror|load failed/i.test(mensaje)) throw e
    }
  }

  const local = await verificarPinLocal(pin, terminalId)
  if (local) return local

  if (!(await hayPinesGuardados(terminalId))) {
    throw new Error(
      'Sin conexión, esta computadora sólo reconoce a quienes ya se identificaron en ella antes. Conectate una vez para poder usarla desconectada.',
    )
  }
  return null
}

/*
  Búsqueda de productos.

  Primero local, siempre. No "si no hay internet": siempre. La copia
  local la mantiene fresca el sincronizador, y consultarla es más rápido
  que ir al servidor — el buscador dispara con cada tecla que toca el
  vendedor. Al servidor se va sólo si todavía no hay copia, que es el
  primer arranque de una terminal nueva.
*/
export async function buscarProductosVenta(texto: string): Promise<ProductoVenta[]> {
  if (!texto.trim()) return []
  if (await hayDatosLocales()) return buscarProductosLocal(texto)
  return buscarProductosServidor(texto)
}

async function buscarProductosServidor(texto: string): Promise<ProductoVenta[]> {
  const patron = `%${texto.replace(/[%_]/g, '')}%`

  // Primero por código de barra exacto: es el caso del lector, y tiene
  // que ganar siempre. Un escaneo no puede devolver una lista.
  const { data: porBarra } = await supabase
    .from('producto_codigo_barra')
    .select('producto_id')
    .eq('codigo', texto.trim())
    .is('eliminado_en', null)
    .limit(1)

  let q = supabase
    .from('vista_stock')
    .select(
      'producto_id, codigo, nombre_interno, precio_venta, unidad_medida, alicuota_iva_id, cantidad, estado',
    )
    .eq('activo', true)
    .limit(20)

  if (porBarra && porBarra.length) {
    q = q.eq('producto_id', porBarra[0].producto_id)
  } else {
    q = q
      .or(`codigo.ilike.${patron},nombre_interno.ilike.${patron},nombre_publico.ilike.${patron}`)
      .order('nombre_interno')
  }

  const { data, error } = await q
  if (error) throw new Error(error.message)

  // La vista no expone condicion_iva; se completa desde producto.
  const filas = (data ?? []) as Omit<ProductoVenta, 'condicion_iva'>[]
  if (!filas.length) return []

  const { data: condiciones } = await supabase
    .from('producto')
    .select('id, condicion_iva')
    .in(
      'id',
      filas.map((f) => f.producto_id),
    )

  const mapa = new Map((condiciones ?? []).map((c) => [c.id as string, c.condicion_iva as string]))
  return filas.map((f) => ({
    ...f,
    condicion_iva: (mapa.get(f.producto_id) ?? 'gravado') as ProductoVenta['condicion_iva'],
  }))
}

export async function buscarClientes(texto: string): Promise<ClienteVenta[]> {
  if (await hayDatosLocales()) return buscarClientesLocal(texto)

  let q = supabase
    .from('cliente')
    .select(
      'id, codigo, nombre, numero_documento, condicion_iva_id, descuento_porcentaje, cuenta_corriente, limite_credito',
    )
    .eq('activo', true)
    .is('eliminado_en', null)
    .order('nombre')
    .limit(15)

  if (texto.trim()) {
    const patron = `%${texto.replace(/[%_]/g, '')}%`
    q = q.or(`nombre.ilike.${patron},numero_documento.ilike.${patron},codigo.ilike.${patron}`)
  }

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as ClienteVenta[]
}

export async function clienteConsumidorFinal(): Promise<ClienteVenta | null> {
  if (await hayDatosLocales()) return consumidorFinalLocal()

  const { data } = await supabase
    .from('cliente')
    .select(
      'id, codigo, nombre, numero_documento, condicion_iva_id, descuento_porcentaje, cuenta_corriente, limite_credito',
    )
    .eq('codigo', 'CF')
    .maybeSingle<ClienteVenta>()
  return data
}

export interface EnvioACaja {
  /*
    En qué estado nace la venta.

    'en_caja' es lo de siempre: va a la cola del cajero. 'borrador' es el
    presupuesto — el cliente se lo lleva a pensar, así que la venta queda
    armada pero NO le aparece a la caja. Si vuelve, se manda a cobrar sin
    volver a cargar nada.
  */
  estado?: 'en_caja' | 'borrador'
  clienteId: string
  vendedorId: string
  terminalId: string
  terminalPrefijo: string
  lineas: LineaVenta[]
  observaciones: string | null
  /*
    Cómo llamar a la persona en la caja mientras espera. Lo escribe el
    vendedor al enviar. No es el nombre del cliente de la ficha: casi
    todo el mostrador es Consumidor Final, y aun con ficha "Juan el de
    la veterinaria" no es lo que dice la razón social.
  */
  nombreParaLlamar?: string | null
  /*
    Con qué dijo el cliente que va a pagar. El vendedor ya se lo pregunta
    en el mostrador —le pide la tarjeta, mira si hay promoción— así que la
    caja recibe la venta con el precio correcto y no hay sorpresa al
    cobrar. La caja lo puede cambiar igual: la tarjeta puede no pasar.
  */
  listaPrecioId: string | null
  /*
    Con qué dijo el cliente que va a pagar, y en cuántas cuotas.

    Viaja además de la lista porque varios medios pueden compartirla:
    si Efectivo y Transferencia usan la lista Contado, desde la lista no
    hay forma de saber cuál dijo el cliente, y el cajero termina
    preguntando de nuevo algo que ya se preguntó.
  */
  medioPagoId: string | null
  cuotas: number
}

/*
  Manda la venta a caja.

  SIEMPRE pasa por la bandeja de salida, haya o no conexión. Que sea
  siempre el mismo camino es lo que evita que el modo sin conexión sea
  un caso especial lleno de bifurcaciones: es el camino normal, que a
  veces tarda más en llegar.

  El id y el número los genera la terminal. El id porque es la clave de
  idempotencia —si algo se reenvía, choca contra la clave primaria en
  vez de duplicar— y el número porque cada terminal tiene su prefijo y
  puede numerar sola, sin coordinar con nadie.

  Los totales no se envían: los recalcula un disparador en la base desde
  las líneas, así no puede quedar una venta cuyo total no coincida con
  lo que tiene adentro.
*/
/*
  Nada de lo que hace enviarACaja toca la red, así que no debería poder
  tardar más de unos milisegundos. Si tarda, algo está mal —la base local
  bloqueada, el disco lleno— y hay que decirlo, no dejar el botón girando.

  Una pantalla que se queda "Enviando…" sin explicar nada es peor que un
  error: quien está en el mostrador no sabe si la venta salió, si tiene
  que volver a apretar, o si va a mandar la misma venta dos veces.
*/
const LIMITE_LOCAL_MS = 5_000

function conLimite<T>(promesa: Promise<T>, mensaje: string): Promise<T> {
  return Promise.race([
    promesa,
    new Promise<never>((_, rechazar) =>
      setTimeout(() => rechazar(new Error(mensaje)), LIMITE_LOCAL_MS),
    ),
  ])
}

/*
  Traza de los pasos al guardar.

  Va a la consola y también a la pantalla. Lo segundo importa más: si el
  mostrador llama diciendo "no guarda", nadie va a abrir la consola del
  navegador. Que el propio botón diga en qué paso se quedó convierte una
  llamada de media hora en una de treinta segundos.
*/
export type AvisoPaso = (nombre: string) => void

export async function enviarACaja(
  datos: EnvioACaja,
  onPaso?: AvisoPaso,
): Promise<{ id: string; codigo: string }> {
  return conLimite(
    guardarVenta(datos, onPaso),
    'La base local no respondió. Anotá la venta a mano y avisá: la computadora no está pudiendo guardar.',
  )
}

async function guardarVenta(
  datos: EnvioACaja,
  onPaso?: AvisoPaso,
): Promise<{ id: string; codigo: string }> {
  const t0 = performance.now()
  const paso = (nombre: string) => {
    console.warn(`[venta] ${nombre} · ${Math.round(performance.now() - t0)} ms`)
    onPaso?.(nombre)
  }

  paso('empezando')
  if (!datos.lineas.length) throw new Error('La venta no tiene productos.')

  const id = crypto.randomUUID()
  paso('id generado')

  const codigo = await reservarCodigoVenta(datos.terminalPrefijo)
  paso(`número ${codigo}`)

  const ahora = new Date().toISOString()

  const esBorrador = datos.estado === 'borrador'

  const cabecera = {
    id,
    codigo,
    estado: datos.estado ?? 'en_caja',
    cliente_id: datos.clienteId,
    vendedor_id: datos.vendedorId,
    terminal_origen_id: datos.terminalId,
    observaciones: datos.observaciones,
    nombre_para_llamar: datos.nombreParaLlamar?.trim() || null,
    ocurrido_en: ahora,
    // Un presupuesto no está esperando en la caja: no tiene fecha de envío.
    enviada_caja_en: esBorrador ? null : ahora,
    registrado_offline: !navigator.onLine,
    medio_pago_previsto_id: datos.medioPagoId,
    cuotas_previstas: datos.medioPagoId ? datos.cuotas : null,
  }

  const lineas = datos.lineas.map((l, i) => ({
    id: crypto.randomUUID(),
    venta_id: id,
    orden: i + 1,
    producto_id: l.producto_id,
    codigo_producto: l.codigo_producto,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precio_original: l.precio_original,
    // El vendedor trabaja a nivel contado: lo que acuerda es el
    // acordado. El unitario lo ajusta la caja al elegir con qué se
    // paga, siempre partiendo de este valor.
    precio_acordado: l.precio_unitario,
    precio_unitario: l.precio_unitario,
    motivo_modificacion: l.motivo_modificacion,
    // Quien autorizó la rebaja, si se identificó con PIN; si no, el
    // vendedor. La base exige que toda línea con precio cambiado tenga
    // responsable y motivo (`venta_linea_modificacion_justificada`).
    modificado_por:
      l.precio_unitario !== l.precio_original
        ? (l.autorizado_por ?? datos.vendedorId)
        : null,
    alicuota_iva_id: l.alicuota_iva_id,
    condicion_iva: l.condicion_iva,
  }))

  await encolar(id, [
    {
      tipo: 'insert',
      tabla: 'venta',
      datos: cabecera,
      descripcion: `Venta ${codigo}`,
    },
    ...lineas.map((l) => ({
      tipo: 'insert' as const,
      tabla: 'venta_linea',
      datos: l,
      descripcion: `${codigo} · ${l.descripcion}`,
    })),
    ...(datos.listaPrecioId
      ? [
          {
            tipo: 'rpc' as const,
            tabla: 'aplicar_lista_a_venta',
            datos: { p_venta_id: id, p_lista_id: datos.listaPrecioId },
            descripcion: `${codigo} · lista de precios`,
          },
        ]
      : []),
  ])

  /*
    Y se guarda también en la base local de esta máquina.

    Hasta ahora la venta sólo iba a la bandeja de salida, y las filas
    locales las traía la sincronización desde el servidor. Sin conexión
    eso deja a la venta existiendo únicamente como una operación
    pendiente: la máquina que acaba de crearla no la encuentra.

    Se descubrió el 07/09 probando el presupuesto sin conexión — el
    documento se arma sobre la venta, y la venta no estaba.
  */
  // Cifrada antes de guardar: el nombre para llamar y las observaciones
  // son de una persona.
  await db.venta.put(
    await sellarVenta({
      ...cabecera,
      observaciones: cabecera.observaciones ?? null,
      descuento_total: 0,
      total: Math.round(lineas.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0) * 100) / 100,
      lista_precio_id: datos.listaPrecioId ?? null,
      actualizado_en: ahora,
    }),
  )
  await db.venta_linea.bulkPut(
    lineas.map((l) => ({ ...l, actualizado_en: ahora })) as never,
  )

  // Con lista de precios, la copia local se recalcula con el mismo
  // criterio que va a usar el servidor al procesar la operación
  // encolada: siempre desde el precio acordado.
  if (datos.listaPrecioId) {
    await aplicarListaLocal(id, datos.listaPrecioId)
  }

  paso('encolada')

  // Si hay conexión se intenta subir enseguida, para que la caja la vea
  // sin esperar el próximo ciclo. Si falla no importa: ya está guardada.
  if (navigator.onLine) {
    void subirPendientes().catch(() => {})
  }

  paso('lista')
  return { id, codigo }
}
