import { supabase } from '@/lib/supabase'
import type { EstadoStock } from '@/lib/tipos'
import { definirColchonTienda, definirVentaOnline, estadoEnTienda } from '@/lib/api/ventaOnline'
import type { EstadoEnTienda } from '@/lib/api/ventaOnline'

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
  rubro_arca_id: number | null
  /** A quién se le compra. Es el eje del aumento masivo de precios. */
  proveedor_id: string | null
  alicuota_iva_id: number
  condicion_iva: 'gravado' | 'exento' | 'no_gravado'
  precio_venta: number
  costo: number | null
  margen_sobre_costo: number | null
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
  rubrosArca: { id: number; descripcion: string }[]
  proveedores: Referencia[]
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

export interface ResultadoBaja {
  id: string
  codigo: string | null
  resultado: 'baja' | 'omitido'
  detalle: string | null
}

/*
  Da de baja productos.

  Baja lógica, nunca borrado: el producto se marca y esa marca viaja a
  las terminales del mostrador. Un borrado físico no viajaría —el
  sincronizador trae lo que cambió, y una fila que ya no está no
  cambió— y el producto quedaría vendible para siempre en las máquinas
  que estuvieron desconectadas.
*/
export async function darDeBajaProductos(ids: string[]): Promise<ResultadoBaja[]> {
  const { data, error } = await supabase.rpc('dar_de_baja_productos', { p_ids: ids })
  if (error) throw new Error(error.message)
  return (data ?? []) as ResultadoBaja[]
}

export async function restaurarProductos(ids: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('restaurar_productos', { p_ids: ids })
  if (error) throw new Error(error.message)
  return Number(data)
}

/*
  Los productos dados de baja.

  Se consultan contra la tabla y no contra vista_stock a propósito: esa
  vista filtra las bajas y de ahí lee el punto de venta. Tocarla para
  poder listarlas acá haría que reaparezcan en el buscador del
  mostrador, que es justo lo que la baja evita.
*/
export async function listarProductosDeBaja(texto: string) {
  let q = supabase
    .from('producto')
    .select('id, codigo, nombre_interno, precio_venta, unidad_medida, eliminado_en', {
      count: 'exact',
    })
    .not('eliminado_en', 'is', null)
    .order('eliminado_en', { ascending: false })
    .limit(LIMITE_LISTADO)

  if (texto) {
    const patron = `%${texto.replace(/[%_]/g, '')}%`
    q = q.or(`codigo.ilike.${patron},nombre_interno.ilike.${patron}`)
  }

  const { data, error, count } = await q
  if (error) throw new Error(error.message)

  type Baja = {
    id: string
    codigo: string
    nombre_interno: string
    precio_venta: number
    unidad_medida: string
    eliminado_en: string
  }
  return { filas: (data ?? []) as Baja[], total: count ?? 0 }
}

