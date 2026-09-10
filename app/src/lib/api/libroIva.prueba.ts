import { describe, expect, it } from 'vitest'
import { comoFilaDePercepcion, percepcionesACsv, totalesDePercepciones } from '@/lib/api/libroIva'
import type { CrudoTributo, FilaPercepcion } from '@/lib/api/libroIva'

/*
  El archivo de percepciones de IIBB para Rentas.

  Gross es agente de **percepción** en Misiones —régimen 14, confirmado
  por el contador por escrito— y no de retención. Lo que se presenta es
  el detalle de lo percibido, y del otro lado hay alguien que suma las
  columnas: si un número está mal, aparece como una diferencia en una
  declaración jurada.
*/

function fila(extra: Partial<FilaPercepcion> = {}): FilaPercepcion {
  return {
    signo: 1,
    fecha: '2026-09-03',
    tipo: 'Factura A',
    punto_venta: 1,
    numero: 48014,
    cliente: 'ESTANCIA LA ESPERANZA S.R.L.',
    documento: '30712234567',
    concepto: 'Percepción de IIBB',
    base_imponible: 1000000,
    alicuota: 3.31,
    importe: 33100,
    ...extra,
  }
}

/*
  Lo que devuelve la base: los importes SIEMPRE positivos, y el signo
  puesto por el tipo de comprobante. Armar la fila a mano con importes
  ya negativos probaría la suma y no la regla, que es lo que importa.
*/
function crudo(signo: number, descripcion = 'Factura A'): CrudoTributo {
  return {
    descripcion: 'Percepción de IIBB',
    base_imponible: 1000000,
    alicuota: 3.31,
    importe: 33100,
    comprobante: {
      fecha: '2026-09-03',
      numero: 48014,
      receptor_nombre: 'ESTANCIA LA ESPERANZA S.R.L.',
      receptor_documento: '30712234567',
      tipo: { descripcion, signo },
      punto: { numero: 1 },
    },
  }
}

describe('la percepción, como sale de la base', () => {
  /*
    El caso que hace falta que esté bien: una nota de crédito devuelve
    la percepción. La base guarda 33.100 en positivo en los dos casos, y
    lo que las distingue es el signo del tipo de comprobante. Si no se
    aplicara, la declaración diría que se percibió el doble — y esa
    diferencia se paga.
  */
  it('la nota de crédito resta lo que devolvió', () => {
    const factura = comoFilaDePercepcion(crudo(1))
    const notaDeCredito = comoFilaDePercepcion(crudo(-1, 'Nota de Crédito A'))

    expect(factura.importe).toBe(33100)
    expect(notaDeCredito.importe).toBe(-33100)
    expect(notaDeCredito.base_imponible).toBe(-1000000)

    const t = totalesDePercepciones([factura, notaDeCredito])
    expect(t.percibido).toBe(0)
    expect(t.base).toBe(0)
    expect(t.percepciones).toBe(2)
  })

  /*
    Los clientes se cuentan por documento y no por nombre: en la
    declaración lo que identifica al percibido es el CUIT, y el mismo
    cliente puede estar escrito de dos formas distintas.
  */
  it('cuenta los clientes por CUIT y no por nombre', () => {
    const t = totalesDePercepciones([
      fila({ cliente: 'ESTANCIA LA ESPERANZA SRL' }),
      fila({ cliente: 'Estancia La Esperanza S.R.L.', numero: 48015 }),
      fila({ cliente: 'OTRO', documento: '20111111112', numero: 48016 }),
    ])

    expect(t.clientes).toBe(2)
  })
})

describe('el archivo que abre en Excel', () => {
  it('lleva el CUIT, la base y la alícuota, que es lo que pide Rentas', () => {
    const csv = percepcionesACsv([fila()])
    const [encabezado, primera] = csv.split('\n')

    expect(encabezado).toContain('CUIT / DNI')
    expect(encabezado).toContain('Base imponible')
    expect(encabezado).toContain('Alícuota %')
    expect(primera).toContain('30712234567')
  })

  /*
    Coma decimal y punto y coma como separador: es lo que necesita el
    Excel que usan. Con punto decimal, "33100.5" entra como texto y no
    se puede sumar.
  */
  it('escribe los números como los espera el Excel de Gross', () => {
    const csv = percepcionesACsv([fila({ importe: 33100.5 })])

    expect(csv).toContain('33100,5')
    expect(csv.split('\n')[0]).toContain(';')
  })

  it('un mes sin percepciones sale con encabezado y sin filas', () => {
    expect(percepcionesACsv([]).split('\n')).toHaveLength(1)
  })
})
