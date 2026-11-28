import { supabase } from '@/lib/supabase'

/** Los números que se ven en el menú. Cada uno vale 0 para quien no tiene su permiso. */
export interface ContadoresDelMenu {
  /** Pedidos web por atender y reintegros por hacer. */
  pedidos: number
  /** Pedidos del vendedor de calle que el depósito no corroboró. */
  mayorista: number
  /** Órdenes de recibo que nadie aceptó todavía. */
  cobros: number
}

export const CLAVE_DE_LOS_CONTADORES = ['contadores-del-menu']

/** Una sola consulta para los tres (28/11): eran tres por minuto en cada PC. */
export async function contarPendientesDelMenu(): Promise<ContadoresDelMenu> {
  const { data, error } = await supabase.rpc('contadores_del_menu')
  if (error) throw new Error(error.message)
  const r = (data ?? {}) as Partial<ContadoresDelMenu>
  return { pedidos: r.pedidos ?? 0, mayorista: r.mayorista ?? 0, cobros: r.cobros ?? 0 }
}
