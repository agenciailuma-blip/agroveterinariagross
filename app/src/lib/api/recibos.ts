import { supabase } from '@/lib/supabase'
import { datosEmisor } from '@/lib/api/comprobante'
import { esFallaDeRed } from '@/lib/api/mayorista'

/*
  ─────────────────────────────────────────────────────────────
  El recibo y la orden de recibo

  Fase 03, punto 5.4. Cada cobranza de cuenta corriente sale con su
  recibo numerado —antes el número se escribía a mano en el concepto—,
  que se imprime, se manda por mail y queda en el registro.

  La orden de recibo la arma el vendedor de calle con lo que le dijo el
  cliente que pagó. No toca la cuenta: en el local confirman que entró
  la plata y, al aceptarla, sale el recibo. Si el vendedor pudiera bajar
  deuda, cualquier día baja algo que no se pagó.
  ─────────────────────────────────────────────────────────────
*/

export function numeroRecibo(serie: string, numero: number): string {
  return `${serie}-${String(numero).padStart(8, '0')}`
}

// ───────────────────────────────────────────────────────────────
// El recibo
// ───────────────────────────────────────────────────────────────

export interface DatosChequeRecibido {
  banco: string
  numero: string
  importe: number
  [k: string]: unknown
}

export interface ReciboEmitido {
  id: string
  serie: string
  numero: number
  total: number
  repetido: boolean
}

/*
  El identificador lo pone la pantalla, una vez por cobranza: si se
  corta la conexión con el recibo ya grabado y se aprieta de nuevo, la
  base contesta el mismo recibo en vez de cobrar dos veces.
*/
export async function emitirRecibo(datos: {
  id: string
  clienteId: string
  medioPagoId: string
  importe: number | null
  cheques: DatosChequeRecibido[] | null
  cajaId: string | null
  concepto: string | null
  ordenId?: string | null
}): Promise<ReciboEmitido> {
  const { data, error } = await supabase.rpc('emitir_recibo', {
    p_id: datos.id,
    p_cliente_id: datos.clienteId,
    p_medio_pago_id: datos.medioPagoId,
    p_importe: datos.importe,
    p_cheques: datos.cheques,
    p_caja_id: datos.cajaId,
    p_concepto: datos.concepto,
    p_orden_id: datos.ordenId ?? null,
  })
  if (error) throw new Error(error.message)
  return data as ReciboEmitido
}

export interface PagoDelRecibo {
  medio: string
  importe: number
  cheque: { banco: string; numero: string; fecha_pago: string | null; librador: string | null } | null
}

export interface ReciboCompleto {
  id: string
  serie: string
  numero: number
  fecha: string
  total: number
  concepto: string | null
  emitido_en: string
  emitido_por_nombre: string | null
  mail_destinatario: string | null
  mail_estado: 'enviado' | 'error' | null
  mail_error: string | null
  mail_en: string | null
  /** Nulo si el recibo es de un fiado. */
  cliente_id: string | null
  cliente_nombre: string
  cliente_email: string | null
  /** El recibo del pago de un fiado (Fase 03, punto 7). */
  fiado_persona_id: string | null
  cliente_documento: string | null
  cliente_domicilio: string | null
  /** El saldo de la cuenta apenas después de este recibo. */
  saldo_despues: number
  orden_numero: number | null
  orden_vendedor: string | null
  pagos: PagoDelRecibo[]
  emisor: Record<string, string>
}

export async function reciboCompleto(id: string): Promise<ReciboCompleto> {
  const [r, emisor] = await Promise.all([supabase.rpc('recibo_completo', { p_id: id }), datosEmisor()])
  if (r.error) throw new Error(r.error.message)
  const d = r.data as Omit<ReciboCompleto, 'emisor'>
  return {
    ...d,
    total: Number(d.total),
    saldo_despues: Number(d.saldo_despues),
    pagos: (d.pagos ?? []).map((p) => ({ ...p, importe: Number(p.importe) })),
    emisor,
  }
}

export interface FilaRecibo {
  id: string
  serie: string
  numero: number
  fecha: string
  total: number
  cliente_id: string
  cliente_nombre: string
  medios: string | null
  orden_numero: number | null
  emitido_por_nombre: string | null
  mail_estado: 'enviado' | 'error' | null
}

export async function listarRecibos(texto: string): Promise<FilaRecibo[]> {
  const { data, error } = await supabase.rpc('listar_recibos', { p_texto: texto.trim() || null, p_limite: 300 })
  if (error) throw new Error(error.message)
  return ((data ?? []) as FilaRecibo[]).map((f) => ({ ...f, total: Number(f.total) }))
}

/*
  El recibo por mail: la app arma el PDF —la misma hoja que se
  imprime— y la función de correo lo manda y lo anota en el recibo.
*/
export async function enviarReciboPorMail(r: ReciboCompleto, destinatario: string): Promise<void> {
  const { aBase64, reciboEnPdf } = await import('@/lib/comprobante/pdf')
  const pdf = aBase64(await reciboEnPdf(r))
  const { error } = await supabase.functions.invoke('enviar-factura', {
    body: { recibo_id: r.id, destinatario: destinatario.trim(), pdf },
  })
  if (error) {
    const contexto = (error as { context?: Response }).context
    let mensaje = 'No se pudo mandar el mail. Revisá la conexión y probá de nuevo.'
    if (contexto && typeof contexto.json === 'function') {
      try {
        const cuerpo = await contexto.json()
        if (cuerpo?.error) mensaje = String(cuerpo.error)
      } catch {
        // No era JSON: falló la red.
      }
    }
    throw new Error(mensaje)
  }
}

