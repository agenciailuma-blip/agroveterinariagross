import { supabase } from '@/lib/supabase'
import { sumarDias } from '@/lib/api/cheques'
import type { Celda, ColumnaDeListado, Listado } from '@/lib/importacion/exportar'

/*
  ─────────────────────────────────────────────────────────────
  Los reportes avanzados

  Lo pidió Gross el 23/11: cuánto vale la mercadería en stock, las
  ventas por rubro de ARCA y las ventas online. Se sumaron la mercadería
  parada y el margen, que salen de los mismos datos.

  La base devuelve los renglones por producto —`reporte_mercaderia` y
  `reporte_ventas`— y acá se arma cada corte. Son cientos de filas: así
  cambiar de corte o de días no vuelve a preguntar al servidor.

  ─── LO QUE HAY QUE SABER PARA LEER LOS NÚMEROS ───

  · Costo y precio son los de hoy y los dos van CON IVA, que es como los
    guarda el sistema. El margen compara lo mismo con lo mismo.
  · El margen usa el costo de hoy, no el del día de la venta: la venta no
    guarda el costo. Es una aproximación y la pantalla lo dice.
  · Un producto sin costo cargado no entra en el valor a costo ni en el
    margen. Nunca se lo cuenta como cero: se lo cuenta aparte y se dice
    cuántos son, para que nadie lea un total más bajo sin saber por qué.
  ─────────────────────────────────────────────────────────────
*/

const n = (x: unknown) => Number(x ?? 0)
const nulo = (x: unknown) => (x === null || x === undefined ? null : Number(x))

/* ═══════════════════════ La mercadería ═══════════════════════ */

export interface ProductoEnStock {
  id: string
  codigo: string
  nombre: string
  categoria: string | null
  rubro_arca_id: number | null
  proveedor: string | null
  cantidad: number
  costo: number | null
  precio: number | null
  ultima_venta: string | null
  ultima_entrada: string | null
}

export interface ValorDeDeposito {
  nombre: string
  principal: boolean
  unidades: number
  valor_costo: number
  valor_venta: number
  sin_costo: number
}

export interface Mercaderia {
  hoy: string
  primera_venta: string | null
  productos: ProductoEnStock[]
  depositos: ValorDeDeposito[]
}

export async function obtenerMercaderia(): Promise<Mercaderia> {
  const { data, error } = await supabase.rpc('reporte_mercaderia')
  if (error) throw new Error(error.message)
  const m = data as Mercaderia
  return {
    hoy: m.hoy,
    primera_venta: m.primera_venta,
    productos: m.productos.map((p) => ({
      ...p,
      cantidad: n(p.cantidad),
      costo: nulo(p.costo),
      precio: nulo(p.precio),
    })),
    depositos: m.depositos.map((d) => ({
      ...d,
      unidades: n(d.unidades),
      valor_costo: n(d.valor_costo),
      valor_venta: n(d.valor_venta),
      sin_costo: n(d.sin_costo),
    })),
  }
}

export interface ValorDelStock {
  /** Productos con stock positivo. */
  productos: number
  unidades: number
  /** Lo que costó lo que hay, sólo de los productos con costo cargado. */
  valor_costo: number
  /** Lo que vale vendido a precio de lista, de todos los que tienen precio. */
  valor_venta: number
  /**
   * Lo que vale vendido, pero sólo de los que tienen costo. Contra este
   * se calcula la ganancia: restarle el costo al valor de venta de TODOS
   * daría una ganancia inflada por los productos que no tienen costo.
   */
  valor_venta_con_costo: number
  ganancia: number
  sin_costo: number
  sin_precio: number
  /** Stock en negativo: se vendió sin haber entrado. No suma, se avisa. */
  negativos: number
}

