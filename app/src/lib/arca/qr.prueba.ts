import { describe, expect, it } from 'vitest'
import { urlQrComprobante } from '@/lib/arca/qr'

/*
  ─────────────────────────────────────────────────────────────
  QR de los comprobantes — RG 4892/2020

  Un QR mal armado no falla de forma visible: el celular abre el link
  igual, y es ARCA la que responde que el comprobante no existe. Eso se
  descubre con un cliente o un inspector adelante.

  Por eso la prueba principal compara contra el ejemplo publicado por
  ARCA en su propia especificación, byte a byte. Si alguien cambia el
  orden de los campos, o manda un número como texto, esto falla acá y no
  en el mostrador.

  Especificación: afip.gob.ar/fe/qr/documentos/QRespecificaciones.pdf
  ─────────────────────────────────────────────────────────────
*/

function datosDelQr(url: string): Record<string, unknown> {
  const base64 = new URL(url).searchParams.get('p')!
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'))
}

describe('formato exigido por ARCA', () => {
  it('reproduce exactamente el ejemplo oficial de la especificación', () => {
    const url = urlQrComprobante({
      fecha: '2020-10-13',
      cuitEmisor: '30000000007',
      puntoVenta: 10,
      tipoComprobante: 1,
      numero: 94,
      importeTotal: 12100,
      moneda: 'DOL',
      cotizacion: 65,
      tipoDocumentoReceptor: 80,
      documentoReceptor: '20000000001',
      tipoAutorizacion: 'E',
      codigoAutorizacion: '70417054367476',
    })

    expect(new URL(url).searchParams.get('p')).toBe(
      'eyJ2ZXIiOjEsImZlY2hhIjoiMjAyMC0xMC0xMyIsImN1aXQiOjMwMDAwMDAwMDA3LCJwdG9WdGEiOjEw' +
        'LCJ0aXBvQ21wIjoxLCJucm9DbXAiOjk0LCJpbXBvcnRlIjoxMjEwMCwibW9uZWRhIjoiRE9MIiwiY3R6' +
        'Ijo2NSwidGlwb0RvY1JlYyI6ODAsIm5yb0RvY1JlYyI6MjAwMDAwMDAwMDEsInRpcG9Db2RBdXQiOiJF' +
        'IiwiY29kQXV0Ijo3MDQxNzA1NDM2NzQ3Nn0=',
    )
  })

  it('apunta al sitio de ARCA', () => {
    const url = urlQrComprobante(facturaB())
    expect(url.startsWith('https://www.arca.gob.ar/fe/qr/?p=')).toBe(true)
  })

  /*
    La especificación dice "numérico" para casi todo. Mandar 12100 como
    "12100" es el error más fácil de cometer y el más difícil de ver.
  */
  it('manda los importes y códigos como números, no como texto', () => {
    const d = datosDelQr(urlQrComprobante(facturaA()))
    expect(typeof d.cuit).toBe('number')
    expect(typeof d.importe).toBe('number')
    expect(typeof d.ctz).toBe('number')
    expect(typeof d.codAut).toBe('number')
    expect(typeof d.nroDocRec).toBe('number')
    // Estos dos sí son texto según la especificación.
    expect(typeof d.moneda).toBe('string')
    expect(typeof d.tipoCodAut).toBe('string')
  })
})

describe('receptor', () => {
  /*
    Los campos del receptor son "de corresponder". En una Factura B de
    mostrador no hay nadie identificado, y mandar el código 99 con
    documento 0 es peor que no mandarlos.
  */
  it('omite el receptor cuando la venta es a consumidor final sin identificar', () => {
    const d = datosDelQr(urlQrComprobante(facturaB()))
    expect(d.tipoDocRec).toBeUndefined()
    expect(d.nroDocRec).toBeUndefined()
  })

  it('incluye el receptor cuando está identificado', () => {
    const d = datosDelQr(urlQrComprobante(facturaA()))
    expect(d.tipoDocRec).toBe(80)
    expect(d.nroDocRec).toBe(30500001735)
  })
})

describe('tipo de autorización', () => {
  it('usa E para un CAE normal', () => {
    expect(datosDelQr(urlQrComprobante(facturaA())).tipoCodAut).toBe('E')
  })

  it('usa A cuando el comprobante salió por contingencia con CAEA', () => {
    const d = datosDelQr(urlQrComprobante({ ...facturaA(), tipoAutorizacion: 'A' }))
    expect(d.tipoCodAut).toBe('A')
  })
})

/** Factura A real, la que ARCA autorizó en homologación el 21/08/2026. */
function facturaA() {
  return {
    fecha: '2026-08-21',
    cuitEmisor: '20146369767',
    puntoVenta: 1,
    tipoComprobante: 1,
    numero: 1,
    importeTotal: 1233346.32,
    moneda: 'PES',
    cotizacion: 1,
    tipoDocumentoReceptor: 80,
    documentoReceptor: '30500001735',
    tipoAutorizacion: 'E' as const,
    codigoAutorizacion: '86340779425050',
  }
}

/** Factura B de mostrador, sin receptor identificado. */
function facturaB() {
  return {
    ...facturaA(),
    tipoComprobante: 6,
    numero: 2,
    importeTotal: 31900,
    tipoDocumentoReceptor: 99,
    documentoReceptor: null,
    codigoAutorizacion: '86340778898271',
  }
}
