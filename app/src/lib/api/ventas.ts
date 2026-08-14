import { supabase } from '@/lib/supabase'
import type { EstadoStock } from '@/lib/tipos'
import {
  buscarClientesLocal,
  buscarProductosLocal,
  consumidorFinalLocal,
  hayDatosLocales,
  recordarUltimoNumero,
  siguienteCodigoLocal,
} from '@/lib/local/consultas'
import { encolar, subirPendientes } from '@/lib/local/sync'

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
  producto_id: string
  codigo_producto: string
  descripcion: string
  unidad_medida: string
  cantidad: number
  precio_original: number
  precio_unitario: number
  motivo_modificacion: string | null
  alicuota_iva_id: number
  condicion_iva: 'gravado' | 'exento' | 'no_gravado'
  /** Existencia al momento de agregarlo, para avisar si no alcanza. */
  stock_disponible: number
}

/** Identifica al operador por PIN dentro de la sesión de la terminal. */
export async function verificarPin(pin: string): Promise<Operador | null> {
  const { data, error } = await supabase.rpc('verificar_pin', { p_pin: pin })
  if (error) throw new Error(error.message)
  const filas = (data ?? []) as Operador[]
  return filas[0] ?? null
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
  clienteId: string
  vendedorId: string
  terminalId: string
  terminalPrefijo: string
  lineas: LineaVenta[]
  observaciones: string | null
  /*
    Con qué dijo el cliente que va a pagar. El vendedor ya se lo pregunta
    en el mostrador —le pide la tarjeta, mira si hay promoción— así que la
    caja recibe la venta con el precio correcto y no hay sorpresa al
    cobrar. La caja lo puede cambiar igual: la tarjeta puede no pasar.
  */
  listaPrecioId: string | null
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

export async function enviarACaja(datos: EnvioACaja): Promise<{ id: string; codigo: string }> {
  return conLimite(
    guardarVenta(datos),
    'La base local no respondió. Anotá la venta a mano y avisá: la computadora no está pudiendo guardar.',
  )
}

async function guardarVenta(datos: EnvioACaja): Promise<{ id: string; codigo: string }> {
  if (!datos.lineas.length) throw new Error('La venta no tiene productos.')

  const id = crypto.randomUUID()
  const codigo = await siguienteCodigoLocal(datos.terminalPrefijo)
  const ahora = new Date().toISOString()

  const cabecera = {
    id,
    codigo,
    estado: 'en_caja',
    cliente_id: datos.clienteId,
    vendedor_id: datos.vendedorId,
    terminal_origen_id: datos.terminalId,
    observaciones: datos.observaciones,
    ocurrido_en: ahora,
    enviada_caja_en: ahora,
    registrado_offline: !navigator.onLine,
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
    modificado_por: l.precio_unitario !== l.precio_original ? datos.vendedorId : null,
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

  await recordarUltimoNumero(datos.terminalPrefijo, codigo)

  // Si hay conexión se intenta subir enseguida, para que la caja la vea
  // sin esperar el próximo ciclo. Si falla no importa: ya está guardada.
  if (navigator.onLine) {
    void subirPendientes().catch(() => {})
  }

  return { id, codigo }
}
