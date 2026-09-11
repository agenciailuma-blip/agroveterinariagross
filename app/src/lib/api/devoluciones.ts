import { supabase } from '@/lib/supabase'
import { solicitarCae } from '@/lib/api/facturacion'

/*
  ─────────────────────────────────────────────────────────────
  Devolver parte de una venta

  El cliente se llevó tres bolsas y trae una. Hasta ahora había que
  anular la venta entera y rehacerla, lo que obliga a volver a cobrar lo
  que el cliente sí se queda y quema un número de comprobante.

  ─── LA VENTA NO SE ANULA ───

  Sigue cobrada. Lo que se registra es un hecho nuevo —volvió una bolsa—
  con su propia nota de crédito. Por eso se puede devolver varias veces
  sobre la misma venta: una hoy y otra la semana que viene.

  ─── EL TOPE LO PONE LA BASE, NO ESTA PANTALLA ───

  `disponible` viene de la base y se vuelve a controlar allá antes de
  escribir. La pantalla lo usa para no dejar cargar de más, pero no es
  la que protege: dos cajeros pueden estar devolviendo la misma venta
  desde dos terminales, y el segundo tiene que chocar contra el tope
  aunque su pantalla diga otra cosa.
  ─────────────────────────────────────────────────────────────
*/

export interface LineaDevolvible {
  venta_linea_id: string
  orden: number
  producto_id: string | null
  codigo_producto: string | null
  descripcion: string
  vendida: number
  devuelta: number
  disponible: number
  precio_unitario: number
  importe: number
  alicuota: number
  condicion_iva: string
}

export async function lineasDevolvibles(ventaId: string): Promise<LineaDevolvible[]> {
  const { data, error } = await supabase
    .from('vista_venta_devolvible')
    .select('*')
    .eq('venta_id', ventaId)
    .order('orden')

  if (error) throw new Error(error.message)
  return (data ?? []) as LineaDevolvible[]
}

/** Lo que el cajero marcó: cuánto de cada línea vuelve. */
export interface LineaADevolver {
  venta_linea_id: string
  cantidad: number
}

/*
  Cuánta plata es.

  Se calcula igual que en la base —prorrateado sobre el importe de la
  línea y no sobre el precio de lista— para que lo que el cajero ve
  antes de confirmar sea lo que después dice la nota de crédito. Si las
  dos cuentas no fueran la misma, la pantalla prometería un número y el
  comprobante saldría con otro.
*/
export function totalADevolver(
  lineas: LineaDevolvible[],
  elegidas: Map<string, number>,
): number {
  let total = 0
  for (const l of lineas) {
    const cantidad = elegidas.get(l.venta_linea_id) ?? 0
    if (cantidad > 0 && l.vendida > 0) {
      total += redondear(l.importe * (cantidad / l.vendida))
    }
  }
  return redondear(total)
}

/*
  Al centavo, y no con el redondeo que trae JavaScript.

  `Math.round(x * 100) / 100` falla en los casos donde el número no se
  representa exacto en binario: 1,005 termina en 1,00 en vez de 1,01,
  porque en realidad vale 1,00499999… Sobre importes de venta eso
  aparece poco, pero cuando aparece es un centavo de diferencia entre lo
  que dice la pantalla y lo que emite la base, y nadie entiende de dónde
  salió.
*/
function redondear(n: number): number {
  return Number(n.toFixed(2))
}

export interface ResultadoDevolucion {
  devolucionId: string
  cae: string | null
  /** Qué salió mal con ARCA, si algo salió mal. La devolución ya está hecha. */
  problema: string | null
}

/*
  Devuelve lo elegido y le pide el CAE a la nota de crédito.

  El orden importa y es el mismo que usa la devolución total: primero se
  cierra lo comercial —stock, deuda y comprobante, todo en una
  transacción— y recién después se habla con ARCA. Si ARCA no contesta,
  la devolución ya está hecha y la nota queda en la cola de Facturación
  para reintentar. Al revés —no devolverle la mercadería al cliente
  porque ARCA no responde— sería inaceptable con la persona en el
  mostrador.
*/
export async function devolverLineas(
  ventaId: string,
  lineas: LineaADevolver[],
  motivo: string,
): Promise<ResultadoDevolucion> {
  const { data: devolucionId, error } = await supabase.rpc('devolver_lineas_de_venta', {
    p_venta_id: ventaId,
    p_lineas: lineas,
    p_motivo: motivo,
  })
  if (error) throw new Error(error.message)

  const id = devolucionId as string

  // Sin factura no hay nota de crédito que autorizar: la venta pudo no
  // haberse facturado nunca.
  const { data: dev } = await supabase
    .from('devolucion')
    .select('comprobante_id')
    .eq('id', id)
    .single()

  if (!dev?.comprobante_id) return { devolucionId: id, cae: null, problema: null }

  try {
    const { cae } = await solicitarCae(dev.comprobante_id as string)
    return { devolucionId: id, cae, problema: null }
  } catch (e) {
    return {
      devolucionId: id,
      cae: null,
      problema: e instanceof Error ? e.message : 'ARCA no respondió.',
    }
  }
}

/*
  Si queda algo por devolver de esta venta.

  Sirve para no ofrecer el botón en una venta que ya volvió entera: la
  base la rechazaría igual, pero enterarse después de abrir el diálogo y
  marcar cantidades es peor que no ver el botón.
*/
export function quedaAlgoPorDevolver(lineas: LineaDevolvible[]): boolean {
  return lineas.some((l) => l.disponible > 0)
}