export function valorDelStock(productos: ProductoEnStock[]): ValorDelStock {
  const v: ValorDelStock = {
    productos: 0, unidades: 0, valor_costo: 0, valor_venta: 0, valor_venta_con_costo: 0,
    ganancia: 0, sin_costo: 0, sin_precio: 0, negativos: 0,
  }
  for (const p of productos) {
    if (p.cantidad < 0) {
      v.negativos++
      continue
    }
    if (p.cantidad === 0) continue
    v.productos++
    v.unidades += p.cantidad
    if (p.precio !== null) v.valor_venta += p.cantidad * p.precio
    else v.sin_precio++
    if (p.costo !== null) {
      v.valor_costo += p.cantidad * p.costo
      if (p.precio !== null) v.valor_venta_con_costo += p.cantidad * p.precio
    } else {
      v.sin_costo++
    }
  }
  v.ganancia = v.valor_venta_con_costo - v.valor_costo
  return v
}

export type CorteDeStock = 'categoria' | 'proveedor' | 'rubro'

export const CORTES_DE_STOCK: Record<CorteDeStock, string> = {
  categoria: 'Categoría',
  proveedor: 'Proveedor',
  rubro: 'Rubro ARCA',
}

export interface FilaDeValor {
  nombre: string
  productos: number
  unidades: number
  valor_costo: number
  valor_venta: number
  sin_costo: number
}

export function valorPor(
  productos: ProductoEnStock[],
  corte: CorteDeStock,
  rubros: Rubro[] = [],
): FilaDeValor[] {
  const nombreDeRubro = new Map(rubros.map((r) => [r.id, r.descripcion]))
  const grupos = new Map<string, FilaDeValor>()
  for (const p of productos) {
    if (p.cantidad <= 0) continue
    const nombre =
      corte === 'categoria'
        ? p.categoria ?? 'Sin categoría'
        : corte === 'proveedor'
          ? p.proveedor ?? 'Sin proveedor'
          : p.rubro_arca_id === null
            ? SIN_RUBRO
            : nombreDeRubro.get(p.rubro_arca_id) ?? String(p.rubro_arca_id)
    const g = grupos.get(nombre) ?? {
      nombre, productos: 0, unidades: 0, valor_costo: 0, valor_venta: 0, sin_costo: 0,
    }
    g.productos++
    g.unidades += p.cantidad
    if (p.precio !== null) g.valor_venta += p.cantidad * p.precio
    if (p.costo !== null) g.valor_costo += p.cantidad * p.costo
    else g.sin_costo++
    grupos.set(nombre, g)
  }
  return [...grupos.values()].sort((a, b) => b.valor_venta - a.valor_venta)
}

/* ─── La mercadería parada ─── */

export const DIAS_PARADA = [60, 90, 180] as const

const diasEntre = (desde: string, hasta: string) =>
  Math.round(
    (Date.UTC(...partes(hasta)) - Date.UTC(...partes(desde))) / 86_400_000,
  )

function partes(f: string): [number, number, number] {
  const [a, m, d] = f.slice(0, 10).split('-').map(Number)
  return [a, m - 1, d]
}

/*
  Cuántos días lleva quieto un producto: desde lo último que pasó, la
  última venta o la última vez que entró mercadería nueva. Uno que
  llegó la semana pasada no está parado aunque nunca se haya vendido.

  Si no hay ni venta ni entrada registrada, se cuenta desde la primera
  venta del sistema: antes de eso no hay forma de saber. Por eso la
  pantalla dice «sin ventas desde el 13/08» y no «nunca se vendió».
*/
export function diasQuieto(
  p: Pick<ProductoEnStock, 'ultima_venta' | 'ultima_entrada'>,
  hoy: string,
  primeraVenta: string | null,
): number | null {
  const fechas = [p.ultima_venta, p.ultima_entrada].filter((f): f is string => !!f)
  const desde = fechas.length > 0 ? fechas.sort().at(-1)! : primeraVenta
  if (!desde) return null
  return Math.max(0, diasEntre(desde, hoy))
}

export interface ProductoParado extends ProductoEnStock {
  dias: number
  /** A costo si lo tiene; si no, a precio de venta. `a_costo` dice cuál. */
  valor: number
  a_costo: boolean
}

