import { supabase } from '@/lib/supabase'

/*
  Las cajas, mostradores y oficinas del local.

  Gross las da de alta solo desde Configuración (28/09). Las reglas las
  pone la base: el prefijo no se cambia después, una caja necesita punto
  de venta, y no se da de baja la caja que escucha a las demás ni una
  con la caja abierta.
*/

export type TipoTerminal = 'caja' | 'mostrador' | 'oficina'

export interface TerminalDelLocal {
  id: string
  nombre: string
  tipo: TipoTerminal
  prefijo: string | null
  punto_venta_id: string | null
  es_punto_de_encuentro: boolean
  ultima_sincronizacion: string | null
  version_app: string | null
  punto_venta: { numero: number } | null
}

export async function listarTerminales(): Promise<TerminalDelLocal[]> {
  const { data, error } = await supabase
    .from('terminal')
    .select(
      'id, nombre, tipo, prefijo, punto_venta_id, es_punto_de_encuentro, ultima_sincronizacion, version_app, punto_venta:punto_venta_id(numero)',
    )
    .is('eliminado_en', null)
    .order('tipo')
    .order('nombre')
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as (TerminalDelLocal & { punto_venta: { numero: number } | { numero: number }[] | null })[]).map(
    (t) => ({ ...t, punto_venta: Array.isArray(t.punto_venta) ? (t.punto_venta[0] ?? null) : t.punto_venta }),
  )
}

export async function crearTerminal(t: {
  nombre: string
  tipo: TipoTerminal
  prefijo: string
  punto_venta_id: string | null
}): Promise<string> {
  const { data, error } = await supabase.rpc('crear_terminal', {
    p_nombre: t.nombre,
    p_tipo: t.tipo,
    p_prefijo: t.prefijo,
    p_punto_venta_id: t.punto_venta_id,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function editarTerminal(id: string, nombre: string, puntoVentaId: string | null): Promise<void> {
  const { error } = await supabase.rpc('editar_terminal', {
    p_id: id,
    p_nombre: nombre,
    p_punto_venta_id: puntoVentaId,
  })
  if (error) throw new Error(error.message)
}

export async function darDeBajaTerminal(id: string): Promise<void> {
  const { error } = await supabase.rpc('dar_de_baja_terminal', { p_id: id })
  if (error) throw new Error(error.message)
}

/*
  El prefijo que se propone para una terminal nueva: el que sigue a los
  de su tipo. Con «MOS1» y «MOS2», un mostrador nuevo es «MOS3». Se
  puede cambiar antes de crearla; después, no.
*/
export function prefijoSugerido(tipo: TipoTerminal, existentes: (string | null)[]): string {
  const base = tipo === 'caja' ? 'CAJA' : tipo === 'mostrador' ? 'MOS' : 'OFI'
  const usados = new Set(existentes.filter(Boolean).map((p) => p!.toUpperCase()))
  let n = 1
  while (usados.has(`${base}${n}`)) n++
  return `${base}${n}`
}

/*
  El nombre que se propone, con el mismo número que el prefijo: la
  «Caja 2» con «CAJA2». No es obligatorio que coincidan, pero ayuda a
  reconocer de qué máquina es una venta mirando su número.
*/
export function nombreSugerido(tipo: TipoTerminal, prefijo: string): string {
  const numero = prefijo.match(/\d+$/)?.[0] ?? ''
  const base = tipo === 'caja' ? 'Caja' : tipo === 'mostrador' ? 'Mostrador' : 'Oficina'
  return numero ? `${base} ${numero}` : base
}
