import { supabase } from '@/lib/supabase'

/*
  Los depósitos, y la mercadería que pasa de uno a otro.

  Hoy Gross tiene uno y en breve son dos: abre el segundo local. Cada
  movimiento de stock guarda en qué depósito ocurrió, y la base lleva el
  saldo de cada producto en cada uno. El total no cambia al transferir:
  sale de un lado y entra en el otro.

  Qué depósito toca cada operación lo decide la base, no la pantalla: la
  venta, el de la máquina; lo que vuelve, el de donde salió. Las
  pantallas sólo preguntan cuando hay algo que elegir: de dónde a dónde
  se transfiere, qué depósito se cuenta y dónde entra lo que llega.
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

  La base no deja dar de baja uno con mercadería ni uno del que vende
  alguna máquina, y el mensaje dice qué hacer primero.
*/
export async function activarDeposito(id: string, activo: boolean): Promise<void> {
  const { error } = await supabase.from('deposito').update({ activo }).eq('id', id)
  if (error) throw new Error(error.message)
}

/*
  El depósito que se propone en esta PC: el de su terminal, y si no
  tiene uno propio, el principal. Es sólo la propuesta: donde hay que
  elegir, se puede cambiar.
*/
export function depositoPropuesto(
  activos: Deposito[],
  depositoDeLaTerminal: string | null | undefined,
): string | null {
  const propio = activos.find((d) => d.id === depositoDeLaTerminal)
  return (propio ?? activos.find((d) => d.es_principal) ?? activos[0])?.id ?? null
}

/*
  Cuánto hay de cada producto en cada depósito.

  Va por una función y no por un filtro: la pantalla de Stock pide hasta
  quinientos productos, y quinientos identificadores no entran en una
  dirección web.
*/
export async function stockPorDeposito(productoIds: string[]): Promise<Map<string, Map<string, number>>> {
  const porProducto = new Map<string, Map<string, number>>()
  if (!productoIds.length) return porProducto

  const { data, error } = await supabase.rpc('stock_por_deposito', { p_producto_ids: productoIds })
  if (error) throw new Error(error.message)

  for (const f of (data ?? []) as { producto_id: string; deposito_id: string; cantidad: number }[]) {
    const fila = porProducto.get(f.producto_id) ?? new Map<string, number>()
    fila.set(f.deposito_id, Number(f.cantidad))
    porProducto.set(f.producto_id, fila)
  }
  return porProducto
}

// ───────────────────────────────────────────────────────────────
// Transferencias
// ───────────────────────────────────────────────────────────────

export interface Transferencia {
  id: string
  numero: number
  ocurrido_en: string
  origen_id: string
  origen: string
  destino_id: string
  destino: string
  observacion: string | null
  usuario_nombre: string | null
  anulada_en: string | null
  anulada_por_nombre: string | null
  motivo_anulacion: string | null
  productos: number
  unidades: number
}

export interface LineaTransferida {
  id: string
  producto_id: string
  codigo: string
  nombre_interno: string
  unidad_medida: string
  cantidad: number
}

