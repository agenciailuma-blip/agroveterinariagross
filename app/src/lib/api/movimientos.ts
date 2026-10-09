import { supabase } from '@/lib/supabase'

/*
  El historial de movimientos de un producto: cómo llegó el stock al
  número que muestra. Lo promete el alcance (§4) y el punto 2 de
  terminado —«el movimiento queda con usuario y hora»—.

  El libro guarda todo desde agosto; esto sólo lo lee. El saldo después
  de cada movimiento lo calcula la base sumando el libro en el orden en
  que pasaron las cosas, no en el que llegaron: una venta hecha sin
  internet va a la hora en que se hizo.
*/

export interface Movimiento {
  id: string
  ocurrido_en: string
  tipo: string
  cantidad: number
  saldo: number
  motivo: string | null
  /** Quién lo registró. */
  usuario: string | null
  /** Quién vendió, cuando no es el mismo que cobró. */
  vendedor: string | null
  terminal: string | null
  deposito: string | null
  registrado_offline: boolean
}

export async function movimientosDeProducto(
  productoId: string,
  limite: number,
  depositoId: string | null = null,
): Promise<{ filas: Movimiento[]; total: number }> {
  const { data, error } = await supabase.rpc('movimientos_de_producto', {
    p_producto_id: productoId,
    p_deposito_id: depositoId,
    p_limite: limite,
  })
  if (error) throw new Error(error.message)
  type Fila = Movimiento & { total: number }
  const filas = (data ?? []) as Fila[]
  return {
    filas: filas.map(({ total: _total, ...f }) => ({ ...f, cantidad: Number(f.cantidad), saldo: Number(f.saldo) })),
    total: filas.length ? Number(filas[0].total) : 0,
  }
}

/** Cómo se llama cada tipo de movimiento en pantalla. */
const NOMBRES: Record<string, string> = {
  carga_inicial: 'Carga inicial',
  compra: 'Compra',
  venta: 'Venta',
  devolucion: 'Devolución',
  ajuste: 'Ajuste',
  inventario: 'Toma de inventario',
  apertura: 'Se abrió para vender suelto',
  fraccionamiento: 'Salió de abrir un envase',
  merma: 'Merma',
  remito: 'Remito',
  retorno_remito: 'Volvió del reparto',
  transferencia: 'Transferencia',
}

export function nombreDelMovimiento(tipo: string): string {
  return NOMBRES[tipo] ?? tipo
}

/*
  Quién y dónde, en una línea: «Ana (vendió Juan) · Caja 1 · Local 2».
  El depósito sólo con más de uno: con uno solo es ruido.
*/
export function quienYDonde(m: Movimiento, conDeposito: boolean): string {
  const quien = m.usuario ? (m.vendedor ? `${m.usuario} (vendió ${m.vendedor})` : m.usuario) : m.vendedor
  return [quien, m.terminal, conDeposito ? m.deposito : null].filter(Boolean).join(' · ')
}
