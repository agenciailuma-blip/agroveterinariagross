import { supabase } from '@/lib/supabase'

/*
  ─────────────────────────────────────────────────────────────
  El resumen de cuenta corriente

  Pedido de Lucas, 14/09: a fin de mes, al cliente que no pagó, le manda
  un documento con las facturas, los pagos y las notas de crédito, y el
  saldo que queda.

  ─── ES UNA HOJA QUE SE GUARDA COMO PDF ───

  Sigue el mismo camino que la factura en A4, que ya es la que se manda
  por mail: se arma la hoja en pantalla y se imprime eligiendo «Guardar
  como PDF». No suma una biblioteca para generar PDF ni un servicio
  aparte, y lo que se ve en pantalla es exactamente lo que sale en el
  archivo.

  ─── LAS CUENTAS LAS HACE LA BASE ───

  El saldo anterior y el saldo que va quedando en cada renglón vienen
  calculados de `resumen_cuenta_corriente`. Acá no se suma nada de plata:
  lo que se resuelve es qué período mostrar y cómo se llama el archivo.
  ─────────────────────────────────────────────────────────────
*/

export interface ClienteDelResumen {
  id: string
  codigo: string | null
  nombre: string
  documento_sigla: string | null
  documento: string | null
  condicion_iva: string | null
  domicilio: string | null
  localidad: string | null
  telefono: string | null
  email: string | null
  limite_credito: number | null
}

export interface MovimientoDelResumen {
  orden: number
  fecha: string
  tipo: string
  concepto: string | null
  vencimiento: string | null
  debe: number
  haber: number
  /** Lo que queda debiendo el cliente después de este movimiento. */
  saldo: number
}

export interface ResumenCuentaCorriente {
  cliente: ClienteDelResumen
  desde: string
  hasta: string
  /** El día de hoy en Oberá, según la base. */
  hoy: string
  saldo_anterior: number
  movimientos: MovimientoDelResumen[]
  total_debe: number
  total_haber: number
  saldo_final: number
  /** Lo vencido a hoy. Sólo tiene sentido en un resumen que llega hasta hoy. */
  vencido_hoy: number
  vencimiento_mas_antiguo: string | null
}

export async function obtenerResumen(
  clienteId: string,
  desde: string,
  hasta: string,
): Promise<ResumenCuentaCorriente> {
  const { data, error } = await supabase.rpc('resumen_cuenta_corriente', {
    p_cliente_id: clienteId,
    p_desde: desde,
    p_hasta: hasta,
  })
  if (error) throw new Error(error.message)
  return data as ResumenCuentaCorriente
}

/* ─── El período ─── */

export type Atajo = 'este_mes' | 'mes_pasado' | 'desde_el_principio'

export interface Periodo {
  desde: string
  hasta: string
}

/*
  Las fechas se arman con los números del calendario y no pasando por
  `toISOString()`, que convierte a UTC: a la noche en Argentina ya es el
  día siguiente en UTC, y «este mes» el último día a las 21 hs saltaría
  al mes que viene.
*/
function iso(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/*
  Los tres períodos que se ofrecen con un botón.

  «Mes pasado» existe por cuándo se usa esto: Lucas manda el resumen a
  fin de mes, y si lo hace el 2 del mes siguiente, «este mes» le daría
  una hoja con dos días. «Desde el principio» es para el cliente que
  pide todo su historial, o para el que se atrasó hace meses.
*/
export function periodoDe(atajo: Atajo, hoy: Date): Periodo {
  const anio = hoy.getFullYear()
  const mes = hoy.getMonth() + 1
  const dia = hoy.getDate()

  if (atajo === 'este_mes') {
    return { desde: iso(anio, mes, 1), hasta: iso(anio, mes, dia) }
  }

  if (atajo === 'mes_pasado') {
    const anioAnterior = mes === 1 ? anio - 1 : anio
    const mesAnterior = mes === 1 ? 12 : mes - 1
    // El día 0 del mes siguiente es el último del mes que se busca.
    const ultimo = new Date(anioAnterior, mesAnterior, 0).getDate()
    return { desde: iso(anioAnterior, mesAnterior, 1), hasta: iso(anioAnterior, mesAnterior, ultimo) }
  }

  // El sistema arranca en 2026: antes no puede haber movimientos.
  return { desde: '2026-01-01', hasta: iso(anio, mes, dia) }
}

/*
  Si el resumen llega hasta hoy.

  La deuda vencida es una foto del día de hoy. En un resumen de agosto
  que se imprime en septiembre, poner «vencido» con el número de hoy
  mezclaría dos momentos: el saldo de fines de agosto con lo que vence
  ahora.
*/
export function llegaHastaHoy(r: Pick<ResumenCuentaCorriente, 'hasta' | 'hoy'>): boolean {
  return r.hasta >= r.hoy
}

/*
  El nombre con el que se guarda el PDF.

  Al imprimir, el navegador propone como nombre del archivo el título de
  la página. Sin esto, todos los resúmenes se guardarían como «Gross ·
  Sistema de gestión.pdf» y Lucas tendría que renombrarlos uno por uno
  antes de mandarlos.

  Se sacan los caracteres que Windows no acepta en un nombre de archivo:
  un cliente llamado «Pérez / Hijos» haría que el guardado fallara o que
  el archivo terminara en otra carpeta.
*/
export function nombreDelArchivo(cliente: string, periodo: Periodo): string {
  const limpio = cliente
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return `Resumen de cuenta ${limpio} ${periodo.desde} a ${periodo.hasta}`
}

/** «14/09/2026», partiendo la fecha a mano para no correrla por UTC. */
export function fechaCorta(isoFecha: string): string {
  const [a, m, d] = isoFecha.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}
