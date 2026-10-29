import { describe, expect, it } from 'vitest'
import { faltaEnFiado, fiadoVacio, mensajeFiado, paraLaBase, repartirEnFechas, textoDelAviso } from '@/lib/api/fiados'
import type { AvisoFiado } from '@/lib/api/fiados'

const hoy = '2026-10-29'

describe('lo que falta para fiar', () => {
  it('sin DNI no se fía', () => {
    expect(faltaEnFiado({ ...fiadoVacio(hoy), nombre: 'Juan' }, hoy)).toMatch(/DNI/)
  })
  it('el DNI se escribe con puntos o sin ellos', () => {
    expect(faltaEnFiado({ ...fiadoVacio(hoy), documento: '30.111.222', nombre: 'Juan' }, hoy)).toBeNull()
    expect(paraLaBase({ ...fiadoVacio(hoy), documento: '30.111.222', nombre: ' Juan ' })).toMatchObject({
      documento: '30111222',
      nombre: 'Juan',
    })
  })
  it('sin nombre tampoco', () => {
    expect(faltaEnFiado({ ...fiadoVacio(hoy), documento: '30111222' }, hoy)).toMatch(/nombre/)
  })
  it('la fecha de pago no puede haber pasado', () => {
    expect(faltaEnFiado({ ...fiadoVacio(hoy), documento: '30111222', nombre: 'Juan', vence: '2026-10-28' }, hoy)).toMatch(/anterior/)
  })
  it('por defecto, a treinta días', () => {
    expect(fiadoVacio(hoy).vence).toBe('2026-11-28')
  })
})

describe('repartir en fechas', () => {
  it('suma justo lo que debe, con los centavos en la última', () => {
    const c = repartirEnFechas(1000, 3, '2026-11-05', 7)
    expect(c.map((x) => x.fecha)).toEqual(['2026-11-05', '2026-11-12', '2026-11-19'])
    expect(c.map((x) => x.importe)).toEqual([333.33, 333.33, 333.34])
    expect(c.reduce((s, x) => s + x.importe, 0)).toBeCloseTo(1000, 2)
  })
})

describe('el aviso y el mensaje', () => {
  const aviso: AvisoFiado = {
    persona_id: 'p', documento: '30111222', nombre: 'Juan Prueba', domicilio: null, telefono: null,
    debe: 68500, vencido: 30000, fiados: 1, fiado_total: 68500, ultimo: hoy,
  }
  it('dice cuánto debe y cuánto está vencido', () => {
    expect(textoDelAviso(aviso)).toMatch(/Debe .*68\.500.*30\.000.*vencido/)
  })
  it('si ya pagó, dice cuánto debió', () => {
    expect(textoDelAviso({ ...aviso, debe: 0, vencido: 0, fiados: 2 })).toMatch(/2 veces/)
  })
  it('el WhatsApp saluda por el nombre y dice lo vencido', () => {
    const m = mensajeFiado({ nombre: 'Juan Prueba', debe: 68500, vencido: 30000, proxima_fecha: null, proximo_importe: null }, 'Gross')
    expect(m).toMatch(/^Hola Juan, te escribimos de Gross/)
    expect(m).toMatch(/30\.000/)
  })
  it('sin vencido, recuerda la próxima fecha', () => {
    const m = mensajeFiado({ nombre: 'Juan', debe: 1000, vencido: 0, proxima_fecha: '2026-11-15', proximo_importe: 500 }, '')
    expect(m).toMatch(/el 15\/11 vence el pago de/)
  })
})
