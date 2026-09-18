/*
  ─────────────────────────────────────────────────────────────
  La cuenta fiscal de un comprobante, hecha en la terminal

  Hasta ahora esto lo hacía siempre el servidor: `preparar_comprobante()`
  arma la factura, `vista_venta_iva` desglosa el IVA y
  `calcular_percepcion_iibb()` decide la percepción. Con internet
  cortado no hay a quién preguntarle, y el cliente está esperando el
  papel — así que la terminal tiene que poder sacar los MISMOS números.

  Esto es un espejo, no una segunda opinión. Cada función de acá
  corresponde a una del servidor y usa su mismo redondeo, en el mismo
  orden. Si alguna vez divergen, la factura que se imprimió en el
  mostrador va a decir una cosa y la que quede en el servidor otra — y
  la que vale es la que se llevó el cliente.

  Por eso está separado de todo lo demás: es puro cálculo, sin base de
  datos ni pantallas, para poder probarlo caso por caso.
  ─────────────────────────────────────────────────────────────
*/

/** Una línea de la venta, con lo único que importa para la cuenta. */
export interface LineaFiscal {
  importe: number
  alicuota_iva_id: number
  condicion_iva: string
}

export interface DesgloseAlicuota {
  alicuota_iva_id: number
  /** El porcentaje, para poder explicarlo. No va al comprobante. */
  porcentaje: number
  base_imponible: number
  importe: number
}

/** Redondeo al centavo, el mismo que hace `round(x, 2)` en la base. */
export function alCentavo(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/*
  El IVA que ya viene adentro del precio.

  En el mostrador los precios se cargan CON IVA, así que el neto se
  saca dividiendo. Es lo que hace `vista_venta_iva`: agrupa por
  alícuota, suma los importes del grupo y recién ahí redondea.

  El orden importa y no es un detalle: redondear línea por línea y
  después sumar da distinto que sumar y redondear una vez. Con tres
  líneas al 21% la diferencia es de centavos, y un centavo de
  diferencia entre el papel y el servidor es una factura que no cierra.
*/
export function desglosarIva(
  lineas: LineaFiscal[],
  porcentajes: Map<number, number>,
): DesgloseAlicuota[] {
  const porAlicuota = new Map<number, number>()

  for (const l of lineas) {
    if (l.condicion_iva !== 'gravado') continue
    porAlicuota.set(l.alicuota_iva_id, (porAlicuota.get(l.alicuota_iva_id) ?? 0) + Number(l.importe))
  }

  return [...porAlicuota.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, total]) => {
      const porcentaje = porcentajes.get(id)
      if (porcentaje === undefined) {
        throw new Error(
          `No está la alícuota de IVA ${id} en esta computadora. Sincronizá con internet antes de facturar.`,
        )
      }
      const neto = alCentavo(total / (1 + porcentaje / 100))
      return {
        alicuota_iva_id: id,
        porcentaje,
        base_imponible: neto,
        importe: alCentavo(total - total / (1 + porcentaje / 100)),
      }
    })
}

/** Lo exento no lleva IVA y va en su propio renglón del comprobante. */
export function totalExento(lineas: LineaFiscal[]): number {
  return alCentavo(
    lineas.filter((l) => l.condicion_iva === 'exento').reduce((s, l) => s + Number(l.importe), 0),
  )
}

export interface DatosPercepcion {
  /** Condición del cliente frente al IVA. 1 = Responsable Inscripto. */
  condicion_iva_id: number
  /** Si tiene certificado de exclusión de la DGR. */
  excluido: boolean
  alicuota: number
  minimo: number
}

/*
  La percepción de IIBB de Misiones.

  Espejo de `calcular_percepcion_iibb()`. Las tres reglas que la definen
  y que no se pueden cambiar de este lado:

  1. Sólo a Responsable Inscripto —a quien se le emite Factura A—.
  2. Nunca a quien tiene certificado de exclusión.
  3. El mínimo se compara contra LA PERCEPCIÓN, no contra la venta. Lo
     puso el contador por escrito, y es la diferencia entre percibirle a
     una venta de $30.000 o a una de $725.000.
*/
export function percepcionIibb(base: number, d: DatosPercepcion): number {
  if (!(base > 0)) return 0
  if (d.condicion_iva_id !== 1) return 0
  if (d.excluido) return 0
  if (!(d.alicuota > 0)) return 0

  const percepcion = alCentavo((base * d.alicuota) / 100)
  return percepcion <= (d.minimo ?? 0) ? 0 : percepcion
}

export interface ComprobanteArmado {
  tipo_comprobante_id: number
  clase: string
  neto_gravado: number
  exento: number
  iva_total: number
  tributos_total: number
  total: number
  alicuotas: { alicuota_iva_id: number; base_imponible: number; importe: number }[]
  tributos: {
    tributo_id: number
    descripcion: string
    base_imponible: number
    alicuota: number
    importe: number
  }[]
}

export interface DatosParaArmar {
  lineas: LineaFiscal[]
  /** Lo que la venta cobró, que es lo que ya pagó el cliente. */
  totalVenta: number
  porcentajes: Map<number, number>
  /** 'A', 'B' o 'C', según la condición del cliente frente al IVA. */
  clase: string
  tipo_comprobante_id: number
  percepcion: DatosPercepcion
}

/*
  El comprobante entero, con los mismos números que sacaría el servidor.

  El total sale del total de la VENTA más la percepción, y no de sumar
  el desglose: es lo que hace `preparar_comprobante()`, y tiene sentido
  —el total de la venta es lo que el cliente pagó, y el desglose es una
  explicación de ese número, no su origen—.
*/
export function armarComprobante(d: DatosParaArmar): ComprobanteArmado {
  const alicuotas = desglosarIva(d.lineas, d.porcentajes)

  const neto = alCentavo(alicuotas.reduce((s, a) => s + a.base_imponible, 0))
  const iva = alCentavo(alicuotas.reduce((s, a) => s + a.importe, 0))
  const exento = totalExento(d.lineas)

  const percepcion = percepcionIibb(neto, d.percepcion)

  return {
    tipo_comprobante_id: d.tipo_comprobante_id,
    clase: d.clase,
    neto_gravado: neto,
    exento,
    iva_total: iva,
    tributos_total: percepcion,
    total: alCentavo(Number(d.totalVenta) + percepcion),
    alicuotas: alicuotas.map((a) => ({
      alicuota_iva_id: a.alicuota_iva_id,
      base_imponible: a.base_imponible,
      importe: a.importe,
    })),
    // Tributo 2 = Impuestos provinciales, el código de ARCA para IIBB.
    tributos:
      percepcion > 0
        ? [
            {
              tributo_id: 2,
              descripcion: 'Percepción IIBB Misiones',
              base_imponible: neto,
              alicuota: d.percepcion.alicuota,
              importe: percepcion,
            },
          ]
        : [],
  }
}
