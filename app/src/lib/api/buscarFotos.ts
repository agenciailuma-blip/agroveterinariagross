import { supabase } from '@/lib/supabase'
import { todasLasFilas } from '@/lib/api/imagenes'

/*
  ─────────────────────────────────────────────────────────────
  Buscar las fotos en internet

  Lo eligió Lucas el 20/10: el sistema busca en Google Imágenes, le
  propone hasta cuatro fotos por producto, y él acepta o descarta. La
  búsqueda y la bajada las hace el servidor (función buscar-fotos), que
  tiene la clave del buscador; lo aceptado se sube como cualquier otra
  foto (subirFoto en lib/api/imagenes.ts): achicada y en WebP.

  Los riesgos, que no resuelve el sistema sino la mirada de Lucas: una
  foto parecida que es otra presentación (7,5 kg contra 15 kg), y fotos
  de otros comercios. Por eso cada una dice de qué sitio sale.
  ─────────────────────────────────────────────────────────────
*/

export interface FotoEncontrada {
  url: string
  /** Qué parte del borde es blanco, de 0 a 1. Lo mide la pantalla. */
  blancura?: number
  /** La vista previa, ya bajada por el servidor (data:…). */
  miniatura: string
  ancho: number | null
  alto: number | null
  titulo: string
  sitio: string
  pagina: string | null
}

export interface ProductoSinFoto {
  id: string
  codigo: string
  nombre: string
  nombre_publico: string | null
  marca: string | null
  codigos_barra: string[]
  vende_online: boolean
}

/*
  Con qué se busca: el nombre público, que es el que se escribe para
  afuera; si no tiene, el interno. La marca adelante si el nombre no la
  dice ya. Lucas lo puede cambiar antes de buscar.
*/
export function consultaDe(p: { nombre: string; nombre_publico: string | null; marca: string | null }): string {
  const nombre = (p.nombre_publico ?? '').trim() || p.nombre.trim()
  const marca = (p.marca ?? '').trim()
  if (!marca || nombre.toLowerCase().includes(marca.toLowerCase())) return nombre
  return `${marca} ${nombre}`
}

/*
  ─── El fondo blanco ───

  Lucas pidió el 21/10 fotos con fondo blanco, sin marca de agua ni
  publicidad de otro comercio. El fondo se puede medir: se mira el
  borde de la vista previa, y si casi todo es blanco, el producto está
  sobre fondo blanco. La marca de agua y el logo de otro comercio no se
  pueden medir: eso lo ve Lucas, y por eso cada foto dice de qué sitio
  sale.
*/

/** Desde cuánto borde blanco se considera «fondo blanco». */
export const FONDO_BLANCO = 0.9
/** Cuántas se le muestran a Lucas por producto. */
export const FOTOS_A_MOSTRAR = 4

/**
  Qué parte del borde de la imagen es blanco o transparente. Los datos
  son los de un lienzo: cuatro números por punto (rojo, verde, azul y
  opacidad).
*/
export function blancuraDelBorde(datos: ArrayLike<number>, ancho: number, alto: number): number {
  const banda = Math.max(1, Math.round(Math.min(ancho, alto) * 0.04))
  let blancos = 0
  let total = 0
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const enBorde = x < banda || y < banda || x >= ancho - banda || y >= alto - banda
      if (!enBorde) continue
      const i = (y * ancho + x) * 4
      const transparente = datos[i + 3] < 20
      const blanco = datos[i] >= 235 && datos[i + 1] >= 235 && datos[i + 2] >= 235
      if (transparente || blanco) blancos++
      total++
    }
  }
  return total === 0 ? 0 : blancos / total
}

/** Mide el fondo de la vista previa en un lienzo chico. Si no se puede, 0. */
export async function medirFondo(miniatura: string): Promise<number> {
  try {
    const imagen = new Image()
    imagen.src = miniatura
    await imagen.decode()
    const lado = 64
    const lienzo = document.createElement('canvas')
    lienzo.width = lado
    lienzo.height = lado
    const contexto = lienzo.getContext('2d', { willReadFrequently: true })
    if (!contexto) return 0
    contexto.drawImage(imagen, 0, 0, lado, lado)
    return blancuraDelBorde(contexto.getImageData(0, 0, lado, lado).data, lado, lado)
  } catch {
    return 0
  }
}

/**
  Las que se le muestran a Lucas: primero las de fondo blanco, y dentro
  de cada grupo, el orden de Google, que ya pone primero lo que más se
  parece a lo buscado.
*/
export function lasQueSeMuestran(fotos: FotoEncontrada[], cuantas = FOTOS_A_MOSTRAR): FotoEncontrada[] {
  const blanca = (f: FotoEncontrada) => (f.blancura ?? 0) >= FONDO_BLANCO
  return [...fotos.filter(blanca), ...fotos.filter((f) => !blanca(f))].slice(0, cuantas)
}

