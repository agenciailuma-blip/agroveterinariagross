import { CAMPOS_CLIENTE, CLIENTES, type CampoCliente, type CampoFichaProveedor } from '@/lib/importacion/definiciones'
import { CONDICIONES, NOMBRE_DEL_MINIMO, codigosDe } from '@/lib/importacion/comparadores'
import { numeroDe, siNoDe, type Columna } from '@/lib/importacion/exportar'
import { PRODUCTOS, type Campo } from '@/lib/importacion/planilla'
import type { Registro } from '@/lib/importacion/comparar'

/*
  Las columnas de la planilla que se baja de cada maestro.

  Salen de lo mismo que el importador usa para comparar
  (productosActuales, clientesActuales): un registro que se baja y se
  vuelve a subir sin tocar tiene que dar «igual». La prueba de ida y
  vuelta (planillasDeMaestros.prueba.ts) lo controla columna por columna.
*/

const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

export interface Categoria {
  id: string
  nombre: string
  padre_id: string | null
}

/** De la hoja del árbol a la raíz, dado vuelta: [rubro, subrubro, grupo, subgrupo]. */
export function rutaDeCategoria(id: string | null, categorias: Map<string, Categoria>): string[] {
  const ruta: string[] = []
  const vistas = new Set<string>()
  for (let actual = id ? categorias.get(id) : undefined; actual && !vistas.has(actual.id); ) {
    vistas.add(actual.id)
    ruta.unshift(actual.nombre)
    actual = actual.padre_id ? categorias.get(actual.padre_id) : undefined
  }
  return ruta
}

export function columnasDeProductos(categorias: Map<string, Categoria>): Columna<Campo, Registro>[] {
  const nivel = (n: number) => (r: Registro) => rutaDeCategoria((r.categoria_id as string | null) ?? null, categorias)[n] ?? null
  const umbral = (r: Registro) => uno(r.umbral as { bajo: unknown; critico: unknown } | null)
  return [
    { campo: 'codigo', valor: (r) => r.codigo as string, ancho: 14 },
    { campo: 'nombre_interno', valor: (r) => r.nombre_interno as string, ancho: 40 },
    { campo: 'nombre_publico', valor: (r) => (r.nombre_publico as string | null) ?? null, ancho: 40 },
    { campo: 'precio_venta', valor: (r) => numeroDe(r.precio_venta), ancho: 14 },
    { campo: 'costo', valor: (r) => numeroDe(r.costo), ancho: 12 },
    {
      campo: 'alicuota_porcentaje',
      valor: (r) => numeroDe(uno(r.alicuota as { porcentaje: unknown } | null)?.porcentaje),
      ancho: 10,
    },
    { campo: 'categoria', valor: nivel(0), ancho: 18 },
    { campo: 'subrubro', valor: nivel(1), ancho: 18 },
    { campo: 'grupo', valor: nivel(2), ancho: 16 },
    { campo: 'subgrupo', valor: nivel(3), ancho: 16 },
    { campo: 'marca', valor: (r) => uno(r.marca as { nombre: string } | null)?.nombre ?? null, ancho: 16 },
    { campo: 'unidad_medida', valor: (r) => (r.unidad_medida as string | null) ?? null, ancho: 10 },
    { campo: 'codigo_barra', valor: (r) => codigosDe(r)[0] ?? null, ancho: 16 },
    { campo: 'es_veterinario', valor: (r) => siNoDe(r.es_producto_veterinario), ancho: 10 },
    { campo: 'requiere_receta', valor: (r) => siNoDe(r.requiere_receta), ancho: 10 },
    { campo: 'es_fitosanitario', valor: (r) => siNoDe(r.es_fitosanitario), ancho: 10 },
    { campo: 'stock_bajo', valor: (r) => numeroDe(umbral(r)?.bajo), ancho: 10 },
    { campo: 'stock_critico', valor: (r) => numeroDe(umbral(r)?.critico), ancho: 10 },
    { campo: 'sale_de', valor: (r) => uno(r.envase as { codigo: string } | null)?.codigo ?? null, ancho: 14 },
    {
      campo: 'cantidad_por_envase',
      valor: (r) => (uno(r.envase as { codigo: string } | null) ? numeroDe(r.cantidad_por_envase) : null),
      ancho: 10,
    },
    { campo: 'peso_kg', valor: (r) => numeroDe(r.peso_kg), ancho: 10 },
    { campo: 'unidades_por_bulto', valor: (r) => numeroDe(r.unidades_por_bulto), ancho: 10 },
  ]
}

