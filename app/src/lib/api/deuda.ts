import { supabase } from '@/lib/supabase'

/*
  ─────────────────────────────────────────────────────────────
  Quién le debe a Gross, y desde hace cuánto

  Es la única parte del punto 9 del alcance que no estaba en ninguna
  pantalla. La ficha del cliente muestra la cuenta de ese cliente; lo
  que no había forma de ver es **el conjunto**: cuánta plata hay en la
  calle y cuánta está vencida.

  ─── LOS TRAMOS SON LO QUE SE MIRA ───

  El saldo solo no alcanza para decidir a quién llamar. $50.000 que
  vencen la semana que viene y $50.000 que vencieron hace tres meses son
  el mismo número y dos situaciones distintas. Por eso la deuda viene
  partida en cuatro: lo que todavía no venció, y lo vencido en tres
  tramos de treinta días.

  ─── LA SUMA DE LOS TRAMOS DA EL SALDO ───

  Y eso es una propiedad, no una coincidencia: los pagos se descuentan
  de las facturas más viejas antes de repartir lo que queda en los
  tramos. Si alguna vez deja de dar, hay un movimiento de cuenta
  corriente sin fecha de vencimiento y el aging no lo puede ubicar.

  ─── NO HACE FALTA CUIDAR EL PERMISO DESDE ACÁ ───

  La base ya lo hace: la vista lee la cuenta corriente respetando quién
  consulta, y sin `cuentacorriente.ver` vuelve vacía. La pantalla igual
  esconde el bloque, pero para no mostrar un panel vacío sin explicación
  —no para proteger el dato.
  ─────────────────────────────────────────────────────────────
*/

export interface DeudaDeCliente {
  cliente_id: string
  nombre: string
  telefono: string | null
  saldo: number
  limite_credito: number
  por_vencer: number
  vencido_30: number
  vencido_60: number
  vencido_mas_60: number
  /** El vencimiento impago más viejo. `null` si no debe nada vencido. */
  vencimiento_mas_antiguo: string | null
}

export async function deudaDeClientes(): Promise<DeudaDeCliente[]> {
  const { data, error } = await supabase
    .from('vista_deuda_antiguedad')
    .select('*')
    .gt('saldo', 0)
    .order('saldo', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as DeudaDeCliente[]
}

export interface TotalesDeDeuda {
  clientes: number
  total: number
  porVencer: number
  vencido: number
  /** Cuántos pasaron el límite de crédito que tienen asignado. */
  excedidos: number
}

/*
  El encabezado del bloque: los cuatro números que se leen primero.

  `vencido` junta los tres tramos a propósito. Para decidir si hay un
  problema alcanza con saber cuánto está fuera de término; el reparto
  entre treinta, sesenta y noventa días recién importa cuando se mira
  cliente por cliente, y eso está en la tabla de abajo.
*/
export function totalesDeDeuda(filas: DeudaDeCliente[]): TotalesDeDeuda {
  return filas.reduce(
    (acc, f) => ({
      clientes: acc.clientes + 1,
      total: acc.total + f.saldo,
      porVencer: acc.porVencer + f.por_vencer,
      vencido: acc.vencido + f.vencido_30 + f.vencido_60 + f.vencido_mas_60,
      // Un límite en cero es "sin límite asignado" y no un límite de cero
      // pesos: marcarlo como excedido pondría en rojo a todo cliente nuevo.
      excedidos: acc.excedidos + (f.limite_credito > 0 && f.saldo > f.limite_credito ? 1 : 0),
    }),
    { clientes: 0, total: 0, porVencer: 0, vencido: 0, excedidos: 0 },
  )
}

/*
  Hace cuántos días venció lo más viejo que debe.

  Se calcula contra el día de acá y no contra la hora del servidor, que
  vive en UTC: pasadas las nueve de la noche, un vencimiento de hoy
  aparecería como vencido ayer.

  La fecha se parte a mano en lugar de `new Date('2026-08-11')`, que se
  interpreta a medianoche UTC y en Argentina cae tres horas antes, el día
  anterior. Acá el `Math.round` de abajo alcanza a tapar esas tres horas
  —se comprobó rompiéndolo a propósito y las pruebas siguieron pasando—,
  así que hoy no cambia ningún resultado. Se parte a mano igual: que la
  cuenta salga bien de casualidad, por un redondeo que está para otra
  cosa, dura hasta que alguien toque el redondeo.
*/
export function diasDeAtraso(vencimiento: string | null, hoy = new Date()): number | null {
  if (!vencimiento) return null

  const [a, m, d] = vencimiento.split('-').map(Number)
  if (!a || !m || !d) return null

  const vence = new Date(a, m - 1, d)
  const dia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const dias = Math.round((dia.getTime() - vence.getTime()) / 86_400_000)

  return dias > 0 ? dias : null
}

/*
  Cuán urgente es este cliente, para el color de la fila.

  El corte en sesenta días no es arbitrario: es el tramo a partir del
  cual la vista deja de esperar el pago y lo cuenta como deuda vieja.
  Que la pantalla use el mismo corte que la base evita que una fila se
  vea tranquila mientras suma en la columna de más de sesenta.
*/
export type Urgencia = 'al_dia' | 'vencido' | 'grave'

export function urgencia(f: DeudaDeCliente): Urgencia {
  if (f.vencido_mas_60 > 0) return 'grave'
  if (f.vencido_30 > 0 || f.vencido_60 > 0) return 'vencido'
  return 'al_dia'
}
