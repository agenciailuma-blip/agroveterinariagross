/*
  ─────────────────────────────────────────────────────────────
  Qué hay que bajar en esta vuelta

  La PC le pregunta una sola vez a la base qué cambió (que_cambio) y baja
  sólo eso. Antes preguntaba tabla por tabla, cada minuto, aunque no
  hubiera nada: con eso se pasaron los cupos del servidor (28/11).

  La regla de fondo: ante la duda, se baja. Si la respuesta no llega o no
  se entiende, la vuelta baja todo, como siempre.

  Acá está sólo lo que se decide, sin red ni base, para poder probarlo.
  ─────────────────────────────────────────────────────────────
*/

export interface Novedades {
  /** Las tablas del servidor con cambios desde el cursor de esta PC. */
  cambiaron: string[]
  generacion: string
  /** Huella de las ventas que esperan cobro y de sus renglones (huellaDeLaCola). */
  cola: string
  /** El último código de venta de esta terminal. */
  venta: string | null
  /** El último número de cada comprobante propio en la serie de esta terminal. */
  noFiscal: Record<string, number>
}

export function leerNovedades(data: unknown): Novedades | null {
  if (!data || typeof data !== 'object') return null
  const r = data as Record<string, unknown>
  if (!Array.isArray(r.cambiaron) || typeof r.generacion !== 'string' || typeof r.cola !== 'string') return null
  if (!r.no_fiscal || typeof r.no_fiscal !== 'object') return null
  return {
    cambiaron: r.cambiaron.map(String),
    generacion: r.generacion,
    cola: r.cola,
    venta: typeof r.venta === 'string' ? r.venta : null,
    noFiscal: r.no_fiscal as Record<string, number>,
  }
}

export function hayQueBajar(novedades: Novedades | null, origen: string): boolean {
  return !novedades || novedades.cambiaron.includes(origen)
}

type ConFecha = { id: string; actualizado_en?: unknown }

/** La misma huella que arma que_cambio, hecha con las filas bajadas. */
export function huellaDeLaCola(ventas: ConFecha[], lineas: ConFecha[]): string {
  return [...ventas, ...lineas]
    .map((f) => `${f.id}@${f.actualizado_en}`)
    .sort()
    .join(',')
}

/*
  Si la cola quedó como la describía la respuesta.

  La huella se toma al empezar la vuelta y la cola se baja al final. Una
  venta que entra en el medio se baja, pero la huella no la nombra: si se
  la diera por vista y después saliera de la cola, la huella volvería a
  ser la misma y esa venta quedaría en la pantalla del cajero, ya
  cobrada. Lo mismo con una que llegue por la red del local mientras
  tanto. Ante cualquier diferencia no se guarda la marca, y la vuelta
  siguiente baja de nuevo.
*/
export function quedoComoSeDescribio(
  huellaDelServidor: string,
  bajada: { ventas: ConFecha[]; lineas: ConFecha[] },
  ventasEnEstaPc: { id: string }[],
): boolean {
  if (huellaDeLaCola(bajada.ventas, bajada.lineas) !== huellaDelServidor) return false
  const delServidor = new Set(bajada.ventas.map((v) => v.id))
  return ventasEnEstaPc.length === delServidor.size && ventasEnEstaPc.every((v) => delServidor.has(v.id))
}

/*
  Cómo está la cola en esta PC.

  Que en el servidor no haya cambiado no alcanza: acá pudo cobrarse una
  venta, llegar una por la red del local o terminar de subir un cobro, y
  cualquiera de las tres pide volver a conciliar. Por eso se guarda junto
  a la huella del servidor.
*/
export function marcaDeLaCola(
  huellaDelServidor: string,
  ventas: { id: string; estado: string; total?: unknown; actualizado_en?: unknown }[],
  lineas: { id: string; cantidad?: unknown; precio_unitario?: unknown }[],
  lotesPendientes: Set<string>,
): string {
  const deLasVentas = ventas
    .map((v) => [v.id, v.estado, v.total, v.actualizado_en, lotesPendientes.has(v.id) ? 'sin_subir' : ''].join(':'))
    .sort()
  const deLosRenglones = lineas.map((l) => [l.id, l.cantidad, l.precio_unitario].join(':')).sort()
  return JSON.stringify([huellaDelServidor, deLasVentas, deLosRenglones])
}

/** Los códigos de ARCA no tienen fecha de cambio: se piden al abrir y cada tanto. */
export const CADA_CUANTO_LOS_CATALOGOS_MS = 6 * 60 * 60 * 1000

export function tocanLosCatalogos(ultimaVez: number, ahora: number): boolean {
  return ahora - ultimaVez >= CADA_CUANTO_LOS_CATALOGOS_MS
}
