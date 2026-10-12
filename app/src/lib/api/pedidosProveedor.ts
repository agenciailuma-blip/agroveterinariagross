import { supabase } from '@/lib/supabase'
import { moneda, numero } from '@/lib/tipos'
import type { TipoMinimo } from '@/lib/api/proveedores'

/*
  ─────────────────────────────────────────────────────────────
  El pedido a proveedor

  Pedido de Lucas del 07/10: armar el pedido mirando todo lo que se le
  compra a un proveedor, no sólo lo que pidió el de depósito —«no le
  puedo pedir sólo cinco bolsas»—. Se elige el proveedor, aparecen sus
  productos con stock, aviso, costo y lo que pidieron las órdenes
  internas, y se completa cuánto pedir de cada uno. El mínimo de cada
  proveedor es variado: unos piden un monto, otros bultos y otros kilos,
  y la pantalla dice cuánto falta.

  No mueve stock ni plata. Lo escribe la base; la pantalla arma el
  pedido y lo manda entero.
  ─────────────────────────────────────────────────────────────
*/

/*
  pedido   — salió hacia el proveedor y espera la mercadería.
  recibido — llegó todo, o se dio por terminado sin que llegue el resto.
  anulado  — no va.
*/
export type EstadoPedido = 'pedido' | 'recibido' | 'anulado'

export const ESTADO_PEDIDO: Record<EstadoPedido, { etiqueta: string; clase: string }> = {
  pedido: { etiqueta: 'Por recibir', clase: 'bg-amber-50 text-amber-800 ring-amber-200' },
  recibido: { etiqueta: 'Recibido', clase: 'bg-verde-50 text-verde-800 ring-verde-200' },
  anulado: { etiqueta: 'Anulado', clase: 'bg-piedra-50 text-piedra-500 ring-borde' },
}

/** Un pedido que espera mercadería y ya recibió una parte. */
export const LLEGO_EN_PARTE = { etiqueta: 'Llegó en parte', clase: 'bg-amber-50 text-amber-900 ring-amber-300' }

export interface ProveedorParaPedido {
  id: string
  nombre: string
  minimo_tipo: TipoMinimo | null
  minimo_valor: number | null
}

/** Lo que se le puede pedir: un producto, o un renglón de orden que no está en el catálogo. */
export interface FilaParaPedido {
  producto_id: string | null
  codigo: string | null
  descripcion: string
  unidad_medida: string | null
  stock: number | null
  umbral_bajo: number | null
  umbral_critico: number | null
  estado: 'ok' | 'bajo' | 'critico' | 'sobrevendido'
  /** El de la última compra a este proveedor; si nunca se le compró, el de la ficha. Con IVA. */
  costo: number | null
  costo_de_este: boolean
  peso_kg: number | null
  unidades_por_bulto: number | null
  /** Si en la ficha figura este proveedor. Uno de otro aparece si una orden se lo pidió a éste. */
  es_del_proveedor: boolean
  /** Lo que pidieron las órdenes internas pendientes. */
  en_ordenes: number
  /** Los renglones de esas órdenes: entran al pedido si se pide algo de esta fila. */
  lineas_orden: string[]
  ordenes: number[]
}

export interface FilaPedido {
  id: string
  numero: number
  fecha: string
  proveedor: string
  estado: EstadoPedido
  renglones: number
  total: number | null
  observacion: string | null
  creado_por: string | null
  /** Si ya entró mercadería de este pedido. */
  llego_algo: boolean
}

export interface RenglonPedido {
  renglon: number
  producto_id: string | null
  codigo: string | null
  descripcion: string
  cantidad: number
  costo: number | null
  peso_kg: number | null
  unidades_por_bulto: number | null
  /** Cuánto llegó, por las facturas atadas al pedido. Nulo en lo que no está en el catálogo. */
  recibido: number | null
}

export interface FacturaDelPedido {
  id: string
  fecha: string
  numero: string
  recibida_en: string | null
}

