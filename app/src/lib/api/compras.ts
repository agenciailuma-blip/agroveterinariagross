import { supabase } from '@/lib/supabase'

/*
  Las facturas de compra.

  Lo que se carga es la CABECERA de la factura que emitió el proveedor:
  quién, cuál, cuándo, y el desglose por alícuota de IVA. La mercadería
  —líneas, stock y costo— se recibe en un paso aparte, más abajo.

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
  /** Cuándo entró la mercadería al stock. Nulo: todavía no. */
  recibida_en: string | null
  proveedor_id: string
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
  'tributos_total, total, observaciones, recibida_en, proveedor_id, proveedor:proveedor_id(nombre), ' +
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

/*
  ─────────────────────────────────────────────────────────────
  Recibir la mercadería de una factura

  Es un paso aparte de cargar la factura, a propósito: a veces lo hace
  la misma persona de una vez y a veces otra, al otro día (Lucas, audio
  3 del 10/09). Entra el stock y el costo del producto pasa a ser el de
  esta factura. El precio de venta NO se toca: se propone.
  ─────────────────────────────────────────────────────────────
*/

export interface LineaARecibir {
  producto_id: string
  cantidad: number
  /** Como está impreso: sin IVA en una A, con IVA en una B o C. */
  costo_unitario: number
}

export interface Recibido {
  producto_id: string
  codigo: string
  nombre: string
  cantidad: number
  costo_anterior: number | null
  costo_nuevo: number | null
  precio_actual: number
  margen_objetivo: number | null
  precio_sugerido: number | null
}

export async function recibirMercaderia(compraId: string, lineas: LineaARecibir[]): Promise<Recibido[]> {
  const { data, error } = await supabase.rpc('recibir_mercaderia', {
    p_compra_id: compraId,
    p_lineas: lineas,
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Recibido[]).map((r) => ({
    ...r,
    cantidad: Number(r.cantidad),
    costo_anterior: r.costo_anterior === null ? null : Number(r.costo_anterior),
    costo_nuevo: r.costo_nuevo === null ? null : Number(r.costo_nuevo),
    precio_actual: Number(r.precio_actual),
    margen_objetivo: r.margen_objetivo === null ? null : Number(r.margen_objetivo),
    precio_sugerido: r.precio_sugerido === null ? null : Number(r.precio_sugerido),
  }))
}

/** La cuenta la hace la base, con el costo y el margen de ese momento. Devuelve cuántos cambió. */
export async function aplicarPrecioSugerido(productoIds: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('aplicar_precio_sugerido', { p_producto_ids: productoIds })
  if (error) throw new Error(error.message)
  return data as number
}

export interface ProductoParaRecibir {
  producto_id: string
  codigo: string
  nombre_interno: string
  costo: number | null
  alicuota_iva_id: number
  /** Lo encontró el lector: entra sin tener que elegirlo. */
  por_barra?: boolean
}

/*
  Buscar el producto de un renglón.

  Primero por código de barras exacto —con la caja en la mano es lo
  más rápido: se pasa el lector—, y si no, por código o nombre.
*/
export async function buscarProductoParaRecibir(texto: string): Promise<ProductoParaRecibir[]> {
  const t = texto.trim()
  if (!t) return []
  const columnas = 'producto_id, codigo, nombre_interno, costo, alicuota_iva_id'

  const { data: barra } = await supabase
    .from('producto_codigo_barra')
    .select('producto_id')
    .eq('codigo', t)
    .is('eliminado_en', null)
    .limit(1)

  if (barra?.length) {
    const { data, error } = await supabase
      .from('vista_stock')
      .select(columnas)
      .eq('producto_id', barra[0].producto_id)
    if (error) throw new Error(error.message)
    return ((data ?? []) as ProductoParaRecibir[]).map((p) => ({ ...p, por_barra: true }))
  }

  const patron = `%${t.replace(/[%_]/g, '')}%`
  const { data, error } = await supabase
    .from('vista_stock')
    .select(columnas)
    .or(`codigo.ilike.${patron},nombre_interno.ilike.${patron}`)
    .order('nombre_interno')
    .limit(12)
  if (error) throw new Error(error.message)
  return (data ?? []) as ProductoParaRecibir[]
}

/*
  El alta rápida de un producto que llegó y no está en el catálogo.

  Lo mínimo para que pueda entrar al stock: código, nombre y alícuota.
  Queda sin precio y sin revisar, así aparece primero en la lista de
  Productos para completarlo —y la pantalla lo avisa—. Se le pone el
  proveedor de la factura, que es el dato que ya se tiene a mano.
*/
export async function altaRapidaDeProducto(p: {
  codigo: string
  nombre_interno: string
  alicuota_iva_id: number
  proveedor_id: string
}): Promise<ProductoParaRecibir> {
  const { data, error } = await supabase
    .from('producto')
    .insert({ ...p, codigo: p.codigo.trim(), nombre_interno: p.nombre_interno.trim() })
    .select('id, codigo, nombre_interno, costo, alicuota_iva_id')
    .single<{ id: string; codigo: string; nombre_interno: string; costo: number | null; alicuota_iva_id: number }>()
  if (error) {
    if (error.code === '23505') throw new Error(`Ya hay un producto con el código ${p.codigo.trim()}.`)
    throw new Error(error.message)
  }
  return { ...data, producto_id: data.id }
}

/*
  El costo con IVA que va a quedar en el producto, para mostrarlo
  mientras se carga. La cuenta que vale es la de la base
  (app.costo_con_iva); ésta tiene que dar lo mismo, y la prueba lo
  cuida.

  Sólo la A y la M discriminan el IVA en el papel. En una B o una C el
  unitario ya es el precio final.
*/
export function costoConIva(costoUnitario: number, clase: string | null | undefined, porcentaje: number, gravado = true): number {
  if (!Number.isFinite(costoUnitario)) return 0
  const conIva = (clase === 'A' || clase === 'M') && gravado ? costoUnitario * (1 + porcentaje / 100) : costoUnitario
  return Math.round(conIva * 10000) / 10000
}

/** Cuánto cambió el costo, en porcentaje. Nulo si antes no había. */
export function variacionDeCosto(anterior: number | null, nuevo: number | null): number | null {
  if (!anterior || anterior <= 0 || nuevo === null) return null
  return Math.round((nuevo / anterior - 1) * 1000) / 10
}
