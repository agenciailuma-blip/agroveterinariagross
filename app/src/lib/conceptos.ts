/*
  ─────────────────────────────────────────────────────────────
  Los productos asociados, al imprimir

  Fase 03, punto 3. Los renglones de la venta son los productos reales;
  los que tienen concepto se imprimen juntos, en un renglón con el
  nombre del concepto y la suma de sus importes. Los reales viajan
  adentro (`asociados`), para poder ver después qué se llevó.

  En la factura se agrupa además por alícuota: un renglón que juntara
  productos al 10,5 % y al 21 % no tendría una alícuota que mostrar. En
  el comprobante interno no se discrimina IVA y alcanza el concepto.
  ─────────────────────────────────────────────────────────────
*/

export interface RenglonImpreso {
  orden: number
  codigo_producto: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  importe: number
  concepto?: string | null
}

export type ConAsociados<T> = T & { asociados?: T[] }

export function agruparPorConcepto<T extends RenglonImpreso & { alicuota_iva_id?: number }>(
  lineas: T[],
  opciones: { porAlicuota: boolean },
): ConAsociados<T>[] {
  const salida: ConAsociados<T>[] = []
  const grupos = new Map<string, ConAsociados<T>>()

  for (const l of lineas) {
    const concepto = l.concepto?.trim()
    if (!concepto) {
      salida.push(l)
      continue
    }
    const clave = opciones.porAlicuota ? `${concepto}|${l.alicuota_iva_id ?? ''}` : concepto
    const ya = grupos.get(clave)
    if (ya) {
      ya.importe = redondear(ya.importe + l.importe)
      ya.precio_unitario = ya.importe
      ya.asociados!.push(l)
      continue
    }
    const grupo: ConAsociados<T> = {
      ...l,
      codigo_producto: '',
      descripcion: concepto,
      cantidad: 1,
      precio_unitario: l.importe,
      importe: l.importe,
      asociados: [l],
    }
    grupos.set(clave, grupo)
    salida.push(grupo)
  }
  return salida
}

const redondear = (n: number) => Math.round(n * 100) / 100

/** Lo que se va a imprimir bajo cada concepto, para mostrarlo antes de cobrar. */
export function totalesPorConcepto(lineas: { concepto?: string | null; cantidad: number; precio_unitario: number }[]) {
  const totales = new Map<string, number>()
  for (const l of lineas) {
    const c = l.concepto?.trim()
    if (!c) continue
    totales.set(c, redondear((totales.get(c) ?? 0) + l.cantidad * l.precio_unitario))
  }
  return [...totales].map(([concepto, total]) => ({ concepto, total }))
}