/** Una orden interna que era para un cliente: a quién avisarle cuando llega. */
export interface AvisoAlCliente {
  orden: number
  cliente: string | null
  contacto: string | null
  que: string
  /** Los productos del catálogo que pidió: el aviso sale cuando llega alguno. */
  productos: string[]
}

export interface PedidoCompleto {
  id: string
  numero: number
  fecha: string
  proveedor_id: string
  proveedor: string
  proveedor_cuit: string | null
  proveedor_contacto: string | null
  proveedor_telefono: string | null
  proveedor_email: string | null
  observacion: string | null
  estado: EstadoPedido
  /** El mínimo como estaba al pedir. */
  minimo_tipo: TipoMinimo | null
  minimo_valor: number | null
  creado_por: string | null
  creado_en: string
  anulado_por: string | null
  motivo_anulacion: string | null
  recibido_por: string | null
  recibido_en: string | null
  /** Si se dio por terminado sin que llegara todo: por qué. */
  motivo_cierre: string | null
  lineas: RenglonPedido[]
  /** Las órdenes internas que cubrió. */
  ordenes: number[]
  /** Las facturas que trajeron su mercadería. */
  facturas: FacturaDelPedido[]
  avisar: AvisoAlCliente[]
}

const n = (x: unknown) => (x == null ? null : Number(x))

export async function listarProveedoresParaPedido(): Promise<ProveedorParaPedido[]> {
  const { data, error } = await supabase
    .from('proveedor')
    .select('id, nombre, minimo_tipo, minimo_valor')
    .is('eliminado_en', null)
    .order('nombre')
  if (error) throw new Error(error.message)
  return ((data ?? []) as ProveedorParaPedido[]).map((p) => ({ ...p, minimo_valor: n(p.minimo_valor) }))
}

export async function productosParaPedido(proveedorId: string): Promise<FilaParaPedido[]> {
  const { data, error } = await supabase.rpc('productos_para_pedido', { p_proveedor_id: proveedorId })
  if (error) throw new Error(error.message)
  return ((data ?? []) as FilaParaPedido[]).map((f) => ({
    ...f,
    stock: n(f.stock),
    umbral_bajo: n(f.umbral_bajo),
    umbral_critico: n(f.umbral_critico),
    costo: n(f.costo),
    peso_kg: n(f.peso_kg),
    unidades_por_bulto: n(f.unidades_por_bulto),
    en_ordenes: Number(f.en_ordenes),
    ordenes: (f.ordenes ?? []).map(Number),
    lineas_orden: f.lineas_orden ?? [],
  }))
}

export async function listarPedidos(estado: EstadoPedido | null): Promise<FilaPedido[]> {
  const { data, error } = await supabase.rpc('pedidos_a_proveedores', { p_estado: estado, p_limite: 200 })
  if (error) throw new Error(error.message)
  return ((data ?? []) as FilaPedido[]).map((f) => ({
    ...f,
    numero: Number(f.numero),
    renglones: Number(f.renglones),
    total: n(f.total),
    llego_algo: !!f.llego_algo,
  }))
}

export async function obtenerPedido(id: string): Promise<PedidoCompleto | null> {
  const { data, error } = await supabase.rpc('pedido_a_proveedor', { p_id: id })
  if (error) throw new Error(error.message)
  if (!data) return null
  const p = data as PedidoCompleto
  return {
    ...p,
    numero: Number(p.numero),
    minimo_valor: n(p.minimo_valor),
    ordenes: (p.ordenes ?? []).map(Number),
    facturas: p.facturas ?? [],
    avisar: (p.avisar ?? []).map((a) => ({ ...a, orden: Number(a.orden), productos: a.productos ?? [] })),
    lineas: p.lineas.map((l) => ({
      ...l,
      cantidad: Number(l.cantidad),
      costo: n(l.costo),
      peso_kg: n(l.peso_kg),
      unidades_por_bulto: n(l.unidades_por_bulto),
      recibido: n(l.recibido),
    })),
  }
}

export interface RenglonAPedir {
  producto_id: string | null
  descripcion: string
  cantidad: number
  costo: number | null
  lineas_orden: string[]
}

