import { describe, expect, it } from 'vitest'
import { agruparMovimientos, cuentaParaElCierre, pideDescripcion } from '@/lib/api/cierreCaja'
import type { MovimientoCaja } from '@/lib/api/cierreCaja'

/*
  La planilla de caja, pedida en la reunión del 05/11: los ingresos y
  egresos van agrupados por tipo, y el subtotal de cada grupo tiene que
  ser el mismo efectivo que descuenta el arqueo.
*/
const mov = (m: Partial<MovimientoCaja>): MovimientoCaja => ({
  id: crypto.randomUUID(),
  tipo: 'egreso',
  categoria: 'gasto',
  forma: 'efectivo',
  importe: -100,
  concepto: 'algo',
  excluir_del_cierre: false,
  creado_en: '2026-11-05T12:00:00Z',
  anulado_en: null,
  motivo_anulacion: null,
  usuario: null,
  empleado: null,
  proveedor: null,
  cheques: [],
  ...m,
})

describe('qué cuenta para el cierre', () => {
  it('el efectivo cargado, sí', () => {
    expect(cuentaParaElCierre(mov({}))).toBe(true)
  })

  it('lo anulado, lo marcado fuera del cierre y lo pagado con cheques, no', () => {
    expect(cuentaParaElCierre(mov({ anulado_en: '2026-11-05T13:00:00Z', motivo_anulacion: 'error' }))).toBe(false)
    expect(cuentaParaElCierre(mov({ excluir_del_cierre: true }))).toBe(false)
    expect(cuentaParaElCierre(mov({ categoria: 'pago_proveedor', forma: 'cheques' }))).toBe(false)
  })
})

describe('los grupos de la planilla', () => {
  const movimientos = [
    mov({ categoria: 'gasto', importe: -300 }),
    mov({ categoria: 'ingreso', tipo: 'ingreso', importe: 1000 }),
    mov({ categoria: 'gasto', importe: -200, excluir_del_cierre: true }),
    mov({ categoria: 'gasto', importe: -50.1 }),
    mov({ categoria: 'pago_proveedor', importe: -20000, forma: 'cheques' }),
    mov({ categoria: 'pago_proveedor', importe: -500 }),
  ]

  it('van en el orden de la planilla y sólo los que tienen algo', () => {
    expect(agruparMovimientos(movimientos).map((g) => g.categoria)).toEqual(['ingreso', 'gasto', 'pago_proveedor'])
  })

  it('el subtotal suma sólo lo que cuenta, pero el grupo muestra todos', () => {
    const gastos = agruparMovimientos(movimientos).find((g) => g.categoria === 'gasto')!
    expect(gastos.movimientos).toHaveLength(3)
    expect(gastos.total).toBe(-350.1)

    const pagos = agruparMovimientos(movimientos).find((g) => g.categoria === 'pago_proveedor')!
    expect(pagos.total).toBe(-500)
  })
})

describe('la descripción', () => {
  it('la piden el ingreso y el gasto; los otros ya dicen de qué son', () => {
    expect(pideDescripcion('ingreso')).toBe(true)
    expect(pideDescripcion('gasto')).toBe(true)
    expect(pideDescripcion('anticipo_haberes')).toBe(false)
    expect(pideDescripcion('retiro_socios')).toBe(false)
  })
})
