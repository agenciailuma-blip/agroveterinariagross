import { supabase } from '@/lib/supabase'
import { solicitarCae } from '@/lib/api/facturacion'

/*
  ─────────────────────────────────────────────────────────────
  Mayorista: el vendedor de calle

  Pedido de Lucas del 26/10 (docs/fase-03.md, punto 5). Facundo sale por
  las rutas con el teléfono, arma los pedidos de los mayoristas y los
  manda al local; ahí el depósito los corrobora, se facturan —o salen con
  comprobante interno— y se remiten.

  Todo pasa por funciones de la base y no por las tablas: el vendedor no
  tiene permiso para ver todos los clientes ni el catálogo con costos, y
  cada función mira el permiso que le toca.

  ─── EN LA RUTA PUEDE NO HABER SEÑAL ───

  El catálogo y los clientes se guardan en el teléfono cada vez que se
  leen, y sin señal se usa esa copia. El pedido armado sin señal queda en
  una cola en el teléfono y sale solo cuando vuelve: el identificador lo
  pone el teléfono, así que mandarlo dos veces no crea dos pedidos.

  La copia va en el almacenamiento del navegador y no en la base local
  del mostrador: el teléfono del vendedor no es una terminal del local, y
  la base local baja cosas que él no tiene que ver.
  ─────────────────────────────────────────────────────────────
*/

export interface ProductoMayorista {
  producto_id: string
  codigo: string
  nombre: string
  precio: number
  /** null cuando el permiso no deja ver el stock. */
  stock: number | null
  unidades_por_bulto: number | null
}

export interface ClienteMayorista {
  id: string
  nombre: string
  nombre_fantasia: string | null
  tipo_documento_id: number
  numero_documento: string | null
  condicion_iva_id: number
  calle: string | null
  numero: string | null
  localidad: string | null
  zona: string | null
  ruta: string | null
  telefono: string | null
  email: string | null
  latitud: number | null
  longitud: number | null
  cuenta_corriente: boolean
  /** null cuando el permiso no deja ver la deuda. */
  saldo: number | null
  vencido: number | null
  vencimiento_mas_antiguo: string | null
  ultimo_pedido_en: string | null
  ultimo_pedido_numero: number | null
  /**
    No quiere factura: su pedido sale con proforma —el comprobante
    interno— salvo que se elija facturar. Falta en la copia del teléfono
    guardada antes del 29/10: se lee como «no».
  */
  pide_proforma?: boolean
}

export type EstadoPedidoMayorista = 'pendiente' | 'confirmado' | 'facturado' | 'cancelado'
export type VistaMayorista = 'pendientes' | 'facturados' | 'cancelados'

export const ETIQUETA_ESTADO: Record<EstadoPedidoMayorista, string> = {
  pendiente: 'Para corroborar',
  confirmado: 'Para facturar',
  facturado: 'Facturado',
  cancelado: 'Cancelado',
}

export interface LineaPedidoMayorista {
  producto_id: string
  codigo: string
  nombre: string
  cantidad: number
  precio: number
  precio_lista: number
  stock: number | null
}

export interface PedidoMayorista {
  id: string
  numero: number
  estado: EstadoPedidoMayorista
  cliente_id: string
  cliente_nombre: string
  cliente_localidad: string | null
  cliente_ruta: string | null
  cliente_domicilio: string | null
  cliente_telefono: string | null
  cliente_email: string | null
  cliente_condicion_iva_id: number
  vendedor_nombre: string | null
  observaciones: string | null
  armado_en: string
  recibido_en: string
  confirmado_en: string | null
  confirmado_por_nombre: string | null
  facturado_en: string | null
  cancelado_en: string | null
  motivo_cancelacion: string | null
  total: number
  lineas: LineaPedidoMayorista[]
  venta_id: string | null
  venta_codigo: string | null
  documentacion: string | null
  comprobante_id: string | null
  comprobante_numero: string | null
  comprobante_cae: string | null
  interno_id: string | null
  interno_numero: string | null
  remito_id: string | null
  remito_numero: string | null
  mail_destinatario: string | null
  mail_estado: 'enviado' | 'error' | null
  mail_error: string | null
  mail_en: string | null
  /** Null si quien mira no tiene permiso de ver la deuda. */
  cliente_vencido: number | null
  cliente_vencido_desde: string | null
  vencido_autorizado_en: string | null
  vencido_autorizado_por_nombre: string | null
  cliente_pide_proforma: boolean
}

// ───────────────────────────────────────────────────────────────
// La copia en el teléfono
// ───────────────────────────────────────────────────────────────