export async function listarTransferencias(): Promise<Transferencia[]> {
  const { data, error } = await supabase
    .from('vista_transferencia')
    .select('*')
    .order('numero', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  return ((data ?? []) as Transferencia[]).map((t) => ({
    ...t,
    productos: Number(t.productos),
    unidades: Number(t.unidades),
  }))
}

export async function lineasDeTransferencia(transferenciaId: string): Promise<LineaTransferida[]> {
  const { data, error } = await supabase
    .from('vista_transferencia_linea')
    .select('id, producto_id, codigo, nombre_interno, unidad_medida, cantidad')
    .eq('transferencia_id', transferenciaId)
    .order('nombre_interno')
  if (error) throw new Error(error.message)
  return ((data ?? []) as LineaTransferida[]).map((l) => ({ ...l, cantidad: Number(l.cantidad) }))
}

/** Un producto a elegir, con cuánto hay en cada punta. */
export interface ProductoParaTransferir {
  producto_id: string
  codigo: string
  nombre_interno: string
  unidad_medida: string
  en_origen: number
  en_destino: number
}

/*
  Busca el producto a transferir.

  Primero por código de barra exacto, porque lo normal es pasar el
  lector por la bolsa que se va a llevar; si no, por código o nombre.
  Trae lo que hay en el origen y en el destino, que es lo que se mira
  para decidir cuánto llevar.
*/
export async function buscarParaTransferir(
  texto: string,
  origenId: string,
  destinoId: string,
): Promise<ProductoParaTransferir[]> {
  const limpio = texto.trim()
  if (!limpio) return []

  const { data: porBarra } = await supabase
    .from('producto_codigo_barra')
    .select('producto_id')
    .eq('codigo', limpio)
    .is('eliminado_en', null)
    .limit(1)

  let q = supabase
    .from('vista_stock_por_deposito')
    .select('producto_id, codigo, nombre_interno, unidad_medida, deposito_id, cantidad')
    .in('deposito_id', [origenId, destinoId])
    .limit(30)

  if (porBarra?.length) {
    q = q.eq('producto_id', porBarra[0].producto_id)
  } else {
    const patron = `%${limpio.replace(/[%_]/g, '')}%`
    q = q.or(`codigo.ilike.${patron},nombre_interno.ilike.${patron}`).order('nombre_interno')
  }

  const { data, error } = await q
  if (error) throw new Error(error.message)

  // Viene un renglón por producto y depósito: se juntan los dos.
  const porProducto = new Map<string, ProductoParaTransferir>()
  for (const f of (data ?? []) as {
    producto_id: string
    codigo: string
    nombre_interno: string
    unidad_medida: string
    deposito_id: string
    cantidad: number
  }[]) {
    const p = porProducto.get(f.producto_id) ?? {
      producto_id: f.producto_id,
      codigo: f.codigo,
      nombre_interno: f.nombre_interno,
      unidad_medida: f.unidad_medida,
      en_origen: 0,
      en_destino: 0,
    }
    if (f.deposito_id === origenId) p.en_origen = Number(f.cantidad)
    if (f.deposito_id === destinoId) p.en_destino = Number(f.cantidad)
    porProducto.set(f.producto_id, p)
  }
  return [...porProducto.values()]
}

export interface LineaATransferir {
  producto_id: string
  codigo: string
  nombre_interno: string
  unidad_medida: string
  en_origen: number
  cantidad: string
}

/*
  Lo que impide confirmar, dicho antes de mandar.

  Son las mismas reglas que controla la base; acá se dicen mientras se
  arma, con la mercadería todavía en la mano, y no al final.

  Que en el origen alcance NO es una de ellas, a propósito: el stock de
  los primeros días puede estar mal, y la bolsa que está en el estante
  se tiene que poder llevar. La pantalla lo muestra en rojo.
*/
export function problemaDeLaTransferencia(
  origenId: string | null,
  destinoId: string | null,
  lineas: LineaATransferir[],
): string | null {
  if (!origenId || !destinoId) return 'Elegí de qué depósito sale y a cuál va.'
  if (origenId === destinoId) return 'El origen y el destino son el mismo depósito.'
  if (!lineas.length) return 'Todavía no agregaste ningún producto.'
  const sinCantidad = lineas.find((l) => !(Number(l.cantidad) > 0))
  if (sinCantidad) return `Falta la cantidad de ${sinCantidad.nombre_interno}.`
  return null
}

/** Lo que queda en el origen después de llevarse esto. Puede ser negativo. */
export function quedaEnOrigen(l: Pick<LineaATransferir, 'en_origen' | 'cantidad'>): number {
  return l.en_origen - (Number(l.cantidad) || 0)
}

/*
  Registrar la transferencia.

  El id se genera acá: si la respuesta se pierde y se vuelve a apretar,
  la base reconoce la misma transferencia y no mueve la mercadería dos
  veces.
*/
export async function registrarTransferencia(t: {
  id: string
  origenId: string
  destinoId: string
  lineas: { producto_id: string; cantidad: number }[]
  observacion: string
}): Promise<number> {
  const { data, error } = await supabase.rpc('registrar_transferencia', {
    p_id: t.id,
    p_origen_id: t.origenId,
    p_destino_id: t.destinoId,
    p_lineas: t.lineas,
    p_observacion: t.observacion.trim() || null,
  })
  if (error) throw new Error(error.message)
  return Number(data)
}

/** La anulación devuelve todo al origen. No borra nada. */
export async function anularTransferencia(id: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('anular_transferencia', { p_id: id, p_motivo: motivo })
  if (error) throw new Error(error.message)
}
