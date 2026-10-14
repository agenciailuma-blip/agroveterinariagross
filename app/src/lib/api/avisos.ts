import { supabase } from '@/lib/supabase'

/*
  Los avisos de stock, en sus tres niveles.

  Gana el más específico: el del producto, si no el de su categoría, si
  no el general. La cascada la resuelve `vista_stock` —la misma que pinta
  los estados en Stock, Productos e Inicio—; acá sólo se leen y se
  cargan los avisos.

  El general y el de cada categoría se cargan desde la pestaña Avisos;
  el del producto, desde su ficha. Los tres piden el mismo permiso,
  `stock.configurar_umbrales`.
*/

export interface Aviso {
  bajo: number
  critico: number
}

export interface AvisoDeCategoria {
  categoria_id: string
  nombre: string
  productos: number
  /** null: la categoría no tiene aviso propio y sus productos usan el general. */
  aviso: Aviso | null
}

export interface ProductoConAviso {
  producto_id: string
  codigo: string
  nombre_interno: string
  aviso: Aviso
}

const numeroDe = (v: unknown, defecto: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : defecto
}

export async function leerAvisoGeneral(): Promise<Aviso> {
  const { data, error } = await supabase
    .from('configuracion')
    .select('clave, valor')
    .in('clave', ['stock.umbral_bajo_general', 'stock.umbral_critico_general'])
  if (error) throw new Error(error.message)
  const valor = (clave: string) => data?.find((f) => f.clave === clave)?.valor
  // Los mismos de siempre si no estuvieran cargados: los de la copia local.
  return { bajo: numeroDe(valor('stock.umbral_bajo_general'), 10), critico: numeroDe(valor('stock.umbral_critico_general'), 3) }
}

export async function definirAvisoGeneral(aviso: Aviso) {
  const { error } = await supabase.rpc('definir_umbral_general', { p_bajo: aviso.bajo, p_critico: aviso.critico })
  if (error) throw new Error(error.message)
}

export async function avisosPorCategoria(): Promise<AvisoDeCategoria[]> {
  const { data, error } = await supabase.rpc('avisos_por_categoria')
  if (error) throw new Error(error.message)
  type Fila = { categoria_id: string; nombre: string; productos: number; bajo: number | null; critico: number | null }
  return ((data ?? []) as Fila[]).map((f) => ({
    categoria_id: f.categoria_id,
    nombre: f.nombre,
    productos: Number(f.productos),
    aviso: f.bajo === null ? null : { bajo: Number(f.bajo), critico: Number(f.critico) },
  }))
}

/** Sin aviso, la categoría lo quita y sus productos vuelven al general. */
export async function definirAvisoCategoria(categoriaId: string, aviso: Aviso | null) {
  const { error } = await supabase.rpc('definir_umbral_categoria', {
    p_categoria_id: categoriaId,
    p_bajo: aviso?.bajo ?? null,
    p_critico: aviso?.critico ?? null,
  })
  if (error) {
    throw new Error(
      error.message.includes('umbral_critico_menor_o_igual')
        ? 'El nivel crítico tiene que ser menor o igual que el nivel bajo.'
        : error.message.includes('row-level security')
          ? 'No tenés permiso para cambiar los avisos de stock.'
          : error.message,
    )
  }
}

/*
  Los productos con un aviso propio: las excepciones. Se cambian en su
  ficha, pero conviene verlos juntos para saber cuáles no siguen a su
  categoría.
*/
export async function productosConAvisoPropio(): Promise<ProductoConAviso[]> {
  const { data, error } = await supabase
    .from('umbral_stock')
    .select('bajo, critico, producto:producto_id(id, codigo, nombre_interno, eliminado_en)')
    .eq('ambito', 'producto')
    .is('eliminado_en', null)
  if (error) throw new Error(error.message)
  type Fila = {
    bajo: number
    critico: number
    producto: { id: string; codigo: string; nombre_interno: string; eliminado_en: string | null } | null
  }
  return ((data ?? []) as unknown as Fila[])
    .filter((f) => f.producto && !f.producto.eliminado_en)
    .map((f) => ({
      producto_id: f.producto!.id,
      codigo: f.producto!.codigo,
      nombre_interno: f.producto!.nombre_interno,
      aviso: { bajo: Number(f.bajo), critico: Number(f.critico) },
    }))
    .sort((a, b) => a.nombre_interno.localeCompare(b.nombre_interno))
}

/** Lo que la pantalla deja guardar: dos números, ninguno negativo, el crítico no más alto que el bajo. */
export function problemaConAviso(bajo: string, critico: string): string | null {
  if (bajo.trim() === '' || critico.trim() === '') return 'Faltan los dos números.'
  const b = Number(bajo)
  const c = Number(critico)
  if (!Number.isFinite(b) || !Number.isFinite(c) || b < 0 || c < 0) return 'Tienen que ser números, cero o más.'
  if (c > b) return 'El crítico tiene que ser menor o igual que el bajo.'
  return null
}
