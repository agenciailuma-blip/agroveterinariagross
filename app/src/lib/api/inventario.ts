import { supabase } from '@/lib/supabase'

export interface TomaInventario {
  id: string
  nombre: string
  sector: string | null
  estado: 'abierto' | 'cerrado' | 'anulado'
  abierto_en: string
  cerrado_en: string | null
  observaciones: string | null
  abierto_por_nombre: string | null
  cerrado_por_nombre: string | null
  contados: number
  con_diferencia: number
  diferencia_valorizada: number
}

export interface LineaConteo {
  id: string
  producto_id: string
  codigo: string
  nombre_interno: string
  unidad_medida: string
  cantidad_sistema: number
  cantidad_contada: number
  diferencia: number
  contado_en: string
  contado_por_nombre: string | null
  costo: number | null
  diferencia_valorizada: number
  aplicado: boolean
}

export async function listarTomas(): Promise<TomaInventario[]> {
  const { data, error } = await supabase
    .from('vista_inventario')
    .select('*')
    .order('abierto_en', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  return (data ?? []) as TomaInventario[]
}

export async function abrirToma(nombre: string, sector: string | null, usuarioId: string) {
  const { data, error } = await supabase
    .from('inventario')
    .insert({ nombre, sector, abierto_por: usuarioId })
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(`No se pudo abrir la toma: ${error.message}`)
  return data.id
}

export async function lineasDeToma(inventarioId: string): Promise<LineaConteo[]> {
  const { data, error } = await supabase
    .from('vista_inventario_linea')
    .select('*')
    .eq('inventario_id', inventarioId)
    .order('contado_en', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as LineaConteo[]
}

/*
  Registra el conteo de un producto.

  Devuelve el saldo que el sistema tenía, que es lo que le permite a
  quien cuenta ver la diferencia en el momento — y volver a contar ahí
  mismo si el número no cierra, que es cuando todavía tiene la mercadería
  delante.
*/
export async function registrarConteo(
  inventarioId: string,
  productoId: string,
  cantidad: number,
): Promise<number> {
  const { data, error } = await supabase.rpc('registrar_conteo', {
    p_inventario_id: inventarioId,
    p_producto_id: productoId,
    p_cantidad: cantidad,
  })
  if (error) throw new Error(error.message)
  return Number(data)
}

export async function borrarConteo(lineaId: string) {
  const { error } = await supabase.from('inventario_linea').delete().eq('id', lineaId)
  if (error) throw new Error(error.message)
}

export async function cerrarToma(inventarioId: string): Promise<number> {
  const { data, error } = await supabase.rpc('cerrar_inventario', {
    p_inventario_id: inventarioId,
  })
  if (error) throw new Error(error.message)
  return Number(data)
}

export async function anularToma(inventarioId: string) {
  const { error } = await supabase
    .from('inventario')
    .update({ estado: 'anulado' })
    .eq('id', inventarioId)
  if (error) throw new Error(error.message)
}

export interface ProductoParaContar {
  producto_id: string
  codigo: string
  nombre_interno: string
  unidad_medida: string
  cantidad: number
}

/*
  Busca el producto a contar.

  Primero por código de barra exacto, porque el caso normal es el
  escaneo y un escaneo no puede devolver una lista: quien está contando
  tiene las manos ocupadas y el lector ya mandó el Enter.
*/
export async function buscarParaContar(texto: string): Promise<ProductoParaContar[]> {
  const limpio = texto.trim()
  if (!limpio) return []

  const { data: porBarra } = await supabase
    .from('producto_codigo_barra')
    .select('producto_id')
    .eq('codigo', limpio)
    .is('eliminado_en', null)
    .limit(1)

  let q = supabase
    .from('vista_stock')
    .select('producto_id, codigo, nombre_interno, unidad_medida, cantidad')
    .eq('activo', true)
    .limit(15)

  if (porBarra?.length) {
    q = q.eq('producto_id', porBarra[0].producto_id)
  } else {
    const patron = `%${limpio.replace(/[%_]/g, '')}%`
    q = q.or(`codigo.ilike.${patron},nombre_interno.ilike.${patron}`).order('nombre_interno')
  }

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as ProductoParaContar[]
}