export const DEFINICION_PRODUCTOS = PRODUCTOS

export const COLUMNAS_DE_CLIENTES: Columna<CampoCliente, Registro>[] = [
  { campo: 'codigo', valor: (r) => (r.codigo as string | null) ?? null, ancho: 12 },
  { campo: 'nombre', valor: (r) => r.nombre as string, ancho: 40 },
  {
    campo: 'condicion_iva',
    valor: (r) => (r.condicion_iva_id == null ? null : (CONDICIONES[String(r.condicion_iva_id)] ?? null)),
    ancho: 22,
  },
  { campo: 'documento', valor: (r) => (r.numero_documento as string | null) ?? null, ancho: 14 },
  { campo: 'domicilio', valor: (r) => (r.calle as string | null) ?? null, ancho: 30 },
  { campo: 'localidad', valor: (r) => (r.localidad as string | null) ?? null, ancho: 16 },
  { campo: 'provincia', valor: (r) => (r.provincia as string | null) ?? null, ancho: 14 },
  { campo: 'codigo_postal', valor: (r) => (r.codigo_postal as string | null) ?? null, ancho: 10 },
  { campo: 'telefono', valor: (r) => (r.telefono as string | null) ?? null, ancho: 16 },
  { campo: 'email', valor: (r) => (r.email as string | null) ?? null, ancho: 26 },
  { campo: 'cuenta_corriente', valor: (r) => siNoDe(r.cuenta_corriente), ancho: 12 },
  { campo: 'limite_credito', valor: (r) => numeroDe(r.limite_credito), ancho: 14 },
  { campo: 'dias_vencimiento', valor: (r) => numeroDe(r.dias_vencimiento), ancho: 10 },
]

export const DEFINICION_CLIENTES = CLIENTES
export { CAMPOS_CLIENTE }

export const COLUMNAS_DE_PROVEEDORES: Columna<CampoFichaProveedor, Registro>[] = [
  { campo: 'codigo', valor: (r) => (r.codigo as string | null) ?? null, ancho: 12 },
  { campo: 'nombre', valor: (r) => r.nombre as string, ancho: 36 },
  { campo: 'nombre_fantasia', valor: (r) => (r.nombre_fantasia as string | null) ?? null, ancho: 24 },
  {
    campo: 'condicion_iva',
    valor: (r) => (r.condicion_iva_id == null ? null : (CONDICIONES[String(r.condicion_iva_id)] ?? null)),
    ancho: 22,
  },
  { campo: 'documento', valor: (r) => (r.numero_documento as string | null) ?? null, ancho: 14 },
  { campo: 'domicilio', valor: (r) => (r.domicilio as string | null) ?? null, ancho: 30 },
  { campo: 'localidad', valor: (r) => (r.localidad as string | null) ?? null, ancho: 16 },
  { campo: 'provincia', valor: (r) => (r.provincia as string | null) ?? null, ancho: 14 },
  { campo: 'telefono', valor: (r) => (r.telefono as string | null) ?? null, ancho: 16 },
  { campo: 'email', valor: (r) => (r.email as string | null) ?? null, ancho: 26 },
  { campo: 'contacto', valor: (r) => (r.contacto as string | null) ?? null, ancho: 18 },
  { campo: 'cbu', valor: (r) => (r.cbu as string | null) ?? null, ancho: 24 },
  { campo: 'alias', valor: (r) => (r.alias as string | null) ?? null, ancho: 18 },
  {
    campo: 'minimo_tipo',
    valor: (r) => (r.minimo_tipo ? (NOMBRE_DEL_MINIMO[String(r.minimo_tipo)] ?? null) : null),
    ancho: 14,
  },
  { campo: 'minimo_valor', valor: (r) => numeroDe(r.minimo_valor), ancho: 12 },
  { campo: 'observaciones', valor: (r) => (r.observaciones as string | null) ?? null, ancho: 30 },
]