export interface ConCopia<T> {
  datos: T
  /** Cuándo se leyó del servidor. Distinto de ahora: es la copia. */
  leidoEn: string
  deLaCopia: boolean
}

function leerGuardado<T>(clave: string): { datos: T; leidoEn: string } | null {
  try {
    const crudo = localStorage.getItem(clave)
    return crudo ? (JSON.parse(crudo) as { datos: T; leidoEn: string }) : null
  } catch {
    return null
  }
}

function guardar(clave: string, valor: unknown): void {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    // Sin almacenamiento no hay copia: con señal anda igual.
  }
}

/*
  Leer del servidor y guardar la copia; si no hay señal, la copia. Un
  error que no es de la red —falta un permiso— no se tapa con la copia:
  se muestra.
*/
async function conCopia<T>(clave: string, leer: () => Promise<T>): Promise<ConCopia<T>> {
  try {
    const datos = await leer()
    const leidoEn = new Date().toISOString()
    guardar(clave, { datos, leidoEn })
    return { datos, leidoEn, deLaCopia: false }
  } catch (e) {
    const guardado = leerGuardado<T>(clave)
    if (guardado && esFallaDeRed(e)) return { ...guardado, deLaCopia: true }
    throw e
  }
}

export function esFallaDeRed(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  // El error de una función de la base no es un Error: trae su mensaje igual.
  const mensaje = String((e as { message?: unknown } | null)?.message ?? e)
  return /failed to fetch|networkerror|network request failed|load failed|fetch/i.test(mensaje)
}

const CLAVE_CATALOGO = 'gross.mayorista.catalogo'
const CLAVE_CLIENTES = 'gross.mayorista.clientes'
const CLAVE_COLA = 'gross.mayorista.cola'

export function leerCatalogo(): Promise<ConCopia<ProductoMayorista[]>> {
  return conCopia(CLAVE_CATALOGO, async () => {
    const { data, error } = await supabase.rpc('mayorista_catalogo')
    if (error) throw new Error(error.message)
    return (data ?? []) as ProductoMayorista[]
  })
}

export function leerClientes(): Promise<ConCopia<ClienteMayorista[]>> {
  return conCopia(CLAVE_CLIENTES, async () => {
    const { data, error } = await supabase.rpc('mayorista_clientes')
    if (error) throw new Error(error.message)
    return (data ?? []) as ClienteMayorista[]
  })
}

// ───────────────────────────────────────────────────────────────
// El pedido que se arma
// ───────────────────────────────────────────────────────────────

export interface LineaArmada {
  producto_id: string
  codigo: string
  nombre: string
  cantidad: number
  /** El de la lista. */
  precio_lista: number
  /** El que se pide: distinto sólo con el permiso de cambiar precio. */
  precio: number
}

export interface PedidoArmado {
  id: string
  cliente_id: string
  cliente_nombre: string
  lineas: LineaArmada[]
  observaciones: string
  armado_en: string
  /** Lo que contestó el servidor la última vez, si no fue la red. */
  error?: string
}

/* Sumar un producto: si ya estaba, suma la cantidad en vez de repetirlo. */
export function agregarLinea(lineas: LineaArmada[], p: ProductoMayorista, cantidad: number): LineaArmada[] {
  if (!(cantidad > 0)) return lineas
  const ya = lineas.find((l) => l.producto_id === p.producto_id)
  if (ya) {
    return lineas.map((l) => (l.producto_id === p.producto_id ? { ...l, cantidad: l.cantidad + cantidad } : l))
  }
  return [
    ...lineas,
    {
      producto_id: p.producto_id,
      codigo: p.codigo,
      nombre: p.nombre,
      cantidad,
      precio_lista: p.precio,
      precio: p.precio,
    },
  ]
}

/* Cero o menos lo saca. */
export function cambiarCantidad(lineas: LineaArmada[], productoId: string, cantidad: number): LineaArmada[] {
  if (!(cantidad > 0)) return lineas.filter((l) => l.producto_id !== productoId)
  return lineas.map((l) => (l.producto_id === productoId ? { ...l, cantidad } : l))
}

export function totalDe(lineas: { cantidad: number; precio: number }[]): number {
  return lineas.reduce((t, l) => t + Math.round(l.cantidad * l.precio * 100) / 100, 0)
}

// ─── La cola del teléfono ───

export function pedidosEnCola(): PedidoArmado[] {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_COLA) ?? '[]') as PedidoArmado[]
  } catch {
    return []
  }
}

function guardarCola(cola: PedidoArmado[]): void {
  guardar(CLAVE_COLA, cola)
  // La pantalla se entera aunque el envío haya salido de otro lado.
  window.dispatchEvent(new Event('gross-mayorista-cola'))
}

