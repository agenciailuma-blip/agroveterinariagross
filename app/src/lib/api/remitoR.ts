import { supabase } from '@/lib/supabase'

/*
  ─────────────────────────────────────────────────────────────
  El remito R: las hojas de imprenta

  Fase 03, punto 4. El remito es el de siempre —el que baja el stock—;
  acá se lleva de qué hoja de la imprenta salió. Las hojas se usan en
  orden, y la que se arruina queda anotada para que cada número de la
  tanda tenga explicación.
  ─────────────────────────────────────────────────────────────
*/

export interface TandaRemitoR {
  id: string
  punto_venta: number
  cai: string
  vencimiento: string
  desde: number
  hasta: number
  proxima: number
  quedan: number
  usadas: number
  arruinadas: number
  vigente: boolean
}

export interface HojaRemitoR {
  id: string
  numero: number
  punto_venta: number
  cai: string
  vencimiento: string
}

export interface RemitoEnHojas {
  hojas: HojaRemitoR[]
  pedido_numero: number | null
  asociado: string | null
}

export const numeroDeHoja = (puntoVenta: number, numero: number) =>
  `${String(puntoVenta).padStart(4, '0')}-${String(numero).padStart(8, '0')}`

export async function listarTandas(): Promise<TandaRemitoR[]> {
  const { data, error } = await supabase.rpc('remito_r_tandas')
  if (error) throw new Error(error.message)
  return (data ?? []) as TandaRemitoR[]
}

export async function guardarTanda(t: {
  punto_venta: number
  cai: string
  vencimiento: string
  desde: number
  hasta: number
}): Promise<void> {
  const { error } = await supabase.rpc('remito_r_guardar_tanda', {
    p_punto_venta: t.punto_venta,
    p_cai: t.cai,
    p_vencimiento: t.vencimiento,
    p_desde: t.desde,
    p_hasta: t.hasta,
  })
  if (error) throw new Error(error.message)
}

export async function borrarTanda(id: string): Promise<void> {
  const { error } = await supabase.rpc('remito_r_borrar_tanda', { p_id: id })
  if (error) throw new Error(error.message)
}

export async function remitoEnHojas(noFiscalId: string): Promise<RemitoEnHojas> {
  const { data, error } = await supabase.rpc('remito_r_de_remito', { p_no_fiscal: noFiscalId })
  if (error) throw new Error(error.message)
  return data as RemitoEnHojas
}

export async function tomarHojas(noFiscalId: string, cantidad: number): Promise<void> {
  const { error } = await supabase.rpc('remito_r_tomar_hojas', { p_no_fiscal: noFiscalId, p_cantidad: cantidad })
  if (error) throw new Error(error.message)
}

/** Sin hoja: la próxima de la pila, que se arruinó antes de usarla. */
export async function arruinarHoja(hojaId: string | null, motivo: string | null): Promise<void> {
  const { error } = await supabase.rpc('remito_r_arruinar_hoja', { p_hoja: hojaId, p_motivo: motivo })
  if (error) throw new Error(error.message)
}

const A_ENCARGAR_HOJAS = 50
const DIAS_DE_AVISO = 30

/** Antes de que falten las hojas, para encargarlas a tiempo. Null si no hay nada que avisar. */
export function avisoDeTandas(tandas: TandaRemitoR[], hoy: string): string | null {
  const vigentes = tandas.filter((t) => t.vigente)
  if (tandas.length === 0) return null
  if (vigentes.length === 0) return 'No quedan hojas con el CAI vigente. Hay que cargar una tanda nueva.'
  const quedan = vigentes.reduce((s, t) => s + t.quedan, 0)
  if (quedan <= A_ENCARGAR_HOJAS) return `Quedan ${quedan} ${quedan === 1 ? 'hoja' : 'hojas'}: conviene encargar más.`
  const ultimo = vigentes.map((t) => t.vencimiento).sort().at(-1)!
  const dias = Math.round((Date.parse(`${ultimo}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000)
  if (dias <= DIAS_DE_AVISO) {
    return dias === 0 ? 'El CAI de las hojas vence hoy.' : `El CAI de las hojas vence en ${dias} ${dias === 1 ? 'día' : 'días'}.`
  }
  return null
}

// ─── El corrimiento de la impresora ───

/*
  Cada impresora toma la hoja apenas distinto, y eso es de la máquina, no
  del remito: se guarda en esta computadora. Lo mismo si la hoja lleva
  duplicado.
*/
export interface AjusteDeImpresion {
  /** Milímetros hacia la derecha. */
  x: number
  /** Milímetros hacia abajo. */
  y: number
  duplicado: boolean
}

const CLAVE_AJUSTE = 'gross.remito_r_ajuste'
export const AJUSTE_MAXIMO = 15

export function limitarAjuste(mm: number): number {
  if (!Number.isFinite(mm)) return 0
  return Math.round(Math.max(-AJUSTE_MAXIMO, Math.min(AJUSTE_MAXIMO, mm)) * 2) / 2
}

export function ajusteGuardado(): AjusteDeImpresion {
  try {
    const a = JSON.parse(localStorage.getItem(CLAVE_AJUSTE) ?? '{}') as Partial<AjusteDeImpresion>
    return { x: limitarAjuste(Number(a.x ?? 0)), y: limitarAjuste(Number(a.y ?? 0)), duplicado: a.duplicado !== false }
  } catch {
    return { x: 0, y: 0, duplicado: true }
  }
}

export function guardarAjuste(a: AjusteDeImpresion) {
  try {
    localStorage.setItem(CLAVE_AJUSTE, JSON.stringify(a))
  } catch {
    // Que no se pueda recordar no impide imprimir.
  }
}
