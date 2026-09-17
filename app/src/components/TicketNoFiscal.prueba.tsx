import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import TicketNoFiscal from '@/components/TicketNoFiscal'
import { ticketNoFiscalEscPos } from '@/lib/comprobante/escposNoFiscal'
import type { NoFiscalCompleto, TipoNoFiscal } from '@/lib/api/noFiscal'

/*
  Lo que estas pruebas cuidan no es la estética: es que este papel NUNCA
  pueda confundirse con una factura.

  El límite del módulo está escrito en el esquema —comprobante_no_fiscal
  no tiene columnas de CAE ni de clase A/B— pero un papel se puede
  falsificar desde la plantilla igual: alcanza con dibujar un recuadro
  con una "A" adentro y escribir "CAE" seguido de cualquier número. Estas
  pruebas leen el HTML y los bytes que se le mandan a la impresora, y
  fallan si aparece cualquiera de esas cosas.

  Se prueban las dos salidas —pantalla e impresora— porque son dos
  caminos distintos y sólo uno se mira con los ojos.
*/

const EMISOR = {
  razon_social: 'GROSS ERNESTO HUGO',
  nombre_fantasia: 'Agroveterinaria Gross',
  cuit: '20146369767',
  domicilio: 'Av. Libertad 315',
  localidad: 'Oberá, Misiones',
  telefono: '3755-421829/401829',
  logo: '',
}

function doc(extra: Partial<NoFiscalCompleto> = {}): NoFiscalCompleto {
  return {
    id: 'nf-1',
    tipo_clave: 'comprobante_interno' as TipoNoFiscal,
    tipo_descripcion: 'Comprobante interno',
    serie: 'CAJA1',
    numero: 45,
    fecha: '2026-09-04',
    estado: 'emitido',
    receptor_nombre: 'Juan Pérez',
    receptor_documento: '20111111112',
    receptor_documento_sigla: 'CUIT',
    receptor_condicion: 'Consumidor Final',
    receptor_domicilio: 'Sarmiento 1200',
    total: 15000,
    observaciones: null,
    valido_hasta: null,
    entrega_domicilio: null,
    entrega_localidad: null,
    entrega_contacto: null,
    transportista: null,
    venta_codigo: 'CAJA1-000123',
    creado_en: '2026-09-04T13:00:00Z',
    lineas: [
      {
        orden: 1,
        codigo_producto: 'A-100',
        descripcion: 'Alimento Perro Adulto 15 kg',
        cantidad: 2,
        precio_unitario: 7500,
        importe: 15000,
      },
    ],
    emisor: EMISOR,
    ...extra,
  }
}

const html = (d: NoFiscalCompleto) => renderToStaticMarkup(<TicketNoFiscal c={d} />)
const bytes = (d: NoFiscalCompleto) => new TextDecoder('latin1').decode(ticketNoFiscalEscPos(d))

