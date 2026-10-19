import type { FilaImportada } from '@/lib/importacion/planilla'

/*
  ─────────────────────────────────────────────────────────────
  Qué va a hacer la importación, antes de hacerla

  Pedido del 19/10: que importar sea exacto e informativo, y que no pase
  lo que pasa en otros sistemas, donde una planilla subida sin cuidado
  cambia o borra todo el catálogo. Por eso, antes de mandar nada:

  · se separan los que son nuevos de los que ya están;
  · de los que ya están, se dice QUÉ cambia en cada uno —el precio de
    $12.500 a $13.000—, y los que no cambian no viajan;
  · la persona elige con casillas: crear los nuevos o no, tocar los que
    ya están o no, y de ésos, qué datos.

  Y lo que ya era así se mantiene: **nada se borra** —un producto que no
  está en la planilla queda como está— y **una celda vacía no borra** el
  dato que había.

  La comparación es contra lo que la base tenía al abrir la planilla. Si
  alguien edita un producto en el medio, la base aplica igual lo que se
  eligió: lo que se ve acá es un resumen fiel, no un candado.
  ─────────────────────────────────────────────────────────────
*/

/** Un dato que se puede elegir actualizar o no. Puede abarcar varias columnas. */
export interface GrupoDeDatos<C extends string> {
  id: string
  etiqueta: string
  campos: C[]
  /*
    Cómo se lee en lo que ya está y en la planilla, para comparar. Sin
    `actual` el dato no se puede comparar —el aviso de stock vive en otra
    tabla—: si la planilla lo trae, se manda, y la pantalla lo dice así.
  */
  actual?: (registro: Registro) => string | null
  nuevo?: (datos: Partial<Record<C, string>>) => string | null
  /** Cómo se muestra. Por defecto, tal cual. */
  mostrar?: (valor: string) => string
}

export type Registro = Record<string, unknown>

export interface Comparador<C extends string> {
  grupos: GrupoDeDatos<C>[]
  /** El que ya está en el sistema para esta fila, si hay. */
  buscar: (datos: Partial<Record<C, string>>, indice: Indice) => Registro | null
  /** Cómo se arma el índice de lo que ya está. */
  indexar: (registros: Registro[]) => Indice
  /** Las columnas que viajan siempre, porque son las que dicen quién es. */
  claves: C[]
  /** Cómo se nombra el registro en la lista de cambios. */
  nombre: (registro: Registro) => string
}

export type Indice = Map<string, Registro>

export interface Cambio {
  grupo: string
  etiqueta: string
  antes: string | null
  despues: string | null
  /** false si no se pudo comparar: se manda igual si se elige. */
  comparado: boolean
}

export interface Existente<C extends string> {
  fila: FilaImportada<C>
  registro: Registro
  cambios: Cambio[]
}

export interface Clasificacion<C extends string> {
  nuevos: FilaImportada<C>[]
  existentes: Existente<C>[]
}

/** Lo que vino en la planilla para un grupo, si vino algo. */
function vinoAlgo<C extends string>(g: GrupoDeDatos<C>, datos: Partial<Record<C, string>>): boolean {
  return g.campos.some((c) => datos[c] !== undefined && datos[c] !== '')
}

export function clasificar<C extends string>(
  filas: FilaImportada<C>[],
  registros: Registro[],
  comparador: Comparador<C>,
): Clasificacion<C> {
  const indice = comparador.indexar(registros)
  const nuevos: FilaImportada<C>[] = []
  const existentes: Existente<C>[] = []

  for (const fila of filas) {
    const registro = comparador.buscar(fila.datos, indice)
    if (!registro) {
      nuevos.push(fila)
      continue
    }
    const cambios: Cambio[] = []
    for (const g of comparador.grupos) {
      if (!vinoAlgo(g, fila.datos)) continue
      if (!g.actual || !g.nuevo) {
        cambios.push({ grupo: g.id, etiqueta: g.etiqueta, antes: null, despues: null, comparado: false })
        continue
      }
      const antes = g.actual(registro)
      const despues = g.nuevo(fila.datos)
      if (despues === null || despues === antes) continue
      const ver = g.mostrar ?? ((v: string) => v)
      cambios.push({
        grupo: g.id,
        etiqueta: g.etiqueta,
        antes: antes === null ? null : ver(antes),
        despues: ver(despues),
        comparado: true,
      })
    }
    existentes.push({ fila, registro, cambios })
  }

  return { nuevos, existentes }
}

