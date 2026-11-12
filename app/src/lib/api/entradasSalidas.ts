import { supabase } from '@/lib/supabase'

/*
  Entradas y salidas de stock: mercadería que aparece o desaparece sin
  compra ni venta, con su motivo.

  La pidió Lucas el 12/11: la bolsa que se rompe o se moja, la que se usa
  en el local, la que se abre para fraccionar a mano y la que vuelve de
  un cliente en un cambio. Antes sólo se corregía con una toma de
  inventario, y el porqué no quedaba en ningún lado.

  Mismo armado que las transferencias: se arma la lista, se confirma una
  vez, queda numerada y no se borra: se anula con motivo.
*/

export type Sentido = 'entrada' | 'salida'

export type Motivo = 'rotura' | 'vencimiento' | 'uso_interno' | 'fraccionamiento' | 'cambio' | 'sobrante' | 'otro'

/*
  Los motivos de cada sentido, en el orden en que se ofrecen. Los
  nombres son los mismos que escribe la base en el historial
  (app.nombre_motivo_stock): si se cambia uno, se cambian los dos.
*/
export const MOTIVOS: Record<Sentido, { valor: Motivo; nombre: string }[]> = {
  salida: [
    { valor: 'rotura', nombre: 'Rotura o pérdida' },
    { valor: 'uso_interno', nombre: 'Uso interno' },
    { valor: 'fraccionamiento', nombre: 'Se abrió para fraccionar' },
    { valor: 'vencimiento', nombre: 'Vencimiento' },
    { valor: 'otro', nombre: 'Otro' },
  ],
  entrada: [
    { valor: 'cambio', nombre: 'Cambio de un cliente' },
    { valor: 'sobrante', nombre: 'Sobrante' },
    { valor: 'otro', nombre: 'Otro' },
  ],
}

export function motivoValido(sentido: Sentido, motivo: Motivo | null): boolean {
  return !!motivo && MOTIVOS[sentido].some((m) => m.valor === motivo)
}

export interface EntradaSalida {
  id: string
  numero: number
  sentido: Sentido
  motivo: Motivo
  motivo_nombre: string
  ocurrido_en: string
  deposito_id: string
  deposito: string
  observacion: string | null
  usuario_nombre: string | null
  anulada_en: string | null
  anulada_por_nombre: string | null
  motivo_anulacion: string | null
  productos: number
  unidades: number
}

export interface LineaRegistrada {
  id: string
  producto_id: string
  codigo: string
  nombre_interno: string
  unidad_medida: string
  cantidad: number
}

export async function listarEntradasSalidas(): Promise<EntradaSalida[]> {
  const { data, error } = await supabase
    .from('vista_entrada_salida')
    .select('*')
    .order('numero', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  return ((data ?? []) as EntradaSalida[]).map((e) => ({
    ...e,
    productos: Number(e.productos),
    unidades: Number(e.unidades),
  }))
}

export async function lineasDeEntradaSalida(id: string): Promise<LineaRegistrada[]> {
  const { data, error } = await supabase
    .from('vista_entrada_salida_linea')
    .select('id, producto_id, codigo, nombre_interno, unidad_medida, cantidad')
    .eq('entrada_salida_id', id)
    .order('nombre_interno')
  if (error) throw new Error(error.message)
  return ((data ?? []) as LineaRegistrada[]).map((l) => ({ ...l, cantidad: Number(l.cantidad) }))
}

/** Un producto a elegir, con cuánto hay hoy en el depósito. */
export interface ProductoParaAjustar {
  producto_id: string
  codigo: string
  nombre_interno: string
  unidad_medida: string
  hay: number
}

/*
  Busca el producto. Primero por código de barra exacto —lo normal es
  pasar el lector por la bolsa rota—; si no, por código o nombre.
*/
export async function buscarParaAjustar(texto: string, depositoId: string): Promise<ProductoParaAjustar[]> {
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
    .select('producto_id, codigo, nombre_interno, unidad_medida, cantidad')
    .eq('deposito_id', depositoId)
    .limit(30)

  if (porBarra?.length) {
    q = q.eq('producto_id', porBarra[0].producto_id)
  } else {
    const patron = `%${limpio.replace(/[%_]/g, '')}%`
    q = q.or(`codigo.ilike.${patron},nombre_interno.ilike.${patron}`).order('nombre_interno')
  }

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return ((data ?? []) as (Omit<ProductoParaAjustar, 'hay'> & { cantidad: number })[]).map((f) => ({
    producto_id: f.producto_id,
    codigo: f.codigo,
    nombre_interno: f.nombre_interno,
    unidad_medida: f.unidad_medida,
    hay: Number(f.cantidad),
  }))
}

export interface LineaAAjustar {
  producto_id: string
  codigo: string
  nombre_interno: string
  unidad_medida: string
  hay: number
  cantidad: string
}

/*
  Lo que impide confirmar, dicho mientras se arma. Son las mismas reglas
  que controla la base.

  Que alcance el stock NO es una de ellas: la bolsa rota está en la mano
  aunque el sistema diga que no hay. La pantalla lo pregunta antes.
*/
export function problemaDelAjuste(
  sentido: Sentido,
  motivo: Motivo | null,
  observacion: string,
  lineas: Pick<LineaAAjustar, 'nombre_interno' | 'cantidad'>[],
): string | null {
  if (!motivoValido(sentido, motivo)) return 'Elegí el motivo.'
  if (motivo === 'otro' && !observacion.trim()) return 'Con «Otro», escribí en la observación qué pasó.'
  if (!lineas.length) return 'Todavía no agregaste ningún producto.'
  const sinCantidad = lineas.find((l) => !(Number(l.cantidad) > 0))
  if (sinCantidad) return `Falta la cantidad de ${sinCantidad.nombre_interno}.`
  return null
}

/** Cuánto queda después. En una salida puede dar negativo. */
export function quedaDespues(sentido: Sentido, l: Pick<LineaAAjustar, 'hay' | 'cantidad'>): number {
  const c = Number(l.cantidad) || 0
  return sentido === 'salida' ? l.hay - c : l.hay + c
}

/*
  Registrar. El id se genera acá: si la respuesta se pierde y se vuelve a
  apretar, la base reconoce la misma y no descuenta dos veces.
*/
export async function registrarEntradaSalida(e: {
  id: string
  sentido: Sentido
  motivo: Motivo
  depositoId: string | null
  lineas: { producto_id: string; cantidad: number }[]
  observacion: string
}): Promise<number> {
  const { data, error } = await supabase.rpc('registrar_entrada_salida', {
    p_id: e.id,
    p_sentido: e.sentido,
    p_motivo: e.motivo,
    p_deposito_id: e.depositoId,
    p_lineas: e.lineas,
    p_observacion: e.observacion.trim() || null,
  })
  if (error) throw new Error(error.message)
  return Number(data)
}

/** La anulación escribe los movimientos al revés. No borra nada. */
export async function anularEntradaSalida(id: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('anular_entrada_salida', { p_id: id, p_motivo: motivo })
  if (error) throw new Error(error.message)
}
