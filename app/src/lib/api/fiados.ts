import { supabase } from '@/lib/supabase'
import { hoyEnObera, sumarDias } from '@/lib/api/cheques'
import { enlaceWhatsapp } from '@/lib/api/mayorista'
import { moneda } from '@/lib/tipos'

/*
  ─────────────────────────────────────────────────────────────
  Los fiados

  Fase 03, punto 7. No es cuenta corriente: es otro registro, la cuenta
  de cada persona que se llevó algo fiado, buscada por DNI. Entra por la
  caja, con el medio de pago «Fiado», y se cobra desde la pantalla
  Fiados, con recibo y a la caja del día.
  ─────────────────────────────────────────────────────────────
*/

/** Lo que se tipea en la caja. Es lo que viaja en venta_pago.datos_fiado. */
export interface DatosFiado {
  documento: string
  nombre: string
  domicilio: string
  telefono: string
  /** Cuándo dijo que paga. */
  vence: string
}

/** Cuánto tiempo se le da si no se dice otra cosa. */
export const DIAS_PARA_PAGAR = 30

export function fiadoVacio(hoy = hoyEnObera()): DatosFiado {
  return { documento: '', nombre: '', domicilio: '', telefono: '', vence: sumarDias(hoy, DIAS_PARA_PAGAR) }
}

export const soloDigitos = (t: string) => t.replace(/\D/g, '')

export const dniValido = (t: string) => /^\d{6,9}$/.test(soloDigitos(t))

/** Lo que falta para que la caja acepte el fiado, o null. Las mismas reglas que la base. */
export function faltaEnFiado(d: DatosFiado, hoy = hoyEnObera()): string | null {
  if (!dniValido(d.documento)) return 'Falta el DNI de quien se lo lleva.'
  if (!d.nombre.trim()) return 'Falta el nombre.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.vence)) return 'Falta la fecha en que paga.'
  if (d.vence < hoy) return 'La fecha en que paga no puede ser anterior a hoy.'
  return null
}

export function paraLaBase(d: DatosFiado) {
  return {
    documento: soloDigitos(d.documento),
    nombre: d.nombre.trim(),
    domicilio: d.domicilio.trim(),
    telefono: d.telefono.trim(),
    vence: d.vence,
  }
}

// ───────────────────────────────────────────────────────────────
// El aviso de reincidencia
// ───────────────────────────────────────────────────────────────

export interface AvisoFiado {
  persona_id: string
  documento: string
  nombre: string
  domicilio: string | null
  telefono: string | null
  /** Lo que debe hoy. Negativo: tiene a favor. */
  debe: number
  vencido: number
  fiados: number
  fiado_total: number
  ultimo: string | null
}

/** Si ese DNI ya tuvo un fiado; si no, null. */
export async function avisoFiado(documento: string): Promise<AvisoFiado | null> {
  if (!dniValido(documento)) return null
  const { data, error } = await supabase.rpc('fiado_aviso', { p_documento: soloDigitos(documento) })
  if (error) throw new Error(error.message)
  if (!data) return null
  const a = data as AvisoFiado
  return { ...a, debe: Number(a.debe), vencido: Number(a.vencido), fiado_total: Number(a.fiado_total) }
}

/** «Ojo, este DNI ya tiene una carga anterior», con lo que debe o debió. */
export function textoDelAviso(a: AvisoFiado): string {
  if (a.debe > 0.009) {
    return a.vencido > 0.009
      ? `Debe ${moneda.format(a.debe)}, ${moneda.format(a.vencido)} vencido.`
      : `Debe ${moneda.format(a.debe)}, todavía sin vencer.`
  }
  if (a.fiados === 0) return 'Tuvo un fiado que se anuló.'
  return `Ya pagó todo: se le fió ${a.fiados === 1 ? 'una vez' : `${a.fiados} veces`}, por ${moneda.format(a.fiado_total)}.`
}

// ───────────────────────────────────────────────────────────────
// La pantalla
// ───────────────────────────────────────────────────────────────