describe('el no fiscal no puede parecerse a una factura', () => {
  it('lleva la leyenda arriba y abajo, en pantalla', () => {
    const salida = html(doc())
    const veces = salida.split('DOCUMENTO NO VÁLIDO COMO FACTURA').length - 1
    expect(veces).toBe(2)
  })

  it('lleva la leyenda en lo que se le manda a la impresora', () => {
    expect(bytes(doc())).toContain('DOCUMENTO NO V')
  })

  it('no dice CAE ni CAEA en ningún lado', () => {
    for (const salida of [html(doc()), bytes(doc())]) {
      expect(salida).not.toMatch(/\bCAE\b/)
      expect(salida).not.toMatch(/\bCAEA\b/)
    }
  })

  it('no discrimina IVA — es lo que le da aspecto de factura', () => {
    for (const salida of [html(doc()), bytes(doc())]) {
      expect(salida).not.toMatch(/IVA/i)
      expect(salida).not.toMatch(/21[,.]00\s*%/)
    }
  })

  it('no imprime un QR', () => {
    // El QR de ARCA se dibuja con GS ( k. Si aparecieran esos bytes,
    // alguien habría copiado el bloque del ticket fiscal.
    const crudo = ticketNoFiscalEscPos(doc())
    let tieneQr = false
    for (let i = 0; i < crudo.length - 2; i++) {
      if (crudo[i] === 0x1d && crudo[i + 1] === 0x28 && crudo[i + 2] === 0x6b) tieneQr = true
    }
    expect(tieneQr).toBe(false)
  })

  it('no lleva los datos fiscales del emisor', () => {
    // CUIT, domicilio e inicio de actividades son obligatorios en una
    // factura. Acá no van: este papel no es un comprobante fiscal, y en
    // 80 mm cada renglón de más empuja al resto hacia abajo.
    for (const salida of [html(doc()), bytes(doc())]) {
      expect(salida).not.toContain('20146369767') // el CUIT de Gross
      expect(salida).not.toContain('Av. Libertad 315')
      expect(salida).not.toContain('Oberá, Misiones')
      expect(salida).not.toContain('GROSS ERNESTO HUGO')
      expect(salida).not.toContain('3755-421829')
    }
    // El CUIT del CLIENTE sí va: es a quién se le entrega el papel.
    expect(html(doc())).toContain('20111111112')
  })

  it('no muestra una letra de comprobante', () => {
    const salida = html(doc())
    expect(salida).not.toMatch(/COD\.\s*\d/)
    expect(salida).not.toMatch(/Factura [AB]/)
  })
})

