import { supabase } from '@/lib/supabase'

/*
  ─────────────────────────────────────────────────────────────
  Las fotos de los productos, para la tienda online

  Acordado con Zubu y Lucas el 19/10: se cargan acá, que es el origen de
  todo el catálogo, y la tienda las toma de la API. Cada foto se achica a
  1200 px del lado más largo y se convierte a WebP antes de subir: es lo
  que pidieron para la web, y una foto de celular de 4 MB queda en unos
  100 KB. Así mil productos con dos fotos entran holgados en el plan
  gratis de la base.

  El archivo va al depósito «productos» y la base anota la foto recién
  cuando el archivo está: una fila sin archivo sería una foto rota en la
  tienda. Las reglas —quién puede, hasta cuántas, el orden— están en la
  base (supabase/migrations/20261019150000_las_imagenes_de_los_productos.sql).
  ─────────────────────────────────────────────────────────────
*/

const DEPOSITO = 'productos'
export const LADO_MAXIMO = 1200
const CALIDAD = 0.82
export const FOTOS_POR_PRODUCTO = 8

export interface FotoDelProducto {
  id: string
  ruta: string
  url: string
  ancho: number | null
  alto: number | null
  orden: number
}

/** El tamaño al que se achica: nunca se agranda, y se respeta la proporción. */
export function medidasAchicadas(ancho: number, alto: number, maximo = LADO_MAXIMO) {
  const mayor = Math.max(ancho, alto)
  if (mayor <= maximo) return { ancho, alto }
  const escala = maximo / mayor
  return { ancho: Math.max(1, Math.round(ancho * escala)), alto: Math.max(1, Math.round(alto * escala)) }
}

/*
  La foto, achicada y en WebP, hecha en la computadora de quien la sube:
  así viaja chica y la base no tiene que procesar nada.
*/
export async function aWebp(
  archivo: Blob,
  maximo = LADO_MAXIMO,
): Promise<{ blob: Blob; ancho: number; alto: number }> {
  let imagen: ImageBitmap
  try {
    imagen = await createImageBitmap(archivo)
  } catch {
    throw new Error('No se pudo leer la imagen. Probá con una foto JPG, PNG o WebP.')
  }
  const { ancho, alto } = medidasAchicadas(imagen.width, imagen.height, maximo)
  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto
  const contexto = lienzo.getContext('2d')
  if (!contexto) throw new Error('Esta computadora no pudo preparar la foto.')
  // Fondo blanco: un PNG transparente en WebP queda transparente igual,
  // pero así se ve bien en cualquier fondo de la tienda.
  contexto.fillStyle = '#ffffff'
  contexto.fillRect(0, 0, ancho, alto)
  contexto.drawImage(imagen, 0, 0, ancho, alto)
  imagen.close()

  const blob = await new Promise<Blob | null>((listo) => lienzo.toBlob(listo, 'image/webp', CALIDAD))
  // Un navegador que no sabe hacer WebP devuelve PNG sin avisar: el
  // depósito lo rechazaría con un error que no se entiende.
  if (!blob || blob.type !== 'image/webp') {
    throw new Error('Esta computadora no puede convertir fotos a WebP. Subilas desde otra o actualizá el navegador.')
  }
  return { blob, ancho, alto }
}

function urlDe(ruta: string): string {
  return supabase.storage.from(DEPOSITO).getPublicUrl(ruta).data.publicUrl
}

export async function fotosDe(productoId: string): Promise<FotoDelProducto[]> {
  const { data, error } = await supabase
    .from('producto_imagen')
    .select('id, ruta, ancho, alto, orden')
    .eq('producto_id', productoId)
    .is('eliminado_en', null)
    .order('orden')
    .order('creado_en')
  if (error) throw new Error(error.message)
  return (data ?? []).map((f) => ({ ...(f as Omit<FotoDelProducto, 'url'>), url: urlDe(f.ruta as string) }))
}

/*
  Sube una foto y la anota. Si la base no la acepta —se pasó del máximo,
  el producto se dio de baja—, el archivo se borra: no puede quedar un
  archivo suelto ocupando lugar sin que ninguna ficha lo muestre.
*/
export async function subirFoto(productoId: string, archivo: Blob): Promise<string> {
  const { blob, ancho, alto } = await aWebp(archivo)
  const ruta = `${productoId}/${crypto.randomUUID()}.webp`

  const { error: errorSubida } = await supabase.storage.from(DEPOSITO).upload(ruta, blob, {
    contentType: 'image/webp',
    cacheControl: '31536000',
    upsert: false,
  })
  if (errorSubida) throw new Error(`No se pudo subir la foto: ${errorSubida.message}`)

  const { data, error } = await supabase.rpc('agregar_imagen_producto', {
    p_producto_id: productoId,
    p_ruta: ruta,
    p_ancho: ancho,
    p_alto: alto,
  })
  if (error) {
    await supabase.storage.from(DEPOSITO).remove([ruta])
    throw new Error(error.message)
  }
  return data as string
}

