import { supabase } from '@/lib/supabase'

/*
  ─────────────────────────────────────────────────────────────
  El papel de cada cosa

  Auditoría de integralidad (19/11): de un renglón de la cuenta
  corriente, de un remito o de una venta se tiene que poder llegar al
  papel que lo respalda sin ir a buscarlo a otra pantalla.

  Un movimiento de la cuenta guarda qué lo originó (`referencia_tipo` y
  `referencia_id`). Algunos apuntan directo al papel —un recibo, una
  nota de crédito—; una venta, en cambio, apunta a la venta, y el papel
  es su factura o, si salió sin factura, su proforma.
  ─────────────────────────────────────────────────────────────
*/

export type Papel =
  | { tipo: 'comprobante'; id: string }
  | { tipo: 'no_fiscal'; id: string }
  | { tipo: 'recibo'; id: string }

/** Los orígenes que tienen un papel para abrir. Un saldo inicial o un ajuste a mano, no. */
const CON_PAPEL = new Set(['venta', 'comprobante', 'comprobante_no_fiscal', 'devolucion'])

interface Movimiento {
  id: string
  tipo: string
  referencia_tipo: string | null
  referencia_id: string | null
}

/*
  Un cobro no apunta a su recibo: el recibo se arma después y dice qué
  movimientos le corresponden (`recibo_pago.movimiento_id`). Por eso los
  recibos de una cuenta se traen juntos, al revés, y un cobro de antes
  de que existieran los recibos queda sin enlace.
*/
export async function recibosDeMovimientos(ids: string[]): Promise<Map<string, string>> {
  const recibos = new Map<string, string>()
  if (!ids.length) return recibos
  const { data, error } = await supabase.from('recibo_pago').select('recibo_id, movimiento_id').in('movimiento_id', ids)
  if (error) throw new Error(error.message)
  for (const r of (data ?? []) as { recibo_id: string; movimiento_id: string }[]) recibos.set(r.movimiento_id, r.recibo_id)
  return recibos
}

export function tienePapel(m: Movimiento, recibos?: Map<string, string>): boolean {
  if (recibos?.has(m.id)) return true
  return !!m.referencia_id && !!m.referencia_tipo && CON_PAPEL.has(m.referencia_tipo)
}

export async function papelDeMovimiento(m: Movimiento, recibos?: Map<string, string>): Promise<Papel | null> {
  const recibo = recibos?.get(m.id)
  if (recibo) return { tipo: 'recibo', id: recibo }
  if (!tienePapel(m)) return null
  const id = m.referencia_id!
  switch (m.referencia_tipo) {
    case 'comprobante':
      return { tipo: 'comprobante', id }
    case 'comprobante_no_fiscal':
      return { tipo: 'no_fiscal', id }
    case 'devolucion': {
      const { data, error } = await supabase.from('devolucion').select('comprobante_id').eq('id', id).maybeSingle()
      if (error) throw new Error(error.message)
      return data?.comprobante_id ? { tipo: 'comprobante', id: data.comprobante_id as string } : null
    }
    case 'venta':
      // Una venta anulada descuenta con su nota de crédito, no con la factura.
      return m.tipo === 'nota_credito' ? ((await notaDeCreditoDeVenta(id)) ?? papelDeVenta(id)) : papelDeVenta(id)
    default:
      return null
  }
}

async function notaDeCreditoDeVenta(ventaId: string): Promise<Papel | null> {
  const { data, error } = await supabase
    .from('vista_comprobante_estado')
    .select('id')
    .eq('venta_id', ventaId)
    .eq('familia', 'nota_credito')
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.id ? { tipo: 'comprobante', id: data.id as string } : null
}

/*
  La factura de una venta —la propia o la agrupada de fin de mes—; si no
  tiene, su proforma; si tampoco, el último papel no fiscal que tenga
  (un remito interno, un comprobante de entrega).

  `salvo` deja afuera un papel: desde un remito, abrir «su venta» no
  tiene que volver a abrir el mismo remito.
*/
export async function papelDeVenta(ventaId: string, salvo?: string): Promise<Papel | null> {
  const [propia, agrupada, noFiscales] = await Promise.all([
    supabase
      .from('vista_comprobante_estado')
      .select('id, estado')
      .eq('venta_id', ventaId)
      .eq('familia', 'factura')
      .order('fecha', { ascending: false })
      .order('numero', { ascending: false }),
    supabase.from('comprobante_venta').select('comprobante_id').eq('venta_id', ventaId),
    supabase
      .from('comprobante_no_fiscal')
      .select('id, tipo_clave, estado')
      .eq('venta_id', ventaId)
      .order('creado_en', { ascending: false }),
  ])
  if (propia.error) throw new Error(propia.error.message)
  if (agrupada.error) throw new Error(agrupada.error.message)
  if (noFiscales.error) throw new Error(noFiscales.error.message)

  const facturas = (propia.data ?? []) as { id: string; estado: string }[]
  const vigente = facturas.find((f) => f.estado !== 'anulado') ?? facturas[0]
  if (vigente) return { tipo: 'comprobante', id: vigente.id }

  const deGrupo = (agrupada.data ?? [])[0] as { comprobante_id: string } | undefined
  if (deGrupo) return { tipo: 'comprobante', id: deGrupo.comprobante_id }

  const internos = (noFiscales.data ?? []) as { id: string; tipo_clave: string; estado: string }[]
  const vivos = internos.filter((n) => n.estado !== 'anulado' && n.id !== salvo)
  const proforma = vivos.find((n) => n.tipo_clave === 'comprobante_interno')
  const otro = proforma ?? vivos[0]
  return otro ? { tipo: 'no_fiscal', id: otro.id } : null
}
