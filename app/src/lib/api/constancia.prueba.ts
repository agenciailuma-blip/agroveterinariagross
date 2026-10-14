import { describe, expect, it } from 'vitest'
import {
  CONDICION,
  condicionSegunImpuestos,
  cuitValido,
  interpretarConstancia,
  separarDireccion,
} from '../../../../supabase/functions/arca-constancia/constancia.ts'
import { cambiosDesdeArca } from '@/lib/api/clientes'

/*
  Lo que ARCA dice de un CUIT.

  Las respuestas están armadas con la forma de getPersona_v2 —la
  Consulta de Constancia de Inscripción—: el mismo sobre SOAP, las
  mismas etiquetas, el espacio de nombres con prefijo. Lo que se prueba
  es la condición frente al IVA, porque es lo que decide la letra de la
  factura y ARCA no avisa si se eligió mal: autoriza igual.
*/

function sobre(persona: string): string {
  return `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
<ns2:getPersona_v2Response xmlns:ns2="http://a5.soap.ws.server.puc.sr/"><personaReturn>${persona}
<metadata><fechaHora>2026-10-01T17:00:00-03:00</fechaHora><servidor>linux11b</servidor></metadata>
</personaReturn></ns2:getPersona_v2Response></soap:Body></soap:Envelope>`
}

function generales(extra = '') {
  return `<datosGenerales>
  <apellido>GOMEZ</apellido>
  <domicilioFiscal>
    <codPostal>3360</codPostal>
    <descripcionProvincia>MISIONES</descripcionProvincia>
    <direccion>AV LIBERTAD 1234</direccion>
    <idProvincia>19</idProvincia>
    <localidad>OBERA</localidad>
    <tipoDomicilio>FISCAL</tipoDomicilio>
  </domicilioFiscal>
  <estadoClave>ACTIVO</estadoClave>
  <idPersona>20123456786</idPersona>
  <nombre>MARIA LAURA</nombre>
  <tipoClave>CUIT</tipoClave>
  <tipoPersona>FISICA</tipoPersona>
  ${extra}
</datosGenerales>`
}

function impuesto(id: number, descripcion: string) {
  return `<impuesto><descripcionImpuesto>${descripcion}</descripcionImpuesto><idImpuesto>${id}</idImpuesto><periodo>201901</periodo></impuesto>`
}

describe('la condición frente al IVA que trae ARCA', () => {
  it('inscripto en IVA es responsable inscripto: Factura A', () => {
    const r = interpretarConstancia(
      sobre(generales() + `<datosRegimenGeneral>
        <actividad><descripcionActividad>VENTA AL POR MENOR</descripcionActividad><idActividad>477</idActividad></actividad>
        ${impuesto(11, 'GANANCIAS PERSONAS FISICAS')}${impuesto(30, 'IVA')}
      </datosRegimenGeneral>`),
      '20123456786',
    )
    expect(r.encontrado).toBe(true)
    if (!r.encontrado) return
    expect(r.datos.condicion_iva_id).toBe(CONDICION.responsableInscripto)
    expect(r.datos.nombre).toBe('GOMEZ MARIA LAURA')
    expect(r.datos.tipo_persona).toBe('fisica')
    expect(r.datos).toMatchObject({
      calle: 'AV LIBERTAD',
      numero: '1234',
      localidad: 'OBERA',
      provincia: 'MISIONES',
      codigo_postal: '3360',
    })
    expect(r.datos.avisos).toEqual([])
  })

  it('el monotributista no es inscripto en IVA: Factura B', () => {
    const r = interpretarConstancia(
      sobre(generales() + `<datosMonotributo>
        <categoriaMonotributo><descripcionCategoria>A LOCACIONES DE SERVICIOS</descripcionCategoria><idCategoria>1</idCategoria><idImpuesto>20</idImpuesto><periodo>202401</periodo></categoriaMonotributo>
        ${impuesto(20, 'MONOTRIBUTO')}
      </datosMonotributo>`),
      '20123456786',
    )
    expect(r.encontrado && r.datos.condicion_iva_id).toBe(CONDICION.monotributo)
  })

  it('el monotributo social tiene su propio código', () => {
    const r = interpretarConstancia(
      sobre(generales() + `<datosMonotributo>${impuesto(21, 'MONOTRIBUTO SOCIAL')}</datosMonotributo>`),
      '20123456786',
    )
    expect(r.encontrado && r.datos.condicion_iva_id).toBe(CONDICION.monotributoSocial)
  })

  it('exento en IVA', () => {
    const r = interpretarConstancia(
      sobre(generales() + `<datosRegimenGeneral>${impuesto(32, 'IVA EXENTO')}</datosRegimenGeneral>`),
      '20123456786',
    )
    expect(r.encontrado && r.datos.condicion_iva_id).toBe(CONDICION.exento)
  })

  it('con CUIT pero sin IVA ni monotributo —un empleado— es consumidor final', () => {
    const r = interpretarConstancia(
      sobre(generales() + `<datosRegimenGeneral>${impuesto(11, 'GANANCIAS PERSONAS FISICAS')}</datosRegimenGeneral>`),
      '20123456786',
    )
    expect(r.encontrado && r.datos.condicion_iva_id).toBe(CONDICION.consumidorFinal)
  })

  it('si un padrón viejo trae monotributo e IVA, manda el monotributo', () => {
    expect(condicionSegunImpuestos([30], [20])).toBe(CONDICION.monotributo)
  })

  it('una empresa trae razón social y es persona jurídica', () => {
    const r = interpretarConstancia(
      sobre(`<datosGenerales><estadoClave>ACTIVO</estadoClave><idPersona>30712345671</idPersona>
        <razonSocial>AGROPECUARIA EL CEIBO S.A.</razonSocial><tipoPersona>JURIDICA</tipoPersona></datosGenerales>
        <datosRegimenGeneral>${impuesto(30, 'IVA')}</datosRegimenGeneral>`),
      '30712345671',
    )
    expect(r.encontrado).toBe(true)
    if (!r.encontrado) return
    expect(r.datos.nombre).toBe('AGROPECUARIA EL CEIBO S.A.')
    expect(r.datos.tipo_persona).toBe('juridica')
    expect(r.datos.condicion_iva_id).toBe(CONDICION.responsableInscripto)
    // Sin domicilio fiscal no se inventa uno.
    expect(r.datos.calle).toBeNull()
  })

  it('un CUIT inactivo se trae igual, con el aviso', () => {
    const r = interpretarConstancia(
      sobre(generales().replace('<estadoClave>ACTIVO</estadoClave>', '<estadoClave>INACTIVO</estadoClave>')),
      '20123456786',
    )
    expect(r.encontrado && r.datos.avisos).toEqual(['El CUIT figura inactivo en ARCA.'])
  })

  it('sin constancia, trae el nombre y deja la condición para una persona', () => {
    const r = interpretarConstancia(
      sobre(`<errorConstancia><apellido>GOMEZ</apellido><error>La CUIT no registra domicilio fiscal</error>
        <idPersona>20123456786</idPersona><nombre>MARIA LAURA</nombre></errorConstancia>`),
      '20123456786',
    )
    expect(r.encontrado).toBe(true)
    if (!r.encontrado) return
    expect(r.datos.nombre).toBe('GOMEZ MARIA LAURA')
    expect(r.datos.condicion_iva_id).toBeNull()
    expect(r.datos.avisos[0]).toContain('La CUIT no registra domicilio fiscal')
  })

  it('un CUIT que no existe vuelve con el motivo de ARCA', () => {
    const r = interpretarConstancia(
      `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault>
        <faultcode>soap:Server</faultcode><faultstring>No existe persona con ese Id</faultstring>
      </soap:Fault></soap:Body></soap:Envelope>`,
      '20111111112',
    )
    expect(r).toEqual({ encontrado: false, motivo: 'No existe persona con ese Id' })
  })

  it('los caracteres escapados se leen bien', () => {
    const r = interpretarConstancia(
      sobre(`<datosGenerales><idPersona>30712345671</idPersona><razonSocial>PEREZ &amp; HIJOS S.R.L.</razonSocial>
        <tipoPersona>JURIDICA</tipoPersona></datosGenerales>`),
      '30712345671',
    )
    expect(r.encontrado && r.datos.nombre).toBe('PEREZ & HIJOS S.R.L.')
  })
})

