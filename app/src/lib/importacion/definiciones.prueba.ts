import { describe, expect, it } from 'vitest'
import { CLIENTES, SALDOS_PROVEEDORES } from '@/lib/importacion/definiciones'
import { codigosDuplicados, detectarEncabezado, prepararFilas, proponerMapeo } from '@/lib/importacion/planilla'

/*
  Las planillas del día del corte: clientes con su saldo, y saldos de
  proveedores. Se prueba lo que pasa en la pantalla —reconocer columnas,
  leer los números, avisar antes de importar—. Lo que se guarda lo
  prueba la base (supabase/pruebas/importar-clientes-y-saldos.sql).
*/

describe('la planilla de clientes', () => {
  const encabezado = ['Cód.', 'Razón Social', 'CUIT', 'Cond. IVA', 'Dirección', 'Localidad', 'Tel.', 'Cta. Cte.', 'Límite', 'Saldo']

  it('reconoce las columnas como las escribiría una persona', () => {
    const mapeo = proponerMapeo(encabezado, CLIENTES)
    expect(Object.values(mapeo)).toEqual([
      'codigo', 'nombre', 'documento', 'condicion_iva', 'domicilio', 'localidad', 'telefono',
      'cuenta_corriente', 'limite_credito', 'saldo',
    ])
  })

  it('encuentra el encabezado aunque arriba haya un título', () => {
    expect(detectarEncabezado([['Clientes al 25/10/2026'], [], encabezado], CLIENTES)).toBe(2)
  })

  it('lee el saldo con formato argentino y acepta que sea negativo', () => {
    const mapeo = proponerMapeo(['Nombre', 'Saldo'], CLIENTES)
    const [deudor, aFavor] = prepararFilas([['Agro Sur', '$ 1.234.567,89'], ['Vecino', '-1.500']], mapeo, 2, CLIENTES)
    expect(deudor.datos.saldo).toBe('1234567.89')
    expect(aFavor.datos.saldo).toBe('-1500')
    expect(aFavor.errores).toEqual([])
  })

  it('no acepta un límite de crédito negativo', () => {
    const mapeo = proponerMapeo(['Nombre', 'Límite'], CLIENTES)
    const [fila] = prepararFilas([['Agro Sur', '-100']], mapeo, 2, CLIENTES)
    expect(fila.errores[0]).toMatch(/Límite de crédito: no puede ser negativo/)
  })

  it('pide el nombre, que es lo único obligatorio', () => {
    const mapeo = proponerMapeo(['CUIT', 'Nombre'], CLIENTES)
    const [fila] = prepararFilas([['20123456786', '']], mapeo, 2, CLIENTES)
    expect(fila.errores).toEqual(['Falta nombre o razón social.'])
  })

  it('saltea la fila de ejemplo de la plantilla', () => {
    const mapeo = proponerMapeo(['Código', 'Nombre'], CLIENTES)
    expect(prepararFilas([['(ejemplo)', 'Cliente de muestra'], ['C1', 'Agro Sur']], mapeo, 2, CLIENTES)).toHaveLength(1)
  })

  it('avisa si el mismo CUIT aparece dos veces', () => {
    const mapeo = proponerMapeo(['Nombre', 'CUIT'], CLIENTES)
    const filas = prepararFilas([['A', '20-12345678-6'], ['B', '30500010912'], ['C', '20-12345678-6']], mapeo, 2, CLIENTES)
    expect([...codigosDuplicados(filas, 'documento')]).toEqual([['20-12345678-6', [2, 4]]])
  })
})

describe('la planilla de saldos de proveedores', () => {
  it('reconoce proveedor, CUIT y saldo', () => {
    expect(Object.values(proponerMapeo(['Proveedor', 'C.U.I.T.', 'Saldo acreedor'], SALDOS_PROVEEDORES))).toEqual([
      'nombre', 'documento', 'saldo',
    ])
  })

  it('un saldo negativo es a favor de Gross, y se acepta', () => {
    const mapeo = proponerMapeo(['Proveedor', 'Saldo'], SALDOS_PROVEEDORES)
    const [fila] = prepararFilas([['Laboratorio', '-2.500,50']], mapeo, 2, SALDOS_PROVEEDORES)
    expect(fila.datos.saldo).toBe('-2500.5')
    expect(fila.errores).toEqual([])
  })
})
