import { supabase } from '@/lib/supabase'
import type { EstadoStock } from '@/lib/tipos'

export interface Operador {
  usuario_id: string
  nombre: string
  rol: string
}

export interface ProductoVenta {
  producto_id: string
  codigo: string
  nombre_interno: string
  precio_venta: number
  unidad_medida: string
  alicuota_iva_id: number
  condicion_iva: 'gravado' | 'exento' | 'no_gravado'
  cantidad: number
  estado: EstadoStock
}

export interface ClienteVenta {
  id: string
  codigo: string | null
  nombre: string
  numero_documento: string | null
  condicion_iva_id: number
  descuento_porcentaje: number
  cuenta_corriente: boolean
  limite_credito: number | null
}

export interface LineaVenta {
  /** Id local, generado en el cliente. Sobrevive a la sincronización. */
  id: string
  producto_id: string
  codigo_producto: string
  descripcion: string
  cantidad: number
  precio_original: number
  precio_unitario: number
  motivo_modificacion: string | null
  alicuota_iva_id: number
  condicion_iva: 'gravado' | 'exento' | 'no_gravado'
  /** Existencia al momento de agregarlo, para avisar si no alcanza. */
  stock_disponible: number
}

/** Identifica al operador por PIN dentro de la sesión de la terminal. */
export async function verificarPin(pin: string): Promise<Operador | null> {
  const { data, error } = await supabase.rpc('verificar_pin', { p_pin: pin })
  if (error) throw new Error(error.message)
  const filas = (data ?? []) as Operador[]
  return filas[0] ?? null
}

export async function buscarProductosVenta(texto: string): Promise<ProductoVenta[]> {
  if (!texto.trim()) return []
  const patron = `%${texto.replace(/[%_]/g, '')}%`

  // Primero por código de barra exacto: es el caso del lector, y tiene
  // que ganar siempre. Un escaneo no puede devolver una lista.
  const { data: porBarra } = await supabase
    .from('producto_codigo_barra')
    .select('producto_id')
    .eq('codigo', texto.trim())
    .is('eliminado_en', null)
    .limit(1)

  let q = supabase
    .from('vista_stock')
    .select(
      'producto_id, codigo, nombre_interno, precio_venta, unidad_medida, alicuota_iva_id, cantidad, estado',
    )
    .eq('activo', true)
    .limit(20)

  if (porBarra && porBarra.length) {
    q = q.eq('producto_id', porBarra[0].producto_id)
  } else {
    q = q
      .or(`codigo.ilike.${patron},nombre_interno.ilike.${patron},nombre_publico.ilike.${patron}`)
      .order('nombre_interno')
  }

  const { data, error } = await q
  if (error) throw new Error(error.message)

  // La vista no expone condicion_iva; se completa desde producto.
  const filas = (data ?? []) as Omit<ProductoVenta, 'condicion_iva'>[]
  if (!filas.length) return []

  const { data: condiciones } = await supabase
    .from('producto')
    .select('id, condicion_iva')
    .in(
      'id',
      filas.map((f) => f.producto_id),
    )

  const mapa = new Map((condiciones ?? []).map((c) => [c.id as string, c.condicion_iva as string]))
  return filas.map((f) => ({
    ...f,
    condicion_iva: (mapa.get(f.producto_id) ?? 'gravado') as ProductoVenta['condicion_iva'],
  }))
}

export async function buscarClientes(texto: string): Promise<ClienteVenta[]> {
  let q = supabase
    .from('cliente')
    .select(
      'id, codigo, nombre, numero_documento, condicion_iva_id, descuento_porcentaje, cuenta_corriente, limite_credito',
    )
    .eq('activo', true)
    .is('eliminado_en', null)
    .order('nombre')
    .limit(15)

  if (texto.trim()) {
    const patron = `%${texto.replace(/[%_]/g, '')}%`
    q = q.or(`nombre.ilike.${patron},numero_documento.ilike.${patron},codigo.ilike.${patron}`)
  }

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as ClienteVenta[]
}

export async function clienteConsumidorFinal(): Promise<ClienteVenta | null> {
  const { data } = await supabase
    .from('cliente')
    .select(
      'id, codigo, nombre, numero_documento, condicion_iva_id, descuento_porcentaje, cuenta_corriente, limite_credito',
    )
    .eq('codigo', 'CF')
    .maybeSingle<ClienteVenta>()
  return data
}

export interface EnvioACaja {
  clienteId: string
  vendedorId: string
  terminalId: string
  lineas: LineaVenta[]
  observaciones: string | null
}

/*
  Manda la venta a caja.

  Crea la cabecera y las líneas en una sola tanda. Los totales NO se
  envían: los recalcula un disparador en la base a partir de las líneas,
  así no puede quedar una venta cuyo total no coincida con lo que tiene
  adentro.
*/
export async function enviarACaja(datos: EnvioACaja): Promise<{ id: string; codigo: string }> {
  if (!datos.lineas.length) throw new Error('La venta no tiene productos.')

  const { data: codigo, error: errorCodigo } = await supabase.rpc('siguiente_codigo_venta', {
    p_terminal_id: datos.terminalId,
  })
  if (errorCodigo) throw new Error(errorCodigo.message)

  const { data: venta, error: errorVenta } = await supabase
    .from('venta')
    .insert({
      codigo,
      estado: 'en_caja',
      cliente_id: datos.clienteId,
      vendedor_id: datos.vendedorId,
      terminal_origen_id: datos.terminalId,
      observaciones: datos.observaciones,
      enviada_caja_en: new Date().toISOString(),
    })
    .select('id, codigo')
    .single<{ id: string; codigo: string }>()

  if (errorVenta) throw new Error(`No se pudo crear la venta: ${errorVenta.message}`)

  const { error: errorLineas } = await supabase.from('venta_linea').insert(
    datos.lineas.map((l, i) => ({
      venta_id: venta.id,
      orden: i + 1,
      producto_id: l.producto_id,
      codigo_producto: l.codigo_producto,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precio_original: l.precio_original,
      // El vendedor trabaja a nivel contado: lo que acuerda es el
      // acordado. El unitario lo va a ajustar la caja al elegir con qué
      // se paga, siempre partiendo de este valor.
      precio_acordado: l.precio_unitario,
      precio_unitario: l.precio_unitario,
      motivo_modificacion: l.motivo_modificacion,
      modificado_por: l.precio_unitario !== l.precio_original ? datos.vendedorId : null,
      alicuota_iva_id: l.alicuota_iva_id,
      condicion_iva: l.condicion_iva,
    })),
  )

  if (errorLineas) {
    // La cabecera quedó sin líneas: se descarta para no dejar basura.
    await supabase.from('venta').delete().eq('id', venta.id)
    throw new Error(`No se pudieron cargar los productos: ${errorLineas.message}`)
  }

  return venta
}
