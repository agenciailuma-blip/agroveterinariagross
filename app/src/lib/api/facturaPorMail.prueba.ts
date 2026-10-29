import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import {
  armarMail,
  armarMailPedido,
  correoValido,
  errorDelCorreo,
  nombreDelPdf,
  pdfValido,
} from '../../../../supabase/functions/enviar-factura/reglas.ts'
import { aBase64, facturaEnPdf, reciboEnPdf, seguro } from '@/lib/comprobante/pdf'
import type { ReciboCompleto } from '@/lib/api/recibos'
import type { ComprobanteCompleto } from '@/lib/api/comprobante'

/*
  La factura por mail.

  Lo que se cuida: que el PDF salga siempre —con muchas líneas, con
  caracteres raros en una descripción—, que el mail diga lo justo, y que
  lo que conteste el servicio de correo se entienda.
*/

const factura = (lineas = 2, extra: Partial<ComprobanteCompleto> = {}): ComprobanteCompleto => ({
  id: 'c1', venta_id: 'v1', estado: 'autorizado', tipo_comprobante_id: 6, tipo_descripcion: 'Factura B', clase: 'B',
  punto_venta: 1, numero: 123, fecha: '2026-10-21', concepto: 1, receptor_nombre: 'María Gómez',
  receptor_documento: '30111222', receptor_tipo_documento_id: 96, receptor_documento_sigla: 'DNI',
  receptor_condicion: 'Consumidor Final', receptor_domicilio: 'San Martín 123, Oberá', neto_gravado: 51487.6,
  neto_no_gravado: 0, exento: 0, iva_total: 10812.4, tributos_total: 0, total: 62300, moneda: 'PES', cotizacion: 1,
  cae: '76123456789012', cae_vencimiento: '2026-10-31', modalidad: 'cae', autorizado_en: null,
  creado_en: '2026-10-21T15:00:00Z', impresiones: 0,
  lineas: Array.from({ length: lineas }, (_, i) => ({
    orden: i + 1, codigo_producto: `PROD-${i}`, descripcion: `Royal Canin Gato Adulto 7,5 kg — bolsa ${i}`,
    cantidad: 1, precio_unitario: 62300 / lineas, importe: 62300 / lineas, alicuota_iva_id: 5,
  })),
  alicuotas: [{ alicuota_iva_id: 5, base_imponible: 51487.6, importe: 10812.4, porcentaje: 21 }],
  tributos: [],
  emisor: {
    razon_social: 'GROSS ERNESTO HUGO', nombre_fantasia: 'Agroveterinaria Gross', cuit: '20146369767',
    domicilio: 'Av. Libertad 315', localidad: 'Oberá, Misiones', telefono: '3755-421829',
    ingresos_brutos: '20-14636976-7', inicio_actividades: '16/06/1986',
  },
  ...extra,
})

describe('el PDF de la factura', () => {
  it('sale un PDF de una hoja, que el servidor acepta', async () => {
    const bytes = await facturaEnPdf(factura(), 'https://www.arca.gob.ar/fe/qr/?p=eyJ2ZXIiOjF9')
    expect(pdfValido(bytes)).toBe(true)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  })

  it('con muchas líneas sigue en otra hoja, sin cortarse', async () => {
    const bytes = await facturaEnPdf(factura(90), null)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1)
  })

  it('una Factura A con percepción también sale', async () => {
    const a = factura(3, {
      clase: 'A', tipo_descripcion: 'Factura A', tipo_comprobante_id: 1, receptor_documento: '30999999995',
      receptor_tipo_documento_id: 80, receptor_documento_sigla: 'CUIT', receptor_condicion: 'IVA Responsable Inscripto',
      tributos: [{ descripcion: 'Percepción IIBB Misiones', base_imponible: 51487.6, alicuota: 3.31, importe: 1704.24 }],
      tributos_total: 1704.24, total: 64004.24,
    })
    expect(pdfValido(await facturaEnPdf(a, null))).toBe(true)
  })

  // Una descripción con un emoji o un carácter que Helvetica no tiene no
  // puede dejar al cliente sin su factura.
  it('lo que la letra no puede escribir se cambia, no rompe', async () => {
    expect(seguro('Alimento “premium” 🐶 — 7,5 kg')).toBe('Alimento "premium"  — 7,5 kg')
    const rara = factura(1)
    rara.lineas[0].descripcion = 'Pipeta 🐾 perros 10–20 kg ✓'
    expect(pdfValido(await facturaEnPdf(rara, null))).toBe(true)
  })

  it('el base64 vuelve a ser el mismo PDF', async () => {
    const bytes = await facturaEnPdf(factura(), null)
    const vuelta = Uint8Array.from(atob(aBase64(bytes)), (ch) => ch.charCodeAt(0))
    expect(vuelta).toEqual(bytes)
  })
})

