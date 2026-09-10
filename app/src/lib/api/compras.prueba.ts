import { describe, expect, it } from 'vitest'
import { ivaSugerido, numeroDeComprobante, totalDeLaCarga } from '@/lib/api/compras'

/*
  Cargar una factura de compra.

  Las cuentas de la base se verifican contra la base. Lo que se prueba
  acá es lo que pasa mientras alguien tiene el papel en la mano: que el
  número se escriba como está impreso, que el IVA sugerido dé lo que da
  la calculadora, y que el total que se muestra antes de guardar sea el
  mismo que va a quedar guardado.

  Ese último es el que importa: es la única comprobación que hace la
  persona —comparar con el papel— y si el número de la pantalla se
  calculara distinto que el de la base, la comprobación no serviría para
  nada.
*/

describe('el número del comprobante', () => {
  it('se escribe como está impreso en la factura', () => {
    expect(numeroDeComprobante(3, 45678)).toBe('0003-00045678')
  })

  it('completa con ceros los puntos de venta y números cortos', () => {
    expect(numeroDeComprobante(1, 7)).toBe('0001-00000007')
  })
})

describe('el IVA que se sugiere al escribir el neto', () => {
  it('calcula el 21% redondeado a centavos', () => {
    expect(ivaSugerido(100000, 21)).toBe(21000)
    expect(ivaSugerido(1234.56, 21)).toBe(259.26)
  })

  it('sirve igual para las otras alícuotas', () => {
    expect(ivaSugerido(50000, 10.5)).toBe(5250)
    expect(ivaSugerido(50000, 0)).toBe(0)
  })

  /*
    Los campos vienen de texto escrito a mano: mientras se está tipeando,
    lo que hay adentro puede no ser un número. Sugerir "NaN" dejaría el
    formulario sin poder guardarse y sin decir por qué.
  */
  it('no devuelve basura cuando todavía no hay un número', () => {
    expect(ivaSugerido(Number('abc'), 21)).toBe(0)
    expect(ivaSugerido(1000, Number(''))).toBe(0)
  })
})

describe('el total que se muestra antes de guardar', () => {
  /*
    El mismo caso que se probó contra la base: dos alícuotas y una
    percepción tienen que dar 179.250, que es lo que quedó guardado.
  */
  it('suma netos, IVA y percepciones igual que la base', () => {
    const total = totalDeLaCarga({
      alicuotas: [
        { base_imponible: 100000, importe: 21000 },
        { base_imponible: 50000, importe: 5250 },
      ],
      tributos: [{ importe: 3000 }],
      neto_no_gravado: 0,
      exento: 0,
    })

    expect(total).toBe(179250)
  })

  it('suma también lo no gravado y lo exento', () => {
    const total = totalDeLaCarga({
      alicuotas: [{ base_imponible: 1000, importe: 210 }],
      tributos: [],
      neto_no_gravado: 500,
      exento: 300,
    })

    expect(total).toBe(2010)
  })

  it('aguanta los campos a medio escribir', () => {
    const total = totalDeLaCarga({
      alicuotas: [{ base_imponible: Number('  '), importe: Number('x') }],
      tributos: [],
      neto_no_gravado: Number('abc'),
      exento: Number('1,5'),
    })

    expect(total).toBe(0)
  })
})