export interface FilaFiado {
  persona_id: string
  documento: string
  nombre: string
  domicilio: string | null
  telefono: string | null
  debe: number
  vencido: number
  proxima_fecha: string | null
  proximo_importe: number | null
  primer_vencimiento: string | null
  fiados: number
  ultimo: string | null
}

export async function listarFiados(texto: string, todos: boolean): Promise<FilaFiado[]> {
  const { data, error } = await supabase.rpc('listar_fiados', { p_texto: texto.trim() || null, p_todos: todos })
  if (error) throw new Error(error.message)
  return ((data ?? []) as FilaFiado[]).map((f) => ({
    ...f,
    debe: Number(f.debe),
    vencido: Number(f.vencido),
    proximo_importe: f.proximo_importe === null ? null : Number(f.proximo_importe),
    fiados: Number(f.fiados),
  }))
}

export interface Estadisticas {
  personas_que_deben: number
  personas_con_vencido: number
  debe: number
  vencido: number
  fiados: number
  fiado_total: number
  promedio: number
  cobrado_total: number
  fiado_mes: number
  cobrado_mes: number
}

export async function estadisticasFiados(): Promise<Estadisticas> {
  const { data, error } = await supabase.rpc('fiados_estadisticas')
  if (error) throw new Error(error.message)
  const e = data as Record<keyof Estadisticas, number | string>
  return Object.fromEntries(Object.entries(e).map(([k, v]) => [k, Number(v)])) as unknown as Estadisticas
}

// ─── La cuenta de una persona ───

export interface CuotaFiado {
  fecha: string
  importe: number
}

export interface CambioDeFecha {
  fecha: string
  importe: number
  fijado_en: string
  fijado_por: string | null
  motivo: string | null
  reemplazado_en: string | null
}

export interface PagoImputado {
  fecha: string
  importe: number
  cobro: string | null
  recibo_id: string | null
  recibo_serie: string | null
  recibo_numero: number | null
}

export interface VentaFiada {
  id: string
  fecha: string
  importe: number
  venta_id: string
  venta_codigo: string
  registrado_por: string | null
  anulado_en: string | null
  motivo_anulacion: string | null
  pagado: number
  saldo: number
  vencido: number
  proxima_fecha: string | null
  proximo_importe: number | null
  renglones: { descripcion: string; cantidad: number; precio_unitario: number }[]
  cronograma: CuotaFiado[]
  historia: CambioDeFecha[]
  pagos: PagoImputado[]
}

export interface PagoFiado {
  id: string
  fecha: string
  importe: number
  medio: string
  cobro: string | null
  creado_en: string
  recibo_id: string | null
  recibo_serie: string | null
  recibo_numero: number | null
}

export interface FichaFiado {
  id: string
  documento: string
  nombre: string
  domicilio: string | null
  telefono: string | null
  creado_en: string
  fiados: VentaFiada[]
  pagos: PagoFiado[]
}

const num = (n: unknown) => Number(n)
const numONulo = (n: unknown) => (n === null || n === undefined ? null : Number(n))

export async function fichaFiado(personaId: string): Promise<FichaFiado> {
  const { data, error } = await supabase.rpc('fiado_ficha', { p_persona_id: personaId })
  if (error) throw new Error(error.message)
  const f = data as FichaFiado
  return {
    ...f,
    fiados: f.fiados.map((v) => ({
      ...v,
      importe: num(v.importe),
      pagado: num(v.pagado),
      saldo: num(v.saldo),
      vencido: num(v.vencido),
      proximo_importe: numONulo(v.proximo_importe),
      renglones: v.renglones.map((r) => ({ ...r, cantidad: num(r.cantidad), precio_unitario: num(r.precio_unitario) })),
      cronograma: v.cronograma.map((c) => ({ ...c, importe: num(c.importe) })),
      historia: v.historia.map((c) => ({ ...c, importe: num(c.importe) })),
      pagos: v.pagos.map((p) => ({ ...p, importe: num(p.importe) })),
    })),
    pagos: f.pagos.map((p) => ({ ...p, importe: num(p.importe) })),
  }
}

