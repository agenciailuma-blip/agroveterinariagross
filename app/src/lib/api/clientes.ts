import { supabase } from '@/lib/supabase'

export interface FilaCliente {
  id: string
  codigo: string | null
  nombre: string
  numero_documento: string | null
  condicion_iva_id: number
  cuenta_corriente: boolean
  activo: boolean
  saldo: number
}

export interface Cliente {
  id: string
  codigo: string | null
  tipo_persona: 'fisica' | 'juridica'
  nombre: string
  nombre_fantasia: string | null
  condicion_iva_id: number
  tipo_documento_id: number
  numero_documento: string | null
  calle: string | null
  numero: string | null
  piso_depto: string | null
  localidad: string | null
  provincia: string | null
  codigo_postal: string | null
  telefono: string | null
  email: string | null
  descuento_porcentaje: number
  lista_precio_id: string | null
  cuenta_corriente: boolean
  limite_credito: number | null
  dias_vencimiento: number
  observaciones: string | null
  activo: boolean
}

export interface MovimientoCC {
  id: string
  tipo: string
  importe: number
  concepto: string | null
  vencimiento: string | null
  ocurrido_en: string
  usuario: { nombre: string } | null
}

export interface CondicionIva {
  id: number
  descripcion: string
  tipo_comprobante: string
}

export interface TipoDocumento {
  id: number
  sigla: string
  descripcion: string
}

export const CLIENTE_NUEVO: Partial<Cliente> = {
  tipo_persona: 'fisica',
  nombre: '',
  condicion_iva_id: 5,
  tipo_documento_id: 99,
  provincia: 'Misiones',
  descuento_porcentaje: 0,
  cuenta_corriente: false,
  dias_vencimiento: 30,
  activo: true,
}

export async function listarClientes(texto: string, soloConDeuda: boolean) {
  let q = supabase
    .from('cliente')
    .select(
      'id, codigo, nombre, numero_documento, condicion_iva_id, cuenta_corriente, activo, cuenta_corriente_saldo(saldo)',
      { count: 'exact' },
    )
    .is('eliminado_en', null)
    .order('nombre')
    .limit(100)

  if (texto.trim()) {
    const patron = `%${texto.replace(/[%_]/g, '')}%`
    q = q.or(`nombre.ilike.${patron},numero_documento.ilike.${patron},codigo.ilike.${patron}`)
  }
  if (soloConDeuda) q = q.eq('cuenta_corriente', true)

  const { data, error, count } = await q
  if (error) throw new Error(error.message)

  type Fila = Omit<FilaCliente, 'saldo'> & { cuenta_corriente_saldo: { saldo: number } | null }
  const filas = ((data ?? []) as unknown as Fila[]).map((c) => ({
    ...c,
    saldo: Number(c.cuenta_corriente_saldo?.saldo ?? 0),
  }))

  return {
    filas: soloConDeuda ? filas.filter((c) => c.saldo > 0) : filas,
    total: count ?? 0,
  }
}

export async function obtenerCliente(id: string) {
  const [cliente, saldo] = await Promise.all([
    supabase.from('cliente').select('*').eq('id', id).single<Cliente>(),
    supabase
      .from('cuenta_corriente_saldo')
      .select('saldo')
      .eq('cliente_id', id)
      .maybeSingle<{ saldo: number }>(),
  ])
  if (cliente.error) throw new Error(cliente.error.message)
  return { cliente: cliente.data, saldo: Number(saldo.data?.saldo ?? 0) }
}

export async function referenciasFiscales() {
  const [condiciones, documentos, listas] = await Promise.all([
    supabase
      .from('condicion_iva_receptor')
      .select('id, descripcion, tipo_comprobante')
      .eq('activo', true)
      .order('id'),
    supabase
      .from('tipo_documento')
      .select('id, sigla, descripcion')
      .eq('activo', true)
      .order('id'),
    supabase.from('lista_precio').select('id, nombre').is('eliminado_en', null).order('orden'),
  ])
  return {
    condiciones: (condiciones.data ?? []) as CondicionIva[],
    documentos: (documentos.data ?? []) as TipoDocumento[],
    listas: (listas.data ?? []) as { id: string; nombre: string }[],
  }
}

export async function guardarCliente(id: string | null, campos: Partial<Cliente>) {
  // Se limpian las cadenas vacías: un documento en blanco tiene que ser
  // nulo, o el índice de unicidad lo trata como un valor más y bloquea
  // el segundo cliente sin documento.
  const limpio = Object.fromEntries(
    Object.entries(campos).map(([k, v]) => [k, v === '' ? null : v]),
  )

  if (id) {
    const { error } = await supabase.from('cliente').update(limpio).eq('id', id)
    if (error) throw new Error(traducir(error.message))
    return id
  }

  const { data, error } = await supabase
    .from('cliente')
    .insert(limpio)
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(traducir(error.message))
  return data.id
}

function traducir(mensaje: string) {
  if (mensaje.includes('cliente_ri_requiere_cuit'))
    return 'Un Responsable Inscripto necesita CUIT. Con DNI o sin identificar, ARCA rechaza la Factura A.'
  if (mensaje.includes('cliente_documento_unico'))
    return 'Ya existe otro cliente con ese documento.'
  if (mensaje.includes('cliente_codigo_unico')) return 'Ya existe otro cliente con ese código.'
  return mensaje
}

export async function movimientosCuentaCorriente(clienteId: string): Promise<MovimientoCC[]> {
  const { data, error } = await supabase
    .from('movimiento_cuenta_corriente')
    .select('id, tipo, importe, concepto, vencimiento, ocurrido_en, usuario:usuario_id(nombre)')
    .eq('cliente_id', clienteId)
    .order('ocurrido_en', { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as MovimientoCC[]
}

export async function registrarCobranza(datos: {
  clienteId: string
  importe: number
  medioPagoId: string
  cajaId: string | null
  concepto: string | null
  usuarioId: string
}) {
  const { error } = await supabase.rpc('registrar_cobranza', {
    p_cliente_id: datos.clienteId,
    p_importe: datos.importe,
    p_medio_pago_id: datos.medioPagoId,
    p_caja_id: datos.cajaId,
    p_concepto: datos.concepto,
    p_usuario_id: datos.usuarioId,
  })
  if (error) throw new Error(error.message)
}

export const ETIQUETA_MOVIMIENTO: Record<string, string> = {
  saldo_inicial: 'Saldo inicial',
  venta: 'Venta',
  cobranza: 'Cobranza',
  nota_credito: 'Nota de crédito',
  nota_debito: 'Nota de débito',
  ajuste: 'Ajuste',
}
