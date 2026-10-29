import { supabase } from '@/lib/supabase'
import { aWebp } from '@/lib/api/imagenes'

/*
  ─────────────────────────────────────────────────────────────
  La foto del remito firmado

  Fase 03, punto 1, ④. El remito vuelve firmado y se le saca una foto,
  con el celular o desde la PC. Queda a la vista en Remitos y en la
  cuenta corriente del cliente: quién firmó y cuándo.

  El depósito es privado —hay firmas y nombres— y la foto se ve con un
  enlace que dura unos minutos. Las reglas están en la base
  (supabase/migrations/20261029220000_el_remito_firmado.sql). Si se sube
  otra foto del mismo remito, la anterior queda guardada y se muestra la
  última.
  ─────────────────────────────────────────────────────────────
*/

const DEPOSITO = 'remitos-firmados'

/*
  Más grande que las fotos de los productos: es un papel con letra chica
  y una firma, y tiene que poder leerse. En WebP queda en unos cientos de
  KB.
*/
const LADO_MAXIMO = 2000

export interface FirmaDeRemito {
  id: string
  remito_id: string
  ruta: string
  firmo: string | null
  firmado_el: string
  subido_en: string
  subido_por: string | null
  /** Cuántas fotos tiene el remito, con esta. */
  fotos: number
}

interface FilaFirma {
  id: string
  remito_id: string
  ruta: string
  firmo: string | null
  firmado_el: string
  subido_en: string
  usuario: { nombre: string } | { nombre: string }[] | null
}

const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

/** La última foto de cada remito, por remito. Vienen ordenadas, la más nueva primero. */
export function ultimaPorRemito(filas: FilaFirma[]): Map<string, FirmaDeRemito> {
  const porRemito = new Map<string, FirmaDeRemito>()
  for (const f of filas) {
    const ya = porRemito.get(f.remito_id)
    if (ya) {
      ya.fotos += 1
      continue
    }
    porRemito.set(f.remito_id, {
      id: f.id,
      remito_id: f.remito_id,
      ruta: f.ruta,
      firmo: f.firmo,
      firmado_el: f.firmado_el,
      subido_en: f.subido_en,
      subido_por: uno(f.usuario)?.nombre ?? null,
      fotos: 1,
    })
  }
  return porRemito
}

const COLUMNAS = 'id, remito_id, ruta, firmo, firmado_el, subido_en, usuario:subido_por(nombre)'

export async function firmasDeRemitos(remitoIds: string[]): Promise<Map<string, FirmaDeRemito>> {
  if (!remitoIds.length) return new Map()
  const { data, error } = await supabase
    .from('remito_firma')
    .select(COLUMNAS)
    .in('remito_id', remitoIds)
    .order('subido_en', { ascending: false })
  if (error) throw new Error(error.message)
  return ultimaPorRemito((data ?? []) as unknown as FilaFirma[])
}

/*
  Para la cuenta corriente, que habla de ventas y no de remitos: la última
  foto firmada de cada venta, con el número del remito.
*/
export interface FirmaDeVenta extends FirmaDeRemito {
  venta_id: string
  serie: string
  numero: number
}

export async function firmasDeVentas(ventaIds: string[]): Promise<Map<string, FirmaDeVenta>> {
  if (!ventaIds.length) return new Map()
  const { data, error } = await supabase
    .from('remito_firma')
    .select(`${COLUMNAS}, remito:remito_id!inner(venta_id, serie, numero)`)
    .in('remito.venta_id', ventaIds)
    .order('subido_en', { ascending: false })
  if (error) throw new Error(error.message)

  const filas = (data ?? []) as unknown as (FilaFirma & {
    remito: { venta_id: string; serie: string; numero: number } | { venta_id: string; serie: string; numero: number }[]
  })[]
  const ultimas = ultimaPorRemito(filas)
  const porVenta = new Map<string, FirmaDeVenta>()
  for (const f of filas) {
    const r = uno(f.remito)
    const ultima = ultimas.get(f.remito_id)
    if (!r || !ultima || porVenta.has(r.venta_id)) continue
    porVenta.set(r.venta_id, { ...ultima, venta_id: r.venta_id, serie: r.serie, numero: r.numero })
  }
  return porVenta
}

/** Un enlace para ver la foto, que vence a los diez minutos. */
export async function urlDeFirma(ruta: string): Promise<string> {
  const { data, error } = await supabase.storage.from(DEPOSITO).createSignedUrl(ruta, 600)
  if (error || !data) throw new Error('No se pudo abrir la foto. Probá de nuevo.')
  return data.signedUrl
}

/*
  Sube la foto y la anota. El archivo va primero: la base sólo anota una
  foto que ya está. Si el archivo subió y la anotación falló, queda un
  archivo suelto que no se muestra en ningún lado; volver a subir lo
  resuelve.
*/
export async function subirRemitoFirmado(
  remitoId: string,
  archivo: Blob,
  firmo: string,
  firmadoEl: string,
): Promise<void> {
  const { blob } = await aWebp(archivo, LADO_MAXIMO)
  const ruta = `${remitoId}/${crypto.randomUUID()}.webp`
  const { error: errorSubida } = await supabase.storage.from(DEPOSITO).upload(ruta, blob, {
    contentType: 'image/webp',
    upsert: false,
  })
  if (errorSubida) throw new Error(`No se pudo subir la foto: ${errorSubida.message}`)

  const { error } = await supabase.rpc('registrar_remito_firmado', {
    p_remito_id: remitoId,
    p_ruta: ruta,
    p_firmo: firmo,
    p_firmado_el: firmadoEl,
  })
  if (error) throw new Error(error.message)
}