/** Lo genera la pantalla: un pedido que se reintenta no sale dos veces. */
export async function hacerPedido(d: {
  id: string
  proveedorId: string
  lineas: RenglonAPedir[]
  observacion: string
}): Promise<number> {
  const { data, error } = await supabase.rpc('hacer_pedido_proveedor', {
    p_id: d.id,
    p_proveedor_id: d.proveedorId,
    p_lineas: d.lineas,
    p_observacion: d.observacion,
  })
  if (error) throw new Error(error.message)
  return Number(data)
}

export async function anularPedido(id: string, motivo: string) {
  const { error } = await supabase.rpc('anular_pedido_proveedor', { p_id: id, p_motivo: motivo })
  if (error) throw new Error(error.message)
}

/** Darlo por recibido sin que llegue lo que falta: el proveedor no lo tiene, o ya no hace falta. */
export async function cerrarPedido(id: string, motivo: string) {
  const { error } = await supabase.rpc('cerrar_pedido_proveedor', { p_id: id, p_motivo: motivo })
  if (error) throw new Error(error.message)
}

/*
  ─────────────────────────────────────────────────────────────
  Recibir desde el pedido

  Al recibir la mercadería de una factura se ofrecen los pedidos a ese
  proveedor que esperan mercadería. Traer uno ata la factura al pedido
  y carga lo que falta llegar; cuando la mercadería entra, la base
  mira cuánto llegó y, si llegó todo, lo da por recibido.
  ─────────────────────────────────────────────────────────────
*/

export interface PedidoPorRecibir {
  id: string
  numero: number
  fecha: string
  renglones: number
  llego_algo: boolean
}

export interface RenglonPorRecibir {
  /** Nulo: lo pidieron pero no está en el catálogo. */
  producto_id: string | null
  codigo: string | null
  descripcion: string
  costo: number | null
  alicuota_iva_id: number | null
  pedido: number
  recibido: number
  falta: number
}

export async function pedidosPorRecibir(proveedorId: string): Promise<PedidoPorRecibir[]> {
  const { data, error } = await supabase.rpc('pedidos_por_recibir', { p_proveedor_id: proveedorId })
  if (error) throw new Error(error.message)
  return ((data ?? []) as PedidoPorRecibir[]).map((p) => ({ ...p, numero: Number(p.numero), renglones: Number(p.renglones) }))
}

export async function pedidoParaRecibir(pedidoId: string): Promise<RenglonPorRecibir[]> {
  const { data, error } = await supabase.rpc('pedido_para_recibir', { p_pedido_id: pedidoId })
  if (error) throw new Error(error.message)
  return ((data ?? []) as RenglonPorRecibir[]).map((r) => ({
    ...r,
    costo: n(r.costo),
    pedido: Number(r.pedido),
    recibido: Number(r.recibido),
    falta: Number(r.falta),
  }))
}

/** Ata la factura al pedido, o la desata con null. Sólo antes de recibir. */
export async function atarCompraAPedido(compraId: string, pedidoId: string | null) {
  const { error } = await supabase.rpc('atar_compra_a_pedido', { p_compra_id: compraId, p_pedido_id: pedidoId })
  if (error) throw new Error(error.message)
}

/** Cuánto falta de un renglón. Nulo en lo que no está en el catálogo: el sistema no lo recibe. */
export function faltaDe(l: Pick<RenglonPedido, 'producto_id' | 'cantidad' | 'recibido'>): number | null {
  if (!l.producto_id) return null
  return Math.max(0, Math.round((l.cantidad - (l.recibido ?? 0)) * 10000) / 10000)
}

/*
  A qué clientes avisarles después de recibir una factura: a los que
  pidieron algo de lo que llegó en ella. Si llegó sólo lo de otro, no:
  el cliente ya habría sido llamado, o todavía no hay nada para él.
*/
export function avisosPorLoQueLlego(avisar: AvisoAlCliente[], llegaron: string[]): AvisoAlCliente[] {
  const llego = new Set(llegaron)
  return avisar.filter((a) => a.productos.some((id) => llego.has(id)))
}