const MAIL = {
  tipo: 'Factura B', numero: '0001-00000123', fecha: '2026-10-16', total: 62300, receptor: 'María Gómez',
  comercio: 'Agroveterinaria Gross', domicilio: 'Av. Libertad 315, Oberá', telefono: '3755-421829',
  logo: 'https://gross-sistema.pages.dev/marca/correo-isotipo-blanco.png', respondible: false,
}

describe('el mail', () => {
  it('una dirección que vale la pena intentar', () => {
    expect(correoValido('maria@ejemplo.com')).toBe(true)
    expect(correoValido(' compras@vet.com.ar ')).toBe(true)
    for (const malo of ['maria', 'maria@', 'maria@ejemplo', 'a b@c.com', 'a@b.com, c@d.com', '']) {
      expect(correoValido(malo), malo).toBe(false)
    }
  })

  it('dice qué es, de cuánto y de quién viene', () => {
    const m = armarMail({ ...MAIL, receptor: 'María Gómez' })
    expect(m.asunto).toBe('Factura B 0001-00000123 · Agroveterinaria Gross')
    expect(m.texto).toContain('Hola, María Gómez:')
    expect(m.texto).toContain('$ 62.300,00')
    expect(m.html).toContain('16/10/2026')
    expect(m.html).toContain('#8d0b7b')
    expect(m.html).toContain('https://gross-sistema.pages.dev/marca/correo-isotipo-blanco.png')
    expect(m.html).not.toContain('<script')
  })

  it('al consumidor final no lo saluda por ese nombre, y no deja pasar HTML', () => {
    const m = armarMail({ ...MAIL, receptor: 'Consumidor Final', comercio: '<b>X</b>' })
    expect(m.texto.startsWith('Hola:')).toBe(true)
    expect(m.html).toContain('&lt;b&gt;X&lt;/b&gt;')
  })

  // «Respondé este mail» sólo si hay una casilla del local que lo reciba.
  it('invita a responder sólo si alguien va a leer la respuesta', () => {
    expect(armarMail({ ...MAIL, respondible: false }).texto).not.toContain('respondé')
    expect(armarMail({ ...MAIL, respondible: true }).texto).toContain('respondé este mail')
  })

  it('el archivo se llama como la factura', () => {
    expect(nombreDelPdf({ tipo: 'Factura B', numero: '0001-00000123' })).toBe('Factura B 0001-00000123.pdf')
  })

  it('lo que contesta Resend, en palabras', () => {
    expect(errorDelCorreo(403, 'You can only send testing emails to your own email address (x@y.com).')).toMatch(/dominio no está verificado/)
    expect(errorDelCorreo(401, 'API key is invalid')).toMatch(/RESEND_API_KEY/)
    expect(errorDelCorreo(429, 'Too many requests')).toMatch(/demasiados/)
  })

  it('lo que no es un PDF no se manda', () => {
    expect(pdfValido(new TextEncoder().encode('<html>no soy un pdf</html>'.repeat(10)))).toBe(false)
  })
})