export function mercaderiaParada(m: Mercaderia, dias: number): ProductoParado[] {
  const filas: ProductoParado[] = []
  for (const p of m.productos) {
    if (p.cantidad <= 0) continue
    const d = diasQuieto(p, m.hoy, m.primera_venta)
    if (d === null || d < dias) continue
    const a_costo = p.costo !== null
    filas.push({
      ...p,
      dias: d,
      a_costo,
      valor: p.cantidad * (p.costo ?? p.precio ?? 0),
    })
  }
  return filas.sort((a, b) => b.valor - a.valor)
}

export function totalesParada(filas: ProductoParado[]) {
  let a_costo = 0
  let a_precio = 0
  for (const f of filas) {
    if (f.costo !== null) a_costo += f.cantidad * f.costo
    if (f.precio !== null) a_precio += f.cantidad * f.precio
  }
  return { productos: filas.length, a_costo, a_precio }
}

/* ═══════════════════════ Las ventas ═══════════════════════ */

export type Canal = 'local' | 'online' | 'mayorista'

export const CANALES: Record<Canal, string> = {
  local: 'Local',
  online: 'Online',
  mayorista: 'Mayorista',
}

export interface LineaVendida {
  producto_id: string | null
  codigo: string | null
  descripcion: string
  categoria: string | null
  rubro_arca_id: number | null
  canal: Canal
  facturado: boolean
  /** Ya con las devoluciones restadas. */
  cantidad: number
  /** Con IVA, como se cobró. */
  importe: number
  /** Sin IVA, alícuota por alícuota. */
  neto: number
  /** Costo unitario de hoy, con IVA. */
  costo: number | null
}

export interface VentasDeCanal {
  canal: Canal
  ventas: number
  vendido: number
  devuelto: number
}

export interface Rubro {
  id: number
  descripcion: string
}

export interface VentasDelPeriodo {
  lineas: LineaVendida[]
  canales: VentasDeCanal[]
  rubros: Rubro[]
}

export async function obtenerVentas(desde: string, hasta: string): Promise<VentasDelPeriodo> {
  const { data, error } = await supabase.rpc('reporte_ventas', { p_desde: desde, p_hasta: hasta })
  if (error) throw new Error(error.message)
  const v = data as VentasDelPeriodo
  return {
    lineas: v.lineas.map((l) => ({
      ...l,
      cantidad: n(l.cantidad),
      importe: n(l.importe),
      neto: n(l.neto),
      costo: nulo(l.costo),
    })),
    canales: v.canales.map((c) => ({
      ...c,
      ventas: n(c.ventas),
      vendido: n(c.vendido),
      devuelto: n(c.devuelto),
    })),
    rubros: v.rubros.map((r) => ({ id: n(r.id), descripcion: r.descripcion })),
  }
}

export async function obtenerRubros(): Promise<Rubro[]> {
  const { data, error } = await supabase.from('rubro_arca').select('id, descripcion').order('orden')
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({ id: Number(r.id), descripcion: String(r.descripcion) }))
}

/* ─── Por rubro de ARCA ─── */

export const SIN_RUBRO = 'Sin rubro cargado'

export interface FilaDeRubro {
  id: number | null
  descripcion: string
  importe: number
  neto: number
  iva: number
  facturado: number
  sin_factura: number
}

export function ventasPorRubro(lineas: LineaVendida[], rubros: Rubro[]): FilaDeRubro[] {
  const nombre = new Map(rubros.map((r) => [r.id, r.descripcion]))
  const grupos = new Map<number | null, FilaDeRubro>()
  for (const l of lineas) {
    const id = l.rubro_arca_id
    const g = grupos.get(id) ?? {
      id,
      descripcion: id === null ? SIN_RUBRO : nombre.get(id) ?? String(id),
      importe: 0, neto: 0, iva: 0, facturado: 0, sin_factura: 0,
    }
    g.importe += l.importe
    g.neto += l.neto
    if (l.facturado) g.facturado += l.importe
    else g.sin_factura += l.importe
    grupos.set(id, g)
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, iva: g.importe - g.neto }))
    // «Sin rubro» va al final aunque sea lo más grande: es lo que falta
    // clasificar, no una actividad.
    .sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : b.importe - a.importe))
}

/* ─── Por canal ─── */