export function encolarPedido(p: PedidoArmado): void {
  guardarCola([...pedidosEnCola().filter((x) => x.id !== p.id), p])
}

export function sacarDeLaCola(id: string): void {
  guardarCola(pedidosEnCola().filter((x) => x.id !== id))
}

/*
  Mandar lo que haya en la cola, de a uno. El que llega sale de la cola;
  el que falla por la red se queda para la próxima; el que el servidor
  rechaza —un producto que salió de la lista— se queda con el motivo a
  la vista, para corregirlo y no perderlo.
*/
let enviando: Promise<{ enviados: number; numeros: number[] }> | null = null

export function enviarCola(): Promise<{ enviados: number; numeros: number[] }> {
  // Dos llamados a la vez —el botón y la vuelta de la señal— no mandan dos veces.
  enviando ??= (async () => {
    const numeros: number[] = []
    try {
      for (const p of pedidosEnCola()) {
        const { data, error } = await supabase.rpc('mayorista_enviar_pedido', {
          p_id: p.id,
          p_cliente_id: p.cliente_id,
          p_lineas: p.lineas.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad, precio: l.precio })),
          p_observaciones: p.observaciones || null,
          p_armado_en: p.armado_en,
        })
        if (error) {
          if (esFallaDeRed(error)) break
          encolarPedido({ ...p, error: error.message })
          continue
        }
        sacarDeLaCola(p.id)
        numeros.push((data as { numero: number }).numero)
        // Al cliente le llega el detalle. Si no sale, se ve en la ficha y se manda desde ahí.
        mandarPedidoPorMail(p.id, null, true).catch(() => {})
      }
    } catch (e) {
      if (!esFallaDeRed(e)) throw e
    }
    return { enviados: numeros.length, numeros }
  })().finally(() => {
    enviando = null
  })
  return enviando
}

// ───────────────────────────────────────────────────────────────
// Los pedidos
// ───────────────────────────────────────────────────────────────

/*
  El mail del pedido al cliente: el detalle de lo que pidió. Lo arma y lo
  manda la función de correo con lo que hay en la base; queda anotado en
  el pedido. Sin dirección, la del cliente.
*/
export async function mandarPedidoPorMail(pedidoId: string, destinatario: string | null, automatico = false): Promise<void> {
  const { error } = await supabase.functions.invoke('enviar-factura', {
    body: { pedido_id: pedidoId, destinatario: destinatario?.trim() || null, automatico },
  })
  if (error) {
    const contexto = (error as { context?: Response }).context
    let mensaje = 'No se pudo mandar el mail. Revisá la conexión y probá de nuevo.'
    if (contexto && typeof contexto.json === 'function') {
      try {
        const cuerpo = await contexto.json()
        if (cuerpo?.error) mensaje = String(cuerpo.error)
      } catch {
        // No era JSON: falló la red.
      }
    }
    throw new Error(mensaje)
  }
}

export async function listarPedidos(vista: VistaMayorista): Promise<PedidoMayorista[]> {
  const { data, error } = await supabase.rpc('mayorista_pedidos', { p_vista: vista })
  if (error) throw new Error(error.message)
  return (data ?? []) as PedidoMayorista[]
}

export async function contarPedidosPendientes(): Promise<number> {
  const { data, error } = await supabase.rpc('mayorista_pedidos_pendientes')
  if (error) throw new Error(error.message)
  return (data as number) ?? 0
}

/* Las cantidades que cambió el depósito. Las que quedan igual no se mandan. */
export function cantidadesCorregidas(
  lineas: LineaPedidoMayorista[],
  corregidas: Record<string, number>,
): { producto_id: string; cantidad: number }[] {
  return lineas
    .filter((l) => l.producto_id in corregidas && corregidas[l.producto_id] !== l.cantidad)
    .map((l) => ({ producto_id: l.producto_id, cantidad: corregidas[l.producto_id] }))
}

export async function confirmarPedido(id: string, cantidades: { producto_id: string; cantidad: number }[]): Promise<void> {
  const { error } = await supabase.rpc('mayorista_confirmar_pedido', {
    p_id: id,
    p_cantidades: cantidades.length > 0 ? cantidades : null,
  })
  if (error) throw new Error(error.message)
}