describe('el recibo por mail', () => {
  const recibo = (pagos: ReciboCompleto['pagos'], saldo = 0): ReciboCompleto => ({
    id: 'r1', serie: '0001', numero: 12, fecha: '2026-10-29', total: pagos.reduce((s, p) => s + p.importe, 0),
    concepto: null, emitido_en: '2026-10-29T12:00:00Z', emitido_por_nombre: 'Lucas Gross',
    mail_destinatario: null, mail_estado: null, mail_error: null, mail_en: null,
    cliente_id: 'c1', cliente_nombre: 'Agro San José 🌱', cliente_email: null, cliente_documento: '30712345678',
    cliente_domicilio: 'Sarmiento 120, Oberá', saldo_despues: saldo, orden_numero: 4, orden_vendedor: 'Facundo',
    pagos, emisor: { razon_social: 'Gross S.A.', nombre_fantasia: 'Agroveterinaria Gross', cuit: '30-00000000-0' },
  })

  it('el PDF sale con transferencia y con varios cheques', async () => {
    expect(pdfValido(await reciboEnPdf(recibo([{ medio: 'Transferencia', importe: 125000.5, cheque: null }], 3000)))).toBe(true)
    const cheques = recibo([
      { medio: 'Cheque', importe: 300, cheque: { banco: 'Banco Macro', numero: '99887766', fecha_pago: '2026-11-28', librador: null } },
      { medio: 'Cheque', importe: 200.5, cheque: { banco: 'Banco Nación', numero: '11223344', fecha_pago: null, librador: null } },
    ], -50)
    expect(pdfValido(await reciboEnPdf(cheques))).toBe(true)
  })

  it('el mail habla de un pago, no de una compra', () => {
    const m = armarMail({ ...MAIL, tipo: 'Recibo', numero: '0001-00000012', esRecibo: true })
    expect(m.asunto).toBe('Recibo 0001-00000012 · Agroveterinaria Gross')
    expect(m.texto).toContain('el recibo 0001-00000012 de tu pago')
    expect(m.texto).toContain('Gracias por tu pago.')
    expect(m.html).toContain('Te mandamos el recibo de tu pago.')
    expect(m.html).not.toContain('factura')
    // La factura sigue igual que antes.
    expect(armarMail(MAIL).html).toContain('Te mandamos tu factura.')
  })
})

describe('el pedido mayorista por mail', () => {
  const PEDIDO = {
    numero: 57, fecha: '2026-10-29', receptor: 'Veterinaria El Ceibo', vendedor: 'Facundo',
    lineas: [
      { nombre: 'Livra Cachorro 15 kg', cantidad: 3, precio: 41250.5 },
      { nombre: 'Livra Adulto 20 kg', cantidad: 1.5, precio: 39900 },
    ],
    total: 3 * 41250.5 + 1.5 * 39900, observaciones: null,
    comercio: 'Agroveterinaria Gross', domicilio: 'Av. Libertad 315, Oberá', telefono: '3755-421829',
    logo: 'https://gross-sistema.pages.dev/marca/correo-isotipo-blanco.png', respondible: false,
  }

  it('dice qué pidió, a cuánto y quién se lo tomó', () => {
    const m = armarMailPedido(PEDIDO)
    expect(m.asunto).toBe('Pedido N.º 57 · Agroveterinaria Gross')
    expect(m.texto).toContain('Hola, Veterinaria El Ceibo:')
    expect(m.texto).toContain('el pedido N.º 57 que armaste con Facundo el 29/10/2026')
    expect(m.texto).toContain('3 × Livra Cachorro 15 kg ($ 41.250,50 c/u): $ 123.751,50')
    expect(m.texto).toContain('1,5 × Livra Adulto 20 kg')
    expect(m.texto).toContain('Total: $ 183.601,50')
    expect(m.html).toContain('Livra Adulto 20 kg')
    expect(m.html).toContain('$ 183.601,50')
    expect(m.html).not.toContain('PDF')
  })

  it('la nota del vendedor va, y no deja pasar HTML', () => {
    const m = armarMailPedido({ ...PEDIDO, observaciones: 'Entregar <martes>', vendedor: null })
    expect(m.texto).toContain('Nota: Entregar <martes>')
    expect(m.html).toContain('Entregar &lt;martes&gt;')
    expect(m.texto).toContain('que armaste el 29/10/2026')
    expect(armarMailPedido(PEDIDO).texto).not.toContain('Nota:')
  })

  it('invita a responder sólo si alguien va a leer la respuesta', () => {
    expect(armarMailPedido(PEDIDO).texto).not.toContain('respondé')
    expect(armarMailPedido({ ...PEDIDO, respondible: true }).html).toContain('respondé este mail')
  })
})
