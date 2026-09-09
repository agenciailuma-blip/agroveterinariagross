/*
  Por dónde sale el ticket.

  Hay dos caminos posibles, y la decisión no puede vivir suelta en cada
  pantalla: la caja, el remito y la prueba de Configuración tienen que
  elegir igual. Si cada una decidiera por su cuenta, el mismo ticket
  saldría por un lado desde una pantalla y por otro desde la de al lado,
  y nadie podría explicar por qué.

  El orden no es arbitrario:

  1. La impresora de Windows de ESTA terminal. Es la de Gross. La POS80
     está por USB en la caja y compartida desde ahí para los mostradores,
     así que no hay ninguna dirección de red a la que apuntar.
  2. La impresora de red del comercio, si alguna vez ponen una.
  3. Nada: entonces el comprobante sale por el diálogo de impresión, que
     es el camino que siempre tiene que quedar disponible.
*/

export type Destino =
  | { via: 'windows'; impresora: string }
  | { via: 'red'; host: string; puerto: number }

/** El puerto habitual de una impresora de red. */
const PUERTO_POR_OMISION = 9100

export function destinoDeImpresion(
  terminal: { impresora_windows?: string | null } | null | undefined,
  emisor?: { impresora_host?: string | null; impresora_puerto?: string | number | null },
): Destino | null {
  const impresora = terminal?.impresora_windows?.trim()
  if (impresora) return { via: 'windows', impresora }

  const host = emisor?.impresora_host?.trim()
  if (host) {
    return { via: 'red', host, puerto: Number(emisor?.impresora_puerto) || PUERTO_POR_OMISION }
  }

  return null
}

/*
  Cómo se le nombra el destino a la persona que está en el mostrador.

  Va acá y no en la pantalla porque lo usan tres: el botón de imprimir,
  el diagnóstico y el aviso de error. Tienen que llamarlo igual.
*/
export function nombreDelDestino(destino: Destino): string {
  return destino.via === 'windows' ? destino.impresora : `${destino.host}:${destino.puerto}`
}
