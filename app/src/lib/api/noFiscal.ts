import { supabase } from '@/lib/supabase'
import { datosEmisor } from '@/lib/api/comprobante'

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

export interface LineaNoFiscal {
  orden: number
  codigo_producto: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  importe: number
}

/*
  El documento completo, para imprimirlo.

  Mirá lo que NO está en este tipo: no hay `cae`, no hay `clase`, no hay
  alícuotas de IVA. No es una omisión: es la garantía. Un componente que
  recibe esto no tiene de dónde sacar un CAE aunque alguien se lo pida,
  y por eso ningún camino de código puede imprimir algo con aspecto de
  factura.
*/
export interface NoFiscalCompleto {
  id: string
  tipo_clave: TipoNoFiscal
  tipo_descripcion: string
  serie: string
  numero: number
  fecha: string
  estado: string
  receptor_nombre: string
  receptor_documento: string | null
  receptor_documento_sigla: string
  receptor_condicion: string
  receptor_domicilio: string | null
  total: number
  observaciones: string | null
  valido_hasta: string | null
  entrega_domicilio: string | null
  entrega_localidad: string | null
  entrega_contacto: string | null
  transportista: string | null
  venta_codigo: string | null
  creado_en: string
  lineas: LineaNoFiscal[]
  emisor: Record<string, string>
}

export async function obtenerNoFiscalCompleto(id: string): Promise<NoFiscalCompleto> {
  const { data: d, error } = await supabase
    .from('comprobante_no_fiscal')
    .select(
      `id, tipo_clave, serie, numero, fecha, estado, total, observaciones, valido_hasta,
       entrega_domicilio, entrega_localidad, entrega_contacto, transportista,
       receptor_nombre, receptor_documento, receptor_domicilio, creado_en,
       tipo:tipo_clave(descripcion),
       condicion:receptor_condicion_iva_id(descripcion),
       documento:receptor_tipo_documento_id(sigla),
       venta:venta_id(codigo)`,
    )
    .eq('id', id)
    .single()

  if (error || !d) throw new Error(error?.message ?? 'No se encontró el comprobante.')

  // PostgREST devuelve las relaciones como objeto o como arreglo de uno
  // según cómo infiera la cardinalidad. Se normaliza acá, igual que en
  // el comprobante fiscal.
  const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)
  const tipo = uno(d.tipo as never) as { descripcion: string } | null
  const cond = uno(d.condicion as never) as { descripcion: string } | null
  const doc = uno(d.documento as never) as { sigla: string } | null
  const vta = uno(d.venta as never) as { codigo: string } | null

  const [lineas, emisor] = await Promise.all([
    supabase
      .from('comprobante_no_fiscal_linea')
      .select('orden, codigo_producto, descripcion, cantidad, precio_unitario, importe')
      .eq('comprobante_no_fiscal_id', id)
      .order('orden'),
    datosEmisor(),
  ])

  return {
    id: d.id as string,
    tipo_clave: d.tipo_clave as TipoNoFiscal,
    tipo_descripcion: tipo?.descripcion ?? '',
    serie: d.serie as string,
    numero: d.numero as number,
    fecha: d.fecha as string,
    estado: d.estado as string,
    receptor_nombre: d.receptor_nombre as string,
    receptor_documento: d.receptor_documento as string | null,
    receptor_documento_sigla: doc?.sigla ?? '',
    receptor_condicion: cond?.descripcion ?? '',
    receptor_domicilio: d.receptor_domicilio as string | null,
    total: Number(d.total),
    observaciones: d.observaciones as string | null,
    valido_hasta: d.valido_hasta as string | null,
    entrega_domicilio: d.entrega_domicilio as string | null,
    entrega_localidad: d.entrega_localidad as string | null,
    entrega_contacto: d.entrega_contacto as string | null,
    transportista: d.transportista as string | null,
    venta_codigo: vta?.codigo ?? null,
    creado_en: d.creado_en as string,
    lineas: ((lineas.data ?? []) as unknown as LineaNoFiscal[]).map((l) => ({
      ...l,
      cantidad: Number(l.cantidad),
      precio_unitario: Number(l.precio_unitario),
      importe: Number(l.importe),
    })),
    emisor,
  }
}

/** La leyenda que hace que este papel no se pueda confundir con una factura. */
export const LEYENDA_NO_FISCAL = 'DOCUMENTO NO VÁLIDO COMO FACTURA'