/*
  Facturar: la base arma la venta, la cobra a cuenta corriente y prepara
  la factura; acá se le pide el CAE a ARCA, como en la caja. Si ARCA no
  contesta la factura ya existe con su número y queda en la cola de
  Facturación: vuelve como «problema», no como error.
*/
export async function facturarPedido(
  id: string,
  documentacion: 'fiscal' | 'no_fiscal',
): Promise<{ ventaId: string; comprobanteId: string | null; cae: string | null; problema: string | null }> {
  const { data, error } = await supabase.rpc('mayorista_facturar_pedido', {
    p_id: id,
    p_documentacion: documentacion,
  })
  if (error) throw new Error(error.message)
  const r = data as { venta_id: string; comprobante_id: string | null }
  if (!r.comprobante_id) return { ventaId: r.venta_id, comprobanteId: null, cae: null, problema: null }

  try {
    const { cae } = await solicitarCae(r.comprobante_id)
    return { ventaId: r.venta_id, comprobanteId: r.comprobante_id, cae, problema: null }
  } catch (e) {
    return {
      ventaId: r.venta_id,
      comprobanteId: r.comprobante_id,
      cae: null,
      problema: e instanceof Error ? e.message : 'ARCA no respondió.',
    }
  }
}

/*
  Respuesta 7 de Lucas: al cliente con deuda vencida no se le factura
  sin que un encargado lo autorice. El pedido se arma y se corrobora
  igual; lo que espera es la factura.
*/
export function frenadoPorVencido(
  p: Pick<PedidoMayorista, 'estado' | 'cliente_vencido' | 'vencido_autorizado_en'>,
): boolean {
  return (p.estado === 'pendiente' || p.estado === 'confirmado') && (p.cliente_vencido ?? 0) > 0 && !p.vencido_autorizado_en
}

/*
  Sin PIN autoriza el usuario de la sesión, si es encargado; con PIN, el
  dueño del PIN. Lo verifica la base. Devuelve quién autorizó.
*/
export async function autorizarVencido(id: string, pin: string | null): Promise<string | null> {
  const { data, error } = await supabase.rpc('mayorista_autorizar_vencido', { p_id: id, p_pin: pin?.trim() || null })
  if (error) throw new Error(error.message)
  const r = data as { ok: boolean; error?: string; nombre?: string }
  if (!r.ok) throw new Error(r.error ?? 'No se pudo autorizar.')
  return r.nombre ?? null
}

export async function cancelarPedido(id: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('mayorista_cancelar_pedido', { p_id: id, p_motivo: motivo })
  if (error) throw new Error(error.message)
}

// ───────────────────────────────────────────────────────────────
// Los clientes
// ───────────────────────────────────────────────────────────────

export interface DatosClienteMayorista {
  nombre?: string
  nombre_fantasia?: string
  numero_documento?: string
  condicion_iva_id?: number
  telefono?: string
  email?: string
  calle?: string
  numero?: string
  localidad?: string
  zona?: string
  ruta?: string
  latitud?: number | null
  longitud?: number | null
  pide_proforma?: boolean
}

export async function guardarClienteMayorista(
  id: string | null,
  datos: DatosClienteMayorista,
): Promise<{ id: string; existia: boolean; nombre: string }> {
  const { data, error } = await supabase.rpc('mayorista_guardar_cliente', { p_id: id, p_datos: datos })
  if (error) throw new Error(error.message)
  return data as { id: string; existia: boolean; nombre: string }
}

/* Las condiciones que se eligen en la ruta: las cuatro de siempre. */
export const CONDICIONES_IVA: { id: number; nombre: string }[] = [
  { id: 5, nombre: 'Consumidor final' },
  { id: 6, nombre: 'Monotributista' },
  { id: 1, nombre: 'Responsable inscripto' },
  { id: 4, nombre: 'Exento' },
]

export interface FiltroClientes {
  texto: string
  ruta: string
  soloConVencido: boolean
}

