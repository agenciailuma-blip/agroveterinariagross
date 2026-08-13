import { supabase } from '@/lib/supabase'
import type { EstadoStock } from '@/lib/tipos'

export interface FilaListado {
  producto_id: string
  codigo: string
  nombre_interno: string
  nombre_publico: string | null
  precio_venta: number
  unidad_medida: string
  cantidad: number
  estado: EstadoStock
  activo: boolean
  revisado_en: string | null
}

export interface ProductoDetalle {
  id: string
  codigo: string
  nombre_interno: string
  nombre_publico: string | null
  descripcion: string | null
  categoria_id: string | null
  marca_id: string | null
  presentacion_id: string | null
  alicuota_iva_id: number
  condicion_iva: 'gravado' | 'exento' | 'no_gravado'
  precio_venta: number
  costo: number | null
  unidad_medida: string
  permite_fraccionamiento: boolean
  es_producto_veterinario: boolean
  requiere_receta: boolean
  es_fitosanitario: boolean
  controla_lote: boolean
  controla_vencimiento: boolean
  principio_activo: string | null
  activo: boolean
  revisado_en: string | null
}

export interface Referencia {
  id: string
  nombre: string
}

export interface Referencias {
  categorias: Referencia[]
  marcas: Referencia[]
  presentaciones: Referencia[]
  animales: Referencia[]
  etapas: Referencia[]
  alicuotas: { id: number; descripcion: string }[]
}

export const UNIDADES = [
  'unidad',
  'kg',
  'gramo',
  'litro',
  'ml',
  'metro',
  'bolsa',
  'caja',
] as const

const LIMITE_LISTADO = 100

export async function listarProductos(texto: string, soloSinRevisar: boolean) {
  let q = supabase
    .from('vista_stock')
    .select(
      'producto_id, codigo, nombre_interno, nombre_publico, precio_venta, unidad_medida, cantidad, estado, activo, revisado_en',
      { count: 'exact' },
    )
    .order('revisado_en', { ascending: true, nullsFirst: true })
    .order('nombre_interno')
    .limit(LIMITE_LISTADO)

  if (texto) {
    // Se limpian los comodines de SQL para que un % tipeado por el
    // usuario busque un % y no haga de comodín.
    const patron = `%${texto.replace(/[%_]/g, '')}%`
    q = q.or(`codigo.ilike.${patron},nombre_interno.ilike.${patron},nombre_publico.ilike.${patron}`)
  }
  if (soloSinRevisar) q = q.is('revisado_en', null)

  const { data, error, count } = await q
  if (error) throw new Error(error.message)
  return { filas: (data ?? []) as FilaListado[], total: count ?? 0, limite: LIMITE_LISTADO }
}

export async function contarAvance() {
  const [total, revisados] = await Promise.all([
    supabase.from('producto').select('id', { count: 'exact', head: true }).is('eliminado_en', null),
    supabase
      .from('producto')
      .select('id', { count: 'exact', head: true })
      .is('eliminado_en', null)
      .not('revisado_en', 'is', null),
  ])
  return { total: total.count ?? 0, revisados: revisados.count ?? 0 }
}

export async function obtenerProducto(id: string) {
  const [producto, codigos, animales, etapas] = await Promise.all([
    supabase.from('producto').select('*').eq('id', id).single<ProductoDetalle>(),
    supabase
      .from('producto_codigo_barra')
      .select('id, codigo, es_principal')
      .eq('producto_id', id)
      .is('eliminado_en', null),
    supabase.from('producto_animal').select('animal_id').eq('producto_id', id),
    supabase.from('producto_etapa_vida').select('etapa_vida_id').eq('producto_id', id),
  ])

  if (producto.error) throw new Error(producto.error.message)

  return {
    producto: producto.data,
    codigosBarra: codigos.data ?? [],
    animales: (animales.data ?? []).map((a) => a.animal_id as string),
    etapas: (etapas.data ?? []).map((e) => e.etapa_vida_id as string),
  }
}

export async function cargarReferencias(): Promise<Referencias> {
  const [cat, mar, pre, ani, eta, ali] = await Promise.all([
    supabase.from('categoria').select('id, nombre').is('eliminado_en', null).order('orden'),
    supabase.from('marca').select('id, nombre').is('eliminado_en', null).order('nombre'),
    supabase.from('presentacion').select('id, nombre').is('eliminado_en', null).order('nombre'),
    supabase.from('animal').select('id, nombre').is('eliminado_en', null).order('orden'),
    supabase.from('etapa_vida').select('id, nombre').is('eliminado_en', null).order('orden'),
    supabase.from('alicuota_iva').select('id, descripcion').eq('activo', true).order('id'),
  ])
  return {
    categorias: (cat.data ?? []) as Referencia[],
    marcas: (mar.data ?? []) as Referencia[],
    presentaciones: (pre.data ?? []) as Referencia[],
    animales: (ani.data ?? []) as Referencia[],
    etapas: (eta.data ?? []) as Referencia[],
    alicuotas: (ali.data ?? []) as { id: number; descripcion: string }[],
  }
}

