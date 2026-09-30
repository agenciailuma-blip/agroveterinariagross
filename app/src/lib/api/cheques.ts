import { supabase } from '@/lib/supabase'

/*
  ─────────────────────────────────────────────────────────────
  Los cheques

  Un cheque no es plata que entró: es una promesa con fecha, que además
  se mueve. Entra por la caja o por la cobranza de un cliente, pasa un
  tiempo en la cartera, y sale depositado o endosado a un proveedor.
  Gross también libra los suyos, de chequera o e-cheq.

  Lo que mueve plata lo decide la base (supabase/migrations/…_cheques.sql).
  Acá están las consultas y las cuentas de pantalla: qué le falta a un
  cheque para cargarse, hasta cuándo se puede depositar, y el calendario
  agrupado por día.
  ─────────────────────────────────────────────────────────────
*/

export type EstadoCheque =
  | 'en_cartera'
  | 'depositado'
  | 'endosado'
  | 'devuelto'
  | 'rechazado'
  | 'emitido'
  | 'debitado'
  | 'anulado'

export const ESTADO_CHEQUE: Record<EstadoCheque, string> = {
  en_cartera: 'En cartera',
  depositado: 'Depositado',
  endosado: 'Endosado',
  devuelto: 'Devuelto',
  rechazado: 'Rechazado',
  emitido: 'Entregado',
  debitado: 'Debitado',
  anulado: 'Anulado',
}

/** Lo que se tipea de un cheque. Es lo que viaja en venta_pago.datos_cheque. */
export interface DatosCheque {
  banco: string
  numero: string
  /** Desde cuándo se puede cobrar. Hoy: al día. Más adelante: diferido. */
  fecha_pago: string
  librador: string
  librador_cuit: string
  electronico: boolean
}

export interface Cheque {
  id: string
  origen: 'tercero' | 'propio'
  electronico: boolean
  banco: string | null
  numero: string | null
  importe: number
  fecha_emision: string | null
  fecha_pago: string
  librador: string | null
  librador_cuit: string | null
  estado: EstadoCheque
  estado_desde: string
  cliente_id: string | null
  proveedor_id: string | null
  deposito: string | null
  motivo: string | null
  gastos: number | null
  observaciones: string | null
  creado_en: string
  nombre: string
  cliente: string | null
  cliente_con_cuenta: boolean | null
  proveedor: string | null
  venta: string | null
  diferido: boolean
  presentar_hasta: string | null
  faltan_datos: boolean
}

export interface MovimientoCheque {
  id: string
  fecha: string
  estado: EstadoCheque
  detalle: string
  creado_en: string
  usuario: { nombre: string } | null
}

/*
  Los bancos que más se ven en Oberá, para elegir sin tipear. Se puede
  escribir cualquier otro: la lista sólo ayuda a que el mismo banco no
  quede escrito de cinco formas, que es lo que después hace difícil
  encontrar un cheque.
*/
export const BANCOS = [
  'Macro',
  'Nación',
  'Galicia',
  'Santander',
  'BBVA',
  'Credicoop',
  'Patagonia',
  'Supervielle',
  'ICBC',
  'Hipotecario',
  'Comafi',
  'Ciudad',
  'Provincia de Buenos Aires',
  'Industrial',
  'Columbia',
] as const

export const hoyEnObera = () => {
  // El día de Oberá, no el UTC: a las diez de la noche ya sería mañana.
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/** Días de a a b, contando por calendario (no por horas). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

export function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10)
}

/*
  Un cheque nuevo, con el cliente como librador. Casi siempre el que
  paga con cheque es quien lo firmó; si no, se cambia. El consumidor
  final no se propone: ahí el librador es alguien que hay que escribir.
*/
export function chequeVacio(cliente?: string | null, hoy = hoyEnObera()): DatosCheque {
  const propio = cliente && !/consumidor final/i.test(cliente) ? cliente : ''
  return { banco: '', numero: '', fecha_pago: hoy, librador: propio, librador_cuit: '', electronico: false }
}

/** El CUIT con su dígito verificador, igual que app.cuit_valido en la base. */
export function cuitValido(texto: string): boolean {
  const d = texto.replace(/\D/g, '')
  if (d.length !== 11) return false
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const suma = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0)
  const resto = 11 - (suma % 11)
  const dv = resto === 11 ? 0 : resto === 10 ? 9 : resto
  return dv === Number(d[10])
}