export async function quitarFoto(fotoId: string): Promise<void> {
  const { data: ruta, error } = await supabase.rpc('quitar_imagen_producto', { p_imagen_id: fotoId })
  if (error) throw new Error(error.message)
  // La foto ya no sale en la tienda. Si el archivo no se pudo borrar, queda
  // ocupando lugar pero no molesta: no se avisa como si hubiera fallado.
  if (ruta) await supabase.storage.from(DEPOSITO).remove([ruta as string])
}

/** La de la lista queda en ese orden; la primera es la principal. */
export async function ordenarFotos(productoId: string, ids: string[]): Promise<void> {
  const { error } = await supabase.rpc('ordenar_imagenes_producto', { p_producto_id: productoId, p_imagenes: ids })
  if (error) throw new Error(error.message)
}

/*
  ─── La subida de a muchas ───

  Las fotos se nombran con el código del producto o su código de barras:
  «DEMO-002.jpg», «7790000000002.png». Para más de una foto del mismo
  producto se le agrega un número: «DEMO-002-2.jpg», «DEMO-002_2.jpg»,
  «DEMO-002 (2).jpg». Así se cargan cientos de una vez, sin abrir ficha
  por ficha.
*/
export interface ProductoParaFotos {
  id: string
  codigo: string
  nombre: string
  codigos_barra: string[]
}

export interface Emparejado {
  archivo: string
  /** Lo que se buscó: el nombre sin la extensión ni el número de foto. */
  clave: string
  producto: ProductoParaFotos | null
}

const normalizar = (t: string) => t.trim().toUpperCase()

export function claveDelArchivo(nombre: string): string {
  const sinExtension = nombre.replace(/\.[^.]+$/, '')
  return sinExtension.replace(/(?:\s*\(\d+\)|[-_]\d{1,2})$/, '').trim()
}

export function emparejarArchivos(nombres: string[], productos: ProductoParaFotos[]): Emparejado[] {
  const porCodigo = new Map<string, ProductoParaFotos>()
  for (const p of productos) {
    porCodigo.set(normalizar(p.codigo), p)
    for (const cb of p.codigos_barra) porCodigo.set(normalizar(cb), p)
  }
  return nombres.map((archivo) => {
    const sinExtension = archivo.replace(/\.[^.]+$/, '')
    // Primero el nombre entero —un código puede terminar en «-2» de verdad—, después sin el número de foto.
    const exacto = porCodigo.get(normalizar(sinExtension))
    const clave = exacto ? sinExtension.trim() : claveDelArchivo(archivo)
    return { archivo, clave, producto: exacto ?? porCodigo.get(normalizar(clave)) ?? null }
  })
}

/*
  Todas las filas, de a mil: el servidor nunca entrega más de mil por
  pedido, y con el catálogo real (2.281 productos) una consulta sola
  dejaba afuera más de la mitad sin avisar.
*/
export async function todasLasFilas<T>(
  pedir: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await pedir(desde, desde + 999)
    if (error) throw new Error(error.message)
    filas.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) return filas
  }
}

export async function productosParaFotos(): Promise<ProductoParaFotos[]> {
  const [productos, codigos] = await Promise.all([
    todasLasFilas<{ id: string; codigo: string; nombre_interno: string }>((desde, hasta) =>
      supabase.from('producto').select('id, codigo, nombre_interno').is('eliminado_en', null).order('id').range(desde, hasta),
    ),
    todasLasFilas<{ producto_id: string; codigo: string }>((desde, hasta) =>
      supabase.from('producto_codigo_barra').select('producto_id, codigo').is('eliminado_en', null).order('id').range(desde, hasta),
    ),
  ])
  const barras = new Map<string, string[]>()
  for (const c of codigos) {
    const lista = barras.get(c.producto_id) ?? []
    lista.push(c.codigo)
    barras.set(c.producto_id, lista)
  }
  return productos.map((p) => ({
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre_interno,
    codigos_barra: barras.get(p.id) ?? [],
  }))
}
