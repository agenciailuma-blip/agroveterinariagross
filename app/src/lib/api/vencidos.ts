import { supabase } from '@/lib/supabase'

/*
  ─────────────────────────────────────────────────────────────
  Qué comprobantes vencieron, y de quién

  La pestaña *Vencidos* de Clientes (fase-03, punto 1, ⑤). La deuda por
  antigüedad, en Reportes, dice cuánto debe cada uno por tramo; esto es
  el detalle para levantar el teléfono: qué factura, cuándo venció y
  cuánto le queda.

  Lo que queda impago de cada comprobante lo calcula la base, con la
  misma imputación que el resto —los pagos van a lo más viejo—, así que
  el total de cada cliente es el mismo vencido que frena en la caja.
  ─────────────────────────────────────────────────────────────
*/

export interface ComprobanteVencido {
  movimiento_id: string
  cliente_id: string
  nombre: string
  telefono: string | null
  concepto: string | null
  ocurrido_en: string
  vencimiento: string
  importe: number
  pendiente: number
  dias: number
}

export interface ClienteConVencidos {
  cliente_id: string
  nombre: string
  telefono: string | null
  total: number
  /** Los días del comprobante más viejo. */
  dias: number
  comprobantes: ComprobanteVencido[]
}

export async function comprobantesVencidos(): Promise<ComprobanteVencido[]> {
  const { data, error } = await supabase
    .from('vista_comprobantes_vencidos')
    .select('movimiento_id, cliente_id, nombre, telefono, concepto, ocurrido_en, vencimiento, importe, pendiente, dias')
    .order('vencimiento')

  if (error) throw new Error(error.message)
  return (data ?? []).map((f) => ({
    ...f,
    importe: Number(f.importe),
    pendiente: Number(f.pendiente),
    dias: Number(f.dias),
  })) as ComprobanteVencido[]
}

/*
  Un cliente por fila, primero el que debe hace más tiempo: es al que hay
  que llamar antes. A igual atraso, el que debe más.
*/
export function agruparVencidos(filas: ComprobanteVencido[]): ClienteConVencidos[] {
  const porCliente = new Map<string, ClienteConVencidos>()

  for (const f of filas) {
    let c = porCliente.get(f.cliente_id)
    if (!c) {
      c = { cliente_id: f.cliente_id, nombre: f.nombre, telefono: f.telefono, total: 0, dias: 0, comprobantes: [] }
      porCliente.set(f.cliente_id, c)
    }
    c.total = Math.round((c.total + f.pendiente) * 100) / 100
    c.dias = Math.max(c.dias, f.dias)
    c.comprobantes.push(f)
  }

  for (const c of porCliente.values()) {
    c.comprobantes.sort((a, b) => b.dias - a.dias)
  }

  return [...porCliente.values()].sort((a, b) => b.dias - a.dias || b.total - a.total)
}
