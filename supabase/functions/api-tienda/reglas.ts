/*
  ─────────────────────────────────────────────────────────────
  Las reglas de la puerta de la tienda, sin red ni Deno.

  Están aparte de index.ts para poder probarlas con las pruebas de la
  aplicación, que corren en Node: lo que decide qué pedido pasa y qué
  error se contesta es lo que un desarrollador de afuera ve, y tiene
  que estar probado como lo demás.

  Lo que decide QUÉ SE VE no está acá sino en la base
  (api_tienda_catalogo). Acá sólo se decide si el pedido está bien
  hecho y cómo se contesta cuando no.
  ─────────────────────────────────────────────────────────────
*/

export const LIMITE_POR_DEFECTO = 500
export const LIMITE_MAXIMO = 1000

export type CodigoDeError =
  | 'falta_clave'
  | 'clave_invalida'
  | 'ruta_desconocida'
  | 'metodo_no_permitido'
  | 'parametro_desconocido'
  | 'desde_invalido'
  | 'limite_invalido'
  | 'error_interno'

/*
  Los mensajes los lee un desarrollador de afuera, sin nosotros al
  lado: dicen qué estuvo mal y cómo arreglarlo.

  Ninguno dice si una clave existe o fue anulada. A quien prueba claves
  no hay que contarle cuál estuvo cerca.
*/
export const MENSAJES: Record<CodigoDeError, string> = {
  falta_clave: 'Falta la clave. Mandala en el encabezado Authorization: Bearer <clave>.',
  clave_invalida: 'La clave no es válida o fue anulada. Si la cambiaron, usá la nueva; si no, pedí una.',
  ruta_desconocida: 'No existe esa consulta. Las que hay son /catalogo y /clasificaciones.',
  metodo_no_permitido: 'Esta API es de sólo lectura: se consulta con GET.',
  parametro_desconocido: 'Esta consulta no acepta ese parámetro.',
  desde_invalido: 'El parámetro desde tiene que ser un valor de "siguiente" tal como lo devolvió esta API, sin tocarlo.',
  limite_invalido: `El parámetro limite tiene que ser un número entero entre 1 y ${LIMITE_MAXIMO}.`,
  error_interno: 'Algo falló de nuestro lado. Probá de nuevo en un rato; si sigue, avisanos con la hora del pedido.',
}

const ESTADO: Record<CodigoDeError, number> = {
  falta_clave: 401,
  clave_invalida: 401,
  ruta_desconocida: 404,
  metodo_no_permitido: 405,
  parametro_desconocido: 400,
  desde_invalido: 400,
  limite_invalido: 400,
  error_interno: 500,
}

export type Consulta =
  | {
      tipo: 'consulta'
      funcion: 'api_tienda_catalogo'
      argumentos: { p_clave: string; p_desde: string | null; p_limite: number }
    }
  | {
      tipo: 'consulta'
      funcion: 'api_tienda_clasificaciones'
      argumentos: { p_clave: string }
    }
  | { tipo: 'error'; estado: number; codigo: CodigoDeError; detalle?: string }

function error(codigo: CodigoDeError, detalle?: string): Consulta {
  return { tipo: 'error', estado: ESTADO[codigo], codigo, detalle }
}

const PARAMETROS: Record<string, string[]> = {
  catalogo: ['desde', 'limite'],
  clasificaciones: [],
}

/*
  La ruta llega con el nombre de la función adelante (/api-tienda/…),
  y corriendo en local además con /functions/v1. Se aceptan las dos.
*/
function rutaDe(url: URL): string {
  return url.pathname
    .replace(/^\/functions\/v1/, '')
    .replace(/^\/api-tienda/, '')
    .replace(/^\/+|\/+$/g, '')
}

export function interpretarPedido(metodo: string, url: URL, autorizacion: string | null): Consulta {
  if (metodo !== 'GET') return error('metodo_no_permitido')

  const ruta = rutaDe(url)
  const permitidos = PARAMETROS[ruta]
  if (!permitidos) return error('ruta_desconocida')

  /*
    La clave va en un encabezado y no en la dirección: las direcciones
    quedan anotadas en los registros del servidor, los encabezados no.
  */
  const clave = /^Bearer\s+(\S+)\s*$/i.exec(autorizacion ?? '')?.[1]
  if (!clave) return error('falta_clave')

  /*
    Un parámetro mal escrito se rechaza en vez de ignorarse: "dsde" en
    lugar de "desde" devolvería el catálogo entero en cada consulta, y
    nadie se daría cuenta hasta ver la cuenta de datos.
  */
  for (const nombre of url.searchParams.keys()) {
    if (!permitidos.includes(nombre)) return error('parametro_desconocido', nombre)
  }

  if (ruta === 'clasificaciones') {
    return { tipo: 'consulta', funcion: 'api_tienda_clasificaciones', argumentos: { p_clave: clave } }
  }

  const desde = url.searchParams.get('desde')
  if (desde !== null && desde.trim() === '') return error('desde_invalido')

  const textoLimite = url.searchParams.get('limite')
  let limite = LIMITE_POR_DEFECTO
  if (textoLimite !== null) {
    if (!/^\d+$/.test(textoLimite)) return error('limite_invalido')
    limite = Number(textoLimite)
    if (limite < 1 || limite > LIMITE_MAXIMO) return error('limite_invalido')
  }

  return {
    tipo: 'consulta',
    funcion: 'api_tienda_catalogo',
    argumentos: { p_clave: clave, p_desde: desde, p_limite: limite },
  }
}

/*
  La base contesta los errores esperables con códigos propios —PT401 y
  PT400, que PostgREST convierte en 401 y 400—. Todo lo demás es un
  error nuestro y se contesta como tal, sin pasarle a Zubu el detalle
  interno: puede nombrar tablas o funciones.
*/
export function interpretarErrorDeLaBase(cuerpo: { code?: string; message?: string } | null): {
  estado: number
  codigo: CodigoDeError
} {
  if (cuerpo?.code === 'PT401') return { estado: 401, codigo: 'clave_invalida' }
  if (cuerpo?.code === 'PT400' && (cuerpo.message === 'desde_invalido' || cuerpo.message === 'limite_invalido')) {
    return { estado: 400, codigo: cuerpo.message }
  }
  return { estado: 500, codigo: 'error_interno' }
}

export function cuerpoDeError(codigo: CodigoDeError, detalle?: string) {
  return {
    error: {
      codigo,
      mensaje: detalle ? `${MENSAJES[codigo]} (${detalle})` : MENSAJES[codigo],
    },
  }
}

/*
  Sin encabezados CORS, a propósito: un navegador no puede leer estas
  respuestas. Obliga a que la clave viva en el servidor de la tienda y
  no en la página, donde cualquiera la podría copiar.
*/
export const CABECERAS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const
