import { supabase } from '@/lib/supabase'

export interface ListaPrecio {
  id: string
  nombre: string
  descripcion: string | null
  ajuste_porcentaje: number
  es_predeterminada: boolean
  orden: number
  activo: boolean
}

export interface CuotaMedioPago {
  medio_pago_id: string
  cuotas: number
  recargo_porcentaje: number
  activo: boolean
}

export interface MedioPago {
  id: string
  nombre: string
  tipo: string
  lista_precio_id: string | null
  admite_cuotas: boolean
  cuotas_maximas: number
  afecta_caja: boolean
  orden: number
  activo: boolean
  medio_pago_cuota: CuotaMedioPago[]
}

export const TIPOS_MEDIO_PAGO: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta_debito: 'Tarjeta de débito',
  tarjeta_credito: 'Tarjeta de crédito',
  transferencia: 'Transferencia',
  cuenta_corriente: 'Cuenta corriente',
  otro: 'Otro',
}

export async function cargarPrecios() {
  const [listas, medios] = await Promise.all([
    supabase
      .from('lista_precio')
      .select('*')
      .is('eliminado_en', null)
      .order('orden'),
    supabase
      .from('medio_pago')
      .select('*, medio_pago_cuota(medio_pago_id, cuotas, recargo_porcentaje, activo)')
      .is('eliminado_en', null)
      .order('orden'),
  ])

  if (listas.error) throw new Error(listas.error.message)
  if (medios.error) throw new Error(medios.error.message)

  return {
    listas: (listas.data ?? []) as ListaPrecio[],
    medios: ((medios.data ?? []) as MedioPago[]).map((m) => ({
      ...m,
      medio_pago_cuota: [...(m.medio_pago_cuota ?? [])].sort((a, b) => a.cuotas - b.cuotas),
    })),
  }
}

export async function guardarLista(id: string, cambios: Partial<ListaPrecio>) {
  const { error } = await supabase.from('lista_precio').update(cambios).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function guardarMedioPago(id: string, cambios: Partial<MedioPago>) {
  const { medio_pago_cuota: _ignorado, ...campos } = cambios as Record<string, unknown>
  const { error } = await supabase.from('medio_pago').update(campos).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function guardarCuota(
  medioPagoId: string,
  cuotas: number,
  recargo: number,
) {
  const { error } = await supabase
    .from('medio_pago_cuota')
    .upsert(
      { medio_pago_id: medioPagoId, cuotas, recargo_porcentaje: recargo, activo: true },
      { onConflict: 'medio_pago_id,cuotas' },
    )
  if (error) throw new Error(error.message)
}

/*
  Calcula el precio con las mismas capas que aplica la base, para poder
  mostrar la vista previa al instante mientras se mueve el porcentaje.

  Es una copia deliberada de calcular_precio() de Postgres. Cualquier
  cambio en el orden de las capas hay que hacerlo en los dos lados, y es
  la misma lógica que después va a replicar la terminal para operar sin
  conexión. La versión de la base es la que manda.
*/
export function previsualizarPrecio(
  base: number,
  lista: ListaPrecio | undefined,
  recargoCuotas: number,
  descuentoCliente = 0,
) {
  const conLista = base * (1 + (lista?.ajuste_porcentaje ?? 0) / 100)
  const conCuotas = conLista * (1 + recargoCuotas / 100)
  return Math.round(conCuotas * (1 - descuentoCliente / 100) * 100) / 100
}
