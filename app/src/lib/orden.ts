/*
  Ordenar una tabla tocando el encabezado de la columna.

  Pedido de Lucas (23/11): en todas las pantallas con tablas, tocar
  «Número», «Fecha», «Cliente»… ordena por esa columna, con la flechita
  de siempre al lado. Primer toque ascendente (↑), segundo descendente
  (↓), y el tercero vuelve al orden en que vino la lista.

  Y que el sistema se acuerde del orden que eligió cada usuario en cada
  tabla, para no tener que ordenar de nuevo cada vez que entra. Se
  guarda en la PC (localStorage), con una clave que lleva el usuario y
  la tabla. Si un día hace falta que lo siga a otra PC, se pasa a la
  base sin cambiar las pantallas: sólo cambian `leerOrden` y
  `guardarOrden`.

  Acá vive sólo la lógica, sin React, para poder probarla sola. El hook
  está en `useOrden.ts` y el encabezado en `EncabezadoOrdenable.tsx`.
*/

export type Sentido = 'asc' | 'desc'

/** El orden elegido. `null` es «como vino la lista». */
export type Orden = { columna: string; sentido: Sentido } | null

/**
  Lo que se compara de cada fila. Un número (importe, cantidad), una
  fecha (`Date` o texto ISO «2026-11-19» / «2026-11-19T10:00»), un texto,
  o nada: lo vacío va siempre al final, se ordene para donde se ordene.
*/
export type Valor = string | number | Date | boolean | null | undefined

/** Cómo sacar el valor de cada columna. La clave es el id de la columna. */
export type Columnas<T> = Record<string, (fila: T) => Valor>

/** Toque en el encabezado: ascendente → descendente → como vino. */
export function siguienteOrden(actual: Orden, columna: string): Orden {
  if (!actual || actual.columna !== columna) return { columna, sentido: 'asc' }
  if (actual.sentido === 'asc') return { columna, sentido: 'desc' }
  return null
}

// Un texto ISO de fecha: «2026-11-19», con hora o sin ella.
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/

/*
  Un solo comparador para todo, con las reglas de acá:
  - los nombres se ordenan como en la guía telefónica: sin importar
    mayúsculas ni acentos («Álvarez» junto a «alvarez», antes que «Benítez»);
  - los números que vienen adentro del texto se ordenan como números
    («REM CAJA1-00000009» antes que «REM CAJA1-00000010», «Caja 2» antes
    que «Caja 10»);
  - las fechas, por fecha y no por cómo se escriben;
  - los importes, como número.
*/
const intl = new Intl.Collator('es', { sensitivity: 'base', numeric: true })

function vacio(v: Valor): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (typeof v === 'number' && Number.isNaN(v))
}

function aComparable(v: Valor): number | string {
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'number') return v
  const s = String(v)
  if (FECHA_ISO.test(s)) {
    const t = Date.parse(s.length === 10 ? `${s}T00:00:00` : s)
    if (!Number.isNaN(t)) return t
  }
  return s
}

/** Compara dos valores en sentido ascendente. Lo vacío, al final. */
export function compararValores(a: Valor, b: Valor): number {
  const va = vacio(a)
  const vb = vacio(b)
  if (va || vb) return va === vb ? 0 : va ? 1 : -1
  const ca = aComparable(a)
  const cb = aComparable(b)
  if (typeof ca === 'number' && typeof cb === 'number') return ca - cb
  return intl.compare(String(ca), String(cb))
}

/**
  Devuelve una copia ordenada. Si no hay orden, o la columna ya no existe
  (una pantalla que la sacó), la lista queda como vino. Las filas iguales
  conservan su orden original, así un segundo orden no las desordena.
*/
export function ordenarFilas<T>(filas: readonly T[], orden: Orden, columnas: Columnas<T>): T[] {
  if (!orden || !columnas[orden.columna]) return [...filas]
  const sacar = columnas[orden.columna]
  const signo = orden.sentido === 'asc' ? 1 : -1
  return filas
    .map((fila, i) => ({ fila, i, v: sacar(fila) }))
    .sort((x, y) => {
      // Lo vacío queda al final también en descendente.
      const xv = vacio(x.v)
      const yv = vacio(y.v)
      if (xv || yv) return xv === yv ? x.i - y.i : xv ? 1 : -1
      return compararValores(x.v, y.v) * signo || x.i - y.i
    })
    .map((x) => x.fila)
}

/* ---------- Lo que se acuerda cada usuario ---------- */

/** La clave en la PC: una por usuario y por tabla. */
export function claveOrden(usuarioId: string | null | undefined, tablaId: string): string {
  return `gross.orden.${usuarioId || 'sin-usuario'}.${tablaId}`
}

/** El almacenamiento de la PC, o nada si el navegador no lo deja usar. */
type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function almacenDeLaPc(): Almacen | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** Lee el orden guardado. Cualquier cosa rara (vacío, roto, bloqueado) es «como vino». */
export function leerOrden(clave: string, almacen: Almacen | null = almacenDeLaPc()): Orden {
  try {
    const crudo = almacen?.getItem(clave)
    if (!crudo) return null
    const o = JSON.parse(crudo) as { columna?: unknown; sentido?: unknown }
    if (typeof o?.columna === 'string' && (o.sentido === 'asc' || o.sentido === 'desc')) {
      return { columna: o.columna, sentido: o.sentido }
    }
    return null
  } catch {
    return null
  }
}

/** Guarda el orden; «como vino» borra la clave. Si la PC no deja guardar, no pasa nada. */
export function guardarOrden(clave: string, orden: Orden, almacen: Almacen | null = almacenDeLaPc()): void {
  try {
    if (!almacen) return
    if (orden) almacen.setItem(clave, JSON.stringify(orden))
    else almacen.removeItem(clave)
  } catch {
    // Navegador en modo privado o sin lugar: se ordena igual, sólo que no se recuerda.
  }
}