/** Lo que no vino: los renglones del catálogo con algo pendiente. */
export function loQueNoVino(p: Pick<PedidoCompleto, 'lineas'>): RenglonPedido[] {
  return p.lineas.filter((l) => (faltaDe(l) ?? 0) > 0)
}

/*
  ─────────────────────────────────────────────────────────────
  Lo que se calcula en la pantalla
  ─────────────────────────────────────────────────────────────
*/

/** «Pedido 000012», como en el papel. */
export function numeroDePedido(n: number): string {
  return String(n).padStart(6, '0')
}

/** La clave de una fila: el producto, o el renglón de orden que no está en el catálogo. */
export function claveDeFila(f: Pick<FilaParaPedido, 'producto_id' | 'lineas_orden'>): string {
  return f.producto_id ?? `orden:${f.lineas_orden[0] ?? ''}`
}

/** Cuántos bultos son, si se sabe cuántas trae el bulto. */
export function bultosDe(cantidad: number, unidadesPorBulto: number | null): number | null {
  if (!unidadesPorBulto || unidadesPorBulto <= 0) return null
  return Math.round((cantidad / unidadesPorBulto) * 100) / 100
}

export function textoDelMinimo(tipo: TipoMinimo, valor: number): string {
  if (tipo === 'monto') return moneda.format(valor)
  if (tipo === 'bultos') return `${numero.format(valor)} ${valor === 1 ? 'bulto' : 'bultos'}`
  return `${numero.format(valor)} kg`
}

interface ParaMinimo {
  cantidad: number
  costo: number | null
  peso_kg: number | null
  unidades_por_bulto: number | null
}

export interface AvanceDelMinimo {
  tipo: TipoMinimo
  minimo: number
  llevado: number
  falta: number
  llega: boolean
  /** Renglones que no se pudieron contar: sin costo, sin peso o sin bulto, según el mínimo. */
  sinDato: number
}

/*
  Cuánto lleva el pedido contra el mínimo del proveedor, en su unidad.

  En pesos, cantidad por costo —con IVA, como los costos—; en bultos,
  cantidad dividido lo que trae el bulto; en kilos, cantidad por el peso
  de una unidad. Lo que no tiene el dato no suma, y se cuenta aparte:
  «faltan 40 kg» con tres productos sin peso es un número que hay que
  leer con cuidado, y la pantalla lo dice.
*/
export function avanceDelMinimo(
  renglones: ParaMinimo[],
  tipo: TipoMinimo | null,
  valor: number | null,
): AvanceDelMinimo | null {
  if (!tipo || !valor || valor <= 0) return null

  let llevado = 0
  let sinDato = 0
  for (const r of renglones) {
    if (!(r.cantidad > 0)) continue
    const dato = tipo === 'monto' ? r.costo : tipo === 'kilos' ? r.peso_kg : r.unidades_por_bulto
    if (dato == null || dato <= 0) {
      sinDato++
      continue
    }
    llevado += tipo === 'bultos' ? r.cantidad / dato : r.cantidad * dato
  }

  llevado = Math.round(llevado * 100) / 100
  const falta = Math.max(0, Math.round((valor - llevado) * 100) / 100)
  return { tipo, minimo: valor, llevado, falta, llega: falta === 0, sinDato }
}

/** Lo que el pedido cuesta, al último costo de cada producto. Lo que no tiene costo no suma. */
export function totalDelPedido(renglones: Pick<ParaMinimo, 'cantidad' | 'costo'>[]): number {
  const total = renglones.reduce((s, r) => s + (r.cantidad > 0 && r.costo ? r.cantidad * r.costo : 0), 0)
  return Math.round(total * 100) / 100
}

