import { supabase } from '@/lib/supabase'
import { diaDeObera, solicitarCae } from '@/lib/api/facturacion'

/*
  ─────────────────────────────────────────────────────────────
  Los pedidos de la tienda online

  El pedido entra solo, por la API, como una venta. Lo que se hace desde
  acá es lo que viene después: prepararlo, facturarlo, entregarlo, y
  —si no sale— cancelarlo o recibir la devolución.

  Todas las acciones son funciones de la base, y es a propósito: las
  reglas que importan —no entregar sin factura lo que se cobró, no
  facturar algo distinto de lo cobrado— las tiene que cumplir cualquier
  camino, no sólo esta pantalla.
  ─────────────────────────────────────────────────────────────
*/

export type EstadoPedido = 'recibido' | 'preparado' | 'entregado' | 'cancelado'
export type Vista = 'por_preparar' | 'entregados' | 'cancelados'

export interface LineaPedido {
  codigo: string
  descripcion: string
  cantidad: number
  precio: number
  importe: number
}

export interface PedidoWeb {
  id: string
  numero: string
  estado: EstadoPedido
  pagado_en_la_web: boolean
  referencia_pago: string | null
  entrega: 'retira' | 'envio'
  domicilio: string | null
  localidad: string | null
  contacto: string | null
  email: string | null
  revisar: string | null
  revisado_en: string | null
  recibido_en: string
  preparado_en: string | null
  entregado_en: string | null
  cancelado_en: string | null
  motivo_cancelacion: string | null
  venta_id: string
  venta_codigo: string
  venta_estado: string
  total: number
  cobrada_en: string | null
  observaciones: string | null
  cliente_nombre: string | null
  cliente_documento: string | null
  comprobante_id: string | null
  comprobante_estado: string | null
  comprobante: string | null
  remito_id: string | null
  a_reintegrar: number
  devuelto: number
  lineas: LineaPedido[]
}

export interface Reintegro {
  id: string
  motivo: 'cancelacion' | 'devolucion'
  importe: number
  creado_en: string
  hecho_en: string | null
  referencia: string | null
}

export const ETIQUETA_ESTADO: Record<EstadoPedido, string> = {
  recibido: 'Recibido',
  preparado: 'Preparado',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}

/*
  ─── HACE CUÁNTO ESPERA FACTURA ───

  Lo que el cliente pagó en la web tiene que facturarse el día del
  cobro: para ARCA, la factura corresponde a ese momento. En la práctica
  se hace el mismo día, así que la cuenta es por día y no por horas:
  un pedido que entró a las 23:50 y se factura a las 8 del día
  siguiente ya se pasó, aunque sean ocho horas.

  El día es el de Oberá: ver diaDeObera().
*/

export type EsperaFactura = { tipo: 'no_espera' } | { tipo: 'en_plazo' | 'vencida'; horas: number }

export function esperaFactura(p: PedidoWeb, ahora: Date = new Date()): EsperaFactura {
  // Sólo espera factura lo que se cobró en la web y todavía no la tiene.
  // Lo que se paga en el local lo factura la caja al cobrarlo.
  if (!p.pagado_en_la_web || p.estado === 'cancelado' || p.comprobante_id) return { tipo: 'no_espera' }
  const desde = new Date(p.cobrada_en ?? p.recibido_en)
  const horas = Math.max(0, Math.floor((ahora.getTime() - desde.getTime()) / (60 * 60 * 1000)))
  return { tipo: diaDeObera(desde) === diaDeObera(ahora) ? 'en_plazo' : 'vencida', horas }
}

export function textoEspera(e: EsperaFactura): string | null {
  if (e.tipo === 'no_espera') return null
  const hace = e.horas === 0 ? 'hace menos de una hora' : e.horas === 1 ? 'hace 1 hora' : `hace ${e.horas} horas`
  return e.tipo === 'vencida' ? `Sin factura desde otro día · ${hace}` : `Espera factura · ${hace}`
}

/*
  ─── QUÉ SE PUEDE HACER CON CADA PEDIDO ───

  La base es la que decide; esto sólo evita mostrar un botón que va a
  contestar que no. Si las dos cosas se desalinean, gana la base y el
  mensaje de ella llega a la pantalla.
*/
export interface Acciones {
  preparar: boolean
  facturar: boolean
  remito: boolean
  entregar: boolean
  cancelar: boolean
  devolver: boolean
}