/** Los que dicen el texto en el nombre, el nombre público o el código, sin importar acentos ni mayúsculas. */
export function filtrarPorNombre(productos: ProductoSinFoto[], texto: string): ProductoSinFoto[] {
  const normal = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const buscado = normal(texto.trim())
  if (!buscado) return productos
  return productos.filter((p) => normal(`${p.nombre} ${p.nombre_publico ?? ''} ${p.codigo}`).includes(buscado))
}

/** Los productos sin ninguna foto: primero los que se venden online, después por nombre. */
export async function productosSinFoto(): Promise<ProductoSinFoto[]> {
  const [productos, conFoto, codigos, online] = await Promise.all([
    todasLasFilas<{ id: string; codigo: string; nombre_interno: string; nombre_publico: string | null; marca: { nombre: string } | null }>(
      (desde, hasta) =>
        supabase
          .from('producto')
          .select('id, codigo, nombre_interno, nombre_publico, marca:marca_id(nombre)')
          .is('eliminado_en', null)
          .order('id')
          .range(desde, hasta),
    ),
    todasLasFilas<{ producto_id: string }>((desde, hasta) =>
      supabase.from('producto_imagen').select('producto_id').is('eliminado_en', null).order('id').range(desde, hasta),
    ),
    todasLasFilas<{ producto_id: string; codigo: string }>((desde, hasta) =>
      supabase.from('producto_codigo_barra').select('producto_id, codigo').is('eliminado_en', null).order('id').range(desde, hasta),
    ),
    todasLasFilas<{ producto_id: string }>((desde, hasta) =>
      supabase.from('canal_producto').select('producto_id').eq('publicar', true).order('producto_id').range(desde, hasta),
    ),
  ])
  const tienen = new Set(conFoto.map((f) => f.producto_id))
  const publicados = new Set(online.map((f) => f.producto_id))
  const barras = new Map<string, string[]>()
  for (const c of codigos) barras.set(c.producto_id, [...(barras.get(c.producto_id) ?? []), c.codigo])

  return productos
    .filter((p) => !tienen.has(p.id))
    .map((p) => ({
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre_interno,
      nombre_publico: p.nombre_publico,
      marca: p.marca?.nombre ?? null,
      codigos_barra: barras.get(p.id) ?? [],
      vende_online: publicados.has(p.id),
    }))
    .sort((a, b) => Number(b.vende_online) - Number(a.vende_online) || a.nombre.localeCompare(b.nombre, 'es'))
}

/** El mensaje que mandó el servidor, o uno genérico si la falla fue de la red. */
async function mensajeDe(error: unknown, generico: string): Promise<string> {
  const contexto = (error as { context?: Response }).context
  if (contexto && typeof contexto.json === 'function') {
    try {
      const cuerpo = await contexto.json()
      if (cuerpo?.error) return String(cuerpo.error)
    } catch {
      // No era JSON: falló la red.
    }
  }
  return generico
}

async function preguntar(consulta: string, blanco: boolean): Promise<FotoEncontrada[]> {
  const { data, error } = await supabase.functions.invoke('buscar-fotos', { body: { accion: 'buscar', consulta, blanco } })
  if (error) throw new Error(await mensajeDe(error, 'No se pudo buscar. Revisá la conexión y probá de nuevo.'))
  return (data as { resultados: FotoEncontrada[] }).resultados
}

/*
  Busca, mide el fondo de cada una y devuelve las que se le muestran a
  Lucas. Primero con el filtro de color blanco de Google Imágenes —el
  21/10, con «Royal Canin Gato Adulto 7,5 kg», devolvió otras fotos que
  sin él—; si así no encuentra nada, sin el filtro, que gasta una
  búsqueda más.
*/
export async function buscarFotos(consulta: string): Promise<FotoEncontrada[]> {
  let fotos = await preguntar(consulta, true)
  if (fotos.length === 0) fotos = await preguntar(consulta, false)
  const medidas = await Promise.all(fotos.map(async (f) => ({ ...f, blancura: await medirFondo(f.miniatura) })))
  return lasQueSeMuestran(medidas)
}

/** La foto elegida, bajada por el servidor: lista para subirFoto. */
export async function traerFoto(url: string): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke('buscar-fotos', { body: { accion: 'traer', url } })
  if (error) throw new Error(await mensajeDe(error, 'No se pudo bajar la foto. Elegí otra.'))
  return data as Blob
}
