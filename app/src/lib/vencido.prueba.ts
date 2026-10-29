import { describe, expect, it } from 'vitest'
import { vencidoAl } from '@/lib/vencido'

/*
  La cuenta tiene que dar lo mismo que app.vencido_de() en la base: la
  caja frena sin conexión con esto, y la base vuelve a mirar al subir.
  Si dieran distinto, un cobro que la caja aceptó lo rechazaría la base
  después, con el cliente ya en su casa.
*/
describe('lo vencido de un cliente', () => {
  const pendientes = [
    { v: '2026-10-17', i: 3000 },
    { v: '2026-10-29', i: 1500 },
    { v: '2026-11-08', i: 3000 },
  ]

  it('suma lo que venció antes del día y dice desde cuándo', () => {
    expect(vencidoAl(pendientes, '2026-10-30')).toEqual({ monto: 4500, desde: '2026-10-17' })
  })

  it('lo que vence hoy todavía no está vencido', () => {
    expect(vencidoAl(pendientes, '2026-10-29')).toEqual({ monto: 3000, desde: '2026-10-17' })
  })

  it('sin cargos vencidos, nada', () => {
    expect(vencidoAl(pendientes, '2026-10-17')).toEqual({ monto: 0, desde: null })
  })

  it('sin datos —una PC que todavía no bajó los cargos— no inventa deuda', () => {
    expect(vencidoAl(undefined, '2026-10-30')).toEqual({ monto: 0, desde: null })
    expect(vencidoAl([], '2026-10-30')).toEqual({ monto: 0, desde: null })
  })

  it('los importes que llegan como texto de la base también suman', () => {
    expect(vencidoAl([{ v: '2026-10-01', i: '1234.5000' as unknown as number }], '2026-10-30').monto).toBe(1234.5)
  })
})