/*
  Lo que le falta a un cheque para poder cargarse, dicho para el que lo
  tiene en la mano. Nulo si está completo.

  Son las mismas reglas que controla la base en la cobranza y en el pago
  a proveedores (app.validar_cheque). En la caja no hay base que
  pregunte —puede estar sin conexión—, así que esta es la única barrera
  antes de que el cliente se vaya.
*/
export function faltaEnCheque(d: DatosCheque, origen: 'tercero' | 'propio' = 'tercero', hoy = hoyEnObera()): string | null {
  if (!d.banco.trim()) return 'Falta el banco.'
  if (!d.numero.trim()) return 'Falta el número.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha_pago)) return 'Falta la fecha de pago.'
  if (diasEntre(hoy, d.fecha_pago) > 365) return 'La fecha de pago pasa del año: un diferido es, como mucho, a 360 días.'
  if (origen === 'tercero' && diasEntre(d.fecha_pago, hoy) > 30)
    return 'Pasaron más de 30 días de la fecha de pago: el banco ya no lo paga.'
  if (d.librador_cuit.trim() && !cuitValido(d.librador_cuit)) return 'El CUIT del librador no es válido.'
  return null
}

export type Plazo =
  | { tipo: 'todavia_no'; dias: number }
  | { tipo: 'se_puede'; dias: number }
  | { tipo: 'ultimos_dias'; dias: number }
  | { tipo: 'vencido'; dias: number }

/*
  Hasta cuándo se puede depositar un cheque de la cartera.

  Desde su fecha de pago hay 30 días; después el banco ya no lo paga.
  Con una semana o menos se avisa en ámbar, porque un cheque «que se hace
  correr» es justamente el que se queda en el cajón hasta el último día.
*/
export function plazoDeDeposito(fechaPago: string, hoy = hoyEnObera()): Plazo {
  const faltanParaCobrar = diasEntre(hoy, fechaPago)
  if (faltanParaCobrar > 0) return { tipo: 'todavia_no', dias: faltanParaCobrar }
  const quedan = diasEntre(hoy, sumarDias(fechaPago, 30))
  if (quedan < 0) return { tipo: 'vencido', dias: -quedan }
  if (quedan <= 7) return { tipo: 'ultimos_dias', dias: quedan }
  return { tipo: 'se_puede', dias: quedan }
}

export function textoDelPlazo(p: Plazo): string {
  switch (p.tipo) {
    case 'todavia_no':
      return p.dias === 1 ? 'Se cobra mañana' : `Se cobra en ${p.dias} días`
    case 'se_puede':
      return `Se puede depositar · quedan ${p.dias} días`
    case 'ultimos_dias':
      return p.dias === 0 ? 'Hoy es el último día para depositarlo' : `Quedan ${p.dias} ${p.dias === 1 ? 'día' : 'días'} para depositarlo`
    case 'vencido':
      return `Se pasó el plazo hace ${p.dias} ${p.dias === 1 ? 'día' : 'días'}: el banco ya no lo paga`
  }
}

/*
  ─────────────────────────────────────────────────────────────
  Consultas
  ─────────────────────────────────────────────────────────────
*/

const aNumero = (c: Cheque): Cheque => ({
  ...c,
  importe: Number(c.importe),
  gastos: c.gastos == null ? null : Number(c.gastos),
})

export type Vista = 'cartera' | 'propios' | 'todos'

export async function listarCheques(vista: Vista): Promise<Cheque[]> {
  let q = supabase.from('vista_cheque').select('*')
  if (vista === 'cartera') q = q.eq('estado', 'en_cartera').order('fecha_pago').order('importe', { ascending: false })
  else if (vista === 'propios') q = q.eq('estado', 'emitido').order('fecha_pago')
  else q = q.order('creado_en', { ascending: false }).limit(300)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return ((data ?? []) as Cheque[]).map(aNumero)
}

/** Los cheques que se pueden endosar: los de la cartera, con sus datos completos. */
export async function carteraParaEndosar(): Promise<Cheque[]> {
  return (await listarCheques('cartera')).filter((c) => !c.faltan_datos)
}

export async function historialDe(chequeId: string): Promise<MovimientoCheque[]> {
  const { data, error } = await supabase
    .from('cheque_movimiento')
    .select('id, fecha, estado, detalle, creado_en, usuario:usuario_id(nombre)')
    .eq('cheque_id', chequeId)
    .order('creado_en')
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as MovimientoCheque[]
}

export async function chequesDeLaCaja(cajaId: string) {
  const { data, error } = await supabase.rpc('cheques_de_la_caja', { p_caja_id: cajaId })
  if (error) throw new Error(error.message)
  return ((data ?? []) as { nombre: string; importe: number; fecha_pago: string; cliente: string | null }[]).map(
    (c) => ({ ...c, importe: Number(c.importe) }),
  )
}

/*
  ─────────────────────────────────────────────────────────────
  Lo que mueve la cartera
  ─────────────────────────────────────────────────────────────
*/

async function rpc(nombre: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(nombre, args)
  if (error) throw new Error(error.message)
  return data
}

/** Datos del cheque, como los espera la base. */
export const paraLaBase = (d: DatosCheque, importe: number) => ({
  banco: d.banco.trim(),
  numero: d.numero.trim(),
  fecha_pago: d.fecha_pago,
  librador: d.librador.trim(),
  librador_cuit: d.librador_cuit.replace(/\D/g, ''),
  electronico: d.electronico,
  importe,
})

