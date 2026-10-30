import { aNumero } from '@/lib/importacion/planilla'
import type { Celda } from '@/lib/importacion/exportar'

/*
  ─────────────────────────────────────────────────────────────
  La planilla de la lista mayorista

  Fase 03, punto 5.2. Se baja con todo el catálogo, se completa en Excel
  la columna del precio mayorista y se sube. Antes de guardar se muestra
  qué entra, qué cambia y qué no se entendió.

  Lo que hay en la planilla manda sólo sobre sus filas: un producto que
  no está en el archivo no se toca, así sirve también una planilla con
  diez productos. Un precio borrado saca el producto de la lista, pero
  sólo si se elige: borrar por error no debe dejar a Facundo sin producto.
  ─────────────────────────────────────────────────────────────
*/

const CODIGO = 'Código'
const PRODUCTO = 'Producto'
const MOSTRADOR = 'Precio de mostrador'
const MAYORISTA = 'Precio mayorista'

/** Un producto del catálogo, y su precio mayorista si está en la lista. */
export interface ProductoDeLaPlanilla {
  id: string
  codigo: string
  nombre: string
  precio_venta: number
  activo: boolean
  precio: number | null
}

export function hojaDeLista(productos: ProductoDeLaPlanilla[]): Celda[][] {
  return [
    [CODIGO, PRODUCTO, MOSTRADOR, MAYORISTA],
    ...productos
      .filter((p) => p.activo || p.precio !== null)
      .map((p) => [p.codigo, p.nombre, p.precio_venta, p.precio]),
  ]
}

export const ANCHOS_DE_LISTA = [16, 48, 18, 18]

export interface CambioDeLista {
  producto_id: string
  codigo: string
  nombre: string
  antes: number | null
  /** Null: sale de la lista. */
  precio: number | null
}

export interface ProblemaDeLista {
  fila: number
  codigo: string
  motivo: string
}

export interface LecturaDeLista {
  entran: CambioDeLista[]
  cambian: CambioDeLista[]
  salen: CambioDeLista[]
  iguales: number
  problemas: ProblemaDeLista[]
}

const normal = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()

/** Lee la planilla contra el catálogo. Null si no tiene las columnas. */
export function leerPlanillaDeLista(filas: unknown[][], productos: ProductoDeLaPlanilla[]): LecturaDeLista | null {
  const inicio = filas.slice(0, 15).findIndex((f) => {
    const t = f.map(normal)
    return t.includes(normal(CODIGO)) && t.includes(normal(MAYORISTA))
  })
  if (inicio < 0) return null
  const encabezado = filas[inicio].map(normal)
  const colCodigo = encabezado.indexOf(normal(CODIGO))
  const colPrecio = encabezado.indexOf(normal(MAYORISTA))

  const porCodigo = new Map(productos.map((p) => [normal(p.codigo), p]))
  const vistos = new Set<string>()
  const r: LecturaDeLista = { entran: [], cambian: [], salen: [], iguales: 0, problemas: [] }

  filas.slice(inicio + 1).forEach((f, i) => {
    const celda = f[colPrecio]
    const codigo = String(f[colCodigo] ?? '').trim()
    const vacio = celda === null || celda === undefined || String(celda).trim() === ''
    if (!codigo) {
      if (!vacio) r.problemas.push({ fila: inicio + i + 2, codigo: '', motivo: 'Tiene precio pero no código.' })
      return
    }
    const fila = inicio + i + 2
    const problema = (motivo: string) => r.problemas.push({ fila, codigo, motivo })

    const clave = normal(codigo)
    if (vistos.has(clave)) return void problema('El código está repetido en la planilla.')
    vistos.add(clave)

    const p = porCodigo.get(clave)
    if (!p) return void problema('No está en el catálogo.')
    const cambio = { producto_id: p.id, codigo: p.codigo, nombre: p.nombre, antes: p.precio }

    if (vacio) {
      if (p.precio !== null) r.salen.push({ ...cambio, precio: null })
      return
    }
    const leido = aNumero(celda)
    if (leido === null || leido <= 0) return void problema('El precio no se entiende.')
    const precio = Math.round(leido * 100) / 100
    if (!p.activo) return void problema('El producto está dado de baja.')

    if (p.precio === null) r.entran.push({ ...cambio, precio })
    else if (p.precio !== precio) r.cambian.push({ ...cambio, precio })
    else r.iguales++
  })
  return r
}
