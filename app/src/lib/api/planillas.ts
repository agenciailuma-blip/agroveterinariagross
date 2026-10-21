import { supabase } from '@/lib/supabase'
import { clientesActuales, productosActuales, proveedoresActuales } from '@/lib/api/importacion'
import { bajarPlanilla } from '@/lib/importacion/exportar'
import { CLIENTES, PROVEEDORES } from '@/lib/importacion/definiciones'
import { PRODUCTOS } from '@/lib/importacion/planilla'
import {
  COLUMNAS_DE_CLIENTES,
  COLUMNAS_DE_PROVEEDORES,
  columnasDeProductos,
  type Categoria,
} from '@/lib/importacion/planillasDeMaestros'
import type { Registro } from '@/lib/importacion/comparar'

/*
  Bajar la planilla de cada maestro, con lo que hay hoy: la misma que
  después se sube por «Importar planilla». Ver lib/importacion/exportar.ts.
*/

const porNombre = (campo: string) => (a: Registro, b: Registro) =>
  String(a[campo] ?? '').localeCompare(String(b[campo] ?? ''), 'es')

export async function bajarPlanillaDeProductos(): Promise<number> {
  const [productos, categorias] = await Promise.all([
    productosActuales(),
    supabase.from('categoria').select('id, nombre, padre_id').is('eliminado_en', null),
  ])
  if (categorias.error) throw new Error(categorias.error.message)
  const arbol = new Map((categorias.data as Categoria[]).map((c) => [c.id, c]))
  productos.sort(porNombre('nombre_interno'))
  await bajarPlanilla('productos', PRODUCTOS, columnasDeProductos(arbol), productos)
  return productos.length
}

/*
  Sin el «Consumidor Final» genérico: es del sistema, no se edita, y el
  importador lo frena si vuelve. Con él, una planilla bajada y subida sin
  tocar mostraba una fila con error.
*/
export function esConsumidorFinalGenerico(r: Registro): boolean {
  const nombre = String(r.nombre ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
  return nombre === 'consumidor final' && !String(r.numero_documento ?? '').replace(/[0\s.-]/g, '')
}

export async function bajarPlanillaDeClientes(): Promise<number> {
  const clientes = (await clientesActuales()).filter((c) => !esConsumidorFinalGenerico(c))
  clientes.sort(porNombre('nombre'))
  await bajarPlanilla('clientes', CLIENTES, COLUMNAS_DE_CLIENTES, clientes)
  return clientes.length
}

/** La ficha de cada proveedor. El saldo no va: tiene su planilla, con su fecha. */
export async function bajarPlanillaDeProveedores(): Promise<number> {
  const proveedores = await proveedoresActuales()
  proveedores.sort(porNombre('nombre'))
  await bajarPlanilla('proveedores', PROVEEDORES, COLUMNAS_DE_PROVEEDORES, proveedores)
  return proveedores.length
}
