import { supabase } from '@/lib/supabase'
import type { EntregaALaCaja } from '@/lib/local/red'

/*
  ─────────────────────────────────────────────────────────────
  El estado de cada PC del local, informado por ella misma (19/11)

  Para saber si una PC había actualizado, si tenía la impresora o si le
  quedaban ventas sin enviar había que preguntar en el local o entrar
  por AnyDesk. Ahora cada PC lo informa sola al abrir y cada cinco
  minutos, y se ve en Configuración → Local → Estado de las PC.

  Se informa lo necesario para soporte, no lo que hace cada persona: ni
  ventas, ni importes, ni pantallas visitadas.
  ─────────────────────────────────────────────────────────────
*/

export interface EstadoPc {
  programa: 'escritorio' | 'navegador'
  /** La impresora elegida en esta PC. Nulo: ninguna. */
  impresora: string | null
  /** Si Windows la sigue encontrando. Nulo desde el navegador, que no puede saberlo. */
  impresora_encontrada: boolean | null
  /** Ventas, cobros y demás que esperan subir al servidor. */
  sin_enviar: number
  error_sync: string | null
  ultima_sync: string | null
  /** Sólo en la PC que escucha a las demás sin internet: si está escuchando. */
  escucha: boolean | null
  /** Cómo le fue a la última entrega a la caja por la red del local. */
  entrega: string | null
  usuario: string | null
  sistema: string | null
}

const UN_ERROR = 300

export function sistemaOperativo(agente: string): string | null {
  if (/Windows NT 6\.1/.test(agente)) return 'Windows 7'
  if (/Windows NT 6\.[23]/.test(agente)) return 'Windows 8'
  if (/Windows NT 10/.test(agente)) return 'Windows 10 u 11'
  if (/Android/.test(agente)) return 'Android'
  if (/iPhone|iPad/.test(agente)) return 'iPhone o iPad'
  if (/Mac OS X/.test(agente)) return 'Mac'
  if (/Linux/.test(agente)) return 'Linux'
  return null
}

function textoDeLaEntrega(e: EntregaALaCaja | null): string | null {
  if (!e) return null
  switch (e.estado) {
    case 'no_corresponde':
      return null
    case 'al_dia':
      return 'al día'
    case 'entregado':
      return `entregó ${e.cuantas}`
    case 'sin_direccion':
      return `no sabe a qué caja entregar (${e.esperando} esperando)`
    case 'no_contesta':
      return `la caja no contesta (${e.esperando} esperando): ${e.motivo}`
  }
}

/** Arma lo que informa esta PC. Separado de la llamada para poder probarlo. */
export function armarEstadoPc(d: {
  enEscritorio: boolean
  impresora: string | null
  impresorasInstaladas: string[] | null
  sinSubir: number
  error: string | null
  ultimaSync: Date | null
  esPuntoDeEncuentro: boolean
  escuchando: boolean
  entrega: EntregaALaCaja | null
  usuario: string | null
  agente: string
}): EstadoPc {
  const impresora = d.impresora?.trim() || null
  return {
    programa: d.enEscritorio ? 'escritorio' : 'navegador',
    impresora,
    // Sin la lista de Windows (navegador, o falló la consulta) no se sabe.
    impresora_encontrada:
      impresora && d.enEscritorio && d.impresorasInstaladas ? d.impresorasInstaladas.includes(impresora) : null,
    sin_enviar: d.sinSubir,
    error_sync: d.error ? d.error.slice(0, UN_ERROR) : null,
    ultima_sync: d.ultimaSync ? d.ultimaSync.toISOString() : null,
    escucha: d.esPuntoDeEncuentro ? d.escuchando : null,
    entrega: textoDeLaEntrega(d.entrega),
    usuario: d.usuario,
    sistema: sistemaOperativo(d.agente),
  }
}

export async function informarEstadoPc(terminalId: string, version: string, estado: EstadoPc): Promise<void> {
  const { error } = await supabase.rpc('informar_estado_pc', {
    p_terminal_id: terminalId,
    p_version: version,
    p_estado: estado,
  })
  if (error) throw new Error(error.message)
}

export interface PcDelLocal {
  id: string
  nombre: string
  tipo: 'caja' | 'mostrador' | 'oficina'
  es_punto_de_encuentro: boolean
  version_app: string | null
  estado_pc: Partial<EstadoPc> | null
  estado_informado_en: string | null
  equipo_visto_en: string | null
}

