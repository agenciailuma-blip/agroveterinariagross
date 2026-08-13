/*
  Tipos de las tablas y vistas que usa la interfaz.

  Se escriben a mano por ahora. Cuando esté instalada la CLI de Supabase
  conviene reemplazarlos por los generados con `supabase gen types`, que
  se mantienen solos al cambiar el esquema.
*/

export type EstadoStock = 'ok' | 'bajo' | 'critico' | 'sobrevendido'

export interface Producto {
  id: string
  codigo: string
  nombre_interno: string
  nombre_publico: string | null
  precio_venta: number
  costo: number | null
  alicuota_iva_id: number
  condicion_iva: 'gravado' | 'exento' | 'no_gravado'
  unidad_medida: string
  categoria_id: string | null
  marca_id: string | null
  activo: boolean
  revisado_en: string | null
}

export interface FilaStock {
  producto_id: string
  codigo: string
  nombre_interno: string
  categoria_id: string | null
  marca_id: string | null
  activo: boolean
  cantidad: number
  stock_actualizado_en: string | null
  umbral_bajo: number | null
  umbral_critico: number | null
  estado: EstadoStock
}

export interface Categoria {
  id: string
  nombre: string
  slug: string
  padre_id: string | null
  orden: number
}

export interface Marca {
  id: string
  nombre: string
  slug: string
}

export interface Usuario {
  id: string
  nombre: string
  email: string | null
  rol_id: string
  activo: boolean
}

export interface Rol {
  id: string
  nombre: string
  descripcion: string | null
}

export interface Permiso {
  clave: string
  grupo: string
  descripcion: string
}

/** Etiqueta y color de cada estado de stock, para no repetirlo en cada pantalla. */
export const ESTADO_STOCK: Record<EstadoStock, { etiqueta: string; clase: string }> = {
  ok: { etiqueta: 'En stock', clase: 'bg-marca-100 text-marca-800 ring-marca-200' },
  bajo: { etiqueta: 'Stock bajo', clase: 'bg-amber-100 text-amber-800 ring-amber-200' },
  critico: { etiqueta: 'Crítico', clase: 'bg-orange-100 text-orange-800 ring-orange-200' },
  sobrevendido: { etiqueta: 'Sobrevendido', clase: 'bg-red-100 text-red-800 ring-red-200' },
}

export const moneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
})

export const numero = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 2,
})
