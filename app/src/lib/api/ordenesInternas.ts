import { supabase } from '@/lib/supabase'

/*
  La orden de compra interna. Pedido de Lucas del 07/10, con su modelo
  dibujado el 08/10: un sector le pide a otro —casi siempre a Compras—
  lo que hay que comprar, en un papel y no de palabra.

  No va al proveedor ni mueve stock ni plata. Se guarda y se marca por
  funciones de la base; la pantalla no escribe las tablas.
*/

export type EstadoOrden = 'pendiente' | 'pedida' | 'anulada'

export interface Sector {
  id: string
  nombre: string
}

export interface FilaOrden {
  id: string
  numero: number
  fecha: string
  emite: string
  recibe: string
  estado: EstadoOrden
  renglones: number
  observacion: string | null
  cliente: string | null
  creada_por: string | null
}

export interface RenglonOrden {
  renglon?: number
  producto_id: string | null
  codigo: string | null
  descripcion: string
  proveedor_id: string | null
  proveedor?: string | null
  cantidad: number
}

export interface OrdenCompleta {
  id: string
  numero: number
  fecha: string
  emite_id: string
  emite: string
  recibe_id: string
  recibe: string
  observacion: string | null
  cliente_id: string | null
  cliente: string | null
  contacto: string | null
  estado: EstadoOrden
  motivo_anulacion: string | null
  creada_por: string | null
  creado_en: string
  pedida_en: string | null
  pedida_por: string | null
  /** Ordenados por proveedor: «tanto de éste, tanto del otro». */
  lineas: RenglonOrden[]
}

export const ESTADO_ORDEN: Record<EstadoOrden, { etiqueta: string; clase: string }> = {
  pendiente: { etiqueta: 'Pendiente', clase: 'bg-amber-50 text-amber-800 ring-amber-200' },
  pedida: { etiqueta: 'Pedida', clase: 'bg-verde-50 text-verde-800 ring-verde-200' },
  anulada: { etiqueta: 'Anulada', clase: 'bg-piedra-50 text-piedra-500 ring-borde' },
}

export async function listarSectores(): Promise<Sector[]> {
  const { data, error } = await supabase
    .from('sector')
    .select('id, nombre')
    .is('eliminado_en', null)
    .order('orden')
    .order('nombre')
  if (error) throw new Error(error.message)
  return (data ?? []) as Sector[]
}

/** Suma un sector, o devuelve el que ya estaba con ese nombre. */
export async function crearSector(nombre: string): Promise<Sector> {
  const { data, error } = await supabase.rpc('crear_sector', { p_nombre: nombre })
  if (error) throw new Error(error.message)
  return { id: data as string, nombre: nombre.trim() }
}

export async function listarOrdenes(estado: EstadoOrden | null): Promise<FilaOrden[]> {
  const { data, error } = await supabase.rpc('ordenes_internas', { p_estado: estado, p_limite: 200 })
  if (error) throw new Error(error.message)
  return ((data ?? []) as FilaOrden[]).map((f) => ({ ...f, numero: Number(f.numero), renglones: Number(f.renglones) }))
}

export async function obtenerOrden(id: string): Promise<OrdenCompleta | null> {
  const { data, error } = await supabase.rpc('orden_interna', { p_id: id })
  if (error) throw new Error(error.message)
  if (!data) return null
  const o = data as OrdenCompleta
  return { ...o, numero: Number(o.numero), lineas: o.lineas.map((l) => ({ ...l, cantidad: Number(l.cantidad) })) }
}

export interface DatosOrden {
  /** Lo genera la pantalla: un guardado que se reintenta no crea dos órdenes. */
  id: string
  emiteId: string
  recibeId: string
  fecha: string
  observacion: string
  clienteId: string | null
  contacto: string
  lineas: RenglonOrden[]
}

export async function guardarOrden(d: DatosOrden): Promise<number> {
  const { data, error } = await supabase.rpc('guardar_orden_interna', {
    p_id: d.id,
    p_emite_id: d.emiteId,
    p_recibe_id: d.recibeId,
    p_lineas: d.lineas.map((l) => ({
      producto_id: l.producto_id,
      descripcion: l.descripcion,
      proveedor_id: l.proveedor_id,
      cantidad: l.cantidad,
    })),
    p_fecha: d.fecha,
    p_observacion: d.observacion,
    p_cliente_id: d.clienteId,
    p_contacto: d.contacto,
  })
  if (error) throw new Error(error.message)
  return Number(data)
}

