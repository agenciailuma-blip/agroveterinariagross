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

export interface MetricasDeVenta {
  /** 'todo' si quien mira ve las ventas del local; 'propio' si sólo las suyas. */
  alcance: 'todo' | 'propio'
  primero_del_mes: string
  hoy: Periodo
  semana: Periodo
  mes: Periodo
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
