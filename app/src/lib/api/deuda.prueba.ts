import { describe, expect, it } from 'vitest'
import { diasDeAtraso, totalesDeDeuda, urgencia } from '@/lib/api/deuda'
import type { DeudaDeCliente } from '@/lib/api/deuda'

/*
  Quién le debe a Gross.

  El reparto de la deuda en tramos lo hace la base y se verificó contra
  la base: la suma de los cuatro tramos tiene que dar el saldo, en los
  cinco clientes con cuenta corriente.

  Lo que se prueba acá es lo que convierte esos números en una pantalla
  que se puede usar para levantar el teléfono: cuánto hace que deben, a
  quién hay que llamar primero, y que un cliente nuevo no aparezca en
  rojo por no tener límite asignado.
*/

function cliente(extra: Partial<DeudaDeCliente> = {}): DeudaDeCliente {
  return {
    cliente_id: 'uno',
    nombre: 'Granja Tres Colonias',
    telefono: '3755-466001',
    saldo: 47300,
    limite_credito: 150000,
    por_vencer: 0,
    vencido_30: 47300,
    vencido_60: 0,
    vencido_mas_60: 0,
    vencimiento_mas_antiguo: '2026-08-19',
    ...extra,
  }
}

describe('hace cuánto que deben', () => {
  it('cuenta los días desde el vencimiento más viejo', () => {
    expect(diasDeAtraso('2026-08-19', new Date(2026, 8, 11))).toBe(23)
  })

  /*
    El borde que de verdad importa: el día del vencimiento todavía no es
    atraso. Una factura que vence hoy no se reclama hoy, y si la pantalla
    dijera «1 día» el cajero llamaría a un cliente que está en fecha.
  */
  it('un vencimiento de hoy todavía no está atrasado', () => {
    expect(diasDeAtraso('2026-09-11', new Date(2026, 8, 11))).toBeNull()
  })

  it('lo que vence mañana tampoco', () => {
    expect(diasDeAtraso('2026-09-12', new Date(2026, 8, 11))).toBeNull()
  })

  it('ayer es un día de atraso', () => {
    expect(diasDeAtraso('2026-09-10', new Date(2026, 8, 11))).toBe(1)
  })

  it('el que no debe nada vencido no tiene atraso', () => {
    expect(diasDeAtraso(null)).toBeNull()
  })

  /*
    Cruzar el año y el bisiesto: la cuenta se hace en milisegundos y el
    redondeo es lo que la salva del cambio de hora.
  */
  it('cuenta bien cruzando el año', () => {
    expect(diasDeAtraso('2025-12-31', new Date(2026, 0, 1))).toBe(1)
  })
})

describe('a quién llamar primero', () => {
  it('el que tiene deuda de más de sesenta días es el grave', () => {
    expect(urgencia(cliente({ vencido_mas_60: 240000 }))).toBe('grave')
  })

  it('el que tiene algo vencido, pero reciente, no es grave todavía', () => {
    expect(urgencia(cliente({ vencido_30: 47300, vencido_mas_60: 0 }))).toBe('vencido')
  })

  /*
    El que debe pero todavía está en fecha no es un problema: es una
    venta a plazo funcionando como se pactó.
  */
  it('el que debe y está en fecha aparece al día', () => {
    const f = cliente({ por_vencer: 50000, vencido_30: 0, vencimiento_mas_antiguo: null })

    expect(urgencia(f)).toBe('al_dia')
  })
})

describe('los totales del bloque', () => {
  it('junta los tres tramos vencidos en un solo número', () => {
    const t = totalesDeDeuda([
      cliente({ saldo: 328900, vencido_30: 88900, vencido_mas_60: 240000 }),
    ])

    expect(t.vencido).toBe(328900)
    expect(t.total).toBe(328900)
    expect(t.clientes).toBe(1)
  })

  it('separa lo que todavía no venció', () => {
    const t = totalesDeDeuda([
      cliente({ saldo: 60000, por_vencer: 60000, vencido_30: 0, vencimiento_mas_antiguo: null }),
    ])

    expect(t.porVencer).toBe(60000)
    expect(t.vencido).toBe(0)
  })

  it('marca a los que pasaron su límite de crédito', () => {
    const t = totalesDeDeuda([
      cliente({ saldo: 328900, limite_credito: 300000 }),
      cliente({ cliente_id: 'dos', saldo: 47300, limite_credito: 150000 }),
    ])

    expect(t.excedidos).toBe(1)
  })

  /*
    El caso que pondría en rojo a media cartera.

    Un límite en cero es «todavía no le asignaron límite», que es como
    queda todo cliente nuevo. Tratarlo como un límite de cero pesos haría
    que cualquiera que deba un peso figure excedido el primer día.
  */
  it('el cliente sin límite asignado no figura excedido', () => {
    const t = totalesDeDeuda([cliente({ saldo: 47300, limite_credito: 0 })])

    expect(t.excedidos).toBe(0)
  })

  it('sin deudores, todo en cero', () => {
    const t = totalesDeDeuda([])

    expect(t).toEqual({ clientes: 0, total: 0, porVencer: 0, vencido: 0, excedidos: 0 })
  })
})