export async function marcarOrden(id: string, pedida: boolean) {
  const { error } = await supabase.rpc('marcar_orden_interna', { p_id: id, p_pedida: pedida })
  if (error) throw new Error(error.message)
}

export async function anularOrden(id: string, motivo: string) {
  const { error } = await supabase.rpc('anular_orden_interna', { p_id: id, p_motivo: motivo })
  if (error) throw new Error(error.message)
}

/*
  Lo que la pantalla frena antes de guardar, con las mismas palabras que
  la base: los dos sectores, al menos un renglón, y cada renglón con qué
  y cuánto.
*/
export function problemaConOrden(d: Pick<DatosOrden, 'emiteId' | 'recibeId' | 'lineas'>): string | null {
  if (!d.emiteId) return 'Falta elegir qué sector la emite.'
  if (!d.recibeId) return 'Falta elegir qué sector la recibe.'
  if (!d.lineas.length) return 'La orden no tiene nada para pedir.'
  for (const [i, l] of d.lineas.entries()) {
    if (!l.descripcion.trim()) return `Al renglón ${i + 1} le falta qué hay que comprar.`
    if (!(l.cantidad > 0)) return `Al renglón ${i + 1} («${l.descripcion.trim()}») le falta la cantidad.`
  }
  return null
}

/*
  Los renglones agrupados por proveedor, para el papel: un bloque por
  proveedor con su total de renglones, y lo que no tiene proveedor al
  final. La base ya los manda ordenados; esto sólo los corta.
*/
export function porProveedor(lineas: RenglonOrden[]): { proveedor: string | null; lineas: RenglonOrden[] }[] {
  const grupos: { proveedor: string | null; lineas: RenglonOrden[] }[] = []
  for (const l of lineas) {
    const nombre = l.proveedor ?? null
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.proveedor === nombre) ultimo.lineas.push(l)
    else grupos.push({ proveedor: nombre, lineas: [l] })
  }
  return grupos
}

/** «Orden interna 000012», como en el papel. */
export function numeroDeOrden(n: number): string {
  return String(n).padStart(6, '0')
}

/*
  ─────────────────────────────────────────────────────────────
  Lo que usa el formulario
  ─────────────────────────────────────────────────────────────
*/

export interface ProductoParaOrden {
  id: string
  codigo: string
  nombre_interno: string
  /** El de la ficha: «que al lado ya te tire por default el proveedor». */
  proveedor_id: string | null
}

/*
  Por código de barras exacto primero —el lector no puede devolver una
  lista para elegir—, y si no, por código o nombre.
*/
export async function buscarProductosParaOrden(texto: string): Promise<ProductoParaOrden[]> {
  const limpio = texto.trim()
  if (!limpio) return []

  const { data: barra } = await supabase
    .from('producto_codigo_barra')
    .select('producto_id')
    .eq('codigo', limpio)
    .is('eliminado_en', null)
    .limit(1)

  let q = supabase
    .from('producto')
    .select('id, codigo, nombre_interno, proveedor_id')
    .is('eliminado_en', null)
    .limit(8)
  if (barra?.length) {
    q = q.eq('id', barra[0].producto_id as string)
  } else {
    const patron = `%${limpio.replace(/[%_]/g, '')}%`
    q = q.or(`codigo.ilike.${patron},nombre_interno.ilike.${patron}`).order('nombre_interno')
  }
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as ProductoParaOrden[]
}

export async function listarProveedoresParaOrden(): Promise<Sector[]> {
  const { data, error } = await supabase.from('proveedor').select('id, nombre').is('eliminado_en', null).order('nombre')
  if (error) throw new Error(error.message)
  return (data ?? []) as Sector[]
}

export interface ClienteParaOrden {
  id: string
  nombre: string
  telefono: string | null
}

/* Sin permiso para ver clientes vuelve vacío: queda el contacto escrito a mano. */
export async function buscarClientesParaOrden(texto: string): Promise<ClienteParaOrden[]> {
  const limpio = texto.trim()
  if (limpio.length < 2) return []
  const patron = `%${limpio.replace(/[%_]/g, '')}%`
  const { data, error } = await supabase
    .from('cliente')
    .select('id, nombre, telefono')
    .is('eliminado_en', null)
    .or(`nombre.ilike.${patron},numero_documento.ilike.${patron},telefono.ilike.${patron}`)
    .order('nombre')
    .limit(8)
  if (error) return []
  return (data ?? []) as ClienteParaOrden[]
}
