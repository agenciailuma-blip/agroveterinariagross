import { supabase } from '@/lib/supabase'

export interface LineaComprobante {
  orden: number
  codigo_producto: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  importe: number
  alicuota_iva_id: number
}

export interface AlicuotaComprobante {
  alicuota_iva_id: number
  base_imponible: number
  importe: number
  porcentaje: number
}

export interface TributoComprobante {
  descripcion: string
  base_imponible: number
  alicuota: number
  importe: number
}

export interface ComprobanteCompleto {
  id: string
  estado: string
  tipo_comprobante_id: number
  tipo_descripcion: string
  clase: string
  punto_venta: number
  numero: number
  fecha: string
  concepto: number
  receptor_nombre: string
  receptor_documento: string | null
  receptor_tipo_documento_id: number
  receptor_documento_sigla: string
  receptor_condicion: string
  receptor_domicilio: string | null
  neto_gravado: number
  neto_no_gravado: number
  exento: number
  iva_total: number
  tributos_total: number
  total: number
  moneda: string
  cotizacion: number
  cae: string | null
  cae_vencimiento: string | null
  modalidad: string
  /** Momento de la autorización. Es la hora que va impresa en el ticket. */
  autorizado_en: string | null
  creado_en: string
  impresiones: number
  lineas: LineaComprobante[]
  alicuotas: AlicuotaComprobante[]
  tributos: TributoComprobante[]
  emisor: Record<string, string>
}

/** Datos del emisor que van en el encabezado. Vienen de configuración. */
async function datosEmisor(): Promise<Record<string, string>> {
  const { data } = await supabase
    .from('configuracion')
    .select('clave, valor')
    .like('clave', 'comercio.%')

  const emisor: Record<string, string> = {}
  for (const fila of data ?? []) {
    emisor[(fila.clave as string).replace('comercio.', '')] = String(fila.valor ?? '')
  }
  return emisor
}

export async function obtenerComprobanteCompleto(id: string): Promise<ComprobanteCompleto> {
  const { data: c, error } = await supabase
    .from('comprobante')
    .select(
      `id, estado, tipo_comprobante_id, numero, fecha, concepto, venta_id,
       receptor_nombre, receptor_documento, receptor_tipo_documento_id,
       receptor_condicion_iva_id, receptor_domicilio,
       neto_gravado, neto_no_gravado, exento, iva_total, tributos_total, total,
       moneda, cotizacion, cae, cae_vencimiento, modalidad, impresiones,
       autorizado_en, creado_en,
       tipo_comprobante:tipo_comprobante_id(descripcion, clase),
       punto_venta:punto_venta_id(numero),
       condicion:receptor_condicion_iva_id(descripcion),
       documento:receptor_tipo_documento_id(sigla)`,
    )
    .eq('id', id)
    .single()

  if (error || !c) throw new Error(error?.message ?? 'No se encontró el comprobante.')

  // PostgREST devuelve las relaciones como objeto o como array de uno
  // según cómo infiera la cardinalidad. Se normaliza acá para que el
  // resto del código no tenga que preguntárselo en cada campo.
  const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)
  const tipo = uno(c.tipo_comprobante as never) as { descripcion: string; clase: string } | null
  const pv = uno(c.punto_venta as never) as { numero: number } | null
  const cond = uno(c.condicion as never) as { descripcion: string } | null
  const doc = uno(c.documento as never) as { sigla: string } | null

  const [lineas, alicuotas, tributos, emisor] = await Promise.all([
    c.venta_id
      ? supabase
          .from('venta_linea')
          .select('orden, codigo_producto, descripcion, cantidad, precio_unitario, importe, alicuota_iva_id')
          .eq('venta_id', c.venta_id)
          .order('orden')
      : Promise.resolve({ data: [] }),
    supabase
      .from('comprobante_alicuota')
      .select('alicuota_iva_id, base_imponible, importe, alicuota:alicuota_iva_id(porcentaje)')
      .eq('comprobante_id', id),
    supabase
      .from('comprobante_tributo')
      .select('descripcion, base_imponible, alicuota, importe')
      .eq('comprobante_id', id),
    datosEmisor(),
  ])

  return {
    id: c.id as string,
    estado: c.estado as string,
    tipo_comprobante_id: c.tipo_comprobante_id as number,
    tipo_descripcion: tipo?.descripcion ?? '',
    clase: tipo?.clase ?? '',
    punto_venta: pv?.numero ?? 0,
    numero: c.numero as number,
    fecha: c.fecha as string,
    concepto: c.concepto as number,
    receptor_nombre: c.receptor_nombre as string,
    receptor_documento: c.receptor_documento as string | null,
    receptor_tipo_documento_id: c.receptor_tipo_documento_id as number,
    receptor_documento_sigla: doc?.sigla ?? '',
    receptor_condicion: cond?.descripcion ?? '',
    receptor_domicilio: c.receptor_domicilio as string | null,
    neto_gravado: Number(c.neto_gravado),
    neto_no_gravado: Number(c.neto_no_gravado),
    exento: Number(c.exento),
    iva_total: Number(c.iva_total),
    tributos_total: Number(c.tributos_total),
    total: Number(c.total),
    moneda: c.moneda as string,
    cotizacion: Number(c.cotizacion),
    cae: c.cae as string | null,
    cae_vencimiento: c.cae_vencimiento as string | null,
    modalidad: c.modalidad as string,
    autorizado_en: (c.autorizado_en as string | null) ?? null,
    creado_en: c.creado_en as string,
    impresiones: c.impresiones as number,
    lineas: (lineas.data ?? []) as unknown as LineaComprobante[],
    alicuotas: ((alicuotas.data ?? []) as unknown as (AlicuotaComprobante & {
      alicuota: { porcentaje: number } | { porcentaje: number }[] | null
    })[]).map((a) => ({
      alicuota_iva_id: a.alicuota_iva_id,
      base_imponible: Number(a.base_imponible),
      importe: Number(a.importe),
      porcentaje: Number(
        (Array.isArray(a.alicuota) ? a.alicuota[0] : a.alicuota)?.porcentaje ?? 0,
      ),
    })),
    tributos: ((tributos.data ?? []) as unknown as TributoComprobante[]).map((t) => ({
      ...t,
      base_imponible: Number(t.base_imponible),
      alicuota: Number(t.alicuota),
      importe: Number(t.importe),
    })),
    emisor,
  }
}

export async function registrarImpresion(comprobanteId: string): Promise<number> {
  const { data, error } = await supabase.rpc('registrar_impresion', {
    p_comprobante_id: comprobanteId,
  })
  if (error) throw new Error(error.message)
  return data as number
}
