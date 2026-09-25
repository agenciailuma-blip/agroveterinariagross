import { describe, expect, it } from 'vitest'
import { accionesPosibles, esperaFactura, pideRevision, textoEspera, type PedidoWeb } from '@/lib/api/pedidos'
import { diaDeObera, vaAlPanelRojo } from '@/lib/api/facturacion'

/*
  ─────────────────────────────────────────────────────────────
  La pantalla Pedidos web

  Las reglas que mueven plata las cumple la base, y están probadas
  contra la base real (supabase/pruebas/pedidos-web.sql). Acá se cuida
  lo que decide la pantalla: cuándo un pedido se ve en rojo porque se
  pasó del día sin factura, qué botones aparecen, y que Facturación no
  grite por un pedido que se está preparando.
  ─────────────────────────────────────────────────────────────
*/

// 25/09 a las 10:00 en Oberá (13:00 UTC).
const AHORA = new Date('2026-09-25T13:00:00Z')

function pedido(cambios: Partial<PedidoWeb> = {}): PedidoWeb {
  return {
    id: 'p1',
    numero: 'T-1',
    estado: 'recibido',
    pagado_en_la_web: true,
    referencia_pago: null,
    entrega: 'retira',
    domicilio: null,
    localidad: null,
    contacto: null,
    email: null,
    revisar: null,
    revisado_en: null,
    recibido_en: '2026-09-25T12:00:00Z',
    preparado_en: null,
    entregado_en: null,
    cancelado_en: null,
    motivo_cancelacion: null,
    venta_id: 'v1',
    venta_codigo: 'WEB-000001',
    venta_estado: 'cobrada',
    total: 6900,
    cobrada_en: '2026-09-25T12:00:00Z',
    observaciones: null,
    cliente_nombre: 'Compradora',
    cliente_documento: null,
    comprobante_id: null,
    comprobante_estado: null,
    comprobante: null,
    remito_id: null,
    a_reintegrar: 0,
    devuelto: 0,
    lineas: [],
    ...cambios,
  }
}

describe('el día de Oberá', () => {
  /*
    El caso que importa: las 22:30 de Oberá ya son el día siguiente en
    UTC. Con el día del servidor, un pedido cobrado a esa hora figuraría
    como de mañana y se vería en plazo un día de más.
  */
  it('a las 22:30 de Oberá sigue siendo el mismo día, aunque en UTC ya sea el siguiente', () => {
    expect(diaDeObera(new Date('2026-09-26T01:30:00Z'))).toBe('2026-09-25')
  })

  it('a la medianoche de Oberá cambia el día', () => {
    expect(diaDeObera(new Date('2026-09-25T02:59:59Z'))).toBe('2026-09-24')
    expect(diaDeObera(new Date('2026-09-25T03:00:00Z'))).toBe('2026-09-25')
  })
})

describe('cuánto hace que espera factura', () => {
  it('cobrado hoy y sin factura: en plazo, con las horas', () => {
    expect(esperaFactura(pedido(), AHORA)).toEqual({ tipo: 'en_plazo', horas: 1 })
  })

  /*
    Por día y no por horas: cobrado a las 23:50 y mirado a las 8 son
    ocho horas, pero para ARCA ya es otro día.
  */
  it('cobrado anoche tarde: vencido aunque hayan pasado pocas horas', () => {
    const anoche = '2026-09-25T02:50:00Z' // 24/09 a las 23:50 en Oberá
    const e = esperaFactura(pedido({ cobrada_en: anoche }), new Date('2026-09-25T11:00:00Z'))
    expect(e).toEqual({ tipo: 'vencida', horas: 8 })
    expect(textoEspera(e)).toBe('Sin factura desde otro día · hace 8 horas')
  })

  it('con factura, pagado en el local o cancelado: no espera nada', () => {
    expect(esperaFactura(pedido({ comprobante_id: 'c1', comprobante_estado: 'pendiente' }), AHORA).tipo).toBe('no_espera')
    expect(esperaFactura(pedido({ pagado_en_la_web: false, venta_estado: 'en_caja' }), AHORA).tipo).toBe('no_espera')
    expect(esperaFactura(pedido({ estado: 'cancelado' }), AHORA).tipo).toBe('no_espera')
  })

  it('el texto cuenta en castellano', () => {
    expect(textoEspera({ tipo: 'en_plazo', horas: 0 })).toBe('Espera factura · hace menos de una hora')
    expect(textoEspera({ tipo: 'en_plazo', horas: 1 })).toBe('Espera factura · hace 1 hora')
    expect(textoEspera({ tipo: 'no_espera' })).toBeNull()
  })
})