/** Lo que debe en total: la suma de lo que falta de cada venta fiada. */
export const deudaDeLaFicha = (f: FichaFiado) =>
  Math.round(f.fiados.filter((v) => !v.anulado_en).reduce((s, v) => s + v.saldo, 0) * 100) / 100

export async function guardarFichaFiado(personaId: string, d: { nombre: string; domicilio: string; telefono: string }) {
  const { error } = await supabase.rpc('fiado_guardar_ficha', {
    p_persona_id: personaId,
    p_nombre: d.nombre,
    p_domicilio: d.domicilio,
    p_telefono: d.telefono,
  })
  if (error) throw new Error(error.message)
}

export async function fijarCronograma(fiadoId: string, cuotas: CuotaFiado[], motivo: string) {
  const { error } = await supabase.rpc('fiado_fijar_cronograma', {
    p_fiado_id: fiadoId,
    p_cuotas: cuotas,
    p_motivo: motivo.trim() || null,
  })
  if (error) throw new Error(error.message)
}

/*
  El identificador lo pone la pantalla, una vez por cobro: si se corta
  la conexión con el recibo ya grabado y se aprieta de nuevo, la base
  contesta el mismo recibo en vez de cobrar dos veces.
*/
export async function cobrarFiado(datos: {
  id: string
  personaId: string
  medioPagoId: string
  importe: number
  cajaId: string | null
  fiadoId: string | null
}): Promise<{ id: string; serie: string; numero: number; total: number }> {
  const { data, error } = await supabase.rpc('cobrar_fiado', {
    p_id: datos.id,
    p_persona_id: datos.personaId,
    p_medio_pago_id: datos.medioPagoId,
    p_importe: datos.importe,
    p_caja_id: datos.cajaId,
    p_fiado_id: datos.fiadoId,
  })
  if (error) throw new Error(error.message)
  return data as { id: string; serie: string; numero: number; total: number }
}

// ─── El aviso por WhatsApp ───

/*
  Manual: abre WhatsApp con el número y el mensaje armado, y lo manda
  quien está en el local. Sin API y sin costo.
*/
export function mensajeFiado(
  f: Pick<FilaFiado, 'nombre' | 'debe' | 'vencido' | 'proxima_fecha' | 'proximo_importe'>,
  negocio: string,
): string {
  const nombre = f.nombre.trim().split(/\s+/)[0]
  const fecha = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' })
  const desde = negocio ? ` de ${negocio}` : ''
  if (f.vencido > 0.009) {
    return `Hola ${nombre}, te escribimos${desde}. Te recordamos que tenés ${moneda.format(f.vencido)} vencidos de lo que llevaste fiado (en total debés ${moneda.format(f.debe)}). ¿Cuándo podés pasar? Gracias.`
  }
  if (f.proxima_fecha && f.proximo_importe) {
    return `Hola ${nombre}, te escribimos${desde}. Te recordamos que el ${fecha(f.proxima_fecha)} vence el pago de ${moneda.format(f.proximo_importe)} de lo que llevaste fiado. Gracias.`
  }
  return `Hola ${nombre}, te escribimos${desde}. Te recordamos que debés ${moneda.format(f.debe)} de lo que llevaste fiado. Gracias.`
}

export function whatsappFiado(f: FilaFiado, negocio: string): string | null {
  return enlaceWhatsapp(f.telefono, mensajeFiado(f, negocio))
}

/** Un cronograma de «n» fechas iguales, cada «dias» días, que suma justo «total». */
export function repartirEnFechas(total: number, n: number, desde: string, dias: number): CuotaFiado[] {
  const centavos = Math.round(total * 100)
  const cuota = Math.floor(centavos / n)
  return Array.from({ length: n }, (_, i) => ({
    fecha: sumarDias(desde, dias * i),
    importe: (i === n - 1 ? centavos - cuota * (n - 1) : cuota) / 100,
  }))
}
