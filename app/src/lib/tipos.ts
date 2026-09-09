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
  ok: { etiqueta: 'En stock', clase: 'bg-verde-100 text-verde-800 ring-verde-200' },
  bajo: { etiqueta: 'Stock bajo', clase: 'bg-amber-100 text-amber-800 ring-amber-200' },
  critico: { etiqueta: 'Crítico', clase: 'bg-orange-100 text-orange-800 ring-orange-200' },
  sobrevendido: { etiqueta: 'Sobrevendido', clase: 'bg-red-100 text-red-800 ring-red-200' },
}

/*
  Las alícuotas de IVA, con los códigos de ARCA.

  Están escritas acá y no se leen de la base a propósito, y es la
  excepción que confirma la regla: no son datos de Gross, son una tabla
  fija de ARCA. Sus identificadores ya se usan sin traducir en todo el
  sistema —es una de las decisiones que no se revisan— y hacen falta en
  el mostrador, donde una línea escrita a mano tiene que poder salir sin
  conexión y sin preguntarle a nadie qué IVA lleva.

  Si ARCA agregara una, se agrega un renglón acá.
*/
export const ALICUOTAS_IVA = [
  { id: 5, etiqueta: '21%' },
  { id: 4, etiqueta: '10,5%' },
  { id: 6, etiqueta: '27%' },
  { id: 8, etiqueta: '5%' },
  { id: 9, etiqueta: '2,5%' },
  { id: 3, etiqueta: '0%' },
] as const

export const moneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
})

export const numero = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 2,
})
