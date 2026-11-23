import { supabase } from '@/lib/supabase'
import { solicitarCae } from '@/lib/api/facturacion'
import { leerNumero, type FilaBusqueda } from '@/lib/api/buscarComprobantes'

/*
  ─────────────────────────────────────────────────────────────
  Notas de crédito y débito escritas a mano

  Pedido en la reunión del 19/11. Hasta ahora una nota de crédito salía
  sólo de una devolución, con los renglones de la venta. Ésta se escribe
  renglón por renglón: una bonificación, un descuento acordado después,
  intereses por mora, un cheque rechazado.

  Puede ir asociada a una factura —toma su cliente, su letra y su punto
  de venta— o sin factura: la «libre», para la que ARCA pide el período
  que abarca, y que arma la función que pide el CAE.

  Mueve la cuenta corriente del cliente si la tiene: la de crédito
  resta, la de débito suma. No toca stock: para que vuelva mercadería
  sigue estando «Devolver».
  ─────────────────────────────────────────────────────────────
*/

export type FamiliaNota = 'nota_credito' | 'nota_debito'

export const NOMBRE_NOTA: Record<FamiliaNota, string> = {
  nota_credito: 'Nota de crédito',
  nota_debito: 'Nota de débito',
}

/** Las alícuotas que se ofrecen, en el orden en que se usan. `null` es exento. */
export const ALICUOTAS: { id: number | null; etiqueta: string; porcentaje: number }[] = [
  { id: 5, etiqueta: '21%', porcentaje: 21 },
  { id: 4, etiqueta: '10,5%', porcentaje: 10.5 },
  { id: 6, etiqueta: '27%', porcentaje: 27 },
  { id: 3, etiqueta: '0%', porcentaje: 0 },
  { id: null, etiqueta: 'Exento', porcentaje: 0 },
]

export interface RenglonNota {
  descripcion: string
  /** Con IVA incluido, como en la venta. */
  importe: number
  alicuota_iva_id: number | null
}

/*
  Al centavo, igual que la base: el número que la pantalla muestra antes
  de emitir tiene que ser el que después dice la nota.
*/
function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function totalesDeNota(renglones: RenglonNota[]): {
  neto: number
  iva: number
  exento: number
  total: number
} {
  let neto = 0
  let iva = 0
  let exento = 0
  let total = 0
  for (const r of renglones) {
    const importe = redondear(r.importe)
    if (!(importe > 0)) continue
    total += importe
    if (r.alicuota_iva_id == null) {
      exento += importe
      continue
    }
    const pct = ALICUOTAS.find((a) => a.id === r.alicuota_iva_id)?.porcentaje ?? 0
    const n = redondear(importe / (1 + pct / 100))
    neto += n
    iva += importe - n
  }
  return { neto: redondear(neto), iva: redondear(iva), exento: redondear(exento), total: redondear(total) }
}

/** Qué falta para poder emitir; null si está todo. */
export function faltaEnNota(n: {
  asociada: boolean
  clienteId: string | null
  facturaId: string | null
  renglones: RenglonNota[]
  motivo: string
}): string | null {
  if (n.asociada && !n.facturaId) return 'Elegí la factura.'
  if (!n.asociada && !n.clienteId) return 'Elegí el cliente.'
  if (n.renglones.length === 0) return 'Agregá al menos un renglón.'
  if (n.renglones.some((r) => !r.descripcion.trim())) return 'Cada renglón necesita una descripción.'
  if (n.renglones.some((r) => !(redondear(r.importe) > 0))) return 'Cada renglón necesita un importe mayor que cero.'
  if (n.motivo.trim().length < 3) return 'Escribí el motivo.'
  return null
}

export interface NotaEmitida {
  id: string
  cae: string | null
  /** Qué dijo ARCA, si no la autorizó. La nota ya está hecha y se reintenta desde Facturación. */
  problema: string | null
}

/*
  Primero se graba la nota —con su número, la cuenta y todo— y recién
  después se habla con ARCA, como en la devolución: si ARCA no contesta,
  la nota queda en la cola de Facturación para reintentar.
*/
export async function emitirNotaManual(datos: {
  id: string
  familia: FamiliaNota
  clienteId: string | null
  facturaId: string | null
  renglones: RenglonNota[]
  motivo: string
}): Promise<NotaEmitida> {
  const { error } = await supabase.rpc('emitir_nota_manual', {
    p_id: datos.id,
    p_familia: datos.familia,
    p_cliente_id: datos.facturaId ? null : datos.clienteId,
    p_asociado_id: datos.facturaId,
    p_lineas: datos.renglones.map((r) => ({
      descripcion: r.descripcion.trim(),
      importe: redondear(r.importe),
      alicuota_iva_id: r.alicuota_iva_id,
    })),
    p_motivo: datos.motivo.trim(),
  })
  if (error) throw new Error(error.message)

  try {
    const { cae } = await solicitarCae(datos.id)
    return { id: datos.id, cae, problema: null }
  } catch (e) {
    return { id: datos.id, cae: null, problema: e instanceof Error ? e.message : 'ARCA no respondió.' }
  }
}

/*
  Las facturas a las que se les puede hacer una nota: autorizadas, por
  número («16», «1-16») o por cliente. Las últimas primero.
*/
export async function buscarFacturasParaNota(texto: string): Promise<FilaBusqueda[]> {
  const t = texto.trim()
  let q = supabase
    .from('vista_comprobante_busqueda')
    .select('*')
    .eq('familia', 'factura')
    .in('estado', ['autorizado', 'contingencia', 'informado'])

  const num = leerNumero(t)
  if (num) {
    q = q.eq('numero', num.numero)
    if (num.punto_venta !== null) q = q.eq('punto_venta', num.punto_venta)
  } else if (t) {
    const limpio = t.replace(/[,()*%]/g, ' ').trim()
    q = q.or(`receptor_nombre.ilike.%${limpio}%,receptor_documento.ilike.%${limpio}%`)
  }

  const { data, error } = await q.order('fecha', { ascending: false }).order('numero', { ascending: false }).limit(15)
  if (error) throw new Error(error.message)
  return ((data ?? []) as FilaBusqueda[]).map((r) => ({ ...r, total: Number(r.total) }))
}
