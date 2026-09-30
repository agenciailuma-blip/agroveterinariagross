import { supabase } from '@/lib/supabase'

/*
  ─────────────────────────────────────────────────────────────
  El historial de costos

  Pedido de Lucas el 14/08: cuando se compra el mismo producto a varios
  proveedores, el costo se pisaba sin dejar rastro. Ahora cada mercadería
  recibida queda en la historia con su fecha, su factura y su proveedor.

  El costo es siempre con IVA, el mismo que quedó en el producto: una
  factura A y una B del mismo producto no pueden dar un 21% de diferencia
  que no existe. La cuenta la hacen las vistas de la base
  (vista_historial_costo, vista_costo_por_proveedor).
  ─────────────────────────────────────────────────────────────
*/

export interface CompraDeProducto {
  id: string
  proveedor_id: string
  proveedor: string
  compra_id: string
  fecha: string
  factura: string
  cantidad: number
  costo: number
  costo_previo: number | null
  proveedor_previo: string | null
  costo_previo_proveedor: number | null
}

export interface CostoPorProveedor {
  proveedor_id: string
  proveedor: string
  producto_id: string
  codigo: string
  producto: string
  ultima_fecha: string
  ultima_factura: string
  ultimo_costo: number
  costo_anterior: number | null
  variacion: number | null
  compras: number
  otro_costo: number | null
  otro_proveedor: string | null
  otro_fecha: string | null
}

const n = (x: unknown) => (x == null ? null : Number(x))

export async function historialDeProducto(productoId: string): Promise<CompraDeProducto[]> {
  const { data, error } = await supabase
    .from('vista_historial_costo')
    .select('*')
    .eq('producto_id', productoId)
    .order('fecha', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  return ((data ?? []) as CompraDeProducto[]).map((c) => ({
    ...c,
    cantidad: Number(c.cantidad),
    costo: Number(c.costo),
    costo_previo: n(c.costo_previo),
    costo_previo_proveedor: n(c.costo_previo_proveedor),
  }))
}

export async function costosPorProveedor(proveedorId: string | null): Promise<CostoPorProveedor[]> {
  let q = supabase.from('vista_costo_por_proveedor').select('*')
  if (proveedorId) q = q.eq('proveedor_id', proveedorId)
  const { data, error } = await q.order('ultima_fecha', { ascending: false }).limit(2000)
  if (error) throw new Error(error.message)
  return ((data ?? []) as CostoPorProveedor[]).map((c) => ({
    ...c,
    ultimo_costo: Number(c.ultimo_costo),
    costo_anterior: n(c.costo_anterior),
    variacion: n(c.variacion),
    compras: Number(c.compras),
    otro_costo: n(c.otro_costo),
  }))
}

/*
  ─────────────────────────────────────────────────────────────
  Lo que se calcula en la pantalla
  ─────────────────────────────────────────────────────────────
*/

/** Cuánto cambió un costo, en porcentaje, al centésimo. Nulo si no hay contra qué comparar. */
export function variacion(actual: number, anterior: number | null): number | null {
  if (anterior == null || anterior <= 0) return null
  return Math.round((actual / anterior - 1) * 10000) / 100
}

export function textoDeVariacion(v: number | null): string {
  if (v === null) return ''
  if (Math.abs(v) < 0.005) return 'igual'
  const t = Math.abs(v).toLocaleString('es-AR', { maximumFractionDigits: 1 })
  return v > 0 ? `+${t}%` : `−${t}%`
}

export type OrdenCostos = 'aumento' | 'reciente' | 'producto'

/*
  El orden del reporte. Por aumento, lo que más subió arriba —es la
  pregunta con la que se abre—; lo que no se puede comparar va al final,
  no al principio: una sola compra no subió ni bajó.
*/
export function ordenarCostos(filas: CostoPorProveedor[], orden: OrdenCostos): CostoPorProveedor[] {
  const copia = [...filas]
  if (orden === 'producto') return copia.sort((a, b) => a.producto.localeCompare(b.producto, 'es'))
  if (orden === 'reciente')
    return copia.sort((a, b) => b.ultima_fecha.localeCompare(a.ultima_fecha) || a.producto.localeCompare(b.producto, 'es'))
  return copia.sort((a, b) => {
    if (a.variacion === null && b.variacion === null) return a.producto.localeCompare(b.producto, 'es')
    if (a.variacion === null) return 1
    if (b.variacion === null) return -1
    return b.variacion - a.variacion
  })
}

/*
  Los puntos de la línea chica de la ficha, del más viejo al más nuevo,
  en un recuadro de ancho × alto. Lucas lo marcó como secundario —«lo
  primordial es el historial»—, así que es una línea y nada más: sin
  ejes ni números, que para eso está la tabla de al lado.
*/
export function puntosDeLaLinea(costos: number[], ancho: number, alto: number, margen = 2): string {
  if (costos.length < 2) return ''
  const min = Math.min(...costos)
  const max = Math.max(...costos)
  const rango = max - min || 1
  const paso = (ancho - margen * 2) / (costos.length - 1)
  return costos
    .map((c, i) => {
      const x = margen + i * paso
      // Todos iguales: una línea en el medio, no pegada al piso.
      const y = max === min ? alto / 2 : alto - margen - ((c - min) / rango) * (alto - margen * 2)
      return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`
    })
    .join(' ')
}
