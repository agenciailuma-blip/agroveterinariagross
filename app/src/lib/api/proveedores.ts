import { supabase } from '@/lib/supabase'

/*
  ─────────────────────────────────────────────────────────────
  Proveedores

  Puntos 5 y 4 de Lucas. El proveedor es mínimo a propósito —nombre,
  CUIT, contacto— porque lo que lo justifica hoy no es llevarle una
  cuenta: es poder **aumentar precios de una**.

  Cuando un laboratorio aumenta, hoy hay que corregir producto por
  producto sobre 2.261. Con esto se elige el proveedor, se pone +7% y
  listo.

  **No se replica en la base local.** El mostrador no necesita saber a
  quién se le compra: los proveedores se miran y se tocan desde la
  oficina, con conexión. Replicarlos sería sumar peso a cada terminal
  para un dato que nunca se lee ahí.
  ─────────────────────────────────────────────────────────────
*/

export interface Proveedor {
  id: string
  codigo: string | null
  nombre: string
  nombre_fantasia: string | null
  condicion_iva_id: number | null
  tipo_documento_id: number | null
  numero_documento: string | null
  domicilio: string | null
  localidad: string | null
  provincia: string | null
  telefono: string | null
  email: string | null
  contacto: string | null
  observaciones: string | null
  activo: boolean
}

export const PROVEEDOR_NUEVO: Omit<Proveedor, 'id'> = {
  codigo: null,
  nombre: '',
  nombre_fantasia: null,
  // 80 es CUIT y 1 es Responsable Inscripto en las tablas de ARCA. Un
  // proveedor de una agroveterinaria es casi siempre las dos cosas;
  // arrancar ahí ahorra dos clics en el caso normal.
  condicion_iva_id: 1,
  tipo_documento_id: 80,
  numero_documento: null,
  domicilio: null,
  localidad: null,
  provincia: null,
  telefono: null,
  email: null,
  contacto: null,
  observaciones: null,
  activo: true,
}

const CAMPOS =
  'id, codigo, nombre, nombre_fantasia, condicion_iva_id, tipo_documento_id, numero_documento, domicilio, localidad, provincia, telefono, email, contacto, observaciones, activo'

export async function listarProveedores(texto = ''): Promise<Proveedor[]> {
  let q = supabase
    .from('proveedor')
    .select(CAMPOS)
    .is('eliminado_en', null)
    .order('nombre')
    .limit(300)

  if (texto.trim()) {
    const patron = `%${texto.replace(/[%_]/g, '')}%`
    q = q.or(`nombre.ilike.${patron},nombre_fantasia.ilike.${patron},numero_documento.ilike.${patron}`)
  }

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as Proveedor[]
}

/** Cuántos productos tiene asignados cada proveedor. */
export async function productosPorProveedor(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('producto')
    .select('proveedor_id')
    .not('proveedor_id', 'is', null)
    .is('eliminado_en', null)
  if (error) return new Map()

  const cuenta = new Map<string, number>()
  for (const f of data ?? []) {
    const id = f.proveedor_id as string
    cuenta.set(id, (cuenta.get(id) ?? 0) + 1)
  }
  return cuenta
}

export async function guardarProveedor(
  datos: Partial<Proveedor>,
  id?: string,
): Promise<string> {
  const campos = {
    ...datos,
    nombre: datos.nombre?.trim(),
    // Un CUIT vacío tiene que ser null y no cadena vacía: el índice
    // único ignora los nulos, pero dos cadenas vacías chocan entre sí
    // y el segundo proveedor sin CUIT no se podría cargar.
    numero_documento: datos.numero_documento?.trim() || null,
    codigo: datos.codigo?.trim() || null,
  }

  if (id) {
    const { error } = await supabase.from('proveedor').update(campos).eq('id', id)
    if (error) throw new Error(traducir(error.message))
    return id
  }

  const { data, error } = await supabase
    .from('proveedor')
    .insert(campos)
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(traducir(error.message))
  return data.id
}

/** Baja lógica, como todo lo demás: el histórico de productos no se toca. */
export async function darDeBajaProveedor(id: string): Promise<void> {
  const { error } = await supabase
    .from('proveedor')
    .update({ eliminado_en: new Date().toISOString(), activo: false })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

function traducir(mensaje: string): string {
  if (mensaje.includes('proveedor_documento_unico')) {
    return 'Ya hay un proveedor cargado con ese CUIT.'
  }
  return mensaje
}

/*
  ─────────────────────────────────────────────────────────────
  El aumento masivo — punto 4

  Lo delicado no es aplicarlo: es **poder deshacerlo**. Un +70%
  tipeado donde iba +7% arruina el mostrador entero y se descubre con
  el primer cliente. Por eso la base guarda el precio anterior de cada
  producto y existe `revertirAumento`.
  ─────────────────────────────────────────────────────────────
*/

export type AlcanceAumento = 'precio' | 'costo' | 'ambos'

/** Cuántos productos tocaría, antes de tocarlos. */
export async function contarParaAumento(
  proveedorId: string | null,
  categoriaId: string | null,
): Promise<number> {
  const { data, error } = await supabase.rpc('contar_productos_para_aumento', {
    p_proveedor_id: proveedorId,
    p_categoria_id: categoriaId,
  })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}

export async function aumentarPrecios(opciones: {
  porcentaje: number
  proveedorId?: string | null
  categoriaId?: string | null
  alcance?: AlcanceAumento
  motivo?: string | null
}): Promise<string> {
  const { data, error } = await supabase.rpc('aumentar_precios', {
    p_porcentaje: opciones.porcentaje,
    p_proveedor_id: opciones.proveedorId ?? null,
    p_categoria_id: opciones.categoriaId ?? null,
    p_alcance: opciones.alcance ?? 'precio',
    p_motivo: opciones.motivo ?? null,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function revertirAumento(id: string): Promise<number> {
  const { data, error } = await supabase.rpc('revertir_aumento', { p_aumento_id: id })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}

export interface AumentoAplicado {
  id: string
  porcentaje: number
  alcance: AlcanceAumento
  productos: number
  motivo: string | null
  aplicado_en: string
  revertido_en: string | null
  proveedor: { nombre: string } | null
  categoria: { nombre: string } | null
  aplicado_por: { nombre: string } | null
}

export async function listarAumentos(): Promise<AumentoAplicado[]> {
  const { data, error } = await supabase
    .from('aumento_precio')
    .select(
      `id, porcentaje, alcance, productos, motivo, aplicado_en, revertido_en,
       proveedor:proveedor_id(nombre), categoria:categoria_id(nombre),
       aplicado_por:aplicado_por(nombre)`,
    )
    .order('aplicado_en', { ascending: false })
    .limit(30)
  if (error) throw new Error(error.message)

  // PostgREST devuelve las relaciones como objeto o arreglo según cómo
  // infiera la cardinalidad. Se normaliza acá, igual que en el resto.
  const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)
  return ((data ?? []) as unknown as AumentoAplicado[]).map((a) => ({
    ...a,
    porcentaje: Number(a.porcentaje),
    proveedor: uno(a.proveedor),
    categoria: uno(a.categoria),
    aplicado_por: uno(a.aplicado_por),
  }))
}
