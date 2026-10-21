import { supabase } from '@/lib/supabase'
import type { ComprobanteCompleto } from '@/lib/api/comprobante'
import { urlQrDe } from '@/lib/comprobante/imprimirDirecto'

/*
  ─────────────────────────────────────────────────────────────
  La factura por mail

  Pedido 17 de Lucas, decidido el 21/10. La app arma el PDF —la misma
  hoja A4 que se imprime— y la función enviar-factura lo manda por
  Resend y lo anota. Desde el botón de la factura, y solo al facturar un
  pedido de la tienda.
  ─────────────────────────────────────────────────────────────
*/

export interface EnvioDeFactura {
  id: string
  destinatario: string
  estado: 'enviado' | 'error'
  error: string | null
  automatico: boolean
  creado_en: string
}

async function mensajeDe(error: unknown, generico: string): Promise<string> {
  const contexto = (error as { context?: Response }).context
  if (contexto && typeof contexto.json === 'function') {
    try {
      const cuerpo = await contexto.json()
      if (cuerpo?.error) return String(cuerpo.error)
    } catch {
      // No era JSON: falló la red.
    }
  }
  return generico
}

/** Arma el PDF y lo manda. Tira con el motivo en palabras si no salió. */
export async function enviarFacturaPorMail(
  c: ComprobanteCompleto,
  destinatario: string,
  automatico = false,
): Promise<void> {
  if (!c.cae) throw new Error('La factura todavía no tiene CAE: sin autorización de ARCA no se manda.')
  // Carga diferida: la librería de PDF sólo hace falta al mandar.
  const { aBase64, facturaEnPdf } = await import('@/lib/comprobante/pdf')
  const pdf = aBase64(await facturaEnPdf(c, urlQrDe(c)))
  const { error } = await supabase.functions.invoke('enviar-factura', {
    body: { comprobante_id: c.id, destinatario: destinatario.trim(), pdf, automatico },
  })
  if (error) throw new Error(await mensajeDe(error, 'No se pudo mandar el mail. Revisá la conexión y probá de nuevo.'))
}

export async function enviosDe(comprobanteId: string): Promise<EnvioDeFactura[]> {
  const { data, error } = await supabase
    .from('comprobante_envio')
    .select('id, destinatario, estado, error, automatico, creado_en')
    .eq('comprobante_id', comprobanteId)
    .order('creado_en', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as EnvioDeFactura[]
}

/*
  A quién se le manda, para proponerlo: el mail del pedido de la tienda,
  si la venta vino de ahí; si no, el del cliente.
*/
export async function correoSugerido(ventaId: string | null): Promise<string> {
  if (!ventaId) return ''
  const [pedido, venta] = await Promise.all([
    supabase.from('pedido_tienda').select('email').eq('venta_id', ventaId).maybeSingle(),
    supabase.from('venta').select('cliente:cliente_id(email)').eq('id', ventaId).maybeSingle(),
  ])
  const delPedido = (pedido.data?.email as string | null) ?? ''
  const cliente = venta.data?.cliente as { email: string | null } | { email: string | null }[] | null
  const delCliente = (Array.isArray(cliente) ? cliente[0]?.email : cliente?.email) ?? ''
  return (delPedido || delCliente).trim()
}
