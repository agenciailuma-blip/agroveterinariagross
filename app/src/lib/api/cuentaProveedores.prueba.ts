import { describe, expect, it } from 'vitest'
import { aCuenta, conSaldoAcumulado, imputacionSugerida } from '@/lib/api/cuentaProveedores'
import type { Movimiento, Pendiente } from '@/lib/api/cuentaProveedores'

/*
  La cuenta de proveedores.

  Lo que la base controla —que no se impute de más, que el pago cierre—
  se prueba contra la base (supabase/pruebas/cuenta-de-proveedores.sql).
  Acá se prueba lo que propone la pantalla: qué facturas vienen marcadas
  al pagar, y el saldo renglón por renglón del resumen.
*/

const pendiente = (id: string, fecha: string, monto: number, vencimiento: string | null = null): Pendiente => ({
  origen: 'compra',
  id,
  fecha,
  vencimiento,
  descripcion: id,
  signo: monto < 0 ? -1 : 1,
  total: monto,
  imputado: 0,
  pendiente: monto,
  vencida: false,
})

describe('las facturas que vienen marcadas al pagar', () => {
  const facturas = [
    pendiente('nueva', '2026-09-20', 3000),
    pendiente('vieja', '2026-08-01', 1000),
    pendiente('media', '2026-09-01', 2000),
  ]

  it('cubre de la más vieja a la más nueva', () => {
    expect(imputacionSugerida(facturas, 3000)).toEqual([
      { origen: 'compra', id: 'vieja', importe: 1000 },
      { origen: 'compra', id: 'media', importe: 2000 },
    ])
  })

  it('la última puede quedar pagada en parte', () => {
    expect(imputacionSugerida(facturas, 1500)).toEqual([
      { origen: 'compra', id: 'vieja', importe: 1000 },
      { origen: 'compra', id: 'media', importe: 500 },
    ])
  })

  it('ordena por vencimiento antes que por fecha', () => {
    const fs = [pendiente('a', '2026-08-01', 1000, '2026-10-30'), pendiente('b', '2026-09-01', 1000, '2026-09-10')]
    expect(imputacionSugerida(fs, 1000).map((i) => i.id)).toEqual(['b'])
  })

  it('lo que sobra no se imputa: queda a cuenta', () => {
    const imp = imputacionSugerida(facturas, 7000)
    expect(imp.reduce((s, i) => s + i.importe, 0)).toBe(6000)
    expect(aCuenta(7000, imp)).toBe(1000)
  })

  it('descuenta primero las notas de crédito', () => {
    const imp = imputacionSugerida([...facturas, pendiente('nc', '2026-09-25', -500)], 500)
    expect(imp).toEqual([
      { origen: 'compra', id: 'nc', importe: -500 },
      { origen: 'compra', id: 'vieja', importe: 1000 },
    ])
    // Sale 500 de plata: 1000 de factura menos 500 de nota.
    expect(aCuenta(500, imp)).toBe(0)
  })

  it('no usa más nota de crédito que la que las facturas necesitan', () => {
    const imp = imputacionSugerida([pendiente('f', '2026-09-01', 300), pendiente('nc', '2026-09-02', -1000)], 0)
    expect(imp).toEqual([
      { origen: 'compra', id: 'nc', importe: -300 },
      { origen: 'compra', id: 'f', importe: 300 },
    ])
    expect(imp.reduce((s, i) => s + i.importe, 0)).toBe(0)
  })

  it('con importe cero y sin notas no marca nada', () => {
    expect(imputacionSugerida(facturas, 0)).toEqual([])
  })
})

describe('el saldo renglón por renglón del resumen', () => {
  const mov = (fecha: string, tipo: Movimiento['tipo'], debe: number, haber: number): Movimiento => ({
    fecha,
    tipo,
    id: `${tipo}-${fecha}-${debe}-${haber}`,
    descripcion: tipo,
    debe,
    haber,
    detalle: null,
  })

  it('acumula debe menos haber en orden de fecha', () => {
    const r = conSaldoAcumulado([
      mov('2026-09-10', 'pago', 0, 1000),
      mov('2026-09-01', 'saldo_inicial', 5000, 0),
      mov('2026-09-05', 'compra', 1210, 0),
    ])
    expect(r.map((m) => m.saldo)).toEqual([5000, 6210, 5210])
  })

  it('en el mismo día, la factura va antes que su pago', () => {
    const r = conSaldoAcumulado([mov('2026-09-10', 'pago', 0, 1210), mov('2026-09-10', 'compra', 1210, 0)])
    expect(r.map((m) => m.tipo)).toEqual(['compra', 'pago'])
    expect(r.map((m) => m.saldo)).toEqual([1210, 0])
  })
})
