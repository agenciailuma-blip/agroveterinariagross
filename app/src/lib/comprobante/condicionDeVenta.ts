/*
  La condición de venta que va impresa en el comprobante.

  No es el medio de pago: dice si la venta se pagó en el momento o
  queda debiendo. Sale de los medios con que se cobró. Cuenta corriente
  y fiado quedan debiendo; todo lo demás (efectivo, tarjeta,
  transferencia, cheque) es contado.

  Sin pagos conocidos —una nota de crédito suelta, o un comprobante
  armado sin conexión cuando la cola ya subió— devuelve vacío y el
  renglón no se imprime: mejor nada que una condición inventada.
*/
const A_CREDITO = new Set(['cuenta_corriente', 'fiado'])

export function condicionDeVenta(tiposDeMedio: (string | null | undefined)[]): string {
  const tipos = tiposDeMedio.filter((t): t is string => !!t)
  if (tipos.length === 0) return ''
  const credito = tipos.some((t) => A_CREDITO.has(t))
  const contado = tipos.some((t) => !A_CREDITO.has(t))
  if (credito && contado) return 'Contado / Cuenta corriente'
  return credito ? 'Cuenta corriente' : 'Contado'
}
