import { supabase } from '@/lib/supabase'

/*
  ─────────────────────────────────────────────────────────────
  La cuenta corriente de los proveedores

  Cuánto se le debe a cada uno, qué falta pagar de cada factura, y los
  pagos. Es el espejo de la cuenta de clientes, del otro lado del
  mostrador.

  Las cuentas de plata las hace la base (vista_saldo_proveedor,
  vista_pendiente_proveedor, registrar_pago_proveedor). Acá sólo se
  proponen las imputaciones y se arma el saldo acumulado del resumen,
  que son cuentas de pantalla.
  ─────────────────────────────────────────────────────────────
*/

export interface SaldoProveedor {
  proveedor_id: string
  nombre: string
  numero_documento: string | null
  saldo: number
  vencido: number
  a_cuenta: number
  proximo_vencimiento: string | null
  ultimo_pago: string | null
}

export type Origen = 'compra' | 'saldo_inicial' | 'cheque_rechazado'

export interface Pendiente {
  origen: Origen
  id: string
  fecha: string
  vencimiento: string | null
  descripcion: string
  signo: number
  total: number
  imputado: number
  pendiente: number
  vencida: boolean
}

export interface Movimiento {
  fecha: string
  tipo: Origen | 'pago'
  id: string
  descripcion: string
  debe: number
  haber: number
  detalle: string | null
}

export type Medio = 'efectivo' | 'transferencia' | 'cheque_propio' | 'cheque_tercero' | 'otro'

export const MEDIOS: { valor: Medio; etiqueta: string }[] = [
  { valor: 'transferencia', etiqueta: 'Transferencia' },
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'cheque_tercero', etiqueta: 'Cheque de la cartera' },
  { valor: 'cheque_propio', etiqueta: 'Cheque propio o e-cheq' },
  { valor: 'otro', etiqueta: 'Otro' },
]

export const esCheque = (m: Medio) => m === 'cheque_propio' || m === 'cheque_tercero'

export interface MedioDePago {
  medio: Medio
  importe: number
  banco?: string
  numero?: string
  fecha_cobro?: string
  referencia?: string
  /** El cheque de la cartera que se endosa. */
  cheque_id?: string
  /** El propio, si es e-cheq. */
  electronico?: boolean
}

export interface Imputacion {
  origen: Origen
  id: string
  importe: number
}

const aNumeros = <T extends object>(fila: T, claves: (keyof T)[]): T => {
  const copia = { ...fila }
  for (const k of claves) copia[k] = Number(copia[k]) as T[keyof T]
  return copia
}

export async function listarSaldos(): Promise<SaldoProveedor[]> {
  const { data, error } = await supabase
    .from('vista_saldo_proveedor')
    .select('*')
    .order('nombre')
  if (error) throw new Error(error.message)
  return ((data ?? []) as SaldoProveedor[]).map((s) => aNumeros(s, ['saldo', 'vencido', 'a_cuenta']))
}

export async function pendientesDe(proveedorId: string): Promise<Pendiente[]> {
  const { data, error } = await supabase
    .from('vista_pendiente_proveedor')
    .select('origen, id, fecha, vencimiento, descripcion, signo, total, imputado, pendiente, vencida')
    .eq('proveedor_id', proveedorId)
    .neq('pendiente', 0)
  if (error) throw new Error(error.message)
  return ordenarParaPagar(
    ((data ?? []) as Pendiente[]).map((p) => aNumeros(p, ['total', 'imputado', 'pendiente', 'signo'])),
  )
}

export async function movimientosDe(proveedorId: string): Promise<Movimiento[]> {
  const { data, error } = await supabase
    .from('vista_movimiento_proveedor')
    .select('fecha, tipo, id, descripcion, debe, haber, detalle')
    .eq('proveedor_id', proveedorId)
    .order('fecha')
  if (error) throw new Error(error.message)
  return ((data ?? []) as Movimiento[]).map((m) => aNumeros(m, ['debe', 'haber']))
}

