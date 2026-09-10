import { supabase } from '@/lib/supabase'

/*
  Las facturas de compra.

  Lo que se carga es la CABECERA de la factura que emitió el proveedor:
  quién, cuál, cuándo, y el desglose por alícuota de IVA. Las líneas de
  producto, el ingreso de stock y los costos son recepción de mercadería
  y siguen en V1-B.

  El motivo de que esto exista antes del 26/10 es simple: ese día Gross
  deja OBTech, que es donde hoy carga sus facturas de compra, y las
  compras siguen entrando igual.
*/

export interface TipoDeComprobante {
  id: number
  descripcion: string
  clase: string
  familia: string
  signo: number
}

export interface AlicuotaIva {
  id: number
  descripcion: string
  porcentaje: number
}

export interface FilaCompra {
  id: string
  fecha: string
  punto_venta: number
  numero: number
  neto_gravado: number
  neto_no_gravado: number
  exento: number
  iva_total: number
  tributos_total: number
  total: number
  observaciones: string | null
  proveedor: { nombre: string } | null
  tipo: { descripcion: string; clase: string; signo: number } | null
}

export interface AlicuotaCargada {
  alicuota_iva_id: number
  base_imponible: number
  importe: number
}

export interface TributoCargado {
  descripcion: string
  base_imponible: number
  alicuota: number | null
  importe: number
}

export interface CompraNueva {
  proveedor_id: string
  tipo_comprobante_id: number
  punto_venta: number
  numero: number
  fecha: string
  neto_no_gravado: number
  exento: number
  observaciones: string
  alicuotas: AlicuotaCargada[]
  tributos: TributoCargado[]
}

const COLUMNAS =
  'id, fecha, punto_venta, numero, neto_gravado, neto_no_gravado, exento, iva_total, ' +
  'tributos_total, total, observaciones, proveedor:proveedor_id(nombre), ' +
  'tipo:tipo_comprobante_id(descripcion, clase, signo)'

export async function listarCompras(limite = 100): Promise<FilaCompra[]> {
  const { data, error } = await supabase
    .from('compra')
    .select(COLUMNAS)
    .is('eliminado_en', null)
    .order('fecha', { ascending: false })
    .order('creado_en', { ascending: false })
    .limit(limite)

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as FilaCompra[]
}

/*
  Los comprobantes que un proveedor le puede emitir a Gross.

  Ojo con `activo` de la tabla: significa "de los que Gross emite", y una
  compra es la dirección contraria. La Factura C está inactiva porque
  Gross es responsable inscripto y no emite C — pero la recibe todo el
  tiempo, de cualquier proveedor monotributista. Filtrar por `activo`
  dejaría esas facturas sin poder cargarse.
*/
export async function tiposParaCompra(): Promise<TipoDeComprobante[]> {
  const { data, error } = await supabase
    .from('tipo_comprobante')
    .select('id, descripcion, clase, familia, signo')
    .in('clase', ['A', 'B', 'C'])
    .in('familia', ['factura', 'nota_debito', 'nota_credito'])
    .order('id')

  if (error) throw new Error(error.message)
  return (data ?? []) as TipoDeComprobante[]
}

export async function alicuotasDeIva(): Promise<AlicuotaIva[]> {
  const { data, error } = await supabase
    .from('alicuota_iva')
    .select('id, descripcion, porcentaje')
    .eq('activo', true)
    .order('porcentaje', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map((a) => ({ ...a, porcentaje: Number(a.porcentaje) })) as AlicuotaIva[]
}

/*
  La factura entera va en un solo viaje.

  Cabecera, alícuotas y percepciones se escriben adentro de la misma
  transacción del lado del servidor. En tres viajes, un corte en el
  segundo dejaría una factura cargada con cero de IVA, y eso no se ve
  mirando la lista.
*/
export async function registrarCompra(c: CompraNueva): Promise<string> {
  const { data, error } = await supabase.rpc('registrar_compra', {
    p_proveedor_id: c.proveedor_id,
    p_tipo_comprobante_id: c.tipo_comprobante_id,
    p_punto_venta: c.punto_venta,
    p_numero: c.numero,
    p_fecha: c.fecha,
    p_neto_no_gravado: c.neto_no_gravado,
    p_exento: c.exento,
    p_observaciones: c.observaciones,
    p_alicuotas: c.alicuotas,
    p_tributos: c.tributos,
  })

  if (error) throw new Error(error.message)
  return data as string
}

export async function anularCompra(id: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('anular_compra', { p_compra_id: id, p_motivo: motivo })
  if (error) throw new Error(error.message)
}

/*
  ─────────────────────────────────────────────────────────────
  Lo que se calcula del lado de la pantalla
  ─────────────────────────────────────────────────────────────
*/

/** Como se lee en el papel: 0003-00045678. */
export function numeroDeComprobante(puntoVenta: number, numero: number): string {
  return `${String(puntoVenta).padStart(4, '0')}-${String(numero).padStart(8, '0')}`
}

/*
  El IVA que le correspondería a un neto.

  Es una sugerencia, no una imposición: se escribe en el campo y se puede
  corregir. **Manda el papel.** Una factura real puede traer un peso de
  diferencia por redondeo, y si el sistema insistiera en su cuenta, esa
  diferencia terminaría en el total y no cerraría con lo que el proveedor
  emitió.
*/
export function ivaSugerido(neto: number, porcentaje: number): number {
  if (!Number.isFinite(neto) || !Number.isFinite(porcentaje)) return 0
  return Math.round(neto * porcentaje) / 100
}

/*
  El total, calculado igual que lo calcula la base.

  Se muestra mientras se carga para que la persona lo compare con el
  papel ANTES de guardar. Es la única validación que importa acá: si este
  número no es el que dice la factura, algo se cargó mal.
*/
export function totalDeLaCarga(datos: {
  alicuotas: { base_imponible: number; importe: number }[]
  tributos: { importe: number }[]
  neto_no_gravado: number
  exento: number
}): number {
  const suma = (ns: number[]) => ns.reduce((t, n) => t + (Number.isFinite(n) ? n : 0), 0)

  return (
    suma(datos.alicuotas.map((a) => a.base_imponible)) +
    suma(datos.alicuotas.map((a) => a.importe)) +
    suma(datos.tributos.map((t) => t.importe)) +
    (Number.isFinite(datos.neto_no_gravado) ? datos.neto_no_gravado : 0) +
    (Number.isFinite(datos.exento) ? datos.exento : 0)
  )
}
