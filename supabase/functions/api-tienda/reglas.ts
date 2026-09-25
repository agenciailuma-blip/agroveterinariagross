/*
  ─────────────────────────────────────────────────────────────
  Las reglas de la puerta de la tienda, sin red ni Deno.

  Están aparte de index.ts para poder probarlas con las pruebas de la
  aplicación, que corren en Node: lo que decide qué pedido pasa y qué
  error se contesta es lo que un desarrollador de afuera ve, y tiene
  que estar probado como lo demás.

  Lo que decide QUÉ SE VE y QUÉ ENTRA no está acá sino en la base
  (api_tienda_catalogo, api_tienda_registrar_pedido,
  api_tienda_estado_pedido). Acá sólo se decide si la consulta está
  bien hecha y cómo se contesta cuando no.
  ─────────────────────────────────────────────────────────────
*/

export const LIMITE_POR_DEFECTO = 500
export const LIMITE_MAXIMO = 1000

/*
  Un pedido de compra grande son unas decenas de líneas. El tope está
  muy por encima de eso y muy por debajo de lo que cuesta atender: es
  un freno para lo que no es un pedido, no un límite a nadie.
*/
export const LIMITE_DEL_CUERPO = 200_000

export type CodigoDeError =
  | 'falta_clave'
  | 'clave_invalida'
  | 'ruta_desconocida'
  | 'metodo_no_permitido'
  | 'parametro_desconocido'
  | 'desde_invalido'
  | 'limite_invalido'
  | 'cuerpo_invalido'
  | 'cuerpo_demasiado_grande'
  | 'falta_numero'
  | 'faltan_productos'
  | 'producto_desconocido'
  | 'cantidad_invalida'
  | 'precio_invalido'
  | 'entrega_invalida'
  | 'falta_el_comprador'
  | 'pedido_invalido'
  | 'numero_invalido'
  | 'pedido_desconocido'
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
  ruta_desconocida: 'No existe ese camino. Los que hay son /catalogo, /clasificaciones, /pedidos y /pedidos/{numero}.',
  metodo_no_permitido:
    'Ese camino no acepta ese método: el catálogo, las clasificaciones y el estado de un pedido se consultan con GET, y los pedidos se mandan con POST a /pedidos.',
  parametro_desconocido: 'Esta consulta no acepta ese parámetro.',
  desde_invalido: 'El parámetro desde tiene que ser un valor de "siguiente" tal como lo devolvió esta API, sin tocarlo.',
  limite_invalido: `El parámetro limite tiene que ser un número entero entre 1 y ${LIMITE_MAXIMO}.`,
  cuerpo_invalido: 'El pedido tiene que ser un objeto JSON. Revisá que el cuerpo no venga vacío ni mal armado.',
  cuerpo_demasiado_grande: `El pedido no puede pasar de ${LIMITE_DEL_CUERPO} caracteres.`,
  falta_numero: 'Falta "numero": el identificador del pedido en la tienda. Es lo que evita que un reintento entre dos veces.',
  faltan_productos: 'Falta "productos": una lista con al menos un producto, cada uno con id, cantidad y precio.',
  producto_desconocido: 'Uno de los productos no existe en el sistema. Usá el "id" tal como viene en /catalogo.',
  cantidad_invalida: 'Cada "cantidad" tiene que ser un número mayor que cero.',
  precio_invalido: 'Cada "precio" tiene que ser un número de cero para arriba, unitario y con impuestos incluidos.',
  entrega_invalida: 'El tipo de entrega tiene que ser "retira" o "envio".',
  falta_el_comprador: 'Falta el nombre del comprador en "comprador.nombre".',
  pedido_invalido: 'El pedido está mal armado: revisá que los identificadores, las cantidades y los precios tengan el formato esperado.',
  numero_invalido: 'El número del pedido en el camino no se pudo leer. Mandalo codificado para URL, el mismo "numero" con el que se envió el pedido.',
  pedido_desconocido: 'No hay ningún pedido con ese número. Es el mismo "numero" con el que se envió el pedido, respetando mayúsculas.',
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
  cuerpo_invalido: 400,
  cuerpo_demasiado_grande: 413,
  falta_numero: 400,
  faltan_productos: 400,
  producto_desconocido: 400,
  cantidad_invalida: 400,
  precio_invalido: 400,
  entrega_invalida: 400,
  falta_el_comprador: 400,
  pedido_invalido: 400,
  numero_invalido: 400,
  pedido_desconocido: 404,
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
  /*
    El pedido de compra se resuelve en dos tiempos: primero la puerta
    —clave, camino, método—, que no necesita leer nada; después el
    cuerpo, que hay que esperar de la red. Así un pedido sin clave se
    rechaza sin haber leído un solo byte de lo que manda.
  */
  | { tipo: 'pedido'; funcion: 'api_tienda_registrar_pedido'; clave: string }
  | {
      tipo: 'consulta'
      funcion: 'api_tienda_estado_pedido'
      argumentos: { p_clave: string; p_numero: string }
    }
  | ErrorDeLaPuerta

export type ErrorDeLaPuerta = { tipo: 'error'; estado: number; codigo: CodigoDeError; detalle?: string }

function error(codigo: CodigoDeError, detalle?: string): ErrorDeLaPuerta {
  return { tipo: 'error', estado: ESTADO[codigo], codigo, detalle }
}

