/*
  ─────────────────────────────────────────────────────────────
  Las funciones del servidor que hablan con ARCA

  Los doce segundos de espera de lib/supabase.ts miden si el servidor
  está. Estas funciones, además, esperan a ARCA, que es otro servidor y
  anda a su ritmo: pedir un permiso nuevo a WSAA de homologación tardó
  diez segundos el 01/10 y uno y medio el 14/10, y a eso se suma lo
  demás. La primera factura del día —antes de las 9, cuando la tarea
  diaria todavía no renovó el permiso— puede pasar de los doce.

  Con doce, el pedido de CAE se cortaba justo cuando ARCA estaba
  contestando, y pasaban dos cosas:

  - el cajero leía «la factura quedó pendiente» mientras el servidor
    obtenía el CAE igual, sin nadie esperándolo;
  - el corte contaba como caída del servidor, y durante quince segundos
    la app trabajaba sin conexión: la venta siguiente se cobraba sin
    subir y la caja la facturaba con CAEA, con internet andando.

  Cada una de estas funciones tiene un plazo propio para ARCA —las de
  factura, veinticinco segundos; la del CUIT, dos esperas de doce— y
  contesta siempre antes de que pasen treinta y cinco, aunque ARCA no
  conteste: así lo que ve el cajero es lo que pasó. Si acá se espera
  menos que lo que tarda la función, vuelve el problema; por eso este
  número está anotado también en cada función, al lado de su plazo.

  Probado el 14/10 desde Facturación: el pedido de CAE tardó dieciséis
  segundos —WSAA tardó doce en contestar— y salió autorizado, sin que
  la app se diera por desconectada.

  Pasados los treinta y cinco sin respuesta, sí es el servidor el que
  no está, y cuenta como caída igual que cualquier otra consulta.
  ─────────────────────────────────────────────────────────────
*/
export const LIMITE_ARCA_MS = 35_000

const FUNCIONES_DE_ARCA = new Set([
  'arca-constancia',
  'arca-wsfe-solicitar-cae',
  'arca-wsfe-caea',
  /*
    No es de ARCA pero espera igual a otro servidor: el buscador de
    fotos y los sitios de donde baja cada una. Medido el 21/10: entre
    seis y ocho segundos por búsqueda, demasiado cerca de los doce.
  */
  'buscar-fotos',
])

/** Si el pedido va a una función del servidor que espera a ARCA. */
export function esFuncionDeArca(entrada: RequestInfo | URL): boolean {
  const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url
  const nombre = url.match(/\/functions\/v1\/([^/?#]+)/)?.[1]
  return !!nombre && FUNCIONES_DE_ARCA.has(nombre)
}