export function cobrarConCheques(p: {
  clienteId: string
  cheques: { datos: DatosCheque; importe: number }[]
  concepto: string | null
  usuarioId: string
}) {
  return rpc('registrar_cobranza_con_cheques', {
    p_cliente_id: p.clienteId,
    p_cheques: p.cheques.map((c) => paraLaBase(c.datos, c.importe)),
    p_concepto: p.concepto,
    p_usuario_id: p.usuarioId,
  })
}

export const depositar = (ids: string[], fecha: string, cuenta: string) =>
  rpc('depositar_cheques', { p_ids: ids, p_fecha: fecha, p_cuenta: cuenta || null })

export const marcarDebitados = (ids: string[], fecha: string) =>
  rpc('marcar_cheques_debitados', { p_ids: ids, p_fecha: fecha })

export const deshacer = (id: string, motivo: string) => rpc('deshacer_cheque', { p_id: id, p_motivo: motivo })

export const devolver = (id: string, fecha: string, motivo: string, cargar: boolean) =>
  rpc('devolver_cheque', { p_id: id, p_fecha: fecha, p_motivo: motivo, p_cargar_al_cliente: cargar })

export const rechazar = (id: string, fecha: string, motivo: string, gastos: number, cargar: boolean) =>
  rpc('rechazar_cheque', { p_id: id, p_fecha: fecha, p_motivo: motivo, p_gastos: gastos, p_cargar_al_cliente: cargar })

export const corregir = (id: string, datos: Partial<DatosCheque> & { observaciones?: string }) =>
  rpc('corregir_cheque', { p_id: id, p_datos: datos })

/*
  ─────────────────────────────────────────────────────────────
  El calendario: qué se cobra y qué se paga
  ─────────────────────────────────────────────────────────────
*/

export interface RenglonCalendario {
  fecha: string | null
  sentido: 'entra' | 'sale'
  tipo: 'cheque' | 'cuenta_cliente' | 'proveedor' | 'cheque_propio'
  descripcion: string
  quien: string
  importe: number
  referencia: string
}

export async function listarCalendario(): Promise<RenglonCalendario[]> {
  const { data, error } = await supabase.from('vista_calendario').select('*')
  if (error) throw new Error(error.message)
  return ((data ?? []) as RenglonCalendario[]).map((r) => ({ ...r, importe: Number(r.importe) }))
}

export interface DiaCalendario {
  /** La fecha, o 'atrasado' para todo lo de antes de hoy. */
  clave: string
  entra: RenglonCalendario[]
  sale: RenglonCalendario[]
  totalEntra: number
  totalSale: number
}

const cent = (n: number) => Math.round(n * 100) / 100

/*
  El calendario agrupado por día, de hoy hasta `hasta`.

  Lo de antes de hoy va junto arriba, como «atrasado»: una factura
  vencida o una cuenta que no se pagó no se ordenan por el día en que
  vencieron, se ordenan por el hecho de que ya tendrían que haberse
  resuelto. Los cheques de la cartera que ya se pueden cobrar también
  van ahí: es plata que se puede ir a buscar hoy.

  Lo que no tiene fecha —una factura cargada sin vencimiento— queda
  afuera de los días y se cuenta aparte, para que no se pierda.
*/
export function agruparCalendario(
  renglones: RenglonCalendario[],
  hoy: string,
  hasta: string,
): { dias: DiaCalendario[]; sinFecha: RenglonCalendario[] } {
  const porClave = new Map<string, DiaCalendario>()
  const sinFecha: RenglonCalendario[] = []

  for (const r of renglones) {
    if (!r.fecha) {
      sinFecha.push(r)
      continue
    }
    if (r.fecha > hasta) continue
    const clave = r.fecha < hoy ? 'atrasado' : r.fecha
    let dia = porClave.get(clave)
    if (!dia) {
      dia = { clave, entra: [], sale: [], totalEntra: 0, totalSale: 0 }
      porClave.set(clave, dia)
    }
    if (r.sentido === 'entra') {
      dia.entra.push(r)
      dia.totalEntra = cent(dia.totalEntra + r.importe)
    } else {
      dia.sale.push(r)
      dia.totalSale = cent(dia.totalSale + r.importe)
    }
  }

  const porImporte = (a: RenglonCalendario, b: RenglonCalendario) => b.importe - a.importe
  const dias = [...porClave.values()]
    .map((d) => ({ ...d, entra: d.entra.sort(porImporte), sale: d.sale.sort(porImporte) }))
    .sort((a, b) => (a.clave === 'atrasado' ? -1 : b.clave === 'atrasado' ? 1 : a.clave.localeCompare(b.clave)))

  return { dias, sinFecha: sinFecha.sort(porImporte) }
}
