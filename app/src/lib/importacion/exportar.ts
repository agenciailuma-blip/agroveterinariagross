import type { DefinicionPlanilla } from '@/lib/importacion/planilla'

/*
  ─────────────────────────────────────────────────────────────
  Bajar la planilla para volver a subirla

  Pedido del 21/10: lo que se exporta de un maestro —productos,
  clientes, proveedores— tiene que servir de plantilla. Se baja, se
  corrige en Excel y se sube por el importador, que dice antes qué
  cambia y deja elegir.

  Por eso las columnas salen de la misma definición que lee el
  importador, con el mismo nombre de campo como encabezado: si mañana se
  agrega una columna al importador y no a la descarga, o se escribe
  distinto, la prueba de ida y vuelta lo dice.

  Es un Excel de verdad (.xlsx) y no un CSV: así los números viajan como
  números. En un CSV, un peso de 0,125 kg vuelve como «0,125», que el
  importador —con razón, en una lista de precios— lee como 125.

  Los movimientos —ventas, facturas, cobros— no se bajan por acá: se
  miran o van al contador, pero no se vuelven a subir. Cada uno pasa por
  sus reglas (ARCA, stock, caja) y una planilla se las saltearía.
  ─────────────────────────────────────────────────────────────
*/

export type Celda = string | number | null

/** Una columna de la planilla: qué campo del importador es y de dónde sale el valor. */
export interface Columna<C extends string, R> {
  campo: C
  valor: (registro: R) => Celda
  /** Ancho en caracteres, para que se lea sin tener que estirar. */
  ancho?: number
}

/** La hoja entera: el encabezado con los nombres del importador, y una fila por registro. */
export function armarHoja<C extends string, R>(
  def: DefinicionPlanilla<C>,
  columnas: Columna<C, R>[],
  registros: R[],
): Celda[][] {
  return [columnas.map((c) => def.campos[c.campo]), ...registros.map((r) => columnas.map((c) => limpiar(c.valor(r))))]
}

function limpiar(v: Celda): Celda {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const t = String(v).trim()
  return t === '' ? null : t
}

/** Un número de la base —que llega como texto— o nada. */
export function numeroDe(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export const siNoDe = (v: unknown): string | null => (v === null || v === undefined ? null : v ? 'Sí' : 'No')

/** El nombre del archivo, con la fecha: «productos-2026-10-21.xlsx». */
export function nombreDeArchivo(que: string, hoy = new Date()): string {
  const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  return `${que}-${fecha}.xlsx`
}

/** El archivo .xlsx, con el encabezado en negrita y fijo arriba. */
export async function aExcel(hoja: Celda[][], anchos: (number | undefined)[] = []): Promise<Blob> {
  // Carga diferida: la librería sólo hace falta al bajar.
  const { default: escribir } = await import('write-excel-file/universal')
  const datos = hoja.map((fila, i) =>
    fila.map((v) => {
      if (v === null) return null
      if (typeof v === 'number') return { value: v, type: Number }
      return i === 0 ? { value: v, type: String, fontWeight: 'bold' as const } : { value: v, type: String }
    }),
  )
  return escribir(datos, { columns: anchos.map((w) => ({ width: w ?? 14 })), stickyRowsCount: 1 }).toBlob()
}

/*
  Bajar el archivo. Igual que los del contador: un enlace que se toca
  solo. En el programa instalado lo resuelve el sistema.
*/
export function descargar(nombre: string, archivo: Blob) {
  const url = URL.createObjectURL(archivo)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function bajarPlanilla<C extends string, R>(
  que: string,
  def: DefinicionPlanilla<C>,
  columnas: Columna<C, R>[],
  registros: R[],
) {
  const hoja = armarHoja(def, columnas, registros)
  descargar(nombreDeArchivo(que), await aExcel(hoja, columnas.map((c) => c.ancho)))
}
