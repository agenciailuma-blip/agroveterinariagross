/*
  ─────────────────────────────────────────────────────────────
  Buscar productos por palabras

  Pedido de Lucas del 25/11: buscaba «shampoo trad» y no aparecía
  «SHAMPOO  TRADIC PULG» (con dos espacios), y la lista cortaba a los 20
  primeros que encontraba, en cualquier orden.

  · Cada palabra escrita tiene que estar en el texto del producto
    (código y nombres), en cualquier orden. Los espacios de más dejan
    de importar.
  · Se ordena por parecido: el código exacto primero; después, cuantas
    más palabras del producto *empiezan* con lo escrito, más arriba
    («trad» pone TRADIC antes que CASTRADOS); a igual parecido, por
    nombre.
  · Se muestran hasta MAXIMO_RESULTADOS.

  Pura, sin base: la usan la búsqueda local y la del servidor, así las
  dos ordenan igual.
  ─────────────────────────────────────────────────────────────
*/

export const MAXIMO_RESULTADOS = 40

/** Sin acentos ni mayúsculas, igual que `normalizar` de la base local. */
function sinAcentos(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/** Lo escrito en el buscador, partido en palabras normalizadas. */
export function palabrasDeBusqueda(texto: string): string[] {
  return sinAcentos(texto).split(/\s+/).filter(Boolean)
}

/**
  Qué tan bien coincide un producto, o null si no coincide.
  `busqueda` es el texto del producto ya normalizado (código y nombres).
*/
export function puntajeDeBusqueda(
  busqueda: string,
  codigo: string,
  palabras: readonly string[],
  escrito: string,
): number | null {
  if (!palabras.length) return null
  if (!palabras.every((p) => busqueda.includes(p))) return null

  const delProducto = busqueda.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  let puntaje = 0
  for (const p of palabras) {
    puntaje += delProducto.some((w) => w.startsWith(p)) ? 2 : 1
  }
  // El código exacto gana siempre: el vendedor que lo sabe aprieta Enter.
  if (sinAcentos(codigo.trim()) === sinAcentos(escrito.trim())) puntaje += 1000
  return puntaje
}

/**
  Filtra, ordena por parecido y corta a MAXIMO_RESULTADOS.
  `datos` da, para cada item, su texto normalizado, el código y el nombre.
*/
export function ordenarPorParecido<T>(
  items: readonly T[],
  escrito: string,
  datos: (item: T) => { busqueda: string; codigo: string; nombre: string },
  maximo = MAXIMO_RESULTADOS,
): T[] {
  const palabras = palabrasDeBusqueda(escrito)
  const conPuntaje: { item: T; puntaje: number; nombre: string }[] = []
  for (const item of items) {
    const d = datos(item)
    const puntaje = puntajeDeBusqueda(d.busqueda, d.codigo, palabras, escrito)
    if (puntaje !== null) conPuntaje.push({ item, puntaje, nombre: d.nombre })
  }
  conPuntaje.sort((a, b) => b.puntaje - a.puntaje || a.nombre.localeCompare(b.nombre, 'es'))
  return conPuntaje.slice(0, maximo).map((c) => c.item)
}

/** El texto de búsqueda de un producto, igual que el que guarda la base local. */
export function textoDeBusqueda(codigo: string | null, nombreInterno: string | null, nombrePublico: string | null) {
  return sinAcentos(`${codigo ?? ''} ${nombreInterno ?? ''} ${nombrePublico ?? ''}`)
}
