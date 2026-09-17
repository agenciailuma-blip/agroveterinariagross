import { describe, expect, it } from 'vitest'
import { ticketDePrueba, ticketEscPos } from '@/lib/comprobante/escpos'
import type { ComprobanteCompleto } from '@/lib/api/comprobante'

/*
  El ticket que sale por la impresora del mostrador.

  No hay forma de mirarlo hasta tener la Hasar delante, así que lo que
  se prueba acá es lo que se puede probar sin ella: que los números que
  salen impresos sean los correctos, que la Factura A vaya sin IVA, y
  que los acentos no se conviertan en símbolos raros.

  Lo último no es un detalle de estilo: con la codificación equivocada,
  "Bagó" se imprime "BagÃ³" en un comprobante fiscal.
*/

const EMISOR = {
  razon_social: 'GROSS ERNESTO HUGO',
  nombre_fantasia: 'Agroveterinaria Gross',
  cuit: '20146369767',
  domicilio: 'Av. Libertad 315',
  localidad: 'Oberá, Misiones',
  telefono: '3755-421829/401829',
  ingresos_brutos: '20-14636976-7',
  inicio_actividades: '16/06/1986',
  logo: '',
}

function comprobante(extra: Partial<ComprobanteCompleto> = {}): ComprobanteCompleto {
  return {
    id: 'c-1',
    estado: 'autorizado',
    tipo_comprobante_id: 6,
    tipo_descripcion: 'Factura B',
    clase: 'B',
    punto_venta: 6,
    numero: 48014,
    fecha: '2026-08-24',
    concepto: 1,
    receptor_nombre: 'Consumidor final',
    receptor_documento: null,
    receptor_tipo_documento_id: 99,
    receptor_documento_sigla: '',
    receptor_condicion: 'Consumidor Final',
    receptor_domicilio: null,
    neto_gravado: 17355.37,
    neto_no_gravado: 0,
    exento: 0,
    iva_total: 3644.63,
    tributos_total: 0,
    total: 21000,
    moneda: 'PES',
    cotizacion: 1,
    cae: '86349754872934',
    cae_vencimiento: '2026-09-03',
    modalidad: 'cae',
    autorizado_en: '2026-08-24T20:48:21.000Z',
    creado_en: '2026-08-24T20:48:00.000Z',
    impresiones: 0,
    lineas: [
      {
        orden: 1,
        codigo_producto: '101',
        descripcion: 'ALIM BAL BAGÓ PERRO ADULTO',
        cantidad: 1,
        precio_unitario: 7500,
        importe: 7500,
        alicuota_iva_id: 5,
      },
      {
        orden: 2,
        codigo_producto: '102',
        descripcion: 'CREDELIO 11-22 x unidad',
        cantidad: 1,
        precio_unitario: 13500,
        importe: 13500,
        alicuota_iva_id: 5,
      },
    ],
    alicuotas: [{ alicuota_iva_id: 5, base_imponible: 17355.37, importe: 3644.63, porcentaje: 21 }],
    tributos: [],
    emisor: EMISOR,
    ...extra,
  }
}

/*
  Lo que va a leer la impresora, leído como lo lee ella.

  La térmica no interpreta latin1 ni UTF-8: usa la página 437, la de
  MS-DOS. Decodificar acá con otra tabla haría pasar pruebas que en el
  papel salen mal — que es exactamente lo que pasó hasta el 17/09.
*/
const DESDE_437: Record<number, string> = {
  0x81: 'ü', 0x82: 'é', 0x90: 'É', 0x99: 'Ö', 0x9a: 'Ü',
  0xa0: 'á', 0xa1: 'í', 0xa2: 'ó', 0xa3: 'ú', 0xa4: 'ñ', 0xa5: 'Ñ',
  0xa6: 'ª', 0xa7: 'º', 0xa8: '¿', 0xad: '¡', 0xf8: '°',
}

function comoTexto(bytes: Uint8Array): string {
  return [...bytes]
    .map((b) => DESDE_437[b] ?? String.fromCharCode(b))
    .join('')
}

/** Los importes impresos, en orden. */
function importes(texto: string): number[] {
  return [...texto.matchAll(/\$\s*([\d.]+,\d{2})/g)].map((m) =>
    Number(m[1].replaceAll('.', '').replace(',', '.')),
  )
}

