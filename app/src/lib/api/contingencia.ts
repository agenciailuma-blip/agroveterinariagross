import { supabase } from '@/lib/supabase'

/*
  Contingencia con CAEA.

  El CAEA es el código que ARCA entrega POR ADELANTADO, una vez por
  quincena, para poder seguir facturando mientras su servicio está
  caído. Tiene tres momentos y ninguno se puede saltear:

    1. pedirlo   — antes del corte. Pedirlo durante el corte no sirve:
                   pedirlo también necesita a ARCA.
    2. usarlo    — durante el corte, comprobante por comprobante.
    3. informar  — después, antes de la fecha tope. No informar es el
                   incumplimiento que la RG 5852/2026 castiga.
*/

export type SituacionCaea = 'listo' | 'por_informar' | 'urgente' | 'vencido' | 'cerrado' | 'sin_uso'

export interface FilaCaea {
  id: string
  codigo: string
  periodo: number
  quincena: number
  fecha_desde: string
  fecha_hasta: string
  fecha_tope_informar: string | null
  estado: string
  ambiente: string
  rige_hoy: boolean
  dias_para_informar: number | null
  por_informar: number
  informados: number
  situacion: SituacionCaea
}

export interface EstadoContingencia {
  caeas: FilaCaea[]
  vigente: FilaCaea | null
  /** ARCA exige al menos un punto de venta del régimen CAEA (error 15003). */
  puntosCaea: number
}

export async function estadoContingencia(): Promise<EstadoContingencia> {
  const [{ data: caeas, error }, { count }] = await Promise.all([
    supabase
      .from('vista_caea_estado')
      .select('*')
      .order('periodo', { ascending: false })
      .order('quincena', { ascending: false })
      .limit(12),
    supabase
      .from('punto_venta')
      .select('id', { count: 'exact', head: true })
      .eq('regimen_caea', true)
      .eq('activo', true),
  ])
  if (error) throw new Error(error.message)

  const filas = (caeas ?? []) as FilaCaea[]
  return {
    caeas: filas,
    vigente: filas.find((c) => c.rige_hoy && c.estado === 'vigente') ?? null,
    puntosCaea: count ?? 0,
  }
}

/*
  Llama a la Edge Function y saca el motivo real del error.

  El cliente de Supabase no expone el cuerpo de una respuesta 500: hay
  que leerlo del context, o en la pantalla queda "Edge Function
  returned a non-2xx status code", que no le dice nada a nadie.
*/
async function invocar<T>(cuerpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('arca-wsfe-caea', { body: cuerpo })

  if (error) {
    let detalle = error.message
    const contexto = (error as { context?: Response }).context
    if (contexto && typeof contexto.json === 'function') {
      try {
        const json = await contexto.json()
        if (json?.error) detalle = json.error
      } catch {
        // El cuerpo no era JSON: queda el mensaje genérico.
      }
    }
    throw new Error(detalle)
  }

  if (!data?.ok) throw new Error(data?.error ?? 'ARCA no devolvió un resultado.')
  return data as T
}

/** Pide el CAEA de la quincena. `proxima` pide el de la que viene. */
export function pedirCaea(proxima = false) {
  return invocar<{ caea: { codigo: string; fecha_desde: string; fecha_hasta: string } }>({
    accion: 'solicitar',
    proxima,
  })
}

export function informarCaea(caeaId?: string) {
  return invocar<{
    informados: number
    fallidos: number
    detalle: { comprobante: string; ok: boolean; motivo: string | null }[]
  }>({ accion: 'informar', caea_id: caeaId })
}

export function informarSinMovimiento(caeaId: string) {
  return invocar<{ detalle: { punto_venta: number; ok: boolean; motivo: string | null }[] }>({
    accion: 'sin_movimiento',
    caea_id: caeaId,
  })
}

/*
  Emite un comprobante por contingencia.

  Las condiciones —que ARCA esté efectivamente caído y que no se trate
  de un comprobante que ARCA rechazó por contenido— las verifica la
  base, no esta pantalla. Un navegador con la consola abierta se saltea
  cualquier validación que viva sólo del lado visual, y acá lo que está
  en juego es poder justificar el uso del CAEA ante ARCA.
*/
export async function emitirConCaea(
  comprobanteId: string,
  motivo: string,
): Promise<{ caea: string; numero: number }> {
  const { data, error } = await supabase
    .rpc('emitir_con_caea', { p_comprobante_id: comprobanteId, p_motivo: motivo })
    .single()
  if (error) throw new Error(error.message)
  return data as { caea: string; numero: number }
}
