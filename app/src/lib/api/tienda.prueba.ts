import { describe, expect, it } from 'vitest'
import {
  cuerpoDeError,
  interpretarCuerpoDelPedido,
  interpretarErrorDeLaBase,
  interpretarPedido,
  LIMITE_DEL_CUERPO,
  LIMITE_POR_DEFECTO,
  MENSAJES,
  type CodigoDeError,
} from '../../../../supabase/functions/api-tienda/reglas.ts'

/*
  ─────────────────────────────────────────────────────────────
  La puerta de la API de la tienda

  La función corre en el servidor de Supabase, con Deno, y estas
  pruebas en Node. Se puede porque las reglas —qué pedido pasa, qué
  error se contesta— están en un archivo sin red ni Deno. Lo que decide
  QUÉ SE VE está en la base y tiene sus propias pruebas, contra la base
  real: supabase/pruebas/api-tienda.sql.

  Lo que se cuida acá es lo que ve un desarrollador de afuera: que un
  pedido mal hecho se rechace con un mensaje que diga cómo arreglarlo,
  y que ningún error deje escapar la clave ni el detalle interno.
  ─────────────────────────────────────────────────────────────
*/

const CLAVE = 'gross_ClaveDePruebaQueNoEsReal0123456789abcdefghi'
const BEARER = `Bearer ${CLAVE}`

function pedir(ruta: string, autorizacion: string | null = BEARER, metodo = 'GET') {
  return interpretarPedido(metodo, new URL(`https://ejemplo.supabase.co${ruta}`), autorizacion)
}

describe('las consultas que pasan', () => {
  it('el catálogo entero, sin parámetros, con el límite por defecto', () => {
    expect(pedir('/api-tienda/catalogo')).toEqual({
      tipo: 'consulta',
      funcion: 'api_tienda_catalogo',
      argumentos: { p_clave: CLAVE, p_desde: null, p_limite: LIMITE_POR_DEFECTO },
    })
  })

  it('lo que cambió, con la marca tal cual llegó y el límite pedido', () => {
    expect(pedir('/api-tienda/catalogo?desde=eyJ0IjoiMjAyNiJ9&limite=20')).toEqual({
      tipo: 'consulta',
      funcion: 'api_tienda_catalogo',
      argumentos: { p_clave: CLAVE, p_desde: 'eyJ0IjoiMjAyNiJ9', p_limite: 20 },
    })
  })

  it('los bordes del límite: 1 y 1000 pasan', () => {
    expect(pedir('/api-tienda/catalogo?limite=1')).toMatchObject({ argumentos: { p_limite: 1 } })
    expect(pedir('/api-tienda/catalogo?limite=1000')).toMatchObject({ argumentos: { p_limite: 1000 } })
  })

  it('las clasificaciones', () => {
    expect(pedir('/api-tienda/clasificaciones')).toEqual({
      tipo: 'consulta',
      funcion: 'api_tienda_clasificaciones',
      argumentos: { p_clave: CLAVE },
    })
  })

  it('un pedido de compra: la puerta lo deja pasar sin mirarle el cuerpo', () => {
    expect(pedir('/api-tienda/pedidos', BEARER, 'POST')).toEqual({
      tipo: 'pedido',
      funcion: 'api_tienda_registrar_pedido',
      clave: CLAVE,
    })
  })

  it('con la dirección de desarrollo local y con barra al final', () => {
    expect(pedir('/functions/v1/api-tienda/catalogo/')).toMatchObject({ funcion: 'api_tienda_catalogo' })
  })

  it('"Bearer" se acepta en cualquier combinación de mayúsculas', () => {
    expect(pedir('/api-tienda/catalogo', `bearer ${CLAVE}`)).toMatchObject({ argumentos: { p_clave: CLAVE } })
  })
})

