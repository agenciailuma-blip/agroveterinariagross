import { describe, expect, it } from 'vitest'
import { aCsv, numeroNoFiscal } from '@/lib/api/noFiscal'
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
    venta_codigo: 'CAJA1-000010',
    venta_estado: 'cobrada',
    ...extra,
  }
}

describe('el número impreso', () => {
  it('lleva la sigla, la serie y ocho dígitos', () => {
    expect(numeroNoFiscal('remito', 'CAJA1', 45)).toBe('REM CAJA1-00000045')
    expect(numeroNoFiscal('presupuesto', 'MOS1', 7)).toBe('PRE MOS1-00000007')
    expect(numeroNoFiscal('comprobante_interno', 'CAJA1', 1)).toBe('CI CAJA1-00000001')
  })
})

describe('exportar a Excel', () => {
  it('arranca con el BOM, si no los acentos salen rotos', () => {
    expect(aCsv([fila()]).startsWith('\uFEFF')).toBe(true)
  })

  it('separa con punto y coma: es lo que espera el Excel en español', () => {
    const [, primera] = aCsv([fila()]).split('\r\n')
    expect(primera.split(';')[0]).toBe('Remito')
    expect(primera.split(';')[1]).toBe('REM CAJA1-00000045')
  })

  it('el importe va con coma decimal', () => {
    expect(aCsv([fila({ total: 1234.5 })])).toContain('1234,50')
  })

  it('un texto con punto y coma no rompe las columnas', () => {
    const csv = aCsv([fila({ receptor_nombre: 'Perez; Juan' })])
    expect(csv).toContain('"Perez; Juan"')
    // La fila sigue teniendo las nueve columnas de siempre.
    const [cabecera] = csv.split('\r\n')
    expect(cabecera.split(';')).toHaveLength(9)
  })

  it('las comillas adentro de un nombre se duplican', () => {
    expect(aCsv([fila({ receptor_nombre: 'El "Gringo"' })])).toContain('"El ""Gringo"""')
  })

  it('exporta una fila por comprobante', () => {
    const csv = aCsv([fila(), fila({ numero: 46 }), fila({ numero: 47 })])
    expect(csv.split('\r\n')).toHaveLength(4) // cabecera + 3
  })
})
