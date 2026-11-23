/*
  Búsqueda avanzada: por fechas, por cliente o proveedor, por número o
  código, y por estado.

  Pedido de Lucas (23/11), empezando por Remito logístico y siguiendo
  por cada pantalla que la necesite. El panel es uno solo
  (`PanelDeFiltros.tsx`) y cada pantalla elige qué campos muestra.

  Dos maneras de aplicar el filtro, según la lista:
  - Si la pantalla ya tiene la lista entera, se filtra acá, en la PC
    (`filtrarFilas`).
  - Si la consulta trae sólo las últimas N filas (los remitos, las
    facturas…), el filtro tiene que ir a la base; si no, buscar un
    remito de agosto no lo encontraría nunca. Eso lo hace
    `api/filtrosConsulta.ts`, con las mismas reglas.
*/

export interface Filtros {
  /** Fecha desde, «AAAA-MM-DD», inclusive. */
  desde: string
  /** Fecha hasta, «AAAA-MM-DD», inclusive. */
  hasta: string
  /** Parte del nombre del cliente o del proveedor. */
  persona: string
  /** Número o código: «26», «1-26», «0001-00000026», «REM CAJA1-26», «MAY-9». */
  numero: string
  /** Uno de los estados que ofrece la pantalla; vacío es «todos». */
  estado: string
}

export const FILTROS_VACIOS: Filtros = { desde: '', hasta: '', persona: '', numero: '', estado: '' }

export function hayFiltros(f: Filtros): boolean {
  return !!(f.desde || f.hasta || f.persona.trim() || f.numero.trim() || f.estado)
}

/** Cuántos filtros hay puestos (para el cartelito del panel plegado). */
export function cuantosFiltros(f: Filtros): number {
  return [f.desde || f.hasta, f.persona.trim(), f.numero.trim(), f.estado].filter(Boolean).length
}

/** Minúsculas y sin acentos: «PÉREZ» y «perez» son la misma persona. */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Los grupos de dígitos de un texto, sin ceros adelante: «REM CAJA1-00000026» → ['1', '26'].
function grupos(s: string): string[] {
  return (s.match(/\d+/g) ?? []).map((g) => g.replace(/^0+(?=\d)/, ''))
}

/**
  ¿El número de un papel coincide con lo que se buscó?

  Con dígitos, se compara por número y no por cómo está escrito: «26»
  encuentra «REM CAJA1-00000026» pero no «…-00000126»; «1-26» o
  «CAJA1-26» piden además el punto de venta o la serie. Sin dígitos (un
  código con letras), basta con que aparezca adentro.
*/
export function coincideNumero(numeroDelPapel: string | null | undefined, buscado: string): boolean {
  const b = buscado.trim()
  if (!b) return true
  if (!numeroDelPapel) return false
  const gb = grupos(b)
  if (gb.length === 0) return normalizar(numeroDelPapel).includes(normalizar(b))
  const gp = grupos(numeroDelPapel)
  if (gp.length > 0 && gp[gp.length - 1] === gb[gb.length - 1] && gb.every((g) => gp.includes(g))) return true
  // Un código de barras escrito en parte (seis dígitos seguidos o más):
  // ahí sí vale que aparezca adentro. Con menos, «26» encontraría el 126.
  if (!/\d{6,}/.test(b)) return false
  return normalizar(numeroDelPapel).replace(/\s+/g, '').includes(normalizar(b).replace(/\s+/g, ''))
}

/** De una fecha (Date o texto ISO) a «AAAA-MM-DD», en la hora de acá. */
export function diaDe(fecha: string | Date | null | undefined): string | null {
  if (!fecha) return null
  if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha
  if (Number.isNaN(d.getTime())) return null
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dia}`
}

/** Qué campo de la fila usa cada filtro. Lo que no se indica, no filtra. */
export interface CamposDeFiltro<T> {
  fecha?: (f: T) => string | Date | null | undefined
  persona?: (f: T) => string | null | undefined
  /** Puede devolver varios: el número del papel y el código de la venta, por ejemplo. */
  numero?: (f: T) => string | null | undefined | (string | null | undefined)[]
  estado?: (f: T) => string | null | undefined
}

/** Filtra en la PC una lista que ya está entera. */
export function filtrarFilas<T>(filas: readonly T[], f: Filtros, campos: CamposDeFiltro<T>): T[] {
  if (!hayFiltros(f)) return [...filas]
  const persona = normalizar(f.persona)
  return filas.filter((fila) => {
    if ((f.desde || f.hasta) && campos.fecha) {
      const d = diaDe(campos.fecha(fila))
      if (!d) return false
      if (f.desde && d < f.desde) return false
      if (f.hasta && d > f.hasta) return false
    }
    if (persona && campos.persona && !normalizar(campos.persona(fila) ?? '').includes(persona)) return false
    if (f.numero.trim() && campos.numero) {
      const v = campos.numero(fila)
      const lista = Array.isArray(v) ? v : [v]
      if (!lista.some((n) => coincideNumero(n, f.numero))) return false
    }
    if (f.estado && campos.estado && campos.estado(fila) !== f.estado) return false
    return true
  })
}