export interface Opciones {
  crearNuevos: boolean
  actualizarExistentes: boolean
  /** Los grupos que se actualizan en los que ya están. */
  grupos: Set<string>
}

export interface EstadoOpciones {
  crearNuevos: boolean
  /* null mientras no se eligió: con eso el botón de importar no anda. */
  actualizarExistentes: boolean | null
  grupos: Set<string>
}

export function opcionesIniciales(): EstadoOpciones {
  return { crearNuevos: true, actualizarExistentes: null, grupos: new Set() }
}

/** Las opciones como las usa armarEnvio(); sin elegir, no se toca lo que ya está. */
export function aOpciones(e: EstadoOpciones): Opciones {
  return { crearNuevos: e.crearNuevos, actualizarExistentes: e.actualizarExistentes === true, grupos: e.grupos }
}

/*
  Lo que viaja a la base, según lo que se eligió.

  De los que ya están viaja sólo lo que cambia y se eligió, más las
  columnas que dicen quién es. Como la base no toca lo que no viene, un
  producto al que se le eligió «sólo el precio» conserva su nombre
  aunque la planilla traiga otro.
*/
export function armarEnvio<C extends string>(
  c: Clasificacion<C>,
  o: Opciones,
  comparador: Comparador<C>,
): FilaImportada<C>[] {
  const envio: FilaImportada<C>[] = []
  if (o.crearNuevos) envio.push(...c.nuevos)
  if (!o.actualizarExistentes) return envio

  for (const e of c.existentes) {
    const elegidos = e.cambios.filter((x) => o.grupos.has(x.grupo))
    if (!elegidos.length) continue
    const datos: Partial<Record<C, string>> = {}
    for (const clave of comparador.claves) {
      if (e.fila.datos[clave] !== undefined) datos[clave] = e.fila.datos[clave]
    }
    for (const x of elegidos) {
      const g = comparador.grupos.find((g) => g.id === x.grupo)!
      for (const campo of g.campos) {
        if (e.fila.datos[campo] !== undefined) datos[campo] = e.fila.datos[campo]
      }
    }
    envio.push({ ...e.fila, datos })
  }
  // En el orden del archivo, que es en el que se van a leer los resultados.
  return envio.sort((a, b) => a.linea - b.linea)
}

/** Cuántos de los que ya están cambian en cada grupo. */
export function cuantosCambian<C extends string>(c: Clasificacion<C>): Map<string, number> {
  const n = new Map<string, number>()
  for (const e of c.existentes) for (const x of e.cambios) n.set(x.grupo, (n.get(x.grupo) ?? 0) + 1)
  return n
}

// ───────────────────────────────────────────────────────────────
// Cómo se comparan los valores
// ───────────────────────────────────────────────────────────────

/** Un texto, sin espacios de más. Las mayúsculas cuentan: es un cambio que se ve. */
export const texto = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const t = String(v).replace(/\s+/g, ' ').trim()
  return t || null
}

/** Un número, con dos decimales, para que 12500 y 12500.00 sean lo mismo. */
export const importe = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(2) : null
}

/** Sí o no, como lo escribe una persona. */
export const siNo = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'boolean') return v ? 'sí' : 'no'
  const t = String(v).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (['si', 's', 'x', '1', 'true', 'verdadero'].includes(t)) return 'sí'
  if (['no', 'n', '0', 'false', 'falso'].includes(t)) return 'no'
  return null
}

const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
export const mostrarPesos = (v: string) => pesos.format(Number(v)).replace(/ /g, ' ')
export const mostrarNumero = (v: string) => Number(v).toLocaleString('es-AR')
