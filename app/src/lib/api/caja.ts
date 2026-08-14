import { supabase } from '@/lib/supabase'

export interface Caja {
  id: string
  terminal_id: string
  cajero_id: string | null
  estado: 'abierta' | 'cerrada'
  monto_inicial: number
  abierta_en: string
}

export interface VentaEnCola {
  id: string
  codigo: string
  total: number
  ocurrido_en: string
  enviada_caja_en: string | null
  cliente: { nombre: string } | null
  vendedor: { nombre: string } | null
}

export interface LineaCobro {
  id: string
  orden: number
  codigo_producto: string
  descripcion: string
  cantidad: number
  precio_original: number
  precio_acordado: number
  precio_unitario: number
  motivo_modificacion: string | null
}

export interface VentaCompleta {
  id: string
  codigo: string
  estado: string
  total: number
  descuento_total: number
  lista_precio_id: string | null
  observaciones: string | null
  cliente: {
    id: string
    nombre: string
    condicion_iva_id: number
    cuenta_corriente: boolean
    limite_credito: number | null
  } | null
  vendedor: { id: string; nombre: string } | null
  venta_linea: LineaCobro[]
}

export interface PagoNuevo {
  medio_pago_id: string
  importe: number
  cuotas: number
  referencia: string | null
}

export async function cajaAbierta(terminalId: string): Promise<Caja | null> {
  const { data, error } = await supabase
    .from('caja')
    .select('id, terminal_id, cajero_id, estado, monto_inicial, abierta_en')
    .eq('terminal_id', terminalId)
    .eq('estado', 'abierta')
    .maybeSingle<Caja>()
  if (error) throw new Error(error.message)
  return data
}

export async function abrirCaja(terminalId: string, cajeroId: string, montoInicial: number) {
  const { data, error } = await supabase
    .from('caja')
    .insert({ terminal_id: terminalId, cajero_id: cajeroId, monto_inicial: montoInicial })
    .select('id, terminal_id, cajero_id, estado, monto_inicial, abierta_en')
    .single<Caja>()
  if (error) throw new Error(`No se pudo abrir la caja: ${error.message}`)
  return data
}

export async function listarVentasEnCola(): Promise<VentaEnCola[]> {
  const { data, error } = await supabase
    .from('venta')
    .select(
      'id, codigo, total, ocurrido_en, enviada_caja_en, cliente:cliente_id(nombre), vendedor:vendedor_id(nombre)',
    )
    .eq('estado', 'en_caja')
    .order('enviada_caja_en', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as VentaEnCola[]
}

export async function obtenerVentaCompleta(id: string): Promise<VentaCompleta> {
  const { data, error } = await supabase
    .from('venta')
    .select(
      `id, codigo, estado, total, descuento_total, lista_precio_id, observaciones,
       cliente:cliente_id(id, nombre, condicion_iva_id, cuenta_corriente, limite_credito),
       vendedor:vendedor_id(id, nombre),
       venta_linea(id, orden, codigo_producto, descripcion, cantidad,
                   precio_original, precio_acordado, precio_unitario, motivo_modificacion)`,
    )
    .eq('id', id)
    .single()
  if (error) throw new Error(error.message)
  const venta = data as unknown as VentaCompleta
  venta.venta_linea = [...venta.venta_linea].sort((a, b) => a.orden - b.orden)
  return venta
}

/** Aplica una lista a la venta y devuelve el total recalculado. */
export async function aplicarLista(ventaId: string, listaId: string | null): Promise<number> {
  const { data, error } = await supabase.rpc('aplicar_lista_a_venta', {
    p_venta_id: ventaId,
    p_lista_id: listaId,
  })
  if (error) throw new Error(error.message)
  return Number(data)
}

/*
  Lleva el total a un importe acordado con el cliente.

  "Dale, te queda en mil." La base lo prorratea entre las líneas, deja
  motivo y responsable, y ajusta el precio acordado para que la rebaja
  no se evapore si después cambia el medio de pago.
*/
export async function ajustarTotal(
  ventaId: string,
  nuevoTotal: number,
  motivo: string,
  usuarioId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('ajustar_total_venta', {
    p_venta_id: ventaId,
    p_nuevo_total: nuevoTotal,
    p_motivo: motivo,
    p_usuario_id: usuarioId,
  })
  if (error) throw new Error(error.message)
  return Number(data)
}

export async function saldoCuentaCorriente(clienteId: string): Promise<number> {
  const { data } = await supabase
    .from('cuenta_corriente_saldo')
    .select('saldo')
    .eq('cliente_id', clienteId)
    .maybeSingle<{ saldo: number }>()
  return Number(data?.saldo ?? 0)
}

/*
  Cobra la venta.

  Los pagos se insertan y después se llama a cobrar_venta(), que valida
  que sumen el total, verifica el límite de crédito, descuenta stock y
  registra la deuda en una sola transacción. Si algo falla ahí, se
  limpian los pagos: una venta con pagos cargados y sin cobrar se
  volvería a cobrar mal en el próximo intento.
*/
export async function cobrar(
  ventaId: string,
  cajaId: string,
  cajeroId: string,
  pagos: PagoNuevo[],
): Promise<void> {
  await supabase.from('venta_pago').delete().eq('venta_id', ventaId)

  const { error: errorPagos } = await supabase
    .from('venta_pago')
    .insert(pagos.map((p) => ({ ...p, venta_id: ventaId })))
  if (errorPagos) throw new Error(`No se pudieron registrar los pagos: ${errorPagos.message}`)

  const { error } = await supabase.rpc('cobrar_venta', {
    p_venta_id: ventaId,
    p_caja_id: cajaId,
    p_cajero_id: cajeroId,
  })

  if (error) {
    await supabase.from('venta_pago').delete().eq('venta_id', ventaId)
    throw new Error(error.message)
  }
}

export async function anular(ventaId: string, motivo: string) {
  const { error } = await supabase.rpc('anular_venta', {
    p_venta_id: ventaId,
    p_motivo: motivo,
  })
  if (error) throw new Error(error.message)
}

export interface ResultadoCierre {
  esperado: number
  declarado: number
  diferencia: number
}

export async function cerrarCaja(cajaId: string, montoDeclarado: number) {
  const { data, error } = await supabase.rpc('cerrar_caja', {
    p_caja_id: cajaId,
    p_monto_declarado: montoDeclarado,
  })
  if (error) throw new Error(error.message)
  const filas = (data ?? []) as ResultadoCierre[]
  return filas[0]
}

export async function resumenCaja(cajaId: string) {
  const [ventas, movimientos] = await Promise.all([
    supabase
      .from('venta')
      .select('id, total')
      .eq('caja_id', cajaId)
      .eq('estado', 'cobrada'),
    supabase.from('caja_movimiento').select('importe').eq('caja_id', cajaId),
  ])
  return {
    ventas: ventas.data?.length ?? 0,
    facturado: (ventas.data ?? []).reduce((s, v) => s + Number(v.total), 0),
    movimientos: (movimientos.data ?? []).reduce((s, m) => s + Number(m.importe), 0),
  }
}
