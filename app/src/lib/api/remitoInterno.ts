import { supabase } from '@/lib/supabase'
import { solicitarCae } from '@/lib/api/facturacion'

/*
  ─────────────────────────────────────────────────────────────
  El remito interno y Pendientes de facturar

  Fase 03, punto 2. La mercadería sale con un remito interno: descuenta
  stock, lleva cliente, productos y cantidades, y el precio se pone
  después. Hasta que se factura queda en Pendientes de facturar y en la
  cuenta corriente del cliente, sin importe.

  Facturar junta uno o varios remitos del mismo cliente en una sola
  factura o comprobante interno a cuenta corriente, con su vencimiento.
  No vuelve a descontar stock: eso ya lo hizo el remito. Las reglas están
  en la base (supabase/migrations/20261029230000_el_remito_interno.sql).
  ─────────────────────────────────────────────────────────────
*/

export interface RemitoPorFacturar {
  id: string
  serie: string
  numero: number
  fecha: string
  cliente_id: string
  cliente: string
  observaciones: string | null
  /** Lo que sumaban los precios de lista al salir. No es lo que se cobra. */
  total_sugerido: number
  unidades: number
  dias: number
}

/** La marca sólo cuenta con cuenta corriente: el remito interno se factura a la cuenta. */
export function esPrecioAConvenir(c: { cuenta_corriente: boolean; precio_a_convenir?: boolean } | null | undefined): boolean {
  return !!c?.cuenta_corriente && !!c.precio_a_convenir
}

export async function remitosPorFacturar(clienteId?: string): Promise<RemitoPorFacturar[]> {
  let consulta = supabase
    .from('vista_remito_por_facturar')
    .select('id, serie, numero, fecha, cliente_id, cliente, observaciones, total_sugerido, unidades, dias')
    .order('fecha')
    .order('numero')
  if (clienteId) consulta = consulta.eq('cliente_id', clienteId)
  const { data, error } = await consulta
  if (error) throw new Error(error.message)
  return ((data ?? []) as RemitoPorFacturar[]).map((r) => ({
    ...r,
    total_sugerido: Number(r.total_sugerido),
    unidades: Number(r.unidades),
    dias: Number(r.dias),
  }))
}

/** Los remitos de un mismo cliente, juntos, el que espera hace más primero. */
export function agruparPorCliente(
  remitos: RemitoPorFacturar[],
): { cliente_id: string; cliente: string; remitos: RemitoPorFacturar[] }[] {
  const grupos = new Map<string, { cliente_id: string; cliente: string; remitos: RemitoPorFacturar[] }>()
  for (const r of remitos) {
    const g = grupos.get(r.cliente_id) ?? { cliente_id: r.cliente_id, cliente: r.cliente, remitos: [] }
    g.remitos.push(r)
    grupos.set(r.cliente_id, g)
  }
  const mayor = (g: { remitos: RemitoPorFacturar[] }) => Math.max(...g.remitos.map((r) => r.dias))
  return [...grupos.values()].sort((a, b) => mayor(b) - mayor(a) || a.cliente.localeCompare(b.cliente))
}

export interface LineaDeRemito {
  remito_id: string
  /** Fecha y número del remito, para saber cuál es el más nuevo. */
  remito_orden: string
  producto_id: string
  codigo: string
  descripcion: string
  cantidad: number
  precio_unitario: number
}

export async function lineasDeRemitos(remitoIds: string[]): Promise<LineaDeRemito[]> {
  if (!remitoIds.length) return []
  const { data, error } = await supabase
    .from('comprobante_no_fiscal_linea')
    .select('comprobante_no_fiscal_id, producto_id, codigo_producto, descripcion, cantidad, precio_unitario, remito:comprobante_no_fiscal_id(fecha, numero)')
    .in('comprobante_no_fiscal_id', remitoIds)
    .order('orden')
  if (error) throw new Error(error.message)

  type Fila = {
    comprobante_no_fiscal_id: string
    producto_id: string
    codigo_producto: string
    descripcion: string
    cantidad: number
    precio_unitario: number
    remito: { fecha: string; numero: number } | { fecha: string; numero: number }[] | null
  }
  return ((data ?? []) as unknown as Fila[]).map((f) => {
    const remito = Array.isArray(f.remito) ? f.remito[0] : f.remito
    return {
      remito_id: f.comprobante_no_fiscal_id,
      remito_orden: remito ? `${remito.fecha}|${String(remito.numero).padStart(8, '0')}` : '',
      producto_id: f.producto_id,
      codigo: f.codigo_producto,
      descripcion: f.descripcion,
      cantidad: Number(f.cantidad),
      precio_unitario: Number(f.precio_unitario),
    }
  })
}

export interface ProductoAFacturar {
  producto_id: string
  codigo: string
  descripcion: string
  cantidad: number
  /** El precio de lista del remito más nuevo. Se ofrece; el que manda es el que se escribe. */
  sugerido: number
}

/*
  Un producto, un precio: si el mismo producto viene en varios remitos se
  suman las cantidades. El precio que se ofrece es el del remito más
  nuevo, igual que en la base.
*/
export function agruparLineas(lineas: LineaDeRemito[]): ProductoAFacturar[] {
  const porProducto = new Map<string, ProductoAFacturar & { orden: string }>()
  for (const l of lineas) {
    const ya = porProducto.get(l.producto_id)
    if (!ya) {
      porProducto.set(l.producto_id, {
        producto_id: l.producto_id,
        codigo: l.codigo,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        sugerido: l.precio_unitario,
        orden: l.remito_orden,
      })
      continue
    }
    ya.cantidad += l.cantidad
    if (l.remito_orden > ya.orden) {
      ya.sugerido = l.precio_unitario
      ya.orden = l.remito_orden
    }
  }
  return [...porProducto.values()]
    .map(({ orden: _orden, ...p }) => p)
    .sort((a, b) => a.descripcion.localeCompare(b.descripcion))
}

/*
  Factura o comprobante interno. Con factura, la base deja el comprobante
  armado y el CAE se pide acá, como en la caja: si ARCA no responde, la
  venta igual queda y la factura se reintenta desde Facturación.
*/
export async function facturarRemitosInternos(
  remitoIds: string[],
  precios: Record<string, number>,
  documentacion: 'fiscal' | 'no_fiscal',
): Promise<{ ventaId: string; comprobanteId: string | null; cae: string | null; problema: string | null }> {
  const { data, error } = await supabase.rpc('facturar_remitos_internos', {
    p_remito_ids: remitoIds,
    p_precios: precios,
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
