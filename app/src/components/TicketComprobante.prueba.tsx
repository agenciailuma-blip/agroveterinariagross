import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import TicketComprobante from '@/components/TicketComprobante'
import type { ComprobanteCompleto } from '@/lib/api/comprobante'

/*
  El ticket se renderiza de verdad y se le miran los números.

  No es una prueba de estética: es la única forma de saber, sin una
  Hasar delante, que en la Factura A los renglones salen sin IVA y que
  cierran con el neto gravado. Ese error ya apareció una vez en la hoja
  A4 —los renglones sumaban el total con IVA y el subtotal mostraba el
  neto— y se descubrió recién cuando Lucas describió cómo tiene que
  salir su factura.
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
        descripcion: 'CAT CHOW x kg adulto',
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
    alicuotas: [
      { alicuota_iva_id: 5, base_imponible: 17355.37, importe: 3644.63, porcentaje: 21 },
    ],
    tributos: [],
    emisor: EMISOR,
    ...extra,
  }
}

/** Los importes que salieron impresos, en orden. */
function importes(html: string): number[] {
  return [...html.matchAll(/\$\s*([\d.]+,\d{2})/g)].map((m) =>
    Number(m[1].replaceAll('.', '').replace(',', '.')),
  )
}

describe('ticket de 80 mm', () => {
  it('imprime los datos del emisor que ARCA exige en el encabezado', () => {
    const html = renderToStaticMarkup(<TicketComprobante c={comprobante()} qr={null} />)
    expect(html).toContain('GROSS ERNESTO HUGO')
    expect(html).toContain('20-14636976-7')
    expect(html).toContain('16/06/1986')
    expect(html).toContain('IVA Responsable Inscripto')
    expect(html).toContain('3755-421829/401829')
  })

  it('identifica el comprobante con punto de venta, número y código de ARCA', () => {
    const html = renderToStaticMarkup(<TicketComprobante c={comprobante()} qr={null} />)
    expect(html).toContain('0006')
    expect(html).toContain('00048014')
    expect(html).toContain('COD. 006')
  })

  it('en la Factura B los renglones van con IVA y suman el total', () => {
    const c = comprobante()
    const html = renderToStaticMarkup(<TicketComprobante c={c} qr={null} />)

    expect(html).toContain('Ley 27.743')
    // Los dos renglones, tal como los ve el cliente en el mostrador
    expect(importes(html)).toContain(7500)
    expect(importes(html)).toContain(13500)
    expect(importes(html)).toContain(21000)
  })

  it('en la Factura A los renglones van sin IVA y cierran con el neto gravado', () => {
    const c = comprobante({ clase: 'A', tipo_comprobante_id: 1, tipo_descripcion: 'Factura A' })
    const html = renderToStaticMarkup(<TicketComprobante c={c} qr={null} />)

    expect(html).toContain('Precios sin IVA')

    // Cada renglón desarmado: 7500 / 1,21 y 13500 / 1,21
    const netos = c.lineas.map((l) => Math.round((l.importe / 1.21) * 100) / 100)
    for (const n of netos) expect(importes(html)).toContain(n)

    // Y la suma de los renglones tiene que dar el neto gravado, que es
    // exactamente lo que no cerraba en la hoja A4 antes del 24/08.
    const suma = netos.reduce((a, b) => a + b, 0)
    expect(Math.abs(suma - c.neto_gravado)).toBeLessThan(0.02)
  })

  it('suma la percepción de IIBB al pie, después del IVA', () => {
    const c = comprobante({
      clase: 'A',
      tipo_comprobante_id: 1,
      tipo_descripcion: 'Factura A',
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
    const html = renderToStaticMarkup(<TicketComprobante c={c} qr={null} />)
    expect(html).toContain('Percepción IIBB Misiones')
    expect(importes(html)).toContain(574.46)
    expect(importes(html)).toContain(21574.46)
  })

  it('dice CAEA, y no CAE, cuando salió por contingencia', () => {
    const c = comprobante({ modalidad: 'caea' })
    const html = renderToStaticMarkup(<TicketComprobante c={c} qr={null} />)
    expect(html).toContain('CAEA Nro:')
    expect(html).not.toContain('>CAE Nro:')
  })

  it('no rompe si todavía no hay logo cargado', () => {
    const c = comprobante({ emisor: { ...EMISOR, logo: '' } })
    const html = renderToStaticMarkup(<TicketComprobante c={c} qr={null} />)
    expect(html).not.toContain('<img src=""')
  })
})
