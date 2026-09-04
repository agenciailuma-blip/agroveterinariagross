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

/*
  Precios y medios de pago.

  Local primero, igual que los productos: el punto de venta los necesita
  para mostrar el total y no puede quedarse esperando al servidor. Al
  servidor se va sólo si todavía no hay copia local.
*/
export async function cargarPrecios() {
  const { hayDatosLocales, preciosLocal } = await import('@/lib/local/consultas')
  if (await hayDatosLocales()) return preciosLocal()

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

/*
  Alta y edición pasan por funciones de la base, no por un update
  directo, porque hay reglas que no se pueden dejar en manos de la
  pantalla: que haya una sola lista predeterminada, que no se dé de baja
  una lista que un medio de pago está usando, que no quede la caja sin
  ningún medio activo. Un navegador con la consola abierta se saltea
  cualquier validación que viva sólo acá.
*/
export interface ListaEditable {
  id?: string
  nombre: string
  ajuste_porcentaje: number
  es_predeterminada: boolean
  orden: number
}

export async function guardarLista(datos: ListaEditable): Promise<string> {
  const { data, error } = await supabase.rpc('guardar_lista_precio', {
    p_id: datos.id ?? null,
    p_nombre: datos.nombre,
    p_ajuste: datos.ajuste_porcentaje,
    p_es_predeterminada: datos.es_predeterminada,
    p_orden: datos.orden,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function darDeBajaLista(id: string) {
  const { error } = await supabase.rpc('dar_de_baja_lista_precio', { p_id: id })
  if (error) throw new Error(error.message)
}

export interface MedioEditable {
  id?: string
  nombre: string
  tipo: string
  lista_precio_id: string | null
  admite_cuotas: boolean
  cuotas_maximas: number
  afecta_caja: boolean
  orden: number
}

export async function guardarMedioPago(datos: MedioEditable): Promise<string> {
  const { data, error } = await supabase.rpc('guardar_medio_pago', {
    p_id: datos.id ?? null,
    p_nombre: datos.nombre,
    p_tipo: datos.tipo,
    p_lista_precio_id: datos.lista_precio_id,
    p_admite_cuotas: datos.admite_cuotas,
    p_cuotas_maximas: datos.cuotas_maximas,
    p_afecta_caja: datos.afecta_caja,
    p_orden: datos.orden,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function darDeBajaMedioPago(id: string) {
  const { error } = await supabase.rpc('dar_de_baja_medio_pago', { p_id: id })
  if (error) throw new Error(error.message)
}

/** Trae listas y medios del servidor, sin pasar por la copia local. */
export async function cargarPreciosServidor() {
  const [listas, medios] = await Promise.all([
    supabase.from('lista_precio').select('*').is('eliminado_en', null).order('orden'),
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
