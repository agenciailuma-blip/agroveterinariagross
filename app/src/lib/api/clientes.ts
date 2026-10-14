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
  iibb_percepcion_excluido: boolean
  iibb_certificado_numero: string | null
  iibb_certificado_vigencia_hasta: string | null
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
  iibb_percepcion_excluido: false,
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

/** Lo que ARCA sabe de un CUIT: lo que devuelve la función arca-constancia. */
export interface DatosDeArca {
  cuit: string
  tipo_persona: 'fisica' | 'juridica'
  nombre: string
  /** null cuando ARCA no la informa: la elige una persona. */
  condicion_iva_id: number | null
  calle: string | null
  numero: string | null
  localidad: string | null
  provincia: string | null
  codigo_postal: string | null
  avisos: string[]
}

export type ConsultaArca =
  | { ok: true; datos: DatosDeArca }
  | {
      ok: false
      motivo: 'cuit_invalido' | 'no_existe' | 'sin_autorizacion' | 'arca_no_responde' | 'sin_conexion' | 'error'
      error: string
    }

/*
  Preguntarle a ARCA por un CUIT.

  Es lo que hace que nadie tenga que preguntarle al cliente si es
  responsable inscripto: con el CUIT, ARCA devuelve el nombre, el
  domicilio fiscal y la condición frente al IVA. No guarda nada; la
  pantalla decide qué hacer con los datos.

  Nunca tira: cada falla vuelve con su motivo, porque en todas la
  salida es la misma —cargar a mano— y la pantalla sólo tiene que
  decir por qué.
*/
export async function consultarCuitEnArca(cuit: string): Promise<ConsultaArca> {
  if (!navigator.onLine) {
    return { ok: false, motivo: 'sin_conexion', error: 'Sin internet no se puede consultar a ARCA: cargá los datos a mano.' }
  }
  const { data, error } = await supabase.functions.invoke('arca-constancia', { body: { cuit } })
  if (!error) return data as ConsultaArca

  const contexto = (error as { context?: Response }).context
  if (contexto && typeof contexto.json === 'function') {
    try {
      const cuerpo = await contexto.json()
      if (cuerpo?.motivo) return cuerpo as ConsultaArca
    } catch {
      // El cuerpo no era JSON: es una falla de la red, no de ARCA.
    }
  }
  return { ok: false, motivo: 'sin_conexion', error: 'No se pudo consultar a ARCA. Probá de nuevo o cargá los datos a mano.' }
}

/*
  Los datos de ARCA, como cambios para la ficha del cliente.

  Pisa el nombre y la condición, que son lo que ARCA sabe mejor que
  nadie y lo que decide la factura. El domicilio sólo si ARCA trae uno:
  un cliente con la dirección cargada a mano no la pierde por una
  constancia sin domicilio. La condición tampoco, si ARCA no la informa.
*/
export function cambiosDesdeArca(datos: DatosDeArca): Partial<Cliente> {
  const cambios: Partial<Cliente> = {
    tipo_persona: datos.tipo_persona,
    nombre: datos.nombre,
    tipo_documento_id: 80,
    numero_documento: datos.cuit,
  }
  if (datos.condicion_iva_id !== null) cambios.condicion_iva_id = datos.condicion_iva_id
  if (datos.calle) {
    cambios.calle = datos.calle
    cambios.numero = datos.numero
    cambios.localidad = datos.localidad
    cambios.provincia = datos.provincia
    cambios.codigo_postal = datos.codigo_postal
  }
  return cambios
}

export interface ClienteConCuit {
  id: string
  nombre: string
  numero_documento: string
  condicion_iva_id: number
}

/** Los clientes activos con CUIT: los que se pueden verificar contra ARCA. */
export async function clientesConCuit(): Promise<ClienteConCuit[]> {
  const { data, error } = await supabase
    .from('cliente')
    .select('id, nombre, numero_documento, condicion_iva_id')
    .eq('tipo_documento_id', 80)
    .not('numero_documento', 'is', null)
    .eq('activo', true)
    .is('eliminado_en', null)
    .order('nombre')
  if (error) throw new Error(error.message)
  return (data ?? []) as ClienteConCuit[]
}

const CAMPOS_PARA_VENDER =
  'id, codigo, nombre, numero_documento, condicion_iva_id, descuento_porcentaje, cuenta_corriente, limite_credito'

export interface ClienteParaVender {
  id: string
  codigo: string | null
  nombre: string
  numero_documento: string | null
  condicion_iva_id: number
  descuento_porcentaje: number
  cuenta_corriente: boolean
  limite_credito: number | null
}

/** El cliente con ese CUIT en el servidor, si hay uno. */
export async function clientePorCuit(cuit: string): Promise<ClienteParaVender | null> {
  const { data, error } = await supabase
    .from('cliente')
    .select(CAMPOS_PARA_VENDER)
    .eq('numero_documento', cuit.replace(/\D/g, ''))
    .is('eliminado_en', null)
    .limit(1)
    .maybeSingle<ClienteParaVender>()
  if (error) throw new Error(error.message)
  return data
}

/*
  El cliente que dice «factura A» y da su CUIT, desde el mostrador.

  Si ya existe en el servidor, se usa ése —la copia local del mostrador
  puede no tenerlo todavía, o tenerlo con guiones—. Si no, se da de alta
  con lo que dice ARCA. Sin la condición frente al IVA no se da de alta:
  adivinarla es emitir la letra equivocada, y eso lo resuelve una
  persona en la ficha.
*/
export async function clienteDesdeArca(
  cuit: string,
): Promise<{ ok: true; cliente: ClienteParaVender; existia: boolean } | { ok: false; error: string }> {
  const digitos = cuit.replace(/\D/g, '')

  const existente = await clientePorCuit(digitos)
  if (existente) return { ok: true, cliente: existente, existia: true }

  const r = await consultarCuitEnArca(digitos)
  if (!r.ok) return { ok: false, error: r.error }
  if (r.datos.condicion_iva_id === null) {
    return { ok: false, error: `${r.datos.avisos[0] ?? 'ARCA no informa la condición frente al IVA.'} Cargalo desde Clientes.` }
  }

  try {
    const id = await guardarCliente(null, { ...cambiosDesdeArca(r.datos), activo: true })
    const { data, error } = await supabase.from('cliente').select(CAMPOS_PARA_VENDER).eq('id', id).single<ClienteParaVender>()
    if (error) throw new Error(error.message)
    return { ok: true, cliente: data, existia: false }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
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