describe('lo que se rechaza', () => {
  const casos: Array<[string, string, string | null, string, CodigoDeError, number]> = [
    ['sin clave', '/api-tienda/catalogo', null, 'GET', 'falta_clave', 401],
    ['con la clave sin "Bearer"', '/api-tienda/catalogo', CLAVE, 'GET', 'falta_clave', 401],
    ['con "Bearer" vacío', '/api-tienda/catalogo', 'Bearer ', 'GET', 'falta_clave', 401],
    ['con otro esquema', '/api-tienda/catalogo', `Basic ${CLAVE}`, 'GET', 'falta_clave', 401],
    ['escribir', '/api-tienda/catalogo', BEARER, 'POST', 'metodo_no_permitido', 405],
    ['borrar', '/api-tienda/catalogo', BEARER, 'DELETE', 'metodo_no_permitido', 405],
    ['la pregunta previa de un navegador', '/api-tienda/catalogo', null, 'OPTIONS', 'metodo_no_permitido', 405],
    ['un camino que no existe', '/api-tienda/clientes', BEARER, 'GET', 'ruta_desconocida', 404],
    ['leer los pedidos, que todavía no se puede', '/api-tienda/pedidos', BEARER, 'GET', 'metodo_no_permitido', 405],
    ['mandar un pedido sin clave', '/api-tienda/pedidos', null, 'POST', 'falta_clave', 401],
    ['un parámetro en los pedidos', '/api-tienda/pedidos?estado=x', BEARER, 'POST', 'parametro_desconocido', 400],
    ['la raíz', '/api-tienda', BEARER, 'GET', 'ruta_desconocida', 404],
    ['un parámetro mal escrito', '/api-tienda/catalogo?dsde=x', BEARER, 'GET', 'parametro_desconocido', 400],
    ['parámetros en clasificaciones', '/api-tienda/clasificaciones?limite=5', BEARER, 'GET', 'parametro_desconocido', 400],
    ['desde vacío', '/api-tienda/catalogo?desde=', BEARER, 'GET', 'desde_invalido', 400],
    ['límite 0', '/api-tienda/catalogo?limite=0', BEARER, 'GET', 'limite_invalido', 400],
    ['límite 1001', '/api-tienda/catalogo?limite=1001', BEARER, 'GET', 'limite_invalido', 400],
    ['límite con decimales', '/api-tienda/catalogo?limite=1.5', BEARER, 'GET', 'limite_invalido', 400],
    ['límite negativo', '/api-tienda/catalogo?limite=-5', BEARER, 'GET', 'limite_invalido', 400],
    ['límite que no es número', '/api-tienda/catalogo?limite=todo', BEARER, 'GET', 'limite_invalido', 400],
    ['límite vacío', '/api-tienda/catalogo?limite=', BEARER, 'GET', 'limite_invalido', 400],
  ]

  it.each(casos)('%s', (_, ruta, autorizacion, metodo, codigo, estado) => {
    expect(pedir(ruta, autorizacion, metodo)).toMatchObject({ tipo: 'error', codigo, estado })
  })

  it('el parámetro mal escrito se nombra en el mensaje, para que se encuentre rápido', () => {
    const r = pedir('/api-tienda/catalogo?dsde=x')
    if (r.tipo !== 'error') throw new Error('tenía que ser un error')
    expect(cuerpoDeError(r.codigo, r.detalle).error.mensaje).toContain('(dsde)')
  })

  it('ningún error repite la clave', () => {
    for (const [, ruta, autorizacion, metodo] of casos) {
      const r = pedir(ruta, autorizacion, metodo)
      if (r.tipo !== 'error') throw new Error(`"${ruta}" tenía que ser un error`)
      expect(JSON.stringify(cuerpoDeError(r.codigo, r.detalle))).not.toContain(CLAVE)
    }
  })
})

describe('el cuerpo del pedido de compra', () => {
  it('un objeto JSON pasa tal cual: qué campos lleva lo decide la base', () => {
    const pedido = { numero: 'A-1', productos: [{ id: 'x', cantidad: 1, precio: 10 }] }
    expect(interpretarCuerpoDelPedido(JSON.stringify(pedido))).toEqual({ tipo: 'cuerpo', pedido })
  })

  const malos: Array<[string, string, CodigoDeError, number]> = [
    ['vacío', '', 'cuerpo_invalido', 400],
    ['sólo espacios', '   ', 'cuerpo_invalido', 400],
    ['JSON roto', '{"numero": ', 'cuerpo_invalido', 400],
    ['una lista', '[{"numero":"A-1"}]', 'cuerpo_invalido', 400],
    ['un texto', '"un pedido"', 'cuerpo_invalido', 400],
    ['un número', '42', 'cuerpo_invalido', 400],
    ['nulo', 'null', 'cuerpo_invalido', 400],
  ]

  it.each(malos)('%s', (_, texto, codigo, estado) => {
    expect(interpretarCuerpoDelPedido(texto)).toMatchObject({ tipo: 'error', codigo, estado })
  })

  /*
    El tope se mira antes de intentar interpretar el texto: un cuerpo
    enorme no tiene que costar el trabajo de analizarlo.
  */
  it('un cuerpo enorme se corta con su propio código', () => {
    expect(interpretarCuerpoDelPedido('x'.repeat(LIMITE_DEL_CUERPO + 1))).toMatchObject({
      tipo: 'error',
      codigo: 'cuerpo_demasiado_grande',
      estado: 413,
    })
  })

  it('justo en el tope todavía entra', () => {
    const relleno = 'a'.repeat(LIMITE_DEL_CUERPO - 14)
    const texto = JSON.stringify({ numero: relleno })
    expect(texto.length).toBeLessThanOrEqual(LIMITE_DEL_CUERPO)
    expect(interpretarCuerpoDelPedido(texto)).toMatchObject({ tipo: 'cuerpo' })
  })
})

