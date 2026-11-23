/*
  La bandeja de «sin enviar», contada como la entiende quien atiende.

  La cola guarda operaciones sueltas —la cabecera de una venta, cada
  renglón, cada pago— y un error de la base en inglés. Al encargado le
  sirve otra cosa: qué venta o qué papel no llegó, si se arregla solo y,
  si no, qué tiene que hacer. Acá se junta cada lote en una sola cosa y
  se traduce el motivo.
*/

export interface OperacionVista {
  id: string
  lote: string
  orden: number
  descripcion: string
  creado_en: string
  estado: string
  ultimo_error: string | null
}

export type EstadoCosa = 'trabada' | 'esperando' | 'enviando'

export interface Motivo {
  /** Qué pasó, en una línea. */
  que: string
  /** Qué hacer. */
  hacer: string
  /** Si se va a enviar sola sin que nadie haga nada. */
  seArreglaSola: boolean
}

export interface CosaSinEnviar {
  lote: string
  titulo: string
  creado_en: string
  estado: EstadoCosa
  /** La operación que frena al resto, si hay una. */
  trabada: OperacionVista | null
  /** Qué parte de la venta es la que no entra (el renglón, el cobro…). */
  parteTrabada: string | null
  motivo: Motivo | null
  /** Cuántas partes esperan detrás de la trabada. */
  detras: number
}

const NOMBRE_SIGLA: Record<string, string> = {
  PRE: 'Presupuesto',
  REM: 'Remito',
  PRO: 'Proforma',
  ENT: 'Comprobante de entrega',
  INT: 'Comprobante interno',
}

function titulo(descripcion: string): string {
  const sigla = /^([A-Z]{3}) (\S+)/.exec(descripcion)
  if (sigla && NOMBRE_SIGLA[sigla[1]]) return `${NOMBRE_SIGLA[sigla[1]]} ${sigla[2]}`
  if (/^venta /i.test(descripcion)) return `Venta ${descripcion.slice(6).split(' · ')[0]}`
  if (/^factura /i.test(descripcion)) return 'F' + descripcion.slice(1)
  const [antes, despues] = descripcion.split(' · ')
  // «CAJA1-000052 · cobro»: el código es de una venta.
  if (despues !== undefined && /^[A-Z0-9]+-\d+$/.test(antes)) return `Venta ${antes}`
  return descripcion ? descripcion[0].toUpperCase() + descripcion.slice(1) : 'Operación'
}

function parte(descripcion: string): string | null {
  const [, despues] = descripcion.split(' · ')
  if (!despues) return null
  if (despues === 'cobro') return 'el cobro'
  if (/^pago \d+$/.test(despues)) return `el ${despues}`
  if (despues === 'lista de precios') return 'la lista de precios'
  if (despues === 'a la cola de la caja') return 'el envío a la caja'
  return `el renglón «${despues}»`
}

const SIN_RED = /failed to fetch|networkerror|load failed|network request failed|timeout|tiempo de espera/i

export function traducirError(error: string): Motivo {
  if (/venta_linea_cantidad_check|cantidad_check/.test(error)) {
    return {
      que: 'Un producto de la venta quedó con cantidad cero.',
      hacer:
        'Si era una venta de prueba, descartala. Si era real, anotá qué se llevó, descartala y volvé a cargarla.',
      seArreglaSola: false,
    }
  }
  if (/entrega_solo_remito|descuenta_solo_remito/.test(error)) {
    return {
      que: 'El sistema central no aceptaba este papel. Ya está corregido.',
      hacer: 'Tocá «Reintentar ahora». No hace falta descartarlo.',
      seArreglaSola: true,
    }
  }
  if (SIN_RED.test(error)) {
    return {
      que: 'No hubo conexión con el sistema central.',
      hacer: 'Se envía sola cuando vuelva internet.',
      seArreglaSola: true,
    }
  }
  if (/jwt|token|not authenticated|sesi[oó]n/i.test(error)) {
    return {
      que: 'La sesión de esta computadora venció.',
      hacer: 'Salí del sistema y volvé a entrar; después se envía sola.',
      seArreglaSola: false,
    }
  }
  if (/permission denied|row-level security|no tiene permiso/i.test(error)) {
    return {
      que: 'El usuario que la hizo no tiene permiso para esto.',
      hacer: 'Avisá a soporte con el detalle de abajo. No la descartes.',
      seArreglaSola: false,
    }
  }
  // Una regla escrita por nosotros (P0001) ya viene en castellano.
  if (/[áéíóúñ¿]|^(no|la|el|ya|ese|esa|hay) /i.test(error)) {
    return { que: error, hacer: 'Avisá a soporte con este mensaje. No la descartes.', seArreglaSola: false }
  }
  return {
    que: 'El sistema central la rechazó.',
    hacer: 'Avisá a soporte con el detalle de abajo. No la descartes.',
    seArreglaSola: false,
  }
}

export function agruparSinEnviar(operaciones: OperacionVista[]): CosaSinEnviar[] {
  const lotes = new Map<string, OperacionVista[]>()
  for (const op of operaciones) {
    if (!lotes.has(op.lote)) lotes.set(op.lote, [])
    lotes.get(op.lote)!.push(op)
  }

  const cosas: CosaSinEnviar[] = []
  for (const [lote, ops] of lotes) {
    ops.sort((a, b) => a.orden - b.orden)
    const iTrabada = ops.findIndex((o) => o.estado === 'error')
    const trabada = iTrabada >= 0 ? ops[iTrabada] : null
    const motivo = trabada ? traducirError(trabada.ultimo_error ?? '') : null
    cosas.push({
      lote,
      titulo: titulo(ops[0].descripcion),
      creado_en: ops.reduce((m, o) => (o.creado_en < m ? o.creado_en : m), ops[0].creado_en),
      estado: trabada
        ? motivo!.seArreglaSola
          ? 'esperando'
          : 'trabada'
        : ops.some((o) => o.estado === 'enviando')
          ? 'enviando'
          : 'esperando',
      trabada,
      parteTrabada: trabada ? parte(trabada.descripcion) : null,
      motivo,
      detras: iTrabada >= 0 ? ops.length - iTrabada - 1 : 0,
    })
  }

  // Lo que necesita a alguien, primero; después, de lo más viejo a lo nuevo.
  const peso = { trabada: 0, enviando: 1, esperando: 2 }
  return cosas.sort((a, b) => peso[a.estado] - peso[b.estado] || a.creado_en.localeCompare(b.creado_en))
}
