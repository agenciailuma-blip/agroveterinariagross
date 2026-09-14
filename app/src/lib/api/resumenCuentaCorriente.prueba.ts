import { describe, expect, it } from 'vitest'
import {
  fechaCorta,
  llegaHastaHoy,
  nombreDelArchivo,
  periodoDe,
} from '@/lib/api/resumenCuentaCorriente'

/*
  El resumen de cuenta corriente.

  Las cuentas —saldo anterior, saldo en cada renglón, saldo final— las
  hace la base y se verificaron contra la base: en los cinco clientes el
  saldo final da el de la ficha, la cuenta cierra a mano, y un período
  partido en dos encadena el saldo final del primero con el anterior del
  segundo.

  Lo que se prueba acá es lo que decide qué hoja sale: qué período se
  elige con un botón, cuándo se muestra lo vencido, y cómo se llama el
  archivo que Lucas va a adjuntar al mail.
*/

describe('los períodos de un botón', () => {
  it('este mes va del 1 a hoy', () => {
    expect(periodoDe('este_mes', new Date(2026, 8, 14))).toEqual({
      desde: '2026-09-01',
      hasta: '2026-09-14',
    })
  })

  /*
    El caso por el que existe el botón: el resumen de fin de mes que se
    manda el 2 del mes siguiente tiene que ser el mes entero anterior.
  */
  it('mes pasado es el mes anterior completo', () => {
    expect(periodoDe('mes_pasado', new Date(2026, 9, 2))).toEqual({
      desde: '2026-09-01',
      hasta: '2026-09-30',
    })
  })

  it('en enero, mes pasado es diciembre del año anterior', () => {
    expect(periodoDe('mes_pasado', new Date(2027, 0, 5))).toEqual({
      desde: '2026-12-01',
      hasta: '2026-12-31',
    })
  })

  it('mes pasado desde marzo termina el 28 de febrero', () => {
    expect(periodoDe('mes_pasado', new Date(2027, 2, 10)).hasta).toBe('2027-02-28')
  })

  it('y en año bisiesto, el 29', () => {
    expect(periodoDe('mes_pasado', new Date(2028, 2, 10)).hasta).toBe('2028-02-29')
  })

  /*
    A la noche en Argentina ya es el día siguiente en UTC. Si el período se
    armara con toISOString(), el último día del mes a las 23 hs «este mes»
    saltaría al mes que viene y la hoja saldría vacía.
  */
  it('el último día del mes a la noche sigue siendo este mes', () => {
    expect(periodoDe('este_mes', new Date(2026, 8, 30, 23, 30))).toEqual({
      desde: '2026-09-01',
      hasta: '2026-09-30',
    })
  })

  it('todo arranca cuando arranca el sistema', () => {
    expect(periodoDe('desde_el_principio', new Date(2026, 8, 14))).toEqual({
      desde: '2026-01-01',
      hasta: '2026-09-14',
    })
  })
})

describe('cuándo se muestra lo vencido', () => {
  it('en un resumen que llega hasta hoy, sí', () => {
    expect(llegaHastaHoy({ hasta: '2026-09-14', hoy: '2026-09-14' })).toBe(true)
  })

  /*
    Un resumen de agosto impreso en septiembre muestra el saldo de fines
    de agosto. Ponerle al lado lo vencido hoy mezclaría dos fechas.
  */
  it('en un resumen de un mes pasado, no', () => {
    expect(llegaHastaHoy({ hasta: '2026-08-31', hoy: '2026-09-14' })).toBe(false)
  })
})

describe('el nombre del PDF', () => {
  it('lleva el cliente y el período', () => {
    expect(nombreDelArchivo('Granja Tres Colonias', { desde: '2026-09-01', hasta: '2026-09-30' })).toBe(
      'Resumen de cuenta Granja Tres Colonias 2026-09-01 a 2026-09-30',
    )
  })

  /*
    Windows no acepta estos caracteres en un nombre de archivo. Un
    cliente con una barra en el nombre haría fallar el guardado, o dejaría
    el PDF en una carpeta que no es la que se eligió.
  */
  it('saca lo que Windows no acepta en un nombre de archivo', () => {
    const nombre = nombreDelArchivo('Pérez / Hijos: "El Galpón"', { desde: '2026-09-01', hasta: '2026-09-30' })

    expect(nombre).not.toMatch(/[\\/:*?"<>|]/)
    expect(nombre).toContain('Pérez Hijos El Galpón')
  })

  it('respeta acentos, comas y puntos del medio', () => {
    expect(nombreDelArchivo('Estancia La Esperanza S.R.L.', { desde: '2026-09-01', hasta: '2026-09-14' })).toContain(
      'Estancia La Esperanza S.R.L. 2026-09-01',
    )
    expect(nombreDelArchivo('Sánchez, Marta', { desde: '2026-09-01', hasta: '2026-09-14' })).toContain(
      'Sánchez, Marta',
    )
  })
})

describe('las fechas de la hoja', () => {
  it('se escriben día/mes/año', () => {
    expect(fechaCorta('2026-08-01')).toBe('01/08/2026')
  })

  /*
    new Date('2026-08-01') es medianoche UTC, que en Argentina es el 31 de
    julio. El primer movimiento del mes saldría fechado el mes anterior.
  */
  it('no corre el primer día del mes al mes anterior', () => {
    expect(fechaCorta('2026-08-01')).not.toContain('/07/')
  })
})