describe('qué se puede hacer con cada pedido', () => {
  it('recién recibido y pagado: preparar, facturar y cancelar; entregar todavía no', () => {
    expect(accionesPosibles(pedido())).toEqual({
      preparar: true,
      facturar: true,
      remito: false,
      entregar: false,
      cancelar: true,
      devolver: false,
    })
  })

  it('con la factura emitida se puede entregar, y no se factura de nuevo', () => {
    const a = accionesPosibles(pedido({ estado: 'preparado', comprobante_id: 'c1', comprobante_estado: 'autorizado' }))
    expect(a.entregar).toBe(true)
    expect(a.facturar).toBe(false)
    expect(a.preparar).toBe(false)
  })

  // Si ARCA no contestó, la factura existe pero sin CAE: se reintenta desde acá.
  it('con la factura esperando el CAE, se puede reintentar', () => {
    expect(accionesPosibles(pedido({ comprobante_id: 'c1', comprobante_estado: 'pendiente' })).facturar).toBe(true)
    expect(accionesPosibles(pedido({ comprobante_id: 'c1', comprobante_estado: 'rechazado' })).facturar).toBe(true)
  })

  it('el que paga en el local no se factura acá, y se entrega recién cobrado', () => {
    const sinCobrar = accionesPosibles(pedido({ pagado_en_la_web: false, venta_estado: 'en_caja' }))
    expect(sinCobrar.facturar).toBe(false)
    expect(sinCobrar.entregar).toBe(false)
    expect(accionesPosibles(pedido({ pagado_en_la_web: false, venta_estado: 'cobrada' })).entregar).toBe(true)
  })

  it('el remito es para los envíos, y uno solo', () => {
    expect(accionesPosibles(pedido({ entrega: 'envio' })).remito).toBe(true)
    expect(accionesPosibles(pedido({ entrega: 'envio', remito_id: 'r1' })).remito).toBe(false)
    expect(accionesPosibles(pedido({ entrega: 'retira' })).remito).toBe(false)
  })

  /*
    Lo entregado no se cancela: vuelve por devolución, sobre la factura
    ya autorizada, porque el cliente puede devolver una parte.
  */
  it('entregado: sólo la devolución, y sólo con la factura autorizada', () => {
    const a = accionesPosibles(pedido({ estado: 'entregado', comprobante_id: 'c1', comprobante_estado: 'autorizado' }))
    expect(a).toMatchObject({ cancelar: false, facturar: false, entregar: false, devolver: true })
    expect(
      accionesPosibles(pedido({ estado: 'entregado', comprobante_id: 'c1', comprobante_estado: 'pendiente' })).devolver,
    ).toBe(false)
  })

  it('devuelto entero: ya no hay nada que devolver', () => {
    expect(
      accionesPosibles(
        pedido({ estado: 'entregado', comprobante_id: 'c1', comprobante_estado: 'autorizado', devuelto: 6900 }),
      ).devolver,
    ).toBe(false)
  })

  it('cancelado: nada', () => {
    expect(Object.values(accionesPosibles(pedido({ estado: 'cancelado', entrega: 'envio' }))).some(Boolean)).toBe(false)
  })
})

describe('la revisión antes de facturar', () => {
  it('un pedido marcado pide revisión hasta que alguien la confirma', () => {
    expect(pideRevision(pedido())).toBe(false)
    expect(pideRevision(pedido({ revisar: 'El precio de X no coincide' }))).toBe(true)
    expect(pideRevision(pedido({ revisar: 'El precio de X no coincide', revisado_en: '2026-09-25T12:30:00Z' }))).toBe(false)
  })
})

describe('el panel rojo de Facturación', () => {
  const pedidos = new Set(['v-web'])

  it('una venta del mostrador cobrada sin factura va siempre', () => {
    expect(vaAlPanelRojo({ id: 'v-local', ocurrido_en: '2026-09-25T12:00:00Z' }, pedidos, AHORA)).toBe(true)
  })

  it('un pedido web cobrado hoy no va: se está preparando y se factura en el día', () => {
    expect(vaAlPanelRojo({ id: 'v-web', ocurrido_en: '2026-09-25T12:00:00Z' }, pedidos, AHORA)).toBe(false)
  })

  it('un pedido web que se pasó del día va, porque ya es un problema', () => {
    expect(vaAlPanelRojo({ id: 'v-web', ocurrido_en: '2026-09-24T20:00:00Z' }, pedidos, AHORA)).toBe(true)
  })
})
