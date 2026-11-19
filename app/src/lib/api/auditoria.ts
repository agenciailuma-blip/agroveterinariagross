import { supabase } from '@/lib/supabase'
import { aExcel, descargar, nombreDeArchivo } from '@/lib/importacion/exportar'
import type { Celda } from '@/lib/importacion/exportar'

/*
  ─────────────────────────────────────────────────────────────
  El registro de auditoría (19/11)

  Administración → Registro de auditoría. La lista la arma la base
  (registro_de_auditoria): junta los cambios de fichas y configuración,
  que se anotan solos desde el 19/11, con los rastros que cada operación
  ya guardaba —anulaciones, precios cambiados en la venta, autorizaciones,
  cajas—. Lo ve quien tenga «Ver el registro de auditoría»: arranca sólo
  en el Administrador. Propuesta: docs/propuesta-registro-de-auditoria.md
  ─────────────────────────────────────────────────────────────
*/

export type TipoEvento =
  | 'anulacion'
  | 'devolucion'
  | 'precio'
  | 'autorizacion'
  | 'caja'
  | 'stock'
  | 'ficha'
  | 'permisos'
  | 'configuracion'

export const TIPOS: { clave: TipoEvento; etiqueta: string }[] = [
  { clave: 'anulacion', etiqueta: 'Anulaciones' },
  { clave: 'devolucion', etiqueta: 'Devoluciones' },
  { clave: 'precio', etiqueta: 'Precios' },
  { clave: 'autorizacion', etiqueta: 'Autorizaciones' },
  { clave: 'caja', etiqueta: 'Caja' },
  { clave: 'stock', etiqueta: 'Stock' },
  { clave: 'ficha', etiqueta: 'Productos y clientes' },
  { clave: 'permisos', etiqueta: 'Usuarios y permisos' },
  { clave: 'configuracion', etiqueta: 'Configuración' },
]

export interface Evento {
  momento: string
  tipo: TipoEvento
  que: string
  detalle: string | null
  usuario_id: string | null
  usuario: string | null
  puesto: string | null
  referencia: string | null
  referencia_id: string | null
  antes: Record<string, unknown> | null
  despues: Record<string, unknown> | null
}

export interface Filtros {
  desde: string // AAAA-MM-DD, o vacío
  hasta: string // AAAA-MM-DD inclusive, o vacío
  usuarioId: string
  tipo: TipoEvento | ''
  texto: string
}

export const LIMITE = 500

/** Las fechas del filtro, como día entero en Oberá (UTC−3). */
export function rangoDeFechas(desde: string, hasta: string): { desde: string | null; hasta: string | null } {
  const dia = (f: string) => `${f}T00:00:00-03:00`
  let fin: string | null = null
  if (hasta) {
    const d = new Date(`${hasta}T12:00:00-03:00`)
    d.setDate(d.getDate() + 1)
    const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    fin = dia(s)
  }
  return { desde: desde ? dia(desde) : null, hasta: fin }
}