/*
  La categoría y la marca filtran igual que la acción de «vender online
  la categoría entera» en la base (definir_venta_online_por_clasificacion):
  los que no están dados de baja, de esa categoría y esa marca. Así el
  total que muestra la lista es el que se confirma al prenderlos.
*/
export async function listarProductos(
  texto: string,
  soloSinRevisar: boolean,
  categoriaId: string | null = null,
  marcaId: string | null = null,
) {
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
  if (categoriaId) q = q.eq('categoria_id', categoriaId)
  if (marcaId) q = q.eq('marca_id', marcaId)

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

/*
  El umbral que le rige a un producto, y de dónde sale.

  Son tres niveles y gana el más específico: el del producto, si no el
  de su categoría, si no el general de `configuracion`. La vista
  `vista_stock` ya resuelve esa cascada, así que el número que se
  muestra es EL MISMO que usa el listado para pintar "Stock bajo" — no
  una segunda cuenta que algún día se separe de la primera.

  `propio` es lo otro que hace falta saber: sin eso la pantalla no
  puede distinguir "tiene 5 porque alguien lo puso" de "tiene 5 porque
  lo hereda", y esas dos cosas se editan distinto.
*/
export interface UmbralDelProducto {
  bajo: number
  critico: number
  propio: boolean
}

export async function obtenerProducto(id: string) {
  const [producto, codigos, animales, etapas, umbralPropio, vigente, tienda] = await Promise.all([
    supabase.from('producto').select('*').eq('id', id).single<ProductoDetalle>(),
    supabase
      .from('producto_codigo_barra')
      .select('id, codigo, es_principal')
      .eq('producto_id', id)
      .is('eliminado_en', null),
    supabase.from('producto_animal').select('animal_id').eq('producto_id', id),
    supabase.from('producto_etapa_vida').select('etapa_vida_id').eq('producto_id', id),
    supabase
      .from('umbral_stock')
      .select('bajo, critico')
      .eq('producto_id', id)
      .eq('ambito', 'producto')
      .maybeSingle<{ bajo: number; critico: number }>(),
    supabase
      .from('vista_stock')
      .select('umbral_bajo, umbral_critico')
      .eq('producto_id', id)
      .maybeSingle<{ umbral_bajo: number; umbral_critico: number }>(),
    /*
      Cómo está en la tienda online. Si esa consulta falla, la ficha se
      abre igual: no poder ver la línea de la tienda no puede impedir
      corregir un precio.
    */
    estadoEnTienda([id])
      .then((m) => m.get(id) ?? null)
      .catch(() => null as EstadoEnTienda | null),
  ])

  if (producto.error) throw new Error(producto.error.message)

  const umbral: UmbralDelProducto = {
    bajo: Number(umbralPropio.data?.bajo ?? vigente.data?.umbral_bajo ?? 0),
    critico: Number(umbralPropio.data?.critico ?? vigente.data?.umbral_critico ?? 0),
    propio: !!umbralPropio.data,
  }

  return {
    producto: producto.data,
    codigosBarra: codigos.data ?? [],
    animales: (animales.data ?? []).map((a) => a.animal_id as string),
    etapas: (etapas.data ?? []).map((e) => e.etapa_vida_id as string),
    umbral,
    tienda,
  }
}

export async function cargarReferencias(): Promise<Referencias> {
  const [cat, mar, pre, ani, eta, ali, rub, prov] = await Promise.all([
    supabase.from('categoria').select('id, nombre').is('eliminado_en', null).order('orden'),
    supabase.from('marca').select('id, nombre').is('eliminado_en', null).order('nombre'),
    supabase.from('presentacion').select('id, nombre').is('eliminado_en', null).order('nombre'),
    supabase.from('animal').select('id, nombre').is('eliminado_en', null).order('orden'),
    supabase.from('etapa_vida').select('id, nombre').is('eliminado_en', null).order('orden'),
    supabase.from('alicuota_iva').select('id, descripcion').eq('activo', true).order('id'),
    supabase.from('rubro_arca').select('id, descripcion').eq('activo', true).order('orden'),
    supabase.from('proveedor').select('id, nombre').is('eliminado_en', null).order('nombre'),
  ])
  return {
    categorias: (cat.data ?? []) as Referencia[],
    marcas: (mar.data ?? []) as Referencia[],
    presentaciones: (pre.data ?? []) as Referencia[],
    animales: (ani.data ?? []) as Referencia[],
    etapas: (eta.data ?? []) as Referencia[],
    alicuotas: (ali.data ?? []) as { id: number; descripcion: string }[],
    rubrosArca: (rub.data ?? []) as { id: number; descripcion: string }[],
    /*
      Vacío si el usuario no tiene `proveedores.ver`: la RLS devuelve
      cero filas en vez de un error, así que el editor simplemente no
      ofrece el desplegable. Es el comportamiento correcto.
    */
    proveedores: (prov.data ?? []) as Referencia[],
  }
}

export type TablaReferencia = 'categoria' | 'marca' | 'presentacion' | 'animal' | 'etapa_vida'

/** Convierte "Alimento Balanceado" en "alimento-balanceado". */
function aSlug(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/*
  Crea una categoría, marca, presentación, animal o etapa desde la misma
  pantalla de producto.

  Sin esto, cargar un producto de una marca nueva obliga a frenar, ir a
  otra pantalla, crearla y volver. Multiplicado por 2.261 productos, esa
  fricción es la diferencia entre que el operativo de carga avance o no.
*/
export async function crearReferencia(
  tabla: TablaReferencia,
  nombre: string,
): Promise<Referencia> {
  const limpio = nombre.trim()
  if (!limpio) throw new Error('El nombre no puede estar vacío.')

  const { data, error } = await supabase
    .from(tabla)
    .insert({ nombre: limpio, slug: aSlug(limpio) })
    .select('id, nombre')
    .single<Referencia>()

  if (error) {
    if (error.code === '23505') throw new Error(`Ya existe "${limpio}".`)
    throw new Error(error.message)
  }
  return data
}

export interface DatosGuardado {
  id?: string
  campos: Partial<ProductoDetalle>
  codigosBarra: string[]
  animales: string[]
  etapas: string[]
  /** Cantidad contada. Si es null no se toca el stock. */
  stockContado: number | null
  /*
    Umbral propio del producto. `null` significa "no tiene uno propio":
    se borra el que hubiera y vuelve a heredar el de su categoría o el
    general. No es lo mismo que poner cero — cero es un umbral válido,
    y querría decir "avisame recién cuando no quede nada".
  */
  umbral: { bajo: number; critico: number } | null
  stockActual: number
  marcarRevisado: boolean
  usuarioId: string
  /*
    «Vender online» y el colchón del producto, como están en el
    formulario y como estaban al abrirlo. Se mandan sólo si cambiaron:
    cada escritura le mueve la fecha al producto, y eso se lo vuelve a
    mandar a la tienda y a las terminales.
  */
  tienda: { vender: boolean; colchon: number | null }
  tiendaAntes: { vender: boolean; colchon: number | null }
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

  /*
    Umbral propio del producto.

    Pasa por `definir_umbral_producto()` y no por un upsert directo: la
    unicidad la da un índice PARCIAL (`where ambito = 'producto'`), y
    PostgREST no emite el predicado que Postgres necesita para
    inferirlo. El upsert falla siempre. Está explicado en la migración
    `20260908110000`, con el error textual.

    Con los dos valores en null la función borra el umbral y el producto
    vuelve a heredar el de su categoría o el general. Es la única forma
    de deshacer uno puesto por error — y no es lo mismo que poner cero.
  */
  const { error: errorUmbral } = await supabase.rpc('definir_umbral_producto', {
    p_producto_id: productoId,
    p_bajo: datos.umbral?.bajo ?? null,
    p_critico: datos.umbral?.critico ?? null,
  })
  // La base exige crítico <= bajo. Se traduce, porque el mensaje de
  // Postgres nombra una restricción y no un problema.
  if (errorUmbral) {
    throw new Error(
      errorUmbral.message.includes('umbral_critico_menor_o_igual')
        ? 'El nivel crítico tiene que ser menor o igual que el nivel bajo.'
        : `No se pudo guardar el aviso de stock: ${errorUmbral.message}`,
    )
  }

  try {
    if (datos.tienda.colchon !== datos.tiendaAntes.colchon) {
      await definirColchonTienda(productoId, datos.tienda.colchon)
    }
    if (datos.tienda.vender !== datos.tiendaAntes.vender) {
      await definirVentaOnline([productoId], datos.tienda.vender)
    }
  } catch (e) {
    // El producto ya quedó guardado; lo que falló es sólo la tienda, y
    // el mensaje tiene que decirlo para que nadie lo vuelva a cargar.
    throw new Error(
      `El producto se guardó, pero no se pudo cambiar la venta online: ${e instanceof Error ? e.message : e}`,
    )
  }

  return productoId
}
