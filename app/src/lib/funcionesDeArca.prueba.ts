import { describe, expect, it } from 'vitest'
import { esFuncionDeArca, LIMITE_ARCA_MS } from '@/lib/funcionesDeArca'

const SERVIDOR = 'https://ywggnhoifhtoncnxrodh.supabase.co'

describe('las funciones que esperan a ARCA', () => {
  /*
    El caso del 01/10: el permiso nuevo de WSAA tarda unos diez segundos
    y el pedido de CAE entero pasaba de los doce. La caja lo cortaba
    mientras el servidor obtenía el CAE igual.
  */
  it('el pedido de CAE espera lo de ARCA, no lo de una consulta', () => {
    expect(esFuncionDeArca(`${SERVIDOR}/functions/v1/arca-wsfe-solicitar-cae`)).toBe(true)
  })

  it('la contingencia y la consulta de CUIT también', () => {
    expect(esFuncionDeArca(`${SERVIDOR}/functions/v1/arca-wsfe-caea`)).toBe(true)
    expect(esFuncionDeArca(`${SERVIDOR}/functions/v1/arca-constancia`)).toBe(true)
  })

  /*
    Al revés también importa: si una consulta común esperara treinta
    segundos, sin internet la Caja volvería a tardar en abrir, que es lo
    que el límite de doce arregló el 17/09.
  */
  it('las consultas a la base siguen con los doce segundos', () => {
    expect(esFuncionDeArca(`${SERVIDOR}/rest/v1/comprobante?select=*`)).toBe(false)
    expect(esFuncionDeArca(`${SERVIDOR}/rest/v1/rpc/preparar_comprobante`)).toBe(false)
  })

  it('una función que no habla con ARCA, tampoco', () => {
    expect(esFuncionDeArca(`${SERVIDOR}/functions/v1/api-tienda/catalogo`)).toBe(false)
  })

  // Que un nombre empiece igual no alcanza: tiene que ser la función.
  it('no se confunde con un nombre parecido', () => {
    expect(esFuncionDeArca(`${SERVIDOR}/functions/v1/arca-wsfe-caea-prueba`)).toBe(false)
    expect(esFuncionDeArca(`${SERVIDOR}/rest/v1/arca_ticket_acceso`)).toBe(false)
  })

  // supabase-js puede mandar el pedido como texto, como URL o como Request.
  it('reconoce el pedido en cualquiera de sus formas', () => {
    const url = `${SERVIDOR}/functions/v1/arca-wsfe-solicitar-cae`
    expect(esFuncionDeArca(new URL(url))).toBe(true)
    expect(esFuncionDeArca(new Request(url, { method: 'POST' }))).toBe(true)
  })

  /*
    Las funciones contestan a más tardar a los veinte segundos (su
    PLAZO_ARCA_MS) más lo que tarda la base. Esperar menos de eso es
    volver a cortarlas a mitad de camino.
  */
  it('la espera queda por encima del plazo de las funciones', () => {
    expect(LIMITE_ARCA_MS).toBeGreaterThanOrEqual(20_000 + 5_000)
  })
})
