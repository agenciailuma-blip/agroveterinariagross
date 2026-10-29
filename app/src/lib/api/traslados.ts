import { supabase } from '@/lib/supabase'
import { hoyEnObera } from '@/lib/api/cheques'
import { leerImporte } from '@/lib/api/recibos'

/*
  ─────────────────────────────────────────────────────────────
  Las órdenes de traslado

  Fase 03, punto 6. Ir a buscar o llevar un animal —para una eutanasia,
  para una operación—. Cada orden pasa por pendiente, en camino y
  finalizada; al finalizar se anotan los kilómetros, el costo y cuánto
  tardó. Se cobra por la caja: «Mandar a caja» deja una venta en la
  cola con un renglón «Traslado» por el monto.

  Necesita conexión: no es algo que se cargue en el mostrador con la
  fila esperando.
  ─────────────────────────────────────────────────────────────
*/

export type MotivoTraslado = 'eutanasia' | 'cirugia' | 'retiro' | 'devolucion' | 'otro'
export type EstadoTraslado = 'pendiente' | 'en_camino' | 'finalizada' | 'cancelada'

export const MOTIVOS: Record<MotivoTraslado, string> = {
  eutanasia: 'Eutanasia',
  cirugia: 'Cirugía',
  retiro: 'Retiro',
  devolucion: 'Devolución',
  otro: 'Otro',
}

export const ESTADOS: Record<EstadoTraslado, string> = {
  pendiente: 'Pendiente',
  en_camino: 'En camino',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
}

/** Lo que se tipea en el formulario. */
export interface DatosTraslado {
  fecha: string
  hora: string
  motivo: MotivoTraslado | ''
  direccion: string
  localidad: string
  dueno_nombre: string
  dueno_telefono: string
  descripcion: string
  monto: string
  observaciones: string
}

export function trasladoVacio(hoy = hoyEnObera()): DatosTraslado {
  return {
    fecha: hoy,
    hora: '',
    motivo: '',
    direccion: '',
    localidad: '',
    dueno_nombre: '',
    dueno_telefono: '',
    descripcion: '',
    monto: '',
    observaciones: '',
  }
}

/** Lo que falta para guardar, o null. Las mismas reglas que la base. */
export function faltaEnTraslado(d: DatosTraslado): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) return 'Falta la fecha.'
  if (!d.motivo) return 'Falta el motivo.'
  if (!d.direccion.trim()) return 'Falta la dirección.'
  if (!d.dueno_nombre.trim()) return 'Falta el nombre del dueño.'
  if (d.hora && !/^\d{2}:\d{2}$/.test(d.hora)) return 'La hora no se entiende.'
  if (d.monto.trim() && leerImporte(d.monto) === null && !/^0+([.,]0*)?$/.test(d.monto.trim())) {
    return 'El monto no se entiende.'
  }
  return null
}

export function paraLaBase(d: DatosTraslado) {
  return {
    fecha: d.fecha,
    hora: d.hora || null,
    motivo: d.motivo,
    direccion: d.direccion.trim(),
    localidad: d.localidad.trim(),
    dueno_nombre: d.dueno_nombre.trim(),
    dueno_telefono: d.dueno_telefono.trim(),
    descripcion: d.descripcion.trim(),
    monto: leerImporte(d.monto) ?? 0,
    observaciones: d.observaciones.trim(),
  }
}

export interface VentaDelTraslado {
  venta_id: string
  codigo: string
  estado: 'borrador' | 'en_caja' | 'cobrada' | 'anulada'
  total: number
  comprobante_id: string | null
  comprobante: string | null
  no_fiscal_id: string | null
}

export interface Traslado {
  id: string
  numero: number
  fecha: string
  hora: string | null
  motivo: MotivoTraslado
  direccion: string
  localidad: string | null
  dueno_nombre: string
  dueno_telefono: string | null
  descripcion: string | null
  monto: number
  observaciones: string | null
  estado: EstadoTraslado
  km: number | null
  costo: number | null
  minutos: number | null
  motivo_cancelacion: string | null
  creado_por: string | null
  estado_en: string
  estado_por: string | null
  ventas: VentaDelTraslado[]
}

export function datosDe(t: Traslado): DatosTraslado {
  return {
    fecha: t.fecha,
    hora: t.hora ?? '',
    motivo: t.motivo,
    direccion: t.direccion,
    localidad: t.localidad ?? '',
    dueno_nombre: t.dueno_nombre,
    dueno_telefono: t.dueno_telefono ?? '',
    descripcion: t.descripcion ?? '',
    monto: t.monto ? String(t.monto).replace('.', ',') : '',
    observaciones: t.observaciones ?? '',
  }
}

const numONulo = (n: unknown) => (n === null || n === undefined ? null : Number(n))

export type Vista = 'abiertas' | 'cerradas' | 'todas'

export async function listarTraslados(vista: Vista, texto: string): Promise<Traslado[]> {
  const { data, error } = await supabase.rpc('listar_traslados', { p_vista: vista, p_texto: texto.trim() || null })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Traslado[]).map((t) => ({
    ...t,
    numero: Number(t.numero),
    monto: Number(t.monto),
    km: numONulo(t.km),
    costo: numONulo(t.costo),
    minutos: numONulo(t.minutos),
    ventas: t.ventas.map((v) => ({ ...v, total: Number(v.total) })),
  }))
}

