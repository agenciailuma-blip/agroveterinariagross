import { describe, expect, it } from 'vitest'
import {
  armarPedidoConsulta,
  esElMismoComprobante,
  leerConsulta,
  type ComprobanteEnArca,
} from '../../../../supabase/functions/arca-wsfe-solicitar-cae/consulta.ts'

/*
  Lo que ARCA tiene con un número, antes de renumerar.

  Las respuestas tienen la forma de FECompConsultar: el mismo sobre
  SOAP, el resultado en ResultGet y los errores en Errors. Lo que se
  prueba es lo que decide si se toma el CAE que ARCA ya dio o se pide
  otro: equivocarse para un lado deja dos facturas para una venta, y
  para el otro le pone a una venta el CAE de otra.
*/

function sobre(cuerpo: string): string {
  return `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
<FECompConsultarResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECompConsultarResult>${cuerpo}</FECompConsultarResult></FECompConsultarResponse>
</soap:Body></soap:Envelope>`
}

function resultado(extra = '', cambios: Record<string, string> = {}): string {
  const d = {
    DocTipo: '99', DocNro: '0', CbteFch: '20261014', ImpTotal: '1210',
    Resultado: 'A', CodAutorizacion: '76412345678901', EmisionTipo: 'CAE', FchVto: '20261024',
    ...cambios,
  }
  return sobre(`<ResultGet><Concepto>1</Concepto><DocTipo>${d.DocTipo}</DocTipo><DocNro>${d.DocNro}</DocNro>
<CbteDesde>28</CbteDesde><CbteHasta>28</CbteHasta><CbteFch>${d.CbteFch}</CbteFch><ImpTotal>${d.ImpTotal}</ImpTotal>
<ImpTotConc>0</ImpTotConc><ImpNeto>1000</ImpNeto><ImpOpEx>0</ImpOpEx><ImpTrib>0</ImpTrib><ImpIVA>210</ImpIVA>
<FchServDesde/><FchServHasta/><FchVtoPago/><MonId>PES</MonId><MonCotiz>1</MonCotiz>${extra}
<Resultado>${d.Resultado}</Resultado><CodAutorizacion>${d.CodAutorizacion}</CodAutorizacion><EmisionTipo>${d.EmisionTipo}</EmisionTipo>
<FchVto>${d.FchVto}</FchVto><FchProceso>20261014101500</FchProceso><PtoVta>1</PtoVta><CbteTipo>6</CbteTipo></ResultGet>`)
}

const local = {
  receptor_tipo_documento_id: 99,
  receptor_documento: null,
  fecha: '2026-10-14',
  total: 1210,
}

function enArca(cambios: Partial<ComprobanteEnArca> = {}): ComprobanteEnArca {
  const r = leerConsulta(resultado())
  if (!r.encontrado) throw new Error('la respuesta de base tenía que encontrarse')
  return { ...r.comprobante, ...cambios }
}

describe('leer lo que ARCA tiene con un número', () => {
  it('lee el CAE, su vencimiento y los datos de la cabecera', () => {
    const r = leerConsulta(resultado())
    expect(r).toEqual({
      encontrado: true,
      comprobante: {
        numero: 28,
        docTipo: 99,
        docNro: '0',
        fecha: '2026-10-14',
        total: 1210,
        resultado: 'A',
        emisionTipo: 'CAE',
        codAutorizacion: '76412345678901',
        vencimiento: '2026-10-24',
        observaciones: [],
      },
    })
  })

  it('lee la cabecera aunque la respuesta traiga asociados e IVA, como una nota de crédito', () => {
    // Una nota de crédito trae la factura que corrige, con su propia fecha.
    const asociados =
      '<CbtesAsoc><CbteAsoc><Tipo>6</Tipo><PtoVta>1</PtoVta><Nro>12</Nro><CbteFch>20260901</CbteFch></CbteAsoc></CbtesAsoc>' +
      '<Iva><AlicIva><Id>5</Id><BaseImp>1000</BaseImp><Importe>210</Importe></AlicIva></Iva>'
    const r = leerConsulta(resultado(asociados))
    expect(r.encontrado && r.comprobante.fecha).toBe('2026-10-14')
    expect(r.encontrado && r.comprobante.total).toBe(1210)
  })

  it('trae las observaciones que ARCA dejó al autorizar', () => {
    const obs = '<Observaciones><Obs><Code>10217</Code><Msg>El credito fiscal &amp; algo</Msg></Obs></Observaciones>'
    const r = leerConsulta(resultado(obs))
    expect(r.encontrado && r.comprobante.observaciones).toEqual([
      { codigo: '10217', mensaje: 'El credito fiscal & algo' },
    ])
  })

  it('«no existen datos» quiere decir que ARCA no tiene nada con ese número', () => {
    const r = leerConsulta(
      sobre('<Errors><Err><Code>602</Code><Msg>No existen datos en nuestros registros para los parametros ingresados.</Msg></Err></Errors>'),
    )
    expect(r).toEqual({ encontrado: false })
  })

  it('cualquier otro error no es «no tiene nada»: no se renumera sobre una duda', () => {
    expect(() =>
      leerConsulta(sobre('<Errors><Err><Code>600</Code><Msg>ValidacionDeToken: No validaron las fechas del token</Msg></Err></Errors>')),
    ).toThrow(/600: ValidacionDeToken/)
  })

  it('un sobre de error de SOAP se avisa con el motivo', () => {
    const fault =
      '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault>' +
      '<faultcode>soap:Server</faultcode><faultstring>Server was unable to process request.</faultstring></soap:Fault></soap:Body></soap:Envelope>'
    expect(() => leerConsulta(fault)).toThrow(/unable to process/)
  })

  it('una respuesta sin resultado ni errores tampoco pasa como vacía', () => {
    expect(() => leerConsulta(sobre(''))).toThrow(/no devolvió/)
  })
})