describe('el ticket que sale por la impresora', () => {
  it('lleva los datos del emisor que ARCA exige', () => {
    const t = comoTexto(ticketEscPos(comprobante(), null))
    expect(t).toContain('GROSS ERNESTO HUGO')
    expect(t).toContain('20-14636976-7')
    expect(t).toContain('16/06/1986')
    expect(t).toContain('IVA Responsable Inscripto')
  })

  it('identifica el comprobante con punto de venta, número y código', () => {
    const t = comoTexto(ticketEscPos(comprobante(), null))
    expect(t).toContain('0006 00048014')
    expect(t).toContain('COD. 006')
  })

  it('en la Factura B imprime con IVA y la leyenda de transparencia', () => {
    const t = comoTexto(ticketEscPos(comprobante(), null))
    expect(t).toContain('Ley 27.743')
    expect(importes(t)).toContain(7500)
    expect(importes(t)).toContain(21000)
  })

  it('en la Factura A imprime sin IVA y cierra con el neto gravado', () => {
    const c = comprobante({ clase: 'A', tipo_comprobante_id: 1, tipo_descripcion: 'Factura A' })
    const t = comoTexto(ticketEscPos(c, null))

    expect(t).toContain('Precios sin IVA')
    const netos = c.lineas.map((l) => Math.round((l.importe / 1.21) * 100) / 100)
    for (const n of netos) expect(importes(t)).toContain(n)
    expect(Math.abs(netos.reduce((a, b) => a + b, 0) - c.neto_gravado)).toBeLessThan(0.02)
  })

  /*
    Lo que se vio impreso en el local el 17/09, y que ninguna prueba
    agarraba porque decodificaban con la tabla equivocada:

      Oberá    salía  Oberß
      Régimen  salía  Rθgimen
      Alícuota salía  Alφcuota

    La impresora leía los códigos de latin1 con su tabla, la 437.
  */
  it('los acentos salen en el alfabeto de la impresora, no en el de Windows', () => {
    const bytes = ticketEscPos(comprobante(), null)
    expect(comoTexto(bytes)).toContain('Oberá, Misiones')
    // La á de la 437 es el 0xA0, no el 0xE1 de latin1.
    expect(bytes).toContain(0xa0)
    expect(bytes).not.toContain(0xe1)
  })

  it('a las mayúsculas acentuadas les saca la tilde en vez de romperlas', () => {
    // La 437 no tiene Ó. "BAGO" se lee igual; "BAG?" parece un error.
    const t = comoTexto(ticketEscPos(comprobante(), null))
    expect(t).toContain('BAGO')
    expect(t).not.toContain('BAG?')
  })

  /*
    El "$á6.400,00" de las fotos del local. El formato de moneda separa
    el signo del número con un espacio duro, invisible en pantalla, y ese
    código en la 437 es justo la letra á.
  */
  it('los importes no arrastran el espacio duro del formato de moneda', () => {
    const bytes = ticketEscPos(comprobante(), null)
    const t = comoTexto(bytes)
    expect(t).toContain('$ 21.000,00')
    expect(t).not.toContain('$á')
  })

  it('le dice a la impresora en qué alfabeto va a hablarle', () => {
    // ESC t 0 — si quedó en otra página, el ticket siguiente sale con
    // las letras cambiadas y no hay forma de saber por qué.
    const inicio = [...ticketEscPos(comprobante(), null)].slice(0, 5)
    expect(inicio).toEqual([0x1b, 0x40, 0x1b, 0x74, 0x00])
  })

  it('dice CAEA, y no CAE, cuando salió por contingencia', () => {
    const t = comoTexto(ticketEscPos(comprobante({ modalidad: 'caea' }), null))
    expect(t).toContain('CAEA Nro:')
    expect(t).not.toContain('CAE Nro:')
  })

  it('suma la percepción de IIBB al pie', () => {
    const c = comprobante({
      tributos: [
        {
          descripcion: 'Percepción IIBB Misiones',
          base_imponible: 17355.37,
          alicuota: 3.31,
          importe: 574.46,
        },
      ],
      tributos_total: 574.46,
      total: 21574.46,
    })
    const t = comoTexto(ticketEscPos(c, null))
    expect(t).toContain('Percepción IIBB')
    expect(importes(t)).toContain(574.46)
    expect(importes(t)).toContain(21574.46)
  })

  it('manda el QR a la impresora sólo si hay uno', () => {
    // GS ( k — el comando con el que la impresora dibuja el QR sola
    const comando = [0x1d, 0x28, 0x6b]
    const con = ticketEscPos(comprobante(), 'https://www.arca.gob.ar/fe/qr/?p=abc')
    const sin = ticketEscPos(comprobante(), null)

    const tiene = (b: Uint8Array) =>
      [...b].some((_, i) => comando.every((c, j) => b[i + j] === c))

    expect(tiene(con)).toBe(true)
    expect(tiene(sin)).toBe(false)
  })

  it('termina cortando el papel, después de avanzarlo', () => {
    // Sin el avance, el corte cae sobre la última línea y el total sale
    // partido al medio — que es justo lo que el cliente mira.
    const cola = [...ticketEscPos(comprobante(), null)].slice(-8)
    expect(cola).toEqual([0x0a, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00])
  })

  it('el ticket de prueba dice de quién es y cuándo se hizo', () => {
    const t = comoTexto(ticketDePrueba('Agroveterinaria Gross'))
    expect(t).toContain('Agroveterinaria Gross')
    expect(t).toContain('Prueba de impresión')
  })
})
