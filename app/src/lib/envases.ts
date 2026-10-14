import { numero } from '@/lib/tipos'

/*
  La caja y la suelta, del lado de la pantalla.

  Lo que de verdad pasa —abrir una caja cuando se vende una pastilla
  y no quedan sueltas— lo hace la base, al registrar la venta. Acá sólo
  se cuenta lo mismo que cuenta ella, para mostrarlo: la copia sin
  internet del mostrador no puede preguntarle al servidor cuánto hay.

  La cuenta es la de `app.disponible_abriendo`, y hay que mantener las
  dos iguales; la de la base es la que manda.
*/

/*
  Lo que hay de una suelta contando los envases que se pueden abrir:
  las sueltas, más lo que traen los envases enteros de arriba. Media
  tableta no se abre, y un envase vendido de más no resta.
*/
export function disponibleAbriendo(sueltas: number, porEnvase: number, disponibleDelEnvase: number): number {
  return sueltas + porEnvase * Math.max(0, Math.floor(disponibleDelEnvase))
}

export interface NivelDeCadena {
  producto_id: string
  codigo: string
  nombre_interno: string
  precio_venta: number
  cantidad: number
  cantidad_por_envase: number | null
  nivel: number
}

/*
  La cadena en una línea, del envase más grande a la suelta más chica:
  «1 CAJA X10 · 9 TABLETA · 9 PASTILLA». Es la respuesta a «¿cuántas
  tengo?» que pidió Lucas: lo que hay cerrado y lo que hay suelto, sin
  contar dos veces la misma pastilla.
*/
export function describirCadena(cadena: NivelDeCadena[]): string {
  return cadena.map((n) => `${numero.format(n.cantidad)} ${n.nombre_interno}`).join(' · ')
}

/*
  Lo mismo, contado todo en la suelta más chica: con 1 caja de 10
  tabletas de 10 pastillas, 9 tabletas y 9 pastillas, son 199. Lo
  vendido de más no cuenta para abrir, igual que en la base.
*/
export function totalEnLaMasChica(cadena: NivelDeCadena[]): number {
  return cadena.reduce(
    (acumulado, n, i) => (i === 0 ? n.cantidad : disponibleAbriendo(n.cantidad, n.cantidad_por_envase ?? 0, acumulado)),
    0,
  )
}

/*
  El precio que da dividir el del envase. No se aplica solo: el
  comprimido suelto casi nunca vale la caja dividido diez, y el precio
  lo pone Lucas. Se muestra para tener una referencia al escribirlo.
*/
export function precioDividido(precioEnvase: number, porEnvase: number): number | null {
  if (!(porEnvase > 0) || !(precioEnvase > 0)) return null
  return Math.round((precioEnvase / porEnvase) * 100) / 100
}

/** Lo que dice la base cuando algo no se puede atar, en palabras de la pantalla. */
export function explicarErrorDeEnvase(mensaje: string): string | null {
  if (mensaje.includes('producto_una_suelta_por_envase'))
    return 'Ese envase ya se abre en otra suelta. Cada caja se abre en una sola cosa: si hay tres niveles, la pastilla sale de la tableta y la tableta de la caja.'
  if (mensaje.includes('producto_envase_completo')) return 'Falta decir cuántas trae el envase.'
  if (mensaje.includes('producto_cantidad_por_envase_positiva'))
    return 'Lo que trae el envase tiene que ser más que cero.'
  if (mensaje.includes('Ese producto ya sale de adentro de éste'))
    return 'Ese producto ya sale de adentro de éste: quedarían uno adentro del otro.'
  return null
}