export interface FilaDeCanal {
  canal: Canal
  nombre: string
  ventas: number
  vendido: number
  devuelto: number
  neto: number
  /** Lo cobrado dividido por la cantidad de ventas. `null` sin ventas. */
  ticket: number | null
  /** Qué parte del total es este canal, de 0 a 100. */
  parte: number
}

export function ventasPorCanal(canales: VentasDeCanal[]): FilaDeCanal[] {
  const filas = (['local', 'online', 'mayorista'] as Canal[]).map((canal) => {
    const c = canales.find((x) => x.canal === canal)
    const ventas = c?.ventas ?? 0
    const vendido = c?.vendido ?? 0
    const devuelto = c?.devuelto ?? 0
    return {
      canal,
      nombre: CANALES[canal],
      ventas,
      vendido,
      devuelto,
      neto: vendido - devuelto,
      ticket: ventas > 0 ? vendido / ventas : null,
      parte: 0,
    }
  })
  const total = filas.reduce((s, f) => s + f.neto, 0)
  for (const f of filas) f.parte = total > 0 ? (f.neto / total) * 100 : 0
  return filas
}

export interface ProductoVendido {
  producto_id: string | null
  codigo: string | null
  descripcion: string
  cantidad: number
  importe: number
}

export function masVendidos(lineas: LineaVendida[], canal: Canal | null, cuantos = 10): ProductoVendido[] {
  const grupos = new Map<string, ProductoVendido>()
  for (const l of lineas) {
    if (canal && l.canal !== canal) continue
    const clave = l.producto_id ?? `libre:${l.descripcion}`
    const g = grupos.get(clave) ?? {
      producto_id: l.producto_id, codigo: l.codigo, descripcion: l.descripcion, cantidad: 0, importe: 0,
    }
    g.cantidad += l.cantidad
    g.importe += l.importe
    grupos.set(clave, g)
  }
  return [...grupos.values()]
    .filter((g) => g.importe > 0)
    .sort((a, b) => b.importe - a.importe)
    .slice(0, cuantos)
}

/* ─── El margen ─── */

export type CorteDeMargen = 'producto' | 'categoria' | 'rubro'

export const CORTES_DE_MARGEN: Record<CorteDeMargen, string> = {
  producto: 'Producto',
  categoria: 'Categoría',
  rubro: 'Rubro ARCA',
}

export interface FilaDeMargen {
  nombre: string
  codigo: string | null
  cantidad: number
  vendido: number
  costo: number
  margen: number
  /** De cada $100 vendidos, cuántos quedan. `null` si no se vendió nada. */
  porcentaje: number | null
}

export interface Margen {
  filas: FilaDeMargen[]
  total: FilaDeMargen
  /** Lo vendido de productos SIN costo: queda afuera del margen. */
  sin_costo: number
  /** Qué parte de lo vendido tiene costo y entra en la cuenta, de 0 a 100. */
  cobertura: number
}

const porcentajeDe = (margen: number, vendido: number) =>
  vendido > 0 ? (margen / vendido) * 100 : null

export function margen(lineas: LineaVendida[], corte: CorteDeMargen, rubros: Rubro[] = []): Margen {
  const nombreDeRubro = new Map(rubros.map((r) => [r.id, r.descripcion]))
  const grupos = new Map<string, FilaDeMargen>()
  let sin_costo = 0
  let todo = 0

  for (const l of lineas) {
    todo += l.importe
    if (l.costo === null) {
      sin_costo += l.importe
      continue
    }
    const [clave, nombre, codigo] =
      corte === 'producto'
        ? [l.producto_id ?? l.descripcion, l.descripcion, l.codigo]
        : corte === 'categoria'
          ? [l.categoria ?? '', l.categoria ?? 'Sin categoría', null]
          : [
              String(l.rubro_arca_id),
              l.rubro_arca_id === null ? SIN_RUBRO : nombreDeRubro.get(l.rubro_arca_id) ?? String(l.rubro_arca_id),
              null,
            ]
    const g = grupos.get(clave) ?? {
      nombre, codigo, cantidad: 0, vendido: 0, costo: 0, margen: 0, porcentaje: null,
    }
    g.cantidad += l.cantidad
    g.vendido += l.importe
    g.costo += l.cantidad * l.costo
    grupos.set(clave, g)
  }

  const filas = [...grupos.values()]
    .map((g) => {
      const m = g.vendido - g.costo
      return { ...g, margen: m, porcentaje: porcentajeDe(m, g.vendido) }
    })
    .sort((a, b) => b.margen - a.margen)

  const vendido = filas.reduce((s, f) => s + f.vendido, 0)
  const costo = filas.reduce((s, f) => s + f.costo, 0)
  return {
    filas,
    total: {
      nombre: 'Total', codigo: null,
      cantidad: filas.reduce((s, f) => s + f.cantidad, 0),
      vendido, costo, margen: vendido - costo,
      porcentaje: porcentajeDe(vendido - costo, vendido),
    },
    sin_costo,
    cobertura: todo > 0 ? ((todo - sin_costo) / todo) * 100 : 0,
  }
}