export interface DatosGuardado {
  id?: string
  campos: Partial<ProductoDetalle>
  codigosBarra: string[]
  animales: string[]
  etapas: string[]
  /** Cantidad contada. Si es null no se toca el stock. */
  stockContado: number | null
  stockActual: number
  marcarRevisado: boolean
  usuarioId: string
}

/*
  Guarda todo el producto de una vez: campos, códigos de barra,
  clasificación y, si corresponde, el ajuste de stock.

  El stock NO se escribe como un campo: se registra el movimiento que
  lleva del saldo actual al contado. Así queda asentado quién contó,
  cuándo y cuánto había antes, que es exactamente lo que hace falta
  cuando dentro de un mes alguien pregunte por qué el número es ese.
*/
export async function guardarProducto(datos: DatosGuardado): Promise<string> {
  const campos = {
    ...datos.campos,
    ...(datos.marcarRevisado
      ? { revisado_en: new Date().toISOString(), revisado_por: datos.usuarioId }
      : {}),
  }

  let productoId = datos.id

  if (productoId) {
    const { error } = await supabase.from('producto').update(campos).eq('id', productoId)
    if (error) throw new Error(`No se pudo guardar el producto: ${error.message}`)
  } else {
    const { data, error } = await supabase
      .from('producto')
      .insert(campos)
      .select('id')
      .single<{ id: string }>()
    if (error) throw new Error(`No se pudo crear el producto: ${error.message}`)
    productoId = data.id
  }

  // Códigos de barra: se reemplaza el conjunto completo.
  const { data: existentes } = await supabase
    .from('producto_codigo_barra')
    .select('id, codigo')
    .eq('producto_id', productoId)
    .is('eliminado_en', null)

  const actuales = new Set(datos.codigosBarra.filter(Boolean))
  const previos = existentes ?? []

  const aBorrar = previos.filter((p) => !actuales.has(p.codigo as string))
  if (aBorrar.length) {
    await supabase
      .from('producto_codigo_barra')
      .update({ eliminado_en: new Date().toISOString() })
      .in(
        'id',
        aBorrar.map((p) => p.id),
      )
  }

  const yaEstaban = new Set(previos.map((p) => p.codigo as string))
  const aInsertar = [...actuales]
    .filter((c) => !yaEstaban.has(c))
    .map((codigo, i) => ({ producto_id: productoId, codigo, es_principal: i === 0 }))
  if (aInsertar.length) {
    const { error } = await supabase.from('producto_codigo_barra').insert(aInsertar)
    if (error) throw new Error(`Código de barra duplicado o inválido: ${error.message}`)
  }

  // Clasificación multivaluada: se borra y se vuelve a escribir, que
  // para dos o tres filas es más simple y más seguro que diferenciar.
  await supabase.from('producto_animal').delete().eq('producto_id', productoId)
  if (datos.animales.length) {
    await supabase
      .from('producto_animal')
      .insert(datos.animales.map((animal_id) => ({ producto_id: productoId, animal_id })))
  }

  await supabase.from('producto_etapa_vida').delete().eq('producto_id', productoId)
  if (datos.etapas.length) {
    await supabase
      .from('producto_etapa_vida')
      .insert(datos.etapas.map((etapa_vida_id) => ({ producto_id: productoId, etapa_vida_id })))
  }

  // Stock: movimiento, nunca escritura directa del saldo.
  if (datos.stockContado !== null) {
    const diferencia = datos.stockContado - datos.stockActual
    if (diferencia !== 0) {
      const esPrimeraCarga = datos.stockActual === 0
      const { error } = await supabase.from('movimiento_stock').insert({
        producto_id: productoId,
        tipo: esPrimeraCarga ? 'carga_inicial' : 'ajuste',
        cantidad: diferencia,
        motivo: esPrimeraCarga ? 'Carga inicial de inventario' : 'Ajuste por conteo',
        referencia_tipo: 'manual',
        usuario_id: datos.usuarioId,
        operador_id: datos.usuarioId,
      })
      if (error) throw new Error(`No se pudo registrar el stock: ${error.message}`)
    }
  }

  return productoId
}