describe('¿es este comprobante?', () => {
  it('con el mismo receptor, fecha y total, sí', () => {
    expect(esElMismoComprobante(local, enArca())).toEqual({ mismo: true, diferencias: [] })
  })

  it('el consumidor final sin documento es el documento 0 de ARCA', () => {
    expect(esElMismoComprobante({ ...local, receptor_documento: '' }, enArca()).mismo).toBe(true)
    expect(esElMismoComprobante({ ...local, receptor_documento: '0' }, enArca()).mismo).toBe(true)
  })

  it('un CUIT escrito con guiones es el mismo número', () => {
    const conCuit = { ...local, receptor_tipo_documento_id: 80, receptor_documento: '20-12345678-6' }
    expect(esElMismoComprobante(conCuit, enArca({ docTipo: 80, docNro: '20123456786' })).mismo).toBe(true)
  })

  it('el total viene de la base como texto o número y da igual', () => {
    expect(esElMismoComprobante({ ...local, total: '1210.00' as unknown as number }, enArca()).mismo).toBe(true)
  })

  it('otro total es otro comprobante', () => {
    const r = esElMismoComprobante({ ...local, total: 1500 }, enArca())
    expect(r.mismo).toBe(false)
    expect(r.diferencias.join()).toMatch(/total/)
  })

  it('otro receptor es otro comprobante', () => {
    const r = esElMismoComprobante(
      { ...local, receptor_tipo_documento_id: 80, receptor_documento: '20123456786' },
      enArca(),
    )
    expect(r.mismo).toBe(false)
    expect(r.diferencias.join()).toMatch(/tipo de documento/)
    expect(r.diferencias.join()).toMatch(/documento 0 en ARCA/)
  })

  it('otro día es otro comprobante', () => {
    expect(esElMismoComprobante({ ...local, fecha: '2026-10-13' }, enArca()).mismo).toBe(false)
  })

  it('emitido con CAEA no es un pedido de CAE que se cortó', () => {
    const r = esElMismoComprobante(local, enArca({ emisionTipo: 'CAEA' }))
    expect(r.mismo).toBe(false)
    expect(r.diferencias.join()).toMatch(/CAEA/)
  })

  it('rechazado, o sin CAE, no se puede tomar', () => {
    expect(esElMismoComprobante(local, enArca({ resultado: 'R' })).mismo).toBe(false)
    expect(esElMismoComprobante(local, enArca({ codAutorizacion: null })).mismo).toBe(false)
    expect(esElMismoComprobante(local, enArca({ vencimiento: null })).mismo).toBe(false)
  })
})

describe('el pedido de consulta', () => {
  it('lleva el punto de venta, el tipo y el número que se preguntan', () => {
    const xml = armarPedidoConsulta({ token: 'T', sign: 'S' }, '20111111112', 1, 6, 28)
    expect(xml).toContain('<ar:FECompConsultar>')
    expect(xml).toContain('<ar:CbteTipo>6</ar:CbteTipo>')
    expect(xml).toContain('<ar:CbteNro>28</ar:CbteNro>')
    expect(xml).toContain('<ar:PtoVta>1</ar:PtoVta>')
    expect(xml).toContain('<ar:Cuit>20111111112</ar:Cuit>')
  })
})
