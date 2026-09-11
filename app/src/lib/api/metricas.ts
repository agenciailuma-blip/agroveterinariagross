import { supabase } from '@/lib/supabase'
import { moneda } from '@/lib/tipos'

/*
  Los números de venta de la pantalla de Inicio.

  Todo lo pesado lo hace la base en una sola función —`metricas_de_venta`—
  y no cinco consultas desde acá: Inicio es la primera pantalla que se
  abre, varias veces por día y en cuatro máquinas.

  Los días son los de Oberá y no los del servidor, que vive en UTC. Sin
  eso, todo lo que se cobra después de las nueve de la noche aparecería
  como vendido mañana.
*/

export interface Periodo {
  ventas: number
  total: number
}

export interface MasVendido {
  codigo: string
  descripcion: string
  cantidad: number
  importe: number
}

export interface VentasPorVendedor {
  nombre: string
  ventas: number
  total: number
}

/** Del 1 al día de hoy, pero del mes pasado. Contra esto se compara el mes. */
export interface TramoDelMesAnterior {
  desde: string
  hasta: string
}

export interface MetricasDeVenta {
  /** 'todo' si quien mira ve las ventas del local; 'propio' si sólo las suyas. */
  alcance: 'todo' | 'propio'
  primero_del_mes: string
  hoy: Periodo
  semana: Periodo
  mes: Periodo
  hoy_anterior: Periodo
  semana_anterior: Periodo
  mes_anterior: Periodo
  tramo_del_mes_anterior: TramoDelMesAnterior
  mas_vendidos: MasVendido[]
  por_vendedor: VentasPorVendedor[]
}

export async function obtenerMetricasDeVenta(): Promise<MetricasDeVenta> {
  const { data, error } = await supabase.rpc('metricas_de_venta')
  if (error) throw new Error(error.message)
  return data as MetricasDeVenta
}

/*
  El título dice de quién son los números que están abajo.

  No es una cuestión de redacción. Un vendedor sin permiso para ver todas
  las ventas recibe únicamente las suyas, y un cartel que dijera "Ventas
  del local" encima de eso no mostraría un número incompleto: mostraría
  un número equivocado, y nadie tendría forma de darse cuenta.
*/
export function tituloDeVentas(alcance: MetricasDeVenta['alcance']): string {
  return alcance === 'todo' ? 'Ventas del local' : 'Tus ventas'
}

export interface TarjetaDeVenta {
  titulo: string
  importe: string
  detalle: string
}

/*
  Las tres tarjetas, ya con el texto que va a leer la persona.

  Las etiquetas dicen exactamente lo que se contó —"últimos 7 días" y no
  "esta semana"— porque son dos cosas distintas: el lunes a la mañana,
  "esta semana" es casi nada y "últimos 7 días" incluye todo el fin de
  semana. Lo que está a la vista tiene que ser lo que se calculó.
*/
export function resumenDeVentas(m: MetricasDeVenta): TarjetaDeVenta[] {
  return [
    { titulo: 'Hoy', ...comoSeLee(m.hoy) },
    { titulo: 'Últimos 7 días', ...comoSeLee(m.semana) },
    { titulo: 'Este mes', ...comoSeLee(m.mes) },
  ]
}

/* ─────────────────────────────────────────────────────────────
   La comparación contra el período anterior
   ───────────────────────────────────────────────────────────── */

export type Sentido = 'sube' | 'baja' | 'igual' | 'sin_base'

export interface Comparacion {
  sentido: Sentido
  /** El cambio en porcentaje. `null` cuando no hay contra qué comparar. */
  porcentaje: number | null
  /** Lo que se lee debajo del importe. */
  texto: string
}

/*
  Cuánto cambió un período contra el anterior.

  **El caso que obliga a que esto exista es el período anterior en cero.**
  Dividir por cero da infinito, y un cartel que diga "+∞%" —o peor,
  "+Infinity%"— arriba del número de ventas es exactamente la clase de
  cosa que hace que nadie vuelva a confiar en la pantalla. Cuando no hay
  base, no hay porcentaje: se dice que no había nada con qué comparar.

  El umbral de medio punto es para no escribir "+0%", que se lee como un
  error de cuentas. Por debajo de eso el período está igual, y eso es lo
  que conviene decir.
*/
export function comparar(actual: number, anterior: number, contra: string): Comparacion {
  if (anterior === 0) {
    // «que» sirve para comparar —"+50% que ayer"— y sobra para constatar:
    // "sin ventas que ayer" no es castellano.
    return {
      sentido: 'sin_base',
      porcentaje: null,
      texto: `sin ventas ${contra.replace(/^que /, '')}`,
    }
  }

  const porcentaje = ((actual - anterior) / anterior) * 100

  if (Math.abs(porcentaje) < 0.5) {
    return { sentido: 'igual', porcentaje, texto: `igual ${contra}` }
  }

  const signo = porcentaje > 0 ? '+' : '−'
  return {
    sentido: porcentaje > 0 ? 'sube' : 'baja',
    porcentaje,
    texto: `${signo}${Math.abs(Math.round(porcentaje))}% ${contra}`,
  }
}

/*
  Las tres tarjetas, ahora con contra qué se están comparando.

  Cada una dice el período de comparación con todas las letras. "Este
  mes −12%" no se puede discutir con nadie si no aclara que los doce
  puntos son contra los mismos días del mes pasado y no contra el mes
  entero, que es lo que cualquiera supone.
*/
export interface TarjetaComparada extends TarjetaDeVenta {
  comparacion: Comparacion
}

export function ventasComparadas(m: MetricasDeVenta): TarjetaComparada[] {
  return [
    {
      titulo: 'Hoy',
      ...comoSeLee(m.hoy),
      comparacion: comparar(m.hoy.total, m.hoy_anterior.total, 'que ayer'),
    },
    {
      titulo: 'Últimos 7 días',
      ...comoSeLee(m.semana),
      comparacion: comparar(m.semana.total, m.semana_anterior.total, 'que los 7 previos'),
    },
    {
      titulo: 'Este mes',
      ...comoSeLee(m.mes),
      comparacion: comparar(
        m.mes.total,
        m.mes_anterior.total,
        `que ${tramoEnPalabras(m.tramo_del_mes_anterior)}`,
      ),
    },
  ]
}

/*
  «el 1 al 11 de agosto», para escribirlo al lado del porcentaje.

  Se arma con las fechas partidas a mano y no con `new Date(...)`: una
  fecha suelta como "2026-08-01" se interpreta en UTC, y en Argentina eso
  la corre al 31 de julio. El mes de la comparación aparecería equivocado
  el primer día de cada mes.
*/
export function tramoEnPalabras(t: TramoDelMesAnterior): string {
  const MESES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ]
  const [, mesDesde, diaDesde] = t.desde.split('-').map(Number)
  const [, , diaHasta] = t.hasta.split('-').map(Number)
  const nombre = MESES[mesDesde - 1] ?? ''

  return diaDesde === diaHasta
    ? `el ${diaDesde} de ${nombre}`
    : `el ${diaDesde} al ${diaHasta} de ${nombre}`
}

function comoSeLee(p: Periodo): { importe: string; detalle: string } {
  return {
    importe: moneda.format(p.total),
    detalle:
      p.ventas === 0
        ? 'sin ventas todavía'
        : p.ventas === 1
          ? '1 venta cobrada'
          : `${p.ventas} ventas cobradas`,
  }
}