/* ═══════════════════════ El período ═══════════════════════ */

export type Periodo = 'este_mes' | 'mes_pasado' | 'tres_meses' | 'este_anio'

export const PERIODOS: Record<Periodo, string> = {
  este_mes: 'Este mes',
  mes_pasado: 'Mes pasado',
  tres_meses: 'Últimos 3 meses',
  este_anio: 'Este año',
}

const primeroDe = (anio: number, mes: number) =>
  new Date(Date.UTC(anio, mes - 1, 1)).toISOString().slice(0, 10)

/** Desde y hasta, en días de Oberá. El mes pasado termina su último día; los demás, hoy. */
export function rangoDe(p: Periodo, hoy: string): { desde: string; hasta: string } {
  const [a, m] = hoy.split('-').map(Number)
  switch (p) {
    case 'este_mes':
      return { desde: primeroDe(a, m), hasta: hoy }
    case 'mes_pasado':
      return { desde: primeroDe(a, m - 1), hasta: sumarDias(primeroDe(a, m), -1) }
    case 'tres_meses':
      return { desde: primeroDe(a, m - 2), hasta: hoy }
    case 'este_anio':
      return { desde: `${a}-01-01`, hasta: hoy }
  }
}

/* ═══════════════════════ Los Excel ═══════════════════════ */

type Columna<T> = ColumnaDeListado & { valor: (f: T) => Celda }

function listado<T>(filas: T[], columnas: Columna<T>[], antes: string[] = [], total?: T): Listado {
  const cuerpo = filas.map((f) => columnas.map((c) => c.valor(f)))
  if (total) cuerpo.push(columnas.map((c) => c.valor(total)))
  return {
    antes,
    columnas: columnas.map(({ titulo, tipo, ancho }) => ({ titulo, tipo, ancho })),
    filas: cuerpo,
    resaltadas: total ? [cuerpo.length - 1] : [],
  }
}

const redondo = (x: number) => Math.round(x * 100) / 100

export function stockAListado(productos: ProductoEnStock[], rubros: Rubro[]): Listado {
  const rubro = new Map(rubros.map((r) => [r.id, r.descripcion]))
  return listado(
    productos.filter((p) => p.cantidad > 0),
    [
      { titulo: 'Código', valor: (p) => p.codigo },
      { titulo: 'Producto', ancho: 40, valor: (p) => p.nombre },
      { titulo: 'Categoría', ancho: 20, valor: (p) => p.categoria },
      { titulo: 'Proveedor', ancho: 20, valor: (p) => p.proveedor },
      { titulo: 'Rubro ARCA', ancho: 30, valor: (p) => (p.rubro_arca_id === null ? null : rubro.get(p.rubro_arca_id) ?? null) },
      { titulo: 'Cantidad', tipo: 'numero', valor: (p) => p.cantidad },
      { titulo: 'Costo (con IVA)', tipo: 'importe', valor: (p) => p.costo },
      { titulo: 'Precio', tipo: 'importe', valor: (p) => p.precio },
      { titulo: 'Valor a costo', tipo: 'importe', valor: (p) => (p.costo === null ? null : redondo(p.cantidad * p.costo)) },
      { titulo: 'Valor a precio', tipo: 'importe', valor: (p) => (p.precio === null ? null : redondo(p.cantidad * p.precio)) },
    ],
  )
}