export async function listarEstadoDeLasPc(): Promise<PcDelLocal[]> {
  const { data, error } = await supabase
    .from('terminal')
    .select('id, nombre, tipo, es_punto_de_encuentro, version_app, estado_pc, estado_informado_en, equipo_visto_en')
    .eq('activo', true)
    .is('eliminado_en', null)
    .order('nombre')
  if (error) throw new Error(error.message)
  return (data ?? []) as PcDelLocal[]
}

/** -1, 0 o 1, comparando «0.25.10» con «0.25.9» como números. */
export function compararVersiones(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

export type Nivel = 'ok' | 'aviso' | 'falla' | 'apagada'

export interface Lectura {
  nivel: Nivel
  /** Lo primero que hay que saber, en una línea. */
  resumen: string
  /** Lo demás que anda mal, si hay. */
  detalles: string[]
}

/** Pasado este tiempo sin informar, la PC está apagada o sin internet. */
const SIN_NOTICIAS_MIN = 15

/*
  Qué decir de cada PC, de lo más grave a lo menos. La más nueva es la
  versión más alta entre la de quien mira y la que informan las demás:
  así no hace falta preguntarle a Cloudflare cuál está publicada.
*/
export function leerPc(pc: PcDelLocal, masNueva: string, ahora: Date): Lectura {
  const e = pc.estado_pc
  if (!e || !pc.estado_informado_en) {
    return {
      nivel: 'aviso',
      resumen: pc.equipo_visto_en
        ? 'No informa: tiene una versión anterior a la que informa el estado. Hay que actualizarla.'
        : 'Nunca se abrió en una PC.',
      detalles: [],
    }
  }

  const detalles: string[] = []
  let nivel: Nivel = 'ok'
  const subir = (n: Nivel) => {
    const orden: Nivel[] = ['ok', 'apagada', 'aviso', 'falla']
    if (orden.indexOf(n) > orden.indexOf(nivel)) nivel = n
  }

  if (e.error_sync) {
    subir('falla')
    detalles.push(`Error al sincronizar: ${e.error_sync}`)
  }
  if (e.escucha === false) {
    subir('falla')
    detalles.push('No está escuchando a las demás: sin internet, los mostradores no le pueden pasar las ventas.')
  }
  if (e.programa === 'escritorio' && e.impresora && e.impresora_encontrada === false) {
    subir('falla')
    detalles.push(`Windows no encuentra la impresora «${e.impresora}».`)
  }
  if (pc.version_app && compararVersiones(pc.version_app, masNueva) < 0) {
    subir('aviso')
    detalles.push(`Tiene la ${pc.version_app}; hay una más nueva, la ${masNueva}.`)
  }
  if ((e.sin_enviar ?? 0) > 0) {
    subir('aviso')
    detalles.push(`${e.sin_enviar} sin enviar al servidor.`)
  }
  if (e.entrega && /no sabe|no contesta/.test(e.entrega)) {
    subir('aviso')
    detalles.push(`Entrega a la caja: ${e.entrega}.`)
  }
  if (e.programa === 'escritorio' && !e.impresora) {
    subir('aviso')
    detalles.push('No tiene impresora de tickets elegida.')
  }

  const minutos = (ahora.getTime() - new Date(pc.estado_informado_en).getTime()) / 60000
  if (minutos > SIN_NOTICIAS_MIN) {
    // Apagada no es una falla: las PC se apagan a la noche. Lo que dijo
    // la última vez sigue a la vista, por si se apagó con algo trabado.
    if (nivel === 'ok') nivel = 'apagada'
    return {
      nivel,
      resumen: `Apagada o sin internet desde ${cuando(pc.estado_informado_en, ahora)}.`,
      detalles,
    }
  }

  return {
    nivel,
    resumen: nivel === 'ok' ? 'Todo en orden.' : detalles.shift()!,
    detalles,
  }
}

export function cuando(iso: string, ahora: Date): string {
  const d = new Date(iso)
  const minutos = Math.round((ahora.getTime() - d.getTime()) / 60000)
  if (minutos < 1) return 'recién'
  if (minutos < 60) return `hace ${minutos} min`
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const mismoDia = d.toDateString() === ahora.toDateString()
  if (mismoDia) return `las ${hora}`
  const ayer = new Date(ahora)
  ayer.setDate(ayer.getDate() - 1)
  if (d.toDateString() === ayer.toDateString()) return `ayer a las ${hora}`
  return `el ${d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })} a las ${hora}`
}