export async function listarEventos(f: Filtros): Promise<Evento[]> {
  const { desde, hasta } = rangoDeFechas(f.desde, f.hasta)
  const { data, error } = await supabase.rpc('registro_de_auditoria', {
    p_desde: desde,
    p_hasta: hasta,
    p_usuario: f.usuarioId || null,
    p_tipo: f.tipo || null,
    p_texto: f.texto.trim() || null,
    p_limite: LIMITE,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as Evento[]
}

/*
  Los nombres de las columnas, como los ve Gross. Lo que no está acá se
  muestra con los guiones bajos cambiados por espacios.
*/
const CAMPOS: Record<string, string> = {
  precio_venta: 'precio',
  precio: 'precio',
  costo: 'costo',
  margen_sobre_costo: 'margen',
  alicuota_iva_id: 'IVA',
  nombre_interno: 'nombre',
  nombre_publico: 'nombre en la web',
  activo: 'activo',
  eliminado_en: 'dado de baja',
  limite_credito: 'límite de crédito',
  cuenta_corriente: 'cuenta corriente',
  dias_vencimiento: 'días de vencimiento',
  lista_precio_id: 'lista de precios',
  descuento_porcentaje: 'descuento',
  precio_a_convenir: 'precio a convenir',
  pide_proforma: 'pide proforma',
  mayorista: 'mayorista',
  rol_id: 'rol',
  opera_con_pin: 'opera con PIN',
  afecta_caja: 'entra al arqueo de caja',
  admite_cuotas: 'admite cuotas',
  cuotas_maximas: 'cuotas',
  ajuste_porcentaje: 'ajuste',
  es_punto_de_encuentro: 'escucha a las demás',
  punto_venta_id: 'punto de venta',
  deposito_id: 'depósito',
  valor: 'valor',
  precio_en_cada_venta: 'precio en cada venta',
  unidad_medida: 'unidad',
}

export function nombreDeCampo(c: string): string {
  return CAMPOS[c] ?? c.replace(/_/g, ' ')
}

/* Columnas que no le dicen nada a quien lee: identificadores internos. */
const OCULTAS = new Set(['id', 'producto_id', 'auth_user_id', 'permiso_clave'])

function valorLegible(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (v === true) return 'sí'
  if (v === false) return 'no'
  if (typeof v === 'number') return String(v).replace('.', ',')
  if (typeof v === 'string') {
    // Una fecha con hora: «dado de baja» lleva la fecha.
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString('es-AR')
    // Un identificador suelto no se puede leer: se dice que cambió.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(v)) return '(otro)'
    return v.length > 80 ? `${v.slice(0, 80)}…` : v
  }
  const s = JSON.stringify(v)
  return s.length > 80 ? `${s.slice(0, 80)}…` : s
}

export interface Cambio {
  campo: string
  antes: string | null
  despues: string | null
}

/*
  Lo que cambió, renglón por renglón. En un cambio, antes → después; en
  un alta, sólo lo que quedó (sin los vacíos); en una baja, lo que había.
*/
export function cambiosDe(e: Pick<Evento, 'antes' | 'despues'>): Cambio[] {
  const antes = e.antes ?? {}
  const despues = e.despues ?? {}
  const soloAlta = !e.antes && !!e.despues
  const campos = [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter((c) => !OCULTAS.has(c))
  return campos
    .filter((c) => !soloAlta || (despues[c] !== null && despues[c] !== '' && despues[c] !== false))
    .map((c) => ({
      campo: nombreDeCampo(c),
      antes: e.antes ? valorLegible(antes[c]) : null,
      despues: e.despues ? valorLegible(despues[c]) : null,
    }))
}

export function resumenDeCambios(e: Pick<Evento, 'antes' | 'despues'>): string {
  return cambiosDe(e)
    .map((c) =>
      c.antes !== null && c.despues !== null
        ? `${c.campo}: ${c.antes} → ${c.despues}`
        : `${c.campo}: ${c.despues ?? c.antes}`,
    )
    .join(' · ')
}

export const ETIQUETA_TIPO: Record<TipoEvento, string> = Object.fromEntries(
  TIPOS.map((t) => [t.clave, t.etiqueta]),
) as Record<TipoEvento, string>

export function filasParaExcel(eventos: Evento[]): Celda[][] {
  return [
    ['Fecha y hora', 'Tipo', 'Qué', 'Detalle', 'Cambios', 'Quién', 'Puesto'],
    ...eventos.map((e) => [
      new Date(e.momento).toLocaleString('es-AR'),
      ETIQUETA_TIPO[e.tipo] ?? e.tipo,
      e.que,
      e.detalle,
      resumenDeCambios(e) || null,
      e.usuario,
      e.puesto,
    ]),
  ]
}

export async function bajarExcel(eventos: Evento[]) {
  descargar(nombreDeArchivo('registro-de-auditoria'), await aExcel(filasParaExcel(eventos), [20, 18, 32, 48, 60, 22, 16]))
}
