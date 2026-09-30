import { describe, expect, it } from 'vitest'
import {
  agruparCalendario,
  chequeVacio,
  cuitValido,
  faltaEnCheque,
  plazoDeDeposito,
  textoDelPlazo,
} from '@/lib/api/cheques'
import type { DatosCheque, RenglonCalendario } from '@/lib/api/cheques'

/*
  Los cheques.

  Lo que mueve plata —la cartera, el endoso, el rechazo— se prueba
  contra la base (supabase/pruebas/cheques.sql). Acá se prueba lo que
  decide la pantalla: qué le falta a un cheque antes de cobrar, hasta
  cuándo se puede depositar, y cómo se arma el calendario.
*/

const HOY = '2026-10-10'

const cheque = (c: Partial<DatosCheque> = {}): DatosCheque => ({
  banco: 'Nación',
  numero: '12345',
  fecha_pago: HOY,
  librador: 'Juan Pérez',
  librador_cuit: '',
  electronico: false,
  ...c,
})

describe('lo que le falta a un cheque antes de cobrar', () => {
  it('completo, no le falta nada', () => {
    expect(faltaEnCheque(cheque(), 'tercero', HOY)).toBeNull()
  })

  it('sin banco, sin número o sin fecha no entra', () => {
    expect(faltaEnCheque(cheque({ banco: ' ' }), 'tercero', HOY)).toBe('Falta el banco.')
    expect(faltaEnCheque(cheque({ numero: '' }), 'tercero', HOY)).toBe('Falta el número.')
    expect(faltaEnCheque(cheque({ fecha_pago: '' }), 'tercero', HOY)).toBe('Falta la fecha de pago.')
  })

  it('un diferido a más de un año es un año mal tipeado', () => {
    expect(faltaEnCheque(cheque({ fecha_pago: '2027-10-11' }), 'tercero', HOY)).toMatch(/360 días/)
    expect(faltaEnCheque(cheque({ fecha_pago: '2027-10-10' }), 'tercero', HOY)).toBeNull()
  })

  it('uno de hace más de 30 días ya no lo paga el banco, pero el propio sí se puede anotar', () => {
    expect(faltaEnCheque(cheque({ fecha_pago: '2026-09-09' }), 'tercero', HOY)).toMatch(/más de 30 días/)
    expect(faltaEnCheque(cheque({ fecha_pago: '2026-09-10' }), 'tercero', HOY)).toBeNull()
    expect(faltaEnCheque(cheque({ fecha_pago: '2026-09-09' }), 'propio', HOY)).toBeNull()
  })

  it('el CUIT es opcional, pero si se escribe tiene que ser válido', () => {
    expect(faltaEnCheque(cheque({ librador_cuit: '20-12345678-6' }), 'tercero', HOY)).toBeNull()
    expect(faltaEnCheque(cheque({ librador_cuit: '20-12345678-0' }), 'tercero', HOY)).toBe(
      'El CUIT del librador no es válido.',
    )
  })
})

describe('el CUIT', () => {
  it('con su dígito verificador, igual que la base', () => {
    expect(cuitValido('20123456786')).toBe(true)
    expect(cuitValido('30-99999999-5')).toBe(true)
    expect(cuitValido('30712345671')).toBe(true)
    expect(cuitValido('20123456780')).toBe(false)
    expect(cuitValido('12345678')).toBe(false)
  })
})

describe('el librador que se propone', () => {
  it('es el cliente, salvo el consumidor final', () => {
    expect(chequeVacio('Agro SRL', HOY).librador).toBe('Agro SRL')
    expect(chequeVacio('Consumidor Final', HOY).librador).toBe('')
    expect(chequeVacio(null, HOY).fecha_pago).toBe(HOY)
  })
})

describe('hasta cuándo se puede depositar', () => {
  it('un diferido todavía no se cobra', () => {
    expect(plazoDeDeposito('2026-10-15', HOY)).toEqual({ tipo: 'todavia_no', dias: 5 })
  })

  it('desde la fecha de pago hay 30 días', () => {
    expect(plazoDeDeposito(HOY, HOY)).toEqual({ tipo: 'se_puede', dias: 30 })
    expect(plazoDeDeposito('2026-09-20', HOY)).toEqual({ tipo: 'se_puede', dias: 10 })
  })

  it('la última semana avisa', () => {
    expect(plazoDeDeposito('2026-09-17', HOY)).toEqual({ tipo: 'ultimos_dias', dias: 7 })
    expect(plazoDeDeposito('2026-09-10', HOY)).toEqual({ tipo: 'ultimos_dias', dias: 0 })
    expect(textoDelPlazo(plazoDeDeposito('2026-09-10', HOY))).toBe('Hoy es el último día para depositarlo')
  })

  it('pasado el día 30, el banco ya no lo paga', () => {
    expect(plazoDeDeposito('2026-09-09', HOY)).toEqual({ tipo: 'vencido', dias: 1 })
  })

  it('cruza el fin de mes sin perder un día', () => {
    // 31/10 + 30 días = 30/11, y no 1/12.
    expect(plazoDeDeposito('2026-10-31', '2026-11-30')).toEqual({ tipo: 'ultimos_dias', dias: 0 })
  })
})

describe('el calendario', () => {
  const r = (fecha: string | null, sentido: 'entra' | 'sale', importe: number, quien = 'X'): RenglonCalendario => ({
    fecha,
    sentido,
    tipo: sentido === 'entra' ? 'cheque' : 'proveedor',
    descripcion: quien,
    quien,
    importe,
    referencia: quien,
  })

  it('agrupa por día, en orden, con lo atrasado arriba', () => {
    const { dias } = agruparCalendario(
      [r('2026-10-12', 'entra', 100), r('2026-10-11', 'sale', 50), r('2026-10-01', 'sale', 30), r('2026-09-20', 'entra', 20)],
      HOY,
      '2026-10-20',
    )
    expect(dias.map((d) => d.clave)).toEqual(['atrasado', '2026-10-11', '2026-10-12'])
    expect(dias[0].totalEntra).toBe(20)
    expect(dias[0].totalSale).toBe(30)
  })

  it('lo de después del rango no aparece', () => {
    const { dias } = agruparCalendario([r('2026-10-21', 'entra', 100), r('2026-10-20', 'entra', 5)], HOY, '2026-10-20')
    expect(dias.map((d) => d.clave)).toEqual(['2026-10-20'])
  })

  it('lo que no tiene fecha se cuenta aparte, no se pierde', () => {
    const { dias, sinFecha } = agruparCalendario([r(null, 'sale', 70, 'sin vencimiento')], HOY, '2026-10-20')
    expect(dias).toEqual([])
    expect(sinFecha.map((x) => x.quien)).toEqual(['sin vencimiento'])
  })

  it('suma al centavo', () => {
    const { dias } = agruparCalendario([r(HOY, 'entra', 0.1), r(HOY, 'entra', 0.2)], HOY, HOY)
    expect(dias[0].totalEntra).toBe(0.3)
  })

  it('dentro del día, lo más grande primero', () => {
    const { dias } = agruparCalendario([r(HOY, 'sale', 10, 'chico'), r(HOY, 'sale', 900, 'grande')], HOY, HOY)
    expect(dias[0].sale.map((x) => x.quien)).toEqual(['grande', 'chico'])
  })
})
