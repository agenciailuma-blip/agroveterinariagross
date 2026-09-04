import { supabase } from '@/lib/supabase'

export type Semaforo = 'verde' | 'amarillo' | 'naranja' | 'rojo' | 'violeta' | 'gris'
export type VentanaCae = 'en_plazo' | 'atencion' | 'urgente' | 'vencido' | null

export interface FilaComprobante {
  id: string
  venta_id: string | null
  estado: string
  modalidad: string
  tipo: string
  familia: 'factura' | 'nota_credito' | 'nota_debito'
  punto_venta: number
  numero: number
  comprobante: string
  fecha: string
  receptor_nombre: string
  total: number
  cae: string | null
  cae_vencimiento: string | null
  impresiones: number
  dias_desde_emision: number
  semaforo: Semaforo
  ventana_cae: VentanaCae
  intentos_fallidos: number
  ultimo_intento: string | null
  tiene_nota_credito: boolean
}

/** Venta cobrada que todavía no tiene comprobante. Es el caso más grave: ya se cobró. */
export interface VentaSinFacturar {
  id: string
  codigo: string
  total: number
  ocurrido_en: string
  cliente: { nombre: string } | null
}

export const ETIQUETA_SEMAFORO: Record<Semaforo, string> = {
  verde: 'Autorizado e impreso',
  amarillo: 'Autorizado, sin imprimir',
  naranja: 'Esperando autorización',
  rojo: 'Rechazado por ARCA',
  violeta: 'Emitido con CAEA, falta informar',
  gris: 'Anulado',
}

export async function listarComprobantes(filtro: 'pendientes' | 'todos'): Promise<FilaComprobante[]> {
  let q = supabase
    .from('vista_comprobante_estado')
    .select('*')
    .order('fecha', { ascending: false })
    .order('numero', { ascending: false })
    .limit(200)

  // Lo que necesita acción: sin CAE todavía, o rechazado, o con CAEA sin informar.
  if (filtro === 'pendientes') {
    q = q.in('estado', ['pendiente', 'rechazado', 'contingencia'])
  }

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as FilaComprobante[]
}

/*
  Ventas cobradas sin comprobante.

  No sale de la vista de comprobantes justamente porque el comprobante
  no existe. Es la fuga que importa: la plata ya entró y no hay factura.
  Puede pasar si se cae ARCA justo al cobrar y además falla el armado
  local del comprobante.
*/
export async function ventasSinFacturar(): Promise<VentaSinFacturar[]> {
  const { data: conComprobante } = await supabase
    .from('comprobante')
    .select('venta_id')
    .neq('estado', 'anulado')
    .not('venta_id', 'is', null)

  const yaFacturadas = new Set((conComprobante ?? []).map((c) => c.venta_id as string))

  /*
    Sólo las que se cobraron CON la promesa de una factura.

    Una venta marcada como no fiscal no está esperando ningún comprobante
    de ARCA: alguien decidió, con permiso y dejando su nombre, que no
    lleva. Si entrara acá, el panel rojo —que existe para el caso grave,
    la plata que entró sin respaldo fiscal— se llenaría de casos
    normales, y en dos semanas nadie lo mira. Un semáforo que grita
    siempre deja de ser un semáforo.
  */
  const { data, error } = await supabase
    .from('venta')
    .select('id, codigo, total, ocurrido_en, cliente:cliente_id(nombre)')
    .eq('estado', 'cobrada')
    .eq('documentacion', 'fiscal')
    .order('ocurrido_en', { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)

  return ((data ?? []) as unknown as VentaSinFacturar[]).filter((v) => !yaFacturadas.has(v.id))
}

/** Cuántos comprobantes esperan resolución. Para el aviso del menú. */
export async function contarPendientes(): Promise<number> {
  const { count } = await supabase
    .from('comprobante')
    .select('id', { count: 'exact', head: true })
    .in('estado', ['pendiente', 'rechazado', 'contingencia'])
  return count ?? 0
}

/*
  Le pide el CAE a ARCA para un comprobante ya armado.

  La Edge Function devuelve 500 con un cuerpo JSON cuando falla. El
  cliente de Supabase no lo expone directo: hay que leerlo del context,
  o el cajero termina viendo "Edge Function returned a non-2xx status
  code", que no le dice nada a nadie.
*/
export async function solicitarCae(comprobanteId: string): Promise<{ cae: string | null }> {
  const { data, error } = await supabase.functions.invoke('arca-wsfe-solicitar-cae', {
    body: { comprobante_id: comprobanteId },
  })

  if (error) {
    let detalle = error.message
    const contexto = (error as { context?: Response }).context
    if (contexto && typeof contexto.json === 'function') {
      try {
        const cuerpo = await contexto.json()
        if (cuerpo?.error) detalle = cuerpo.error
      } catch {
        // El cuerpo no era JSON: queda el mensaje genérico.
      }
    }
    throw new Error(detalle)
  }

  if (!data?.ok) throw new Error(data?.error ?? 'ARCA no devolvió un resultado.')
  if (!data.aprobado) {
    const obs = (data.observaciones ?? [])
      .map((o: { codigo: string; mensaje: string }) => `${o.codigo}: ${o.mensaje}`)
      .join(' · ')
    throw new Error(obs || 'ARCA rechazó el comprobante.')
  }
  return { cae: data.cae }
}

/*
  Devuelve una venta entera.

  Una sola llamada hace las tres cosas que componen una devolución
  —reingresar el stock, sacarle la deuda al cliente y armar la nota de
  crédito— dentro de la misma transacción. Después se le pide el CAE a
  la nota, que es lo único que depende de que ARCA conteste.

  Si el pedido de CAE falla, la devolución ya está hecha: la nota queda
  en la cola de Facturación y se reintenta desde ahí. Al revés —no
  devolverle la plata al cliente porque ARCA no responde— sería
  inaceptable con la persona en el mostrador.
*/
export async function devolverVenta(
  ventaId: string,
  motivo: string,
): Promise<{ notaCreditoId: string | null; cae: string | null; problema: string | null }> {
  const { data: notaCreditoId, error } = await supabase.rpc('anular_venta_con_nota_credito', {
    p_venta_id: ventaId,
    p_motivo: motivo,
  })
  if (error) throw new Error(error.message)

  // La venta no estaba facturada: no hay nada que pedirle a ARCA.
  if (!notaCreditoId) return { notaCreditoId: null, cae: null, problema: null }

  try {
    const { cae } = await solicitarCae(notaCreditoId as string)
    return { notaCreditoId: notaCreditoId as string, cae, problema: null }
  } catch (e) {
    return {
      notaCreditoId: notaCreditoId as string,
      cae: null,
      problema: e instanceof Error ? e.message : 'ARCA no respondió.',
    }
  }
}

/*
  Arma el comprobante de una venta cobrada y le pide el CAE.

  Los dos pasos están separados a propósito: si preparar_comprobante()
  funcionó y ARCA falló, el comprobante YA EXISTE con su número
  reservado y queda en la cola para reintentar. El número no se libera
  nunca — saltear un número es un problema fiscal.
*/
export async function facturarVenta(ventaId: string): Promise<{ comprobanteId: string; cae: string | null }> {
  const { data: comprobanteId, error } = await supabase.rpc('preparar_comprobante', {
    p_venta_id: ventaId,
  })
  if (error) throw new Error(`No se pudo armar el comprobante: ${error.message}`)

  const { cae } = await solicitarCae(comprobanteId as string)
  return { comprobanteId: comprobanteId as string, cae }
}
