import { supabase } from '@/lib/supabase'
import type { EstadoStock } from '@/lib/tipos'

/*
  ─────────────────────────────────────────────────────────────
  Stock, mirado por sí mismo

  Sugerencia 2 de Lucas: que el stock sea una entrada propia del
  menú. Hasta ahora vivía adentro de Productos (una columna más del
  catálogo) y de Inventario (el conteo por sectores), y ninguna de
  las dos contesta la pregunta que se hace todos los días: **qué
  hay que pedir**.

  Esa pregunta tiene una forma distinta de la de Productos. Ahí se
  busca *un* producto para corregirle algo; acá se mira *el
  conjunto* ordenado por urgencia, y casi nunca se toca nada — se
  anota qué comprar. Por eso arranca filtrado en lo que está por
  debajo del umbral en vez de mostrar los 2.261.

  No hay consulta nueva: es `vista_stock`, la misma que pinta los
  estados en el catálogo. Dos fuentes para el mismo semáforo
  terminarían dando dos respuestas distintas.
  ─────────────────────────────────────────────────────────────
*/

export interface FilaStock {
  producto_id: string
  codigo: string
  nombre_interno: string
  unidad_medida: string
  cantidad: number
  umbral_bajo: number
  umbral_critico: number
  estado: EstadoStock
  precio_venta: number
  costo: number | null
}

/** El orden en que hay que mirarlos: primero lo que ya se vendió de más. */
const URGENCIA: Record<EstadoStock, number> = {
  sobrevendido: 0,
  critico: 1,
  bajo: 2,
  ok: 3,
}

export type FiltroStock = 'atencion' | 'sobrevendido' | 'critico' | 'bajo' | 'todos'

export async function listarStock(filtro: FiltroStock, texto: string): Promise<FilaStock[]> {
  let q = supabase
    .from('vista_stock')
    .select(
      'producto_id, codigo, nombre_interno, unidad_medida, cantidad, umbral_bajo, umbral_critico, estado, precio_venta, costo',
    )
    .eq('activo', true)
    .limit(500)

  /*
    'atencion' es el filtro de arranque y agrupa los tres estados que
    piden una decisión. Se pide al servidor y no se filtra en el
    navegador: sobre 2.261 productos, traerlos todos para descartar el
    90% es tiempo de mostrador regalado.
  */
  if (filtro === 'atencion') q = q.in('estado', ['sobrevendido', 'critico', 'bajo'])
  else if (filtro !== 'todos') q = q.eq('estado', filtro)

  if (texto.trim()) {
    const patron = `%${texto.replace(/[%_]/g, '')}%`
    q = q.or(`codigo.ilike.${patron},nombre_interno.ilike.${patron}`)
  }

  const { data, error } = await q
  if (error) throw new Error(error.message)

  const filas = (data ?? []) as FilaStock[]
  /*
    El orden se arma acá y no en SQL porque es por urgencia —un orden
    del negocio, no alfabético ni numérico— y expresarlo como un CASE
    dentro de la consulta lo escondería en un string.
  */
  return filas.sort(
    (a, b) => URGENCIA[a.estado] - URGENCIA[b.estado] || a.nombre_interno.localeCompare(b.nombre_interno),
  )
}

/** Cuántos hay en cada estado. Es el encabezado de la pantalla. */
export async function resumenStock(): Promise<Record<EstadoStock, number>> {
  const cuenta = async (estado: EstadoStock) => {
    const { count } = await supabase
      .from('vista_stock')
      .select('producto_id', { count: 'exact', head: true })
      .eq('activo', true)
      .eq('estado', estado)
    return count ?? 0
  }
  const [sobrevendido, critico, bajo, ok] = await Promise.all([
    cuenta('sobrevendido'),
    cuenta('critico'),
    cuenta('bajo'),
    cuenta('ok'),
  ])
  return { sobrevendido, critico, bajo, ok }
}

/*
  Lo que hay que comprar, en texto, para pegarlo en un WhatsApp al
  proveedor.

  Es deliberadamente tonto: no calcula cuánto pedir —eso necesita la
  venta media mensual, que es la sugerencia 8 y quedó para V3— sino que
  copia la lista de lo que está por debajo del umbral. Hoy esa lista se
  escribe a mano en un papel.
*/
export function comoTexto(filas: FilaStock[]): string {
  return filas
    .map((f) => `${f.codigo}  ${f.nombre_interno}  —  quedan ${f.cantidad} ${f.unidad_medida}`)
    .join('\n')
}