export function accionesPosibles(p: PedidoWeb): Acciones {
  const abierto = p.estado === 'recibido' || p.estado === 'preparado'
  const facturado = p.comprobante_id !== null
  const autorizado = p.comprobante_estado === 'autorizado' || p.comprobante_estado === 'informado'
  return {
    preparar: p.estado === 'recibido',
    // Una factura esperando el CAE también se reintenta desde acá.
    facturar:
      p.pagado_en_la_web &&
      abierto &&
      (!facturado || p.comprobante_estado === 'pendiente' || p.comprobante_estado === 'rechazado'),
    remito: p.entrega === 'envio' && p.estado !== 'cancelado' && p.remito_id === null,
    entregar: abierto && (p.pagado_en_la_web ? facturado : p.venta_estado === 'cobrada'),
    cancelar: abierto,
    // Lo entregado vuelve por devolución, sobre la factura con CAE, y
    // mientras quede algo sin devolver.
    devolver: p.estado === 'entregado' && autorizado && p.devuelto < p.total,
  }
}

/*
  Si hay que confirmar la revisión antes de facturar. Un pedido marcado
  —precio raro, falta de stock, factura A— no se factura sin que alguien
  diga que lo miró, y la base guarda quién.
*/
export function pideRevision(p: PedidoWeb): boolean {
  return p.revisar !== null && p.revisado_en === null
}

// ─── Lo que se lee ───

export async function listarPedidos(vista: Vista): Promise<PedidoWeb[]> {
  const { data, error } = await supabase.rpc('pedidos_web', { p_vista: vista })
  if (error) throw new Error(error.message)
  return (data ?? []) as PedidoWeb[]
}

export async function reintegrosDe(pedidoId: string): Promise<Reintegro[]> {
  const { data, error } = await supabase.rpc('pedido_web_reintegros', { p_pedido_id: pedidoId })
  if (error) throw new Error(error.message)
  return (data ?? []) as Reintegro[]
}

export async function contarPedidosPendientes(): Promise<number> {
  const { data, error } = await supabase.rpc('pedidos_web_pendientes')
  if (error) throw new Error(error.message)
  return (data as number) ?? 0
}

// ─── Lo que se hace ───

export async function marcar(pedidoId: string, estado: 'preparado' | 'entregado'): Promise<void> {
  const { error } = await supabase.rpc('pedido_web_marcar', { p_pedido_id: pedidoId, p_estado: estado })
  if (error) throw new Error(error.message)
}

/*
  Facturar: la base arma la factura —y frena si difiere de lo cobrado—,
  y después se le pide el CAE a ARCA como en la caja.

  Si ARCA no contesta, la factura ya existe con su número y queda en la
  cola de Facturación; se reintenta desde acá o desde allá. Por eso el
  error de ARCA vuelve como «problema» y no como un error: el pedido sí
  quedó facturado, sólo falta la autorización.
*/
export async function facturar(
  pedidoId: string,
  loRevise: boolean,
): Promise<{ comprobanteId: string; cae: string | null; problema: string | null }> {
  const { data, error } = await supabase.rpc('pedido_web_facturar', {
    p_pedido_id: pedidoId,
    p_lo_revise: loRevise,
  })
  if (error) throw new Error(error.message)
  const comprobanteId = data as string

  try {
    const { cae } = await solicitarCae(comprobanteId)
    return { comprobanteId, cae, problema: null }
  } catch (e) {
    return { comprobanteId, cae: null, problema: e instanceof Error ? e.message : 'ARCA no respondió.' }
  }
}

/*
  Cancelar. Si ya estaba facturado sale una nota de crédito, y a esa se
  le pide el CAE igual que a cualquier devolución.
*/
export async function cancelar(
  pedidoId: string,
  motivo: string,
): Promise<{ notaCreditoId: string | null; problema: string | null }> {
  const { data, error } = await supabase.rpc('pedido_web_cancelar', { p_pedido_id: pedidoId, p_motivo: motivo })
  if (error) throw new Error(error.message)
  const notaCreditoId = (data as string | null) ?? null
  if (!notaCreditoId) return { notaCreditoId: null, problema: null }

  try {
    await solicitarCae(notaCreditoId)
    return { notaCreditoId, problema: null }
  } catch (e) {
    return { notaCreditoId, problema: e instanceof Error ? e.message : 'ARCA no respondió.' }
  }
}

export async function reintegroHecho(reintegroId: string, referencia: string): Promise<void> {
  const { error } = await supabase.rpc('pedido_web_reintegro_hecho', {
    p_reintegro_id: reintegroId,
    p_referencia: referencia,
  })
  if (error) throw new Error(error.message)
}
