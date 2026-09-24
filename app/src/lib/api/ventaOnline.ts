import { supabase } from '@/lib/supabase'
import { moneda, numero } from '@/lib/tipos'

/*
  ─────────────────────────────────────────────────────────────
  «Vender online»: qué sale a la tienda de Zubu

  Nada sale hasta que alguien lo prende. Prendido, sale sólo si además
  tiene nombre público y precio (y no es fitosanitario, hasta que Gross
  lo decida). Esas reglas NO están acá: están en la base, en el mismo
  lugar que usa la API de la tienda. Esta pantalla sólo muestra lo que
  la base dice, para que la ficha nunca diga «se vende» de un producto
  que la tienda no ve.
  ─────────────────────────────────────────────────────────────
*/

export interface EstadoEnTienda {
  producto_id: string
  vender_online: boolean
  /** El colchón puesto a este producto. null = usa el del canal. */
  colchon_propio: number | null
  colchon_canal: number
  /** Lo que ve la tienda: lo que hay menos el colchón. */
  stock: number
  /** El precio con la lista de la tienda. */
  precio: number
  /** Por qué no sale, en palabras. null = sale. */
  motivo: string | null
}

function aNumero(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v)
}

export async function estadoEnTienda(ids: string[]): Promise<Map<string, EstadoEnTienda>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await supabase.rpc('estado_en_tienda', { p_productos: ids })
  if (error) throw new Error(error.message)
  const filas = (data ?? []) as Record<string, unknown>[]
  return new Map(
    filas.map((f) => [
      f.producto_id as string,
      {
        producto_id: f.producto_id as string,
        vender_online: !!f.vender_online,
        colchon_propio: aNumero(f.colchon_propio),
        colchon_canal: Number(f.colchon_canal ?? 0),
        stock: Number(f.stock ?? 0),
        precio: Number(f.precio ?? 0),
        motivo: (f.motivo as string | null) ?? null,
      },
    ]),
  )
}

/** Devuelve cuántos cambiaron de verdad: prender lo ya prendido no cuenta. */
export async function definirVentaOnline(ids: string[], vender: boolean): Promise<number> {
  const { data, error } = await supabase.rpc('definir_venta_online', {
    p_productos: ids,
    p_vender: vender,
  })
  if (error) throw new Error(error.message)
  return Number(data)
}

/*
  Una categoría o una marca entera. La hace la base y no esta pantalla,
  porque la lista muestra de a 100: «marcar todos» acá tomaría sólo los
  que se ven.
*/
export async function definirVentaOnlinePorClasificacion(
  categoriaId: string | null,
  marcaId: string | null,
  vender: boolean,
): Promise<{ cambiados: number; sinSalir: number }> {
  const { data, error } = await supabase.rpc('definir_venta_online_por_clasificacion', {
    p_categoria_id: categoriaId,
    p_marca_id: marcaId,
    p_vender: vender,
  })
  if (error) throw new Error(error.message)
  const r = (data ?? {}) as { cambiados?: number; sin_salir?: number }
  return { cambiados: Number(r.cambiados ?? 0), sinSalir: Number(r.sin_salir ?? 0) }
}

export async function definirColchonTienda(productoId: string, colchon: number | null) {
  const { error } = await supabase.rpc('definir_colchon_tienda', {
    p_producto_id: productoId,
    p_colchon: colchon,
  })
  if (error) throw new Error(error.message)
}

export async function listaDeLaTienda(): Promise<string | null> {
  const { data, error } = await supabase
    .from('canal')
    .select('lista_precio_id')
    .eq('tipo', 'tienda')
    .eq('activo', true)
    .is('eliminado_en', null)
    .order('creado_en')
    .limit(1)
    .maybeSingle<{ lista_precio_id: string | null }>()
  if (error) throw new Error(error.message)
  return data?.lista_precio_id ?? null
}

export async function elegirListaDeLaTienda(listaId: string) {
  const { error } = await supabase.rpc('elegir_lista_de_la_tienda', { p_lista_id: listaId })
  if (error) throw new Error(error.message)
}

/*
  ─── Lo que dice la ficha, en una línea ───

  La línea describe lo GUARDADO, porque es lo que la tienda ve. Si en el
  formulario hay cambios que la afectan y todavía no se guardaron, dice
  eso en vez de adivinar: calcularlo acá sería una segunda cuenta que
  algún día no coincide con la de la base.
*/
export type TonoEnTienda = 'sale' | 'no_sale' | 'apagado' | 'pendiente'

export function describirEnTienda(
  estado: EstadoEnTienda | null,
  { esNuevo, pendiente, unidad }: { esNuevo: boolean; pendiente: boolean; unidad: string },
): { tono: TonoEnTienda; texto: string } {
  if (esNuevo) return { tono: 'pendiente', texto: 'Guardá el producto para ver cómo queda en la tienda.' }
  if (pendiente) return { tono: 'pendiente', texto: 'Guardá para ver cómo queda en la tienda.' }
  if (!estado) return { tono: 'apagado', texto: 'No se vende online.' }
  if (estado.motivo === null) {
    const cantidad = `${numero.format(estado.stock)} ${estado.stock === 1 ? unidad : plural(unidad)}`
    return {
      tono: 'sale',
      texto: `Se vende online: la tienda ve ${cantidad} a ${moneda.format(estado.precio)}.`,
    }
  }
  if (!estado.vender_online) return { tono: 'apagado', texto: 'No se vende online.' }
  return { tono: 'no_sale', texto: `Prendido, pero no sale: ${minusculaInicial(estado.motivo)}.` }
}

function plural(unidad: string) {
  if (unidad === 'unidad') return 'unidades'
  if (/[aeiou]$/.test(unidad)) return `${unidad}s`
  return unidad
}

function minusculaInicial(texto: string) {
  return texto.charAt(0).toLowerCase() + texto.slice(1)
}

/*
  ¿Lo que cambió en el formulario cambia lo que ve la tienda? Son los
  campos que entran en la regla de publicación, en el precio o en el
  stock que se publica.
*/
export interface LoQueMiraLaTienda {
  vender: boolean
  colchon: string
  nombre_publico: string | null | undefined
  precio_venta: number | undefined
  activo: boolean | undefined
  es_fitosanitario: boolean | undefined
}

export function cambiaLoQueVeLaTienda(guardado: LoQueMiraLaTienda, formulario: LoQueMiraLaTienda) {
  return (
    guardado.vender !== formulario.vender ||
    normalizarColchon(guardado.colchon) !== normalizarColchon(formulario.colchon) ||
    (guardado.nombre_publico ?? '').trim() !== (formulario.nombre_publico ?? '').trim() ||
    Number(guardado.precio_venta ?? 0) !== Number(formulario.precio_venta ?? 0) ||
    !!guardado.activo !== !!formulario.activo ||
    !!guardado.es_fitosanitario !== !!formulario.es_fitosanitario
  )
}

/** '' es «el del canal»; '3' y '3.0' son lo mismo. */
export function normalizarColchon(texto: string): number | null {
  const t = texto.trim()
  if (t === '') return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