/*
  De la pantalla al pedido: sólo lo que tiene cantidad. Los renglones de
  órdenes internas viajan con su fila, así que una fila que se dejó en
  cero no da por pedida la orden que la pidió.
*/
export function renglonesAPedir(filas: FilaParaPedido[], pedir: Record<string, number>): RenglonAPedir[] {
  return filas
    .filter((f) => (pedir[claveDeFila(f)] ?? 0) > 0)
    .map((f) => ({
      producto_id: f.producto_id,
      descripcion: f.descripcion,
      cantidad: pedir[claveDeFila(f)],
      costo: f.costo,
      lineas_orden: f.lineas_orden,
    }))
}

/** Lo que arranca escrito en «Pedir»: lo que pidieron las órdenes. */
export function pedirInicial(filas: FilaParaPedido[]): Record<string, number> {
  const pedir: Record<string, number> = {}
  for (const f of filas) if (f.en_ordenes > 0) pedir[claveDeFila(f)] = f.en_ordenes
  return pedir
}

/*
  El pedido como texto, para pegar en WhatsApp. Sin precios ni códigos
  internos: al proveedor le sirven la descripción y la cantidad, y los
  bultos si se saben. Los asteriscos son la negrita de WhatsApp.
*/
export function textoParaWhatsapp(p: PedidoCompleto, comercio: string): string {
  const fecha = new Date(`${p.fecha}T00:00:00`).toLocaleDateString('es-AR')
  const renglones = p.lineas.map((l) => {
    const bultos = bultosDe(l.cantidad, l.unidades_por_bulto)
    const enBultos = bultos != null ? ` (${numero.format(bultos)} ${bultos === 1 ? 'bulto' : 'bultos'})` : ''
    return `• ${numero.format(l.cantidad)} × ${l.descripcion}${enBultos}`
  })
  return [
    `*Pedido N° ${numeroDePedido(p.numero)} — ${comercio}*`,
    `Fecha: ${fecha}`,
    '',
    ...renglones,
    ...(p.observacion ? ['', `Observación: ${p.observacion}`] : []),
  ].join('\n')
}

/*
  ─────────────────────────────────────────────────────────────
  El borrador

  Un pedido se arma de a poco —«un poco de cada cosa»— y salir de la
  pantalla a mirar otra cosa no tiene que borrarlo. Se guarda en esta
  computadora, por proveedor, hasta que se hace el pedido. Si el
  navegador no deja guardar, se sigue sin borrador.
  ─────────────────────────────────────────────────────────────
*/

export interface Borrador {
  pedir: Record<string, number>
  observacion: string
}

const claveBorrador = (proveedorId: string) => `gross.pedido.${proveedorId}`

export function leerBorrador(proveedorId: string): Borrador | null {
  try {
    const crudo = localStorage.getItem(claveBorrador(proveedorId))
    if (!crudo) return null
    const b = JSON.parse(crudo) as Borrador
    return typeof b === 'object' && b && typeof b.pedir === 'object' ? b : null
  } catch {
    return null
  }
}

export function guardarBorrador(proveedorId: string, b: Borrador) {
  try {
    const vacio = !Object.values(b.pedir).some((v) => v > 0) && !b.observacion.trim()
    if (vacio) localStorage.removeItem(claveBorrador(proveedorId))
    else localStorage.setItem(claveBorrador(proveedorId), JSON.stringify(b))
  } catch {
    // Sin almacenamiento, el pedido se arma igual: sólo no sobrevive a salir de la pantalla.
  }
}

export function borrarBorrador(proveedorId: string) {
  try {
    localStorage.removeItem(claveBorrador(proveedorId))
  } catch {
    // Nada que hacer.
  }
}

/*
  Al volver al proveedor: lo que estaba en el borrador manda; lo que no
  estaba —una orden nueva, por ejemplo— arranca con lo que pidieron las
  órdenes.
*/
export function pedirConBorrador(filas: FilaParaPedido[], borrador: Borrador | null): Record<string, number> {
  const inicial = pedirInicial(filas)
  if (!borrador) return inicial
  const claves = new Set(filas.map(claveDeFila))
  const guardado = Object.fromEntries(Object.entries(borrador.pedir).filter(([k]) => claves.has(k)))
  return { ...inicial, ...guardado }
}
