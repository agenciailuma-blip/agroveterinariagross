import { supabase } from '@/lib/supabase'

export interface FilaConfiguracion {
  clave: string
  valor: number
  descripcion: string | null
}

/**
 * Trae un grupo de claves de configuración como números. El resto de las
 * columnas (grupo, jsonb crudo) no le sirve a esta pantalla: solo valores
 * numéricos simples, que es lo único que 'configuracion' guarda hasta ahora.
 */
export async function obtenerConfiguracion(claves: string[]): Promise<FilaConfiguracion[]> {
  const { data, error } = await supabase
    .from('configuracion')
    .select('clave, valor, descripcion')
    .in('clave', claves)

  if (error) throw new Error(error.message)

  return (data ?? []).map((f) => ({
    clave: f.clave as string,
    valor: Number(f.valor),
    descripcion: f.descripcion as string | null,
  }))
}

export async function guardarValorConfiguracion(clave: string, valor: number) {
  const { error } = await supabase.from('configuracion').update({ valor }).eq('clave', clave)
  if (error) throw new Error(error.message)
}

/*
  Puntos de venta de ARCA.

  El régimen importa: ARCA no otorga el CAEA mientras el CUIT no tenga
  al menos un punto de venta dado de alta bajo ese régimen (rechaza con
  el error 15003). El alta se hace en el portal de ARCA; acá sólo se
  registra cuál es, para que la contingencia sepa dónde emitir.
*/
export interface PuntoVenta {
  id: string
  numero: number
  nombre: string
  activo: boolean
  regimen_caea: boolean
}

export async function listarPuntosVenta(): Promise<PuntoVenta[]> {
  const { data, error } = await supabase
    .from('punto_venta')
    .select('id, numero, nombre, activo, regimen_caea')
    .is('eliminado_en', null)
    .order('numero')
  if (error) throw new Error(error.message)
  return (data ?? []) as PuntoVenta[]
}

export async function marcarRegimenCaea(id: string, regimen_caea: boolean) {
  const { error } = await supabase.from('punto_venta').update({ regimen_caea }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function crearPuntoVenta(numero: number, nombre: string, regimen_caea: boolean) {
  const { error } = await supabase
    .from('punto_venta')
    .insert({ numero, nombre, regimen_caea })
  if (error) throw new Error(error.message)
}

/*
  Datos del emisor.

  Van aparte de obtenerConfiguracion() porque esa función convierte todo
  a número: acá son textos (y uno de ellos es el logo entero, como data
  URI). El logo viaja embebido en el comprobante a propósito — una
  imagen que se baja de un servidor saldría en blanco justo el día que
  se corta internet, que es cuando el mostrador más la necesita.
*/
export const CLAVES_EMISOR = [
  'comercio.razon_social',
  'comercio.nombre_fantasia',
  'comercio.domicilio',
  'comercio.localidad',
  'comercio.telefono',
  'comercio.ingresos_brutos',
  'comercio.inicio_actividades',
  'comercio.logo',
] as const

/*
  La impresora del mostrador.

  Aparte de los datos del emisor a propósito: no es un dato fiscal, es
  un dato de la instalación de cada local. Si mañana cambian el router,
  esto cambia y el encabezado de la factura no.
*/
export const CLAVES_IMPRESORA = [
  'comercio.impresora_host',
  'comercio.impresora_puerto',
  'comercio.nombre_fantasia',
] as const

export async function obtenerTextos(claves: readonly string[]): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('configuracion')
    .select('clave, valor')
    .in('clave', claves as string[])
  if (error) throw new Error(error.message)

  const out: Record<string, string> = {}
  for (const f of data ?? []) out[f.clave as string] = String(f.valor ?? '')
  return out
}

export async function guardarTextos(valores: Record<string, string>) {
  for (const [clave, valor] of Object.entries(valores)) {
    const { error } = await supabase.from('configuracion').update({ valor }).eq('clave', clave)
    if (error) throw new Error(`${clave}: ${error.message}`)
  }
}