export async function registrarPago(p: {
  proveedor_id: string
  fecha: string
  medios: MedioDePago[]
  imputaciones: Imputacion[]
  observaciones: string
}): Promise<string> {
  const { data, error } = await supabase.rpc('registrar_pago_proveedor', {
    p_proveedor_id: p.proveedor_id,
    p_fecha: p.fecha,
    p_medios: p.medios,
    p_imputaciones: p.imputaciones.filter((i) => i.importe !== 0),
    p_observaciones: p.observaciones,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function anularPago(id: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('anular_pago_proveedor', { p_pago_id: id, p_motivo: motivo })
  if (error) throw new Error(error.message)
}

export async function definirSaldoInicial(p: {
  proveedor_id: string
  fecha: string
  importe: number
  detalle: string
}): Promise<void> {
  const { error } = await supabase.rpc('definir_saldo_inicial_proveedor', {
    p_proveedor_id: p.proveedor_id,
    p_fecha: p.fecha,
    p_importe: p.importe,
    p_detalle: p.detalle,
  })
  if (error) throw new Error(error.message)
}

/*
  ─────────────────────────────────────────────────────────────
  Lo que se calcula en la pantalla
  ─────────────────────────────────────────────────────────────
*/

/*
  El orden en que se paga: primero lo que vence antes. Sin vencimiento,
  cuenta su fecha. El saldo inicial es lo más viejo que hay, y va
  primero por su propia fecha.
*/
export function ordenarParaPagar(ps: Pendiente[]): Pendiente[] {
  const clave = (p: Pendiente) => p.vencimiento ?? p.fecha
  return [...ps].sort((a, b) => clave(a).localeCompare(clave(b)) || a.fecha.localeCompare(b.fecha))
}

/*
  Las imputaciones que se proponen para un pago: decidido el 28/09, se
  eligen a mano, pero con las más viejas ya marcadas.

  Primero se descuentan todas las notas de crédito —son plata a favor,
  y no usarlas es pagar de más—; con eso y lo que sale se cubren las
  facturas de la más vieja a la más nueva. La última puede quedar
  pagada en parte. Lo que sobra queda a cuenta.
*/
export function imputacionSugerida(pendientes: Pendiente[], importe: number): Imputacion[] {
  const cent = (n: number) => Math.round(n * 100) / 100
  const creditos = pendientes.filter((p) => p.pendiente < 0)
  const deudas = ordenarParaPagar(pendientes.filter((p) => p.pendiente > 0))

  let disponible = cent(Math.max(importe, 0) + creditos.reduce((s, c) => s - c.pendiente, 0))
  const aDeudas: Imputacion[] = []
  for (const d of deudas) {
    if (disponible <= 0) break
    const monto = cent(Math.min(d.pendiente, disponible))
    aDeudas.push({ origen: d.origen, id: d.id, importe: monto })
    disponible = cent(disponible - monto)
  }

  /*
    Si las facturas no alcanzan para usar todas las notas de crédito,
    se usan sólo las que hacen falta: una imputación que deja el total
    en negativo la base la rechaza, y con razón.
  */
  const cubierto = aDeudas.reduce((s, i) => s + i.importe, 0)
  let porUsar = cent(Math.min(cubierto, creditos.reduce((s, c) => s - c.pendiente, 0)))
  const aCreditos: Imputacion[] = []
  for (const c of ordenarParaPagar(creditos)) {
    if (porUsar <= 0) break
    const monto = cent(Math.min(-c.pendiente, porUsar))
    aCreditos.push({ origen: c.origen, id: c.id, importe: -monto })
    porUsar = cent(porUsar - monto)
  }

  return [...aCreditos, ...aDeudas]
}

/** Lo que queda a cuenta: sale plata que no cancela ningún comprobante. */
export function aCuenta(importe: number, imputaciones: Imputacion[]): number {
  return Math.round((importe - imputaciones.reduce((s, i) => s + i.importe, 0)) * 100) / 100
}

/*
  El resumen de cuenta, con el saldo después de cada renglón. En el
  mismo día van primero los comprobantes y después los pagos: así un
  pago de contado no deja el saldo en negativo por un renglón.
*/
export function conSaldoAcumulado(movs: Movimiento[]): (Movimiento & { saldo: number })[] {
  const orden = { saldo_inicial: 0, compra: 1, cheque_rechazado: 1, pago: 2 } as const
  let saldo = 0
  return [...movs]
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || orden[a.tipo] - orden[b.tipo])
    .map((m) => {
      saldo = Math.round((saldo + m.debe - m.haber) * 100) / 100
      return { ...m, saldo }
    })
}