describe('los errores del pedido de compra que contesta la base', () => {
  const codigos: CodigoDeError[] = [
    'falta_numero',
    'faltan_productos',
    'producto_desconocido',
    'cantidad_invalida',
    'precio_invalido',
    'entrega_invalida',
    'falta_el_comprador',
    'pedido_invalido',
  ]

  it.each(codigos)('%s llega con su nombre y un 400', (codigo) => {
    expect(interpretarErrorDeLaBase({ code: 'PT400', message: codigo })).toMatchObject({ estado: 400, codigo })
  })

  /*
    Del producto desconocido sí se devuelve cuál: ese identificador lo
    mandó la tienda en el mismo pedido, así que no le cuenta nada que
    no sepa, y sin él tiene que adivinar cuál de veinte líneas falló.
  */
  it('el producto desconocido dice cuál era', () => {
    const e = interpretarErrorDeLaBase({
      code: 'PT400',
      message: 'producto_desconocido',
      details: '0f3c2a44-0000-0000-0000-000000000000',
    })
    expect(e.detalle).toBe('0f3c2a44-0000-0000-0000-000000000000')
    expect(cuerpoDeError(e.codigo, e.detalle).error.mensaje).toContain('0f3c2a44')
  })

  /*
    El resto de los detalles es el mensaje crudo de Postgres, que
    nombra tipos y columnas del sistema. El código alcanza para
    arreglar el pedido; el detalle sólo cuenta cómo está armado adentro.
  */
  it('los demás errores no dejan salir el detalle interno', () => {
    for (const codigo of codigos.filter((c) => c !== 'producto_desconocido')) {
      const e = interpretarErrorDeLaBase({
        code: 'PT400',
        message: codigo,
        details: 'invalid input syntax for type uuid: "venta_linea"',
      })
      expect(e.detalle, codigo).toBeUndefined()
      expect(JSON.stringify(cuerpoDeError(e.codigo, e.detalle)), codigo).not.toContain('venta_linea')
    }
  })

  it('un error que la base no nombra sigue siendo un 500 nuestro', () => {
    expect(interpretarErrorDeLaBase({ code: 'PT400', message: 'canal_sin_medio_de_pago' })).toEqual({
      estado: 500,
      codigo: 'error_interno',
    })
    expect(interpretarErrorDeLaBase({ code: 'PT500', message: 'canal_sin_medio_de_pago' })).toEqual({
      estado: 500,
      codigo: 'error_interno',
    })
  })
})

describe('los errores que contesta la base', () => {
  it('una clave que la base no reconoce es un 401', () => {
    expect(interpretarErrorDeLaBase({ code: 'PT401', message: 'clave_invalida' })).toEqual({
      estado: 401,
      codigo: 'clave_invalida',
    })
  })

  it('una marca o un límite que la base rechaza son un 400 con su nombre', () => {
    expect(interpretarErrorDeLaBase({ code: 'PT400', message: 'desde_invalido' })).toEqual({
      estado: 400,
      codigo: 'desde_invalido',
    })
    expect(interpretarErrorDeLaBase({ code: 'PT400', message: 'limite_invalido' })).toEqual({
      estado: 400,
      codigo: 'limite_invalido',
    })
  })

  /*
    Cualquier otra cosa es un error nuestro. El detalle de la base puede
    nombrar tablas o funciones internas, y eso no le sirve a Zubu y le
    cuenta a cualquiera cómo está armado el sistema.
  */
  it('lo inesperado es un 500 sin el detalle interno', () => {
    for (const cuerpo of [
      { code: '42501', message: 'permission denied for table producto' },
      { code: 'PT400', message: 'otra cosa' },
      { message: 'sin código' },
      null,
    ]) {
      const e = interpretarErrorDeLaBase(cuerpo)
      expect(e).toEqual({ estado: 500, codigo: 'error_interno' })
      expect(JSON.stringify(cuerpoDeError(e.codigo))).not.toContain('producto')
    }
  })

  it('todos los errores tienen un mensaje que dice qué hacer', () => {
    for (const [codigo, mensaje] of Object.entries(MENSAJES)) {
      expect(mensaje.length, codigo).toBeGreaterThan(20)
      expect(cuerpoDeError(codigo as CodigoDeError)).toEqual({ error: { codigo, mensaje } })
    }
  })
})