export function paradaAListado(filas: ProductoParado[], dias: number): Listado {
  return listado(
    filas,
    [
      { titulo: 'Código', valor: (p) => p.codigo },
      { titulo: 'Producto', ancho: 40, valor: (p) => p.nombre },
      { titulo: 'Proveedor', ancho: 20, valor: (p) => p.proveedor },
      { titulo: 'Cantidad', tipo: 'numero', valor: (p) => p.cantidad },
      { titulo: 'Días quieto', tipo: 'numero', valor: (p) => p.dias },
      { titulo: 'Última venta', tipo: 'fecha', valor: (p) => p.ultima_venta },
      { titulo: 'Última entrada', tipo: 'fecha', valor: (p) => p.ultima_entrada },
      { titulo: 'Valor a costo', tipo: 'importe', valor: (p) => (p.costo === null ? null : redondo(p.cantidad * p.costo)) },
      { titulo: 'Valor a precio', tipo: 'importe', valor: (p) => (p.precio === null ? null : redondo(p.cantidad * p.precio)) },
    ],
    [`Mercadería sin movimiento hace ${dias} días o más`, ''],
  )
}

export function rubrosAListado(filas: FilaDeRubro[], desde: string, hasta: string): Listado {
  const suma = (k: keyof FilaDeRubro) => filas.reduce((s, f) => s + Number(f[k] ?? 0), 0)
  const total: FilaDeRubro = {
    id: null, descripcion: 'Total',
    importe: suma('importe'), neto: suma('neto'), iva: suma('iva'),
    facturado: suma('facturado'), sin_factura: suma('sin_factura'),
  }
  return listado(
    filas,
    [
      { titulo: 'Código de actividad', valor: (f) => (f === total ? null : f.id === null ? null : String(f.id)) },
      { titulo: 'Rubro', ancho: 50, valor: (f) => f.descripcion },
      { titulo: 'Neto sin IVA', tipo: 'importe', valor: (f) => redondo(f.neto) },
      { titulo: 'IVA', tipo: 'importe', valor: (f) => redondo(f.iva) },
      { titulo: 'Total con IVA', tipo: 'importe', valor: (f) => redondo(f.importe) },
      { titulo: 'Con factura', tipo: 'importe', valor: (f) => redondo(f.facturado) },
      { titulo: 'Sin factura', tipo: 'importe', valor: (f) => redondo(f.sin_factura) },
    ],
    [`Ventas por rubro de ARCA, del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`, 'Devoluciones ya restadas.', ''],
    total,
  )
}

export function margenAListado(m: Margen, corte: CorteDeMargen, desde: string, hasta: string): Listado {
  return listado(
    m.filas,
    [
      ...(corte === 'producto' ? [{ titulo: 'Código', valor: (f: FilaDeMargen) => f.codigo } as Columna<FilaDeMargen>] : []),
      { titulo: CORTES_DE_MARGEN[corte], ancho: 40, valor: (f) => f.nombre },
      { titulo: 'Cantidad', tipo: 'numero', valor: (f) => f.cantidad },
      { titulo: 'Vendido', tipo: 'importe', valor: (f) => redondo(f.vendido) },
      { titulo: 'Costo de hoy', tipo: 'importe', valor: (f) => redondo(f.costo) },
      { titulo: 'Margen', tipo: 'importe', valor: (f) => redondo(f.margen) },
      { titulo: 'Margen %', tipo: 'numero', valor: (f) => (f.porcentaje === null ? null : Math.round(f.porcentaje * 10) / 10) },
    ],
    [
      `Margen del ${fechaCorta(desde)} al ${fechaCorta(hasta)}, con el costo de hoy`,
      'Importes con IVA. Sólo productos con costo cargado.',
      '',
    ],
    m.total,
  )
}

/** «2026-11-23» → «23/11/2026». */
export function fechaCorta(f: string): string {
  const [a, m, d] = f.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}