function sinAcentos(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function filtrarClientes(clientes: ClienteMayorista[], f: FiltroClientes): ClienteMayorista[] {
  const palabras = sinAcentos(f.texto.trim()).split(/\s+/).filter(Boolean)
  return clientes.filter((c) => {
    if (f.ruta && (c.ruta ?? '') !== f.ruta) return false
    if (f.soloConVencido && !((c.vencido ?? 0) > 0)) return false
    if (palabras.length === 0) return true
    const donde = sinAcentos(
      [c.nombre, c.nombre_fantasia, c.localidad, c.zona, c.ruta, c.numero_documento].filter(Boolean).join(' '),
    )
    return palabras.every((p) => donde.includes(p))
  })
}

/* Las rutas que ya se usan, para elegir sin escribir. */
export function rutasDe(clientes: ClienteMayorista[]): string[] {
  return [...new Set(clientes.map((c) => c.ruta).filter((r): r is string => !!r))].sort((a, b) =>
    a.localeCompare(b, 'es', { numeric: true }),
  )
}

export function buscarProductos(catalogo: ProductoMayorista[], texto: string): ProductoMayorista[] {
  const palabras = sinAcentos(texto.trim()).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return catalogo
  return catalogo.filter((p) => {
    const donde = sinAcentos(`${p.codigo} ${p.nombre}`)
    return palabras.every((x) => donde.includes(x))
  })
}

// ─── Llamar, escribir, llegar ───

/*
  El número para WhatsApp: con el 54 y el 9 de los celulares, sin el 0
  de la característica ni el 15. Se cargan de muchas maneras —«3764
  15-123456», «03764-123456», «+54 9 3764 123456»— y todas tienen que
  llevar al mismo chat. Si no queda un número de diez cifras, no hay
  enlace: mejor nada que un chat con otro.
*/
export function numeroWhatsapp(telefono: string | null): string | null {
  if (!telefono) return null
  let n = telefono.replace(/\D/g, '')
  if (n.startsWith('54')) n = n.slice(2)
  if (n.startsWith('9') && n.length === 11) n = n.slice(1)
  if (n.startsWith('0')) n = n.slice(1)
  if (n.length === 12) {
    // El 15 va después de la característica, que en Misiones tiene cuatro cifras.
    for (const i of [4, 3, 2]) {
      if (n.slice(i, i + 2) === '15') {
        n = n.slice(0, i) + n.slice(i + 2)
        break
      }
    }
  }
  return n.length === 10 ? `549${n}` : null
}

export function enlaceWhatsapp(telefono: string | null, texto?: string): string | null {
  const n = numeroWhatsapp(telefono)
  if (!n) return null
  return `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`
}

export function enlaceMapa(c: Pick<ClienteMayorista, 'latitud' | 'longitud' | 'calle' | 'numero' | 'localidad'>): string | null {
  if (c.latitud != null && c.longitud != null) {
    return `https://www.google.com/maps/search/?api=1&query=${c.latitud},${c.longitud}`
  }
  if (!c.calle || !c.localidad) return null
  const domicilio = [c.calle, c.numero, c.localidad, 'Misiones'].filter(Boolean).join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(domicilio)}`
}

/* Dónde está el teléfono ahora: para guardar la ubicación del cliente parado en su local. */
export function ubicacionActual(): Promise<{ latitud: number; longitud: number }> {
  return new Promise((resolver, rechazar) => {
    if (!('geolocation' in navigator)) {
      rechazar(new Error('Este teléfono no informa la ubicación.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolver({
          latitud: Math.round(p.coords.latitude * 1e6) / 1e6,
          longitud: Math.round(p.coords.longitude * 1e6) / 1e6,
        }),
      (e) =>
        rechazar(
          new Error(
            e.code === e.PERMISSION_DENIED
              ? 'El teléfono no dio permiso para la ubicación: se habilita en el navegador.'
              : 'No se pudo saber la ubicación. Probá de nuevo al aire libre.',
          ),
        ),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    )
  })
}

// ───────────────────────────────────────────────────────────────
// La lista de precios mayorista, desde el local
// ───────────────────────────────────────────────────────────────

export interface PrecioMayorista {
  producto_id: string
  codigo: string
  nombre: string
  precio: number
  precio_venta: number
  stock: number
}

export async function leerLista(): Promise<PrecioMayorista[]> {
  const { data, error } = await supabase.rpc('mayorista_lista')
  if (error) throw new Error(error.message)
  return (data ?? []) as PrecioMayorista[]
}

/* null saca el producto de la lista. */
export async function guardarPrecio(productoId: string, precio: number | null): Promise<void> {
  const { error } = await supabase.rpc('mayorista_guardar_precio', { p_producto_id: productoId, p_precio: precio })
  if (error) throw new Error(error.message)
}

export interface ProductoParaLista {
  id: string
  codigo: string
  nombre_interno: string
  precio_venta: number
}

export async function buscarParaLista(texto: string): Promise<ProductoParaLista[]> {
  const t = texto.trim().replace(/[%,()]/g, ' ')
  if (t.length < 2) return []
  const { data, error } = await supabase
    .from('producto')
    .select('id, codigo, nombre_interno, precio_venta')
    .is('eliminado_en', null)
    .eq('activo', true)
    .or(`codigo.ilike.%${t}%,nombre_interno.ilike.%${t}%`)
    .order('nombre_interno')
    .limit(20)
  if (error) throw new Error(error.message)
  return (data ?? []) as ProductoParaLista[]
}