describe('el contenido', () => {
  it('muestra el número con su sigla y su serie', () => {
    expect(html(doc())).toContain('CI CAJA1-00000045')
    expect(bytes(doc())).toContain('CI CAJA1-00000045')
  })

  it('el total es el de la venta, sin desglose', () => {
    const salida = html(doc())
    expect(salida).toContain('TOTAL')
    // 15.000 con el formato de moneda argentino
    expect(salida).toMatch(/15[.\s]000/)
  })

  it('el remito muestra la entrega y el recibí conforme', () => {
    const remito = doc({
      tipo_clave: 'remito' as TipoNoFiscal,
      tipo_descripcion: 'Remito',
      entrega_domicilio: 'Av. Siempreviva 742',
      entrega_localidad: 'Posadas',
      transportista: 'Camión 1',
    })
    for (const salida of [html(remito), bytes(remito)]) {
      expect(salida).toContain('Av. Siempreviva 742')
      expect(salida).toContain('Posadas')
      expect(salida).toMatch(/Cami.n 1/)
      expect(salida).toMatch(/Recib. conforme/)
    }
  })

  it('el comprobante interno NO lleva recibí conforme: no se entrega nada a domicilio', () => {
    expect(html(doc())).not.toMatch(/Recib. conforme/)
  })

  it('el presupuesto muestra hasta cuándo vale', () => {
    const p = doc({
      tipo_clave: 'presupuesto' as TipoNoFiscal,
      tipo_descripcion: 'Presupuesto',
      valido_hasta: '2026-09-19',
    })
    expect(html(p)).toMatch(/V.lido hasta/)
    expect(html(p)).toContain('19/9/2026')
  })

  it('un remito sin valorizar no muestra importes', () => {
    const sinPrecios = doc({
      tipo_clave: 'remito' as TipoNoFiscal,
      tipo_descripcion: 'Remito',
      total: 0,
      lineas: [
        {
          orden: 1,
          codigo_producto: 'A-100',
          descripcion: 'Alimento Perro Adulto 15 kg',
          cantidad: 2,
          precio_unitario: 0,
          importe: 0,
        },
      ],
    })
    const salida = html(sinPrecios)
    expect(salida).toContain('Alimento Perro Adulto 15 kg')
    expect(salida).not.toContain('TOTAL:')
  })

  /*
    El caso que pidió Lucas el 07/09, y el que de verdad importa: el
    remito TIENE precios guardados —hacen falta para valorizar lo que
    salió sin cobrarse— y aun así no se imprimen.

    La prueba se escribe con importes cargados a propósito. Con un
    remito en cero pasaría igual sin que el código haga nada, y no
    estaría probando nada.
  */
  it('un remito con precios cargados NO los imprime', () => {
    const remito = doc({
      tipo_clave: 'remito' as TipoNoFiscal,
      tipo_descripcion: 'Remito',
      total: 92500,
      lineas: [
        {
          orden: 1,
          codigo_producto: 'A-100',
          descripcion: 'Alimento Perro Adulto 15 kg',
          cantidad: 5,
          precio_unitario: 18500,
          importe: 92500,
        },
      ],
    })

    const salida = html(remito)
    expect(salida).toContain('Alimento Perro Adulto 15 kg')
    // Ni el unitario, ni el importe de la línea, ni el total.
    expect(salida).not.toContain('18.500')
    expect(salida).not.toContain('92.500')
    expect(salida).not.toContain('TOTAL:')
    // Pero sí los bultos, que es lo que se cuenta al recibir.
    expect(salida).toContain('TOTAL DE UNIDADES')

    // Y lo mismo por la impresora, que es el camino que nadie mira.
    const impreso = bytes(remito)
    expect(impreso).toContain('Alimento Perro Adulto 15 kg')
    expect(impreso).not.toContain('18.500')
    expect(impreso).not.toContain('92.500')
    expect(impreso).toContain('TOTAL DE UNIDADES')
  })

  it('el presupuesto sigue mostrando los precios', () => {
    const p = doc({
      tipo_clave: 'presupuesto' as TipoNoFiscal,
      tipo_descripcion: 'Presupuesto',
      total: 92500,
      lineas: [
        {
          orden: 1,
          codigo_producto: 'A-100',
          descripcion: 'Alimento Perro Adulto 15 kg',
          cantidad: 5,
          precio_unitario: 18500,
          importe: 92500,
        },
      ],
    })
    const salida = html(p)
    expect(salida).toContain('18.500')
    expect(salida).toContain('92.500')
    expect(salida).toContain('TOTAL:')
  })

  it('un comprobante anulado lo dice, en pantalla y en la impresora', () => {
    const anulado = doc({ estado: 'anulado' })
    expect(html(anulado)).toContain('ANULADO')
    expect(bytes(anulado)).toContain('ANULADO')
  })

  /*
    Los acentos van en el alfabeto de la impresora —la página 437, la de
    MS-DOS— y no en el de Windows. Con el de Windows, que es lo que se
    mandaba hasta el 17/09, "Operación" sale impreso "Operaci≤n".

    La leyenda va en mayúsculas y la 437 no tiene Á, así que sale
    "VALIDO", sin tilde. Se lee igual, que es lo que importa en el
    renglón que impide que este papel se confunda con una factura.
  */
  it('los acentos van en el alfabeto de la impresora', () => {
    const crudo = ticketNoFiscalEscPos(doc({ venta_codigo: 'CAJA1-000123' }))
    const texto = new TextDecoder('latin1').decode(crudo)

    expect(texto).toContain('DOCUMENTO NO VALIDO COMO FACTURA')
    // La ó de "Operación" es el 0xA2 de la 437, no el 0xF3 de Windows.
    expect(crudo).toContain(0xa2)
    expect(crudo).not.toContain(0xf3)
    // Ni rastro de UTF-8: ahí cada acento viajaría como dos bytes.
    expect(crudo).not.toContain(0xc3)
  })

  it('corta el papel al final', () => {
    const crudo = ticketNoFiscalEscPos(doc())
    const ultimos = Array.from(crudo.slice(-4))
    expect(ultimos).toEqual([0x1d, 0x56, 0x42, 0x00])
  })
})