const RUTAS: Record<string, { metodo: string; parametros: string[] }> = {
  catalogo: { metodo: 'GET', parametros: ['desde', 'limite'] },
  clasificaciones: { metodo: 'GET', parametros: [] },
  pedidos: { metodo: 'POST', parametros: [] },
  // El estado de un pedido: /pedidos/{numero}. El número es de la tienda
  // y viaja en el camino, así que se lee aparte (ver interpretarPedido).
  'pedidos/*': { metodo: 'GET', parametros: [] },
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
  const completa = rutaDe(url)
  /*
    El número del pedido lo elige la tienda y puede traer cualquier
    cosa, incluso una barra codificada. Se toma todo lo que viene
    después de "pedidos/" y recién ahí se decodifica: partir el camino
    por las barras antes cortaría un número como "2026/0001".
  */
  const delPedido = /^pedidos\/(.+)$/.exec(completa)?.[1]
  const ruta = delPedido !== undefined ? 'pedidos/*' : completa
  const definicion = RUTAS[ruta]
  if (!definicion) return error('ruta_desconocida')
  // El método se mira antes que la clave: a la pregunta previa de un
  // navegador hay que contestarle que acá no, no pedirle credenciales.
  if (metodo !== definicion.metodo) return error('metodo_no_permitido', definicion.metodo)

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
    if (!definicion.parametros.includes(nombre)) return error('parametro_desconocido', nombre)
  }

  if (ruta === 'clasificaciones') {
    return { tipo: 'consulta', funcion: 'api_tienda_clasificaciones', argumentos: { p_clave: clave } }
  }

  if (ruta === 'pedidos') {
    return { tipo: 'pedido', funcion: 'api_tienda_registrar_pedido', clave }
  }

  if (delPedido !== undefined) {
    let numero: string
    try {
      numero = decodeURIComponent(delPedido)
    } catch {
      return error('numero_invalido')
    }
    if (numero.trim() === '') return error('numero_invalido')
    return { tipo: 'consulta', funcion: 'api_tienda_estado_pedido', argumentos: { p_clave: clave, p_numero: numero } }
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

export type CuerpoDelPedido = { tipo: 'cuerpo'; pedido: Record<string, unknown> } | ErrorDeLaPuerta

/*
  Lo único que se mira acá es que sea un objeto JSON: qué campos lleva
  y cuáles faltan lo decide la base, que es la que conoce las reglas
  del negocio. Dos lugares decidiendo lo mismo se contradicen solos.
*/
export function interpretarCuerpoDelPedido(texto: string): CuerpoDelPedido {
  if (texto.length > LIMITE_DEL_CUERPO) return error('cuerpo_demasiado_grande')
  if (texto.trim() === '') return error('cuerpo_invalido')

  let pedido: unknown
  try {
    pedido = JSON.parse(texto)
  } catch {
    return error('cuerpo_invalido')
  }

  if (typeof pedido !== 'object' || pedido === null || Array.isArray(pedido)) {
    return error('cuerpo_invalido')
  }
  return { tipo: 'cuerpo', pedido: pedido as Record<string, unknown> }
}

/*
  Los errores de pedido que la base conoce por nombre. El nombre viaja
  como mensaje del error PT400 y llega igual al desarrollador de la
  tienda: un nombre estable, que se puede mirar en el código de ellos
  sin leer castellano.
*/
const ERRORES_DE_LA_BASE: CodigoDeError[] = [
  'desde_invalido',
  'limite_invalido',
  'falta_numero',
  'faltan_productos',
  'producto_desconocido',
  'cantidad_invalida',
  'precio_invalido',
  'entrega_invalida',
  'falta_el_comprador',
  'pedido_invalido',
]

/*
  La base contesta los errores esperables con códigos propios —PT401,
  PT404 y PT400, que PostgREST convierte en 401, 404 y 400—. Todo lo
  demás es un error nuestro y se contesta como tal, sin pasarle afuera
  el detalle interno: puede nombrar tablas o funciones.
*/
export function interpretarErrorDeLaBase(
  cuerpo: { code?: string; message?: string; details?: string } | null,
): { estado: number; codigo: CodigoDeError; detalle?: string } {
  if (cuerpo?.code === 'PT401') return { estado: 401, codigo: 'clave_invalida' }
  if (cuerpo?.code === 'PT404' && cuerpo.message === 'pedido_desconocido') {
    return { estado: 404, codigo: 'pedido_desconocido' }
  }

  if (cuerpo?.code === 'PT400' && ERRORES_DE_LA_BASE.includes(cuerpo.message as CodigoDeError)) {
    const codigo = cuerpo.message as CodigoDeError
    /*
      El único detalle que sale es el identificador del producto que no
      existe, y es dato de ellos: lo mandaron ellos en el mismo pedido.
      El detalle de los demás errores es el mensaje crudo de Postgres.
    */
    const detalle = codigo === 'producto_desconocido' ? cuerpo.details || undefined : undefined
    return { estado: ESTADO[codigo], codigo, detalle }
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
  no en la página, donde cualquiera la podría copiar. Vale también para
  los pedidos: los manda el servidor de la tienda, no el comprador.
*/
export const CABECERAS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const
