/*
  Lo vencido de un cliente, a partir de sus cargos impagos.

  Los cargos los arma la base (app.pendientes_de): cada uno con su
  vencimiento y lo que falta pagar, con lo cobrado ya descontado de los
  más viejos. Acá sólo se suma lo que venció antes del día que se mira,
  igual que app.vencido_de(). Por eso sirve sin conexión: la caja y la
  base hacen la misma cuenta con el mismo dato.
*/

export interface CargoPendiente {
  /** Vencimiento, AAAA-MM-DD. */
  v: string
  /** Lo que falta pagar de ese cargo. */
  i: number
}

export interface Vencido {
  monto: number
  /** El vencimiento más viejo que sigue impago. */
  desde: string | null
}

/** `dia` es AAAA-MM-DD en Oberá: vence el día anterior a éste o antes. */
export function vencidoAl(pendientes: CargoPendiente[] | null | undefined, dia: string): Vencido {
  let monto = 0
  let desde: string | null = null
  for (const c of pendientes ?? []) {
    const importe = Number(c.i)
    if (!(c.v < dia) || !(importe > 0)) continue
    monto += importe
    if (desde === null || c.v < desde) desde = c.v
  }
  return { monto: Math.round(monto * 100) / 100, desde }
}
