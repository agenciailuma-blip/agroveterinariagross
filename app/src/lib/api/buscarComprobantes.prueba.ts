import { describe, expect, it } from 'vitest'
import {
  agruparPor,
  busquedaACsv,
  grupoDe,
  leerNumero,
  rangoDe,
  totalesDe,
  type FilaBusqueda,
} from './buscarComprobantes'

function fila(p: Partial<FilaBusqueda> = {}): FilaBusqueda {
  return {
    id: crypto.randomUUID(),
    venta_id: null,
    cliente_id: null,
    estado: 'autorizado',
    modalidad: 'cae',
    tipo: 'Factura A',
    familia: 'factura',
    clase: 'A',
    signo: 1,
    punto_venta: 1,
    numero: 1,
    comprobante: '00001-00000001',
    fecha: '2026-10-06',
    receptor_nombre: 'HIMPA',
    receptor_documento: '30711631956',
    neto_gravado: 4249741.9,
    neto_no_gravado: 0,
    exento: 0,
    iva_total: 892445.8,
    tributos_total: 140666.46,
    total: 5282854.16,
    cae: '76123456789012',
    cae_vencimiento: null,
    impresiones: 1,
    ...p,
  }
}

describe('los períodos', () => {
  it('la semana va de lunes a domingo, también si hoy es domingo', () => {
    // 19/10/2026 es lunes; el 25 es domingo y es de la misma semana.
    expect(rangoDe('semana', new Date(2026, 9, 19))).toEqual({ desde: '2026-10-19', hasta: '2026-10-25' })
    expect(rangoDe('semana', new Date(2026, 9, 25))).toEqual({ desde: '2026-10-19', hasta: '2026-10-25' })
  })

  it('el mes anterior de enero es diciembre del año anterior', () => {
    expect(rangoDe('mes_anterior', new Date(2027, 0, 10))).toEqual({ desde: '2026-12-01', hasta: '2026-12-31' })
  })

  it('el mes termina en su último día, también en febrero', () => {
    expect(rangoDe('mes', new Date(2028, 1, 3))).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' })
  })
})

describe('el número, como lo escribe la gente', () => {
  it('acepta el número solo, con punto de venta, y como sale impreso', () => {
    expect(leerNumero('29')).toEqual({ punto_venta: null, numero: 29 })
    expect(leerNumero('1-29')).toEqual({ punto_venta: 1, numero: 29 })
    expect(leerNumero('0001-00000029')).toEqual({ punto_venta: 1, numero: 29 })
    expect(leerNumero('0001 00000029')).toEqual({ punto_venta: 1, numero: 29 })
  })

  it('lo que no es un número no filtra', () => {
    expect(leerNumero('')).toBeNull()
    expect(leerNumero('A-29')).toBeNull()
    expect(leerNumero('1-2-3')).toBeNull()
  })
})

describe('los totales', () => {
  it('la nota de crédito resta, también la percepción que devuelve', () => {
    const t = totalesDe([
      fila(),
      fila({ familia: 'nota_credito', tipo: 'Nota de Crédito A', signo: -1, tributos_total: 40666.46,
        neto_gravado: 1000, iva_total: 210, total: 41876.46 }),
    ])
    expect(t.percepciones).toBe(100000)
    expect(t.neto).toBe(4248741.9)
    expect(t.iva).toBe(892235.8)
    expect(t.comprobantes).toBe(2)
  })
})

describe('clasificar por semana o por mes', () => {
  it('cada semana empieza el lunes', () => {
    expect(grupoDe('2026-10-25', 'semana')).toEqual({ clave: '2026-10-19', titulo: 'Semana del 19/10 al 25/10' })
    expect(grupoDe('2026-10-26', 'semana').clave).toBe('2026-10-26')
  })

  it('arma un grupo por mes, en orden, con su subtotal', () => {
    const grupos = agruparPor(
      [fila({ fecha: '2026-09-30' }), fila({ fecha: '2026-10-01' }), fila({ fecha: '2026-10-02' })],
      'mes',
    )
    expect(grupos.map((g) => g.titulo)).toEqual(['Septiembre 2026', 'Octubre 2026'])
    expect(grupos[1].totales.percepciones).toBe(281332.92)
  })
})

describe('el archivo', () => {
  it('abre en Excel con acentos y lleva la fila de totales', () => {
    const csv = busquedaACsv(agruparPor([fila()], 'nada'), true)
    expect(csv.startsWith('﻿')).toBe(true)
    const renglones = csv.slice(1).split('\r\n')
    expect(renglones[0]).toBe('Fecha;Comprobante;Letra;Número;Cliente;CUIT / DNI;Neto;IVA;Percepción;Total;CAE')
    expect(renglones[1]).toContain('06/10/2026;Factura A;A;00001-00000001;HIMPA;30711631956;4249741,90;892445,80;140666,46;5282854,16')
    expect(renglones.at(-1)).toBe(';TOTAL;;;1 comprobantes;;4249741,90;892445,80;140666,46;5282854,16;')
  })

  it('con grupos, cada uno lleva su subtotal antes del total', () => {
    const csv = busquedaACsv(agruparPor([fila({ fecha: '2026-09-30' }), fila({ fecha: '2026-10-01' })], 'mes'), true)
    const renglones = csv.slice(1).split('\r\n')
    expect(renglones.filter((r) => r.includes('Subtotal'))).toHaveLength(2)
    expect(renglones.at(-1)).toContain('281332,92')
  })

  it('sin percepciones no lleva esa columna', () => {
    const csv = busquedaACsv(agruparPor([fila()], 'nada'), false)
    expect(csv).not.toContain('Percepción')
  })

  it('las notas de crédito salen en negativo', () => {
    const csv = busquedaACsv(agruparPor([fila({ signo: -1, familia: 'nota_credito' })], 'nada'), true)
    expect(csv).toContain('-140666,46')
  })
})
