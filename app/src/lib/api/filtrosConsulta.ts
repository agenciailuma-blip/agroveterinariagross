import type { Filtros } from '@/lib/filtros'

/*
  Los filtros de la búsqueda avanzada, aplicados a la consulta de la base.

  Para las listas que traen sólo las últimas N filas: filtrar en la PC
  sólo buscaría entre esas N. Acá el filtro viaja a Supabase y la base
  devuelve las que cumplen, de cualquier fecha.
*/

/** Lo mínimo de una consulta de Supabase que usamos acá. */
export interface ConsultaFiltrable<Q> {
  gte(columna: string, valor: string): Q
  lte(columna: string, valor: string): Q
  lt(columna: string, valor: string): Q
  ilike(columna: string, patron: string): Q
  eq(columna: string, valor: string | number): Q
}

/** Qué columna de la tabla usa cada filtro. */
export interface ColumnasDeFiltro {
  /** Columna de fecha. Si es fecha y hora (`timestamptz`), marcar `fechaConHora`. */
  fecha?: string
  fechaConHora?: boolean
  persona?: string
  /** Columna numérica del número del papel. */
  numero?: string
  /** Columna de texto con el código (por ejemplo «MAY-000009»), si la hay. */
  codigo?: string
  /** Columna de texto con la serie («CAJA1»), para «CAJA1-26» o «1-26». */
  serie?: string
  /** Columna numérica del punto de venta, para «1-26» o «0001-00000026». */
  puntoVenta?: string
  estado?: string
}

/** Escapa los comodines de `ilike` para buscar el texto tal cual. */
export function textoParaIlike(s: string): string {
  return `%${s.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

// El día siguiente, para «hasta» con hora: todo lo del día cuenta.
function diaSiguiente(dia: string): string {
  const d = new Date(`${dia}T00:00:00`)
  d.setDate(d.getDate() + 1)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, '0')}`
}

/** Medianoche de acá, como instante: Argentina no tiene horario de verano. */
function inicioDelDia(dia: string): string {
  return `${dia}T00:00:00-03:00`
}

/**
  Lee lo escrito en «número o código»: el último grupo de dígitos es el
  número; si hay un grupo antes, la serie o el punto de venta.
  «REM CAJA1-00000026» → { numero: 26, serie: '1', letras: 'CAJA1' }.
*/
export function leerNumeroBuscado(texto: string): { numero: number | null; serie: string | null; letras: string | null } {
  const t = texto.trim().toUpperCase()
  const g = t.match(/\d+/g) ?? []
  if (g.length === 0) return { numero: null, serie: null, letras: null }
  const numero = Number(g[g.length - 1])
  const serie = g.length > 1 ? String(Number(g[g.length - 2])) : null
  // La serie de presupuestos, remitos y recibos va con letras: «CAJA1».
  const m = t.match(/([A-Z]+\d+)\s*-\s*\d+\s*$/)
  return { numero: Number.isFinite(numero) ? numero : null, serie, letras: m ? m[1] : null }
}

/** Aplica los filtros a una consulta de Supabase y la devuelve. */
export function aplicarFiltros<Q extends ConsultaFiltrable<Q>>(q: Q, f: Filtros, c: ColumnasDeFiltro): Q {
  if (c.fecha && f.desde) q = q.gte(c.fecha, c.fechaConHora ? inicioDelDia(f.desde) : f.desde)
  if (c.fecha && f.hasta) q = c.fechaConHora ? q.lt(c.fecha, inicioDelDia(diaSiguiente(f.hasta))) : q.lte(c.fecha, f.hasta)
  if (c.persona && f.persona.trim()) q = q.ilike(c.persona, textoParaIlike(f.persona))
  if (c.estado && f.estado) q = q.eq(c.estado, f.estado)

  const texto = f.numero.trim()
  if (texto) {
    const { numero, serie, letras } = leerNumeroBuscado(texto)
    if (c.numero && numero !== null) {
      q = q.eq(c.numero, numero)
      if (c.serie && letras) q = q.ilike(c.serie, letras)
      else if (c.serie && serie) q = q.ilike(c.serie, `%${serie}`)
      else if (c.puntoVenta && serie) q = q.eq(c.puntoVenta, Number(serie))
    } else if (c.codigo) {
      q = q.ilike(c.codigo, textoParaIlike(texto))
    }
  }
  return q
}
