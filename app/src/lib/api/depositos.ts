import { supabase } from '@/lib/supabase'

/*
  Los depósitos.

  Hoy Gross tiene uno y en breve son dos: abre el segundo local. Lo que
  se puede hacer desde acá es lo de una sección de catálogo —dar de alta,
  renombrar, elegir cuál es el principal, dar de baja—, no mover
  mercadería entre ellos: las transferencias y el saldo separado por
  depósito son el módulo de V1-B.

  Igual sirve desde el primer día, porque **cada movimiento de stock ya
  guarda en qué depósito ocurrió**. Cuando exista el módulo, el histórico
  ya va a estar bien repartido en vez de haber que inventarlo.
*/

export interface Deposito {
  id: string
  nombre: string
  es_principal: boolean
  activo: boolean
}

export async function listarDepositos(): Promise<Deposito[]> {
  const { data, error } = await supabase
    .from('deposito')
    .select('id, nombre, es_principal, activo')
    .is('eliminado_en', null)
    // El principal primero: es el que contesta "¿dónde está la
    // mercadería si nadie dijo nada?", y esa es la pregunta que más se
    // hace mirando esta lista.
    .order('es_principal', { ascending: false })
    .order('nombre')

  if (error) throw new Error(error.message)
  return (data ?? []) as Deposito[]
}

export async function crearDeposito(nombre: string): Promise<void> {
  const { error } = await supabase.from('deposito').insert({ nombre: nombre.trim() })
  if (error) throw new Error(error.message)
}

export async function renombrarDeposito(id: string, nombre: string): Promise<void> {
  const { error } = await supabase.from('deposito').update({ nombre: nombre.trim() }).eq('id', id)
  if (error) throw new Error(error.message)
}

/*
  Elegir el principal.

  Va por una función de la base y no por dos guardados: apagar el
  anterior y prender el nuevo tienen que pasar juntos. Si quedara sin
  principal, el próximo movimiento de stock —o sea, la próxima venta—
  fallaría.
*/
export async function marcarPrincipal(id: string): Promise<void> {
  const { error } = await supabase.rpc('marcar_deposito_principal', { p_deposito_id: id })
  if (error) throw new Error(error.message)
}

/*
  Dar de baja es desactivar, no borrar. Los movimientos viejos siguen
  apuntando ahí, y un depósito que desaparece dejaría un año de historial
  sin poder decir dónde pasó cada cosa.
*/
export async function activarDeposito(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from('deposito').update({ activo }).eq('id', id)
  if (error) throw new Error(error.message)
}
