import { supabase } from '@/lib/supabase'

/*
  Presupuestos, remitos y comprobantes internos.

  Viven en una tabla aparte de los comprobantes fiscales, a propósito: sus
  números son de Gross y no de ARCA, y un documento no fiscal que se
  cuele en una consulta de facturación termina informándole a ARCA algo
  que para el fisco no existe. La separación es lo que hace imposible ese
  error, y por eso también son dos módulos y no uno.
*/

export type TipoNoFiscal = 'presupuesto' | 'remito' | 'comprobante_interno'

export const ETIQUETA_NO_FISCAL: Record<TipoNoFiscal, string> = {
  presupuesto: 'Presupuesto',
  remito: 'Remito',
  comprobante_interno: 'Comprobante interno',
}

export const SIGLA_NO_FISCAL: Record<TipoNoFiscal, string> = {
  presupuesto: 'PRE',
  remito: 'REM',
  comprobante_interno: 'CI',
}

export interface DatosEntrega {
  domicilio?: string | null
  localidad?: string | null
  contacto?: string | null
  transportista?: string | null
}

/** El número como se imprime: REM 0002-00000045 */
export function numeroNoFiscal(tipo: TipoNoFiscal, serie: string, numero: number): string {
  return `${SIGLA_NO_FISCAL[tipo]} ${serie}-${String(numero).padStart(8, '0')}`
}

export async function emitirNoFiscal(
  ventaId: string,
  tipo: TipoNoFiscal,
  terminalId: string | null,
  opciones: {
    observaciones?: string | null
    validoHasta?: string | null
    entrega?: DatosEntrega
  } = {},
): Promise<string> {
  const { data, error } = await supabase.rpc('emitir_comprobante_no_fiscal', {
    p_venta_id: ventaId,
    p_tipo_clave: tipo,
    p_terminal_id: terminalId,
    p_lineas: null,
    p_observaciones: opciones.observaciones ?? null,
    p_valido_hasta: opciones.validoHasta ?? null,
    p_entrega_domicilio: opciones.entrega?.domicilio ?? null,
    p_entrega_localidad: opciones.entrega?.localidad ?? null,
    p_entrega_contacto: opciones.entrega?.contacto ?? null,
    p_transportista: opciones.entrega?.transportista ?? null,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export interface ResumenNoFiscal {
  id: string
  tipo_clave: TipoNoFiscal
  serie: string
  numero: number
  fecha: string
  receptor_nombre: string
  total: number
  estado: string
}

/** Lo emitido para una venta. Para mostrar el número recién sacado. */
export async function noFiscalesDeVenta(ventaId: string): Promise<ResumenNoFiscal[]> {
  const { data, error } = await supabase
    .from('comprobante_no_fiscal')
    .select('id, tipo_clave, serie, numero, fecha, receptor_nombre, total, estado')
    .eq('venta_id', ventaId)
    .order('creado_en', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ResumenNoFiscal[]
}

/*
  Marca si la venta se cobra con factura o sin ella.

  Los dos candados —el permiso propio y que a un Responsable Inscripto no
  se le entregue otra cosa— los verifica la base. Acá no se repiten: una
  regla escrita en dos lugares se separa con el tiempo, y el día que se
  separe nadie sabe cuál tiene razón.
*/
export async function marcarDocumentacion(
  ventaId: string,
  documentacion: 'fiscal' | 'no_fiscal',
): Promise<void> {
  const { error } = await supabase.rpc('marcar_documentacion_venta', {
    p_venta_id: ventaId,
    p_documentacion: documentacion,
  })
  if (error) throw new Error(error.message)
}