// ───────────────────────────────────────────────────────────────
// La orden de recibo
// ───────────────────────────────────────────────────────────────

export type FormaDeCobro = 'transferencia' | 'efectivo' | 'cheque'

export const FORMAS_DE_COBRO: { valor: FormaDeCobro; etiqueta: string }[] = [
  { valor: 'transferencia', etiqueta: 'Transferencia' },
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'cheque', etiqueta: 'Cheque' },
]

export function etiquetaForma(f: FormaDeCobro): string {
  return FORMAS_DE_COBRO.find((x) => x.valor === f)?.etiqueta ?? f
}

export type EstadoOrden = 'pendiente' | 'aceptada' | 'rechazada'
export type VistaOrdenes = 'pendientes' | 'aceptadas' | 'rechazadas'

export interface OrdenRecibo {
  id: string
  numero: number
  estado: EstadoOrden
  cliente_id: string
  cliente_nombre: string
  cliente_localidad: string | null
  cliente_ruta: string | null
  cliente_email: string | null
  /** Sólo si se puede ver la deuda. */
  cliente_saldo: number | null
  vendedor_nombre: string | null
  importe: number
  forma: FormaDeCobro
  detalle: string | null
  armado_en: string
  recibido_en: string
  resuelto_en: string | null
  resuelto_por_nombre: string | null
  motivo_rechazo: string | null
  recibo_id: string | null
  recibo_numero: string | null
}

export async function listarOrdenes(vista: VistaOrdenes): Promise<OrdenRecibo[]> {
  const { data, error } = await supabase.rpc('mayorista_ordenes_recibo', { p_vista: vista })
  if (error) throw new Error(error.message)
  return ((data ?? []) as OrdenRecibo[]).map((o) => ({
    ...o,
    importe: Number(o.importe),
    cliente_saldo: o.cliente_saldo === null ? null : Number(o.cliente_saldo),
  }))
}

export async function contarOrdenesPendientes(): Promise<number> {
  const { data, error } = await supabase.rpc('mayorista_ordenes_recibo_pendientes')
  if (error) throw new Error(error.message)
  return (data as number) ?? 0
}

export async function rechazarOrden(id: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('mayorista_rechazar_orden_recibo', { p_id: id, p_motivo: motivo })
  if (error) throw new Error(error.message)
}

// ─── Lo que quedó en el teléfono ───

export interface OrdenArmada {
  id: string
  cliente_id: string
  cliente_nombre: string
  importe: number
  forma: FormaDeCobro
  detalle: string
  armado_en: string
  /** Lo que contestó el servidor la última vez, si no fue la red. */
  error?: string
}

const CLAVE_COLA = 'gross.mayorista.cobros'

export function ordenesEnCola(): OrdenArmada[] {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_COLA) ?? '[]') as OrdenArmada[]
  } catch {
    return []
  }
}

function guardarCola(cola: OrdenArmada[]): void {
  try {
    localStorage.setItem(CLAVE_COLA, JSON.stringify(cola))
  } catch {
    // Sin almacenamiento no hay cola: con señal sale igual.
  }
  window.dispatchEvent(new Event('gross-mayorista-cobros'))
}

export function encolarOrden(o: OrdenArmada): void {
  guardarCola([...ordenesEnCola().filter((x) => x.id !== o.id), o])
}

export function sacarOrdenDeLaCola(id: string): void {
  guardarCola(ordenesEnCola().filter((x) => x.id !== id))
}

/*
  Igual que los pedidos: de a una; la que llega sale de la cola, la que
  falla por la red se queda, y la que el local no acepta se queda con el
  motivo a la vista.
*/
let enviando: Promise<{ enviadas: number; numeros: number[] }> | null = null

export function enviarOrdenes(): Promise<{ enviadas: number; numeros: number[] }> {
  enviando ??= (async () => {
    const numeros: number[] = []
    try {
      for (const o of ordenesEnCola()) {
        const { data, error } = await supabase.rpc('mayorista_enviar_orden_recibo', {
          p_id: o.id,
          p_cliente_id: o.cliente_id,
          p_importe: o.importe,
          p_forma: o.forma,
          p_detalle: o.detalle || null,
          p_armado_en: o.armado_en,
        })
        if (error) {
          if (esFallaDeRed(error)) break
          encolarOrden({ ...o, error: error.message })
          continue
        }
        sacarOrdenDeLaCola(o.id)
        numeros.push((data as { numero: number }).numero)
      }
    } catch (e) {
      if (!esFallaDeRed(e)) throw e
    }
    return { enviadas: numeros.length, numeros }
  })().finally(() => {
    enviando = null
  })
  return enviando
}

/* «1.250,50», «1250,5» y «1250.5» son el mismo importe; «1.250» son mil doscientos cincuenta. */
export function leerImporte(texto: string): number | null {
  const t = texto.trim().replace(/\s|\$/g, '')
  const normal = t.includes(',')
    ? t.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(t)
      ? t.replace(/\./g, '')
      : t
  const n = Number(normal)
  return t !== '' && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}