describe('la dirección de ARCA, en calle y número', () => {
  it('separa el número de puerta del final', () => {
    expect(separarDireccion('AV LIBERTAD 1234')).toEqual({ calle: 'AV LIBERTAD', numero: '1234' })
  })

  it('sin número al final, va todo a la calle', () => {
    expect(separarDireccion('RUTA 14 KM 850 S/N')).toEqual({ calle: 'RUTA 14 KM 850 S/N', numero: null })
  })
})

describe('el CUIT', () => {
  it('controla el dígito verificador, con o sin guiones', () => {
    expect(cuitValido('20123456786')).toBe(true)
    expect(cuitValido('30-71234567-1')).toBe(true)
    expect(cuitValido('20123456780')).toBe(false)
    expect(cuitValido('2012345678')).toBe(false)
  })
})

describe('lo que los datos de ARCA cambian en la ficha', () => {
  const deArca = {
    cuit: '20123456786',
    tipo_persona: 'fisica' as const,
    nombre: 'GOMEZ MARIA LAURA',
    condicion_iva_id: 1,
    calle: 'AV LIBERTAD',
    numero: '1234',
    localidad: 'OBERA',
    provincia: 'MISIONES',
    codigo_postal: '3360',
    avisos: [],
  }

  it('pone el CUIT como documento, el nombre y la condición', () => {
    expect(cambiosDesdeArca(deArca)).toMatchObject({
      tipo_documento_id: 80,
      numero_documento: '20123456786',
      nombre: 'GOMEZ MARIA LAURA',
      condicion_iva_id: 1,
      calle: 'AV LIBERTAD',
    })
  })

  // Un cliente con la dirección cargada a mano no la pierde por una
  // constancia sin domicilio.
  it('sin domicilio en ARCA, no toca el que ya estaba', () => {
    const cambios = cambiosDesdeArca({ ...deArca, calle: null, numero: null, localidad: null, provincia: null, codigo_postal: null })
    expect(cambios).not.toHaveProperty('calle')
    expect(cambios).not.toHaveProperty('localidad')
  })

  // Adivinarla es emitir la letra equivocada.
  it('sin condición en ARCA, no toca la que ya estaba', () => {
    expect(cambiosDesdeArca({ ...deArca, condicion_iva_id: null })).not.toHaveProperty('condicion_iva_id')
  })
})
