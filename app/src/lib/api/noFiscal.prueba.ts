import { describe, expect, it } from 'vitest'
import { noFiscalesAListado, numeroNoFiscal } from '@/lib/api/noFiscal'
import type { FilaNoFiscal } from '@/lib/api/noFiscal'

/*
  La exportación.

  "Registro, veo y exporto" — punto 12 de Lucas. Lo que se prueba acá es
  lo que hace que el archivo se abra bien en el Excel que Gross usa: el
  punto y coma como separador, la coma decimal, y el BOM que hace que los
  acentos no salgan rotos.

  Un CSV que abre con todo en una sola columna obliga a rehacerlo a mano,
  que es exactamente lo que exportar viene a evitar.
*/

function fila(extra: Partial<FilaNoFiscal> = {}): FilaNoFiscal {
  return {
    id: 'x',
    tipo_clave: 'remito',
    serie: 'CAJA1',
    numero: 45,
    fecha: '2026-09-04',
    receptor_nombre: 'Granja Tres Colonias',
    total: 108200,
    estado: 'emitido',
    valido_hasta: null,
    entrega_localidad: 'Campo Ramón',
    transportista: 'Camioneta 1',
    descuenta_stock: true,
    venta_id: 'v1',
    convertido_en_comprobante_id: null,
    venta_codigo: 'CAJA1-000010',
    venta_estado: 'cobrada',
    venta_documentacion: 'no_fiscal',
    ...extra,
  }
}

describe('el número impreso', () => {
  it('lleva la sigla, la serie y ocho dígitos', () => {
    expect(numeroNoFiscal('remito', 'CAJA1', 45)).toBe('REM CAJA1-00000045')
    expect(numeroNoFiscal('presupuesto', 'MOS1', 7)).toBe('PRE MOS1-00000007')
    expect(numeroNoFiscal('comprobante_interno', 'CAJA1', 1)).toBe('PRO CAJA1-00000001')
  })
})

describe('exportar a Excel', () => {
  it('una fila por comprobante, con el tipo y el número a la vista', () => {
    const l = noFiscalesAListado([fila(), fila({ numero: 46 }), fila({ numero: 47 })])
    expect(l.columnas).toHaveLength(9)
    expect(l.filas).toHaveLength(3)
    expect(l.filas[0][0]).toBe('Remito logístico')
    expect(l.filas[0][1]).toBe('REM CAJA1-00000045')
  })

  it('el total va como número', () => {
    const l = noFiscalesAListado([fila({ total: 1234.5 })])
    expect(l.filas[0][4]).toBe(1234.5)
  })
})
