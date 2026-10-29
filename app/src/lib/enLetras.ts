/*
  El importe en letras, como se escribe en un recibo: «Recibimos la
  suma de pesos mil doscientos cincuenta con 50/100».

  Es lo que hace difícil adulterar el número en un papel firmado: a un
  «1.000» se le agrega un cero; a «mil» no.
*/

const UNIDADES = [
  '', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete',
  'veintiocho', 'veintinueve',
]
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const CENTENAS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos',
]

/** De 0 a 999. */
function hastaMil(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cien'
  const c = Math.floor(n / 100)
  const resto = n % 100
  let decenas = ''
  if (resto < 30) decenas = UNIDADES[resto]
  else {
    const d = Math.floor(resto / 10)
    const u = resto % 10
    decenas = DECENAS[d] + (u ? ` y ${UNIDADES[u]}` : '')
  }
  return [CENTENAS[c], decenas].filter(Boolean).join(' ')
}

/*
  «Uno» se acorta delante de lo que cuenta: «veintiún mil», «un
  millón». Al final del número queda entero: «treinta y uno».
*/
function apocopar(t: string): string {
  return t.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un')
}

/** Un entero en letras, hasta 999.999.999.999. */
export function enteroEnLetras(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n === 0) return 'cero'
  const millones = Math.floor(n / 1_000_000)
  const miles = Math.floor((n % 1_000_000) / 1000)
  const resto = n % 1000

  const partes: string[] = []
  if (millones) {
    partes.push(millones === 1 ? 'un millón' : `${apocopar(enteroEnLetras(millones))} millones`)
  }
  if (miles) partes.push(miles === 1 ? 'mil' : `${apocopar(hastaMil(miles))} mil`)
  if (resto) partes.push(hastaMil(resto))
  return partes.join(' ')
}

/** «mil doscientos cincuenta con 50/100». */
export function importeEnLetras(importe: number): string {
  const centavos = Math.round(Math.abs(importe) * 100)
  const enteros = Math.floor(centavos / 100)
  const resto = centavos % 100
  return `${enteroEnLetras(enteros)} con ${String(resto).padStart(2, '0')}/100`
}