/*
  El identificador lo pone la pantalla al abrir el formulario: si se
  corta la conexión con la orden ya grabada y se aprieta de nuevo, se
  corrige la misma en vez de cargar dos.
*/
export async function guardarTraslado(id: string, d: DatosTraslado): Promise<{ id: string; numero: number }> {
  const { data, error } = await supabase.rpc('guardar_traslado', { p_id: id, p: paraLaBase(d) })
  if (error) throw new Error(error.message)
  return data as { id: string; numero: number }
}

export async function cambiarEstado(
  id: string,
  estado: EstadoTraslado,
  extra: { km?: number | null; costo?: number | null; minutos?: number | null; motivo?: string | null } = {},
) {
  const { error } = await supabase.rpc('traslado_cambiar_estado', {
    p_id: id,
    p_estado: estado,
    p_km: extra.km ?? null,
    p_costo: extra.costo ?? null,
    p_minutos: extra.minutos ?? null,
    p_motivo: extra.motivo ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function mandarACaja(id: string): Promise<{ venta_id: string; codigo: string }> {
  const { data, error } = await supabase.rpc('traslado_a_caja', { p_id: id })
  if (error) throw new Error(error.message)
  return data as { venta_id: string; codigo: string }
}

export interface EstadisticasTraslados {
  finalizadas: number
  km: number
  costo: number
  minutos: number
  monto: number
  con_datos: number
  por_motivo: Partial<Record<MotivoTraslado, number>>
}

export async function estadisticasTraslados(desde: string, hasta: string): Promise<EstadisticasTraslados> {
  const { data, error } = await supabase.rpc('traslados_estadisticas', { p_desde: desde, p_hasta: hasta })
  if (error) throw new Error(error.message)
  const e = data as EstadisticasTraslados
  return {
    finalizadas: Number(e.finalizadas),
    km: Number(e.km),
    costo: Number(e.costo),
    minutos: Number(e.minutos),
    monto: Number(e.monto),
    con_datos: Number(e.con_datos),
    por_motivo: e.por_motivo ?? {},
  }
}

// ─── Lo que se calcula en la pantalla ───

/** La venta que cuenta: la última que no se anuló. */
export const ventaVigente = (t: Pick<Traslado, 'ventas'>) =>
  [...t.ventas].reverse().find((v) => v.estado !== 'anulada') ?? null

/** Se puede mandar a la caja si tiene monto, no está cancelada y no hay una venta viva. */
export const puedeIrACaja = (t: Pick<Traslado, 'estado' | 'monto' | 'ventas'>) =>
  t.estado !== 'cancelada' && t.monto > 0 && !ventaVigente(t)

/** La orden se corrige mientras no esté finalizada ni cancelada. */
export const sePuedeCorregir = (t: Pick<Traslado, 'estado'>) => t.estado === 'pendiente' || t.estado === 'en_camino'

/** «45 min», «1 h», «2 h 10 min». */
export function duracion(minutos: number): string {
  const m = Math.round(minutos)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const resto = m % 60
  return resto ? `${h} h ${resto} min` : `${h} h`
}

/** «1:15», «90» o «1 h 15» → minutos. */
export function leerMinutos(texto: string): number | null {
  const t = texto.trim().toLowerCase()
  if (!t) return null
  const reloj = /^(\d{1,2})[:.](\d{2})$/.exec(t)
  if (reloj) return Number(reloj[1]) * 60 + Number(reloj[2])
  const hm = /^(\d{1,2})\s*h(?:s|oras?)?\s*(\d{1,2})?\s*(?:m|min|minutos?)?$/.exec(t)
  if (hm) return Number(hm[1]) * 60 + Number(hm[2] ?? 0)
  const solo = /^(\d{1,4})\s*(?:m|min|minutos?)?$/.exec(t)
  return solo ? Number(solo[1]) : null
}

/** «18,4» o «18.4» → 18.4. */
export function leerKm(texto: string): number | null {
  const t = texto.trim().replace(',', '.')
  if (!/^\d{1,5}(\.\d+)?$/.test(t)) return null
  return Math.round(Number(t) * 10) / 10
}

/*
  La dirección en el mapa del teléfono. Sin localidad se supone Oberá:
  es de donde sale el que maneja.
*/
export function enlaceMapaTraslado(t: Pick<Traslado, 'direccion' | 'localidad'>): string {
  const lugar = [t.direccion.trim(), t.localidad?.trim() || 'Oberá', 'Misiones'].join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lugar)}`
}

/** Para marcar desde el teléfono: sólo los dígitos y un «+» inicial. */
export function enlaceTelefono(telefono: string | null): string | null {
  if (!telefono) return null
  const t = telefono.trim()
  const digitos = t.replace(/\D/g, '')
  if (digitos.length < 6) return null
  return `tel:${t.startsWith('+') ? '+' : ''}${digitos}`
}
