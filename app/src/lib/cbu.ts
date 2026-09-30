/*
  ─────────────────────────────────────────────────────────────
  CBU, CVU y alias

  Los datos para transferirle a alguien. El CBU es de una cuenta de
  banco; el CVU, de una billetera virtual (empieza con 000). Para el
  sistema son lo mismo: 22 dígitos con dos dígitos verificadores, la
  misma cuenta que hace app.cbu_valido en la base.

  Un número cambiado es una transferencia a otra persona, y esa plata no
  vuelve sola: por eso se controla antes de guardar, no después.
  ─────────────────────────────────────────────────────────────
*/

/** Sólo los dígitos: el CBU se pega de un mail con espacios o guiones. */
export const limpiarCbu = (texto: string) => texto.replace(/\D/g, '')

export function cbuValido(texto: string): boolean {
  const v = limpiarCbu(texto)
  if (v.length !== 22) return false
  const digito = (desde: number, pesos: number[]) =>
    (10 - (pesos.reduce((s, p, i) => s + p * Number(v[desde + i]), 0) % 10)) % 10
  return (
    digito(0, [7, 1, 3, 9, 7, 1, 3]) === Number(v[7]) &&
    digito(8, [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]) === Number(v[21])
  )
}

export const esCvu = (texto: string) => limpiarCbu(texto).startsWith('000')

/*
  El banco sale de los tres primeros dígitos del CBU. Están los que más
  se ven en la zona; de otro, se muestra sólo el número. Es para que al
  copiarlo se vea «Macro» y se note si es el que se esperaba.
*/
const BANCOS: Record<string, string> = {
  '005': 'The Royal Bank of Scotland',
  '007': 'Galicia',
  '011': 'Nación',
  '014': 'Provincia de Buenos Aires',
  '015': 'ICBC',
  '017': 'BBVA',
  '020': 'Córdoba',
  '027': 'Supervielle',
  '029': 'Ciudad',
  '034': 'Patagonia',
  '044': 'Hipotecario',
  '072': 'Santander',
  '086': 'Santa Cruz',
  '150': 'HSBC',
  '191': 'Credicoop',
  '259': 'Itaú',
  '285': 'Macro',
  '299': 'Comafi',
  '322': 'Industrial',
  '330': 'Santa Fe',
  '386': 'Entre Ríos',
  '389': 'Columbia',
}

/** El banco del CBU, o «Billetera virtual» si es un CVU. Nulo si no se reconoce. */
export function bancoDelCbu(texto: string): string | null {
  const v = limpiarCbu(texto)
  if (v.length < 3) return null
  if (v.startsWith('000')) return 'Billetera virtual'
  return BANCOS[v.slice(0, 3)] ?? null
}

/** El CBU en grupos de cuatro, para leerlo en voz alta sin perderse: 2850 5909 4009 0418 1352 01. */
export function cbuLegible(texto: string): string {
  const v = limpiarCbu(texto)
  if (v.length !== 22) return v
  return `${v.slice(0, 4)} ${v.slice(4, 8)} ${v.slice(8, 12)} ${v.slice(12, 16)} ${v.slice(16, 20)} ${v.slice(20)}`
}

/** El alias: de 6 a 20 letras, números, puntos o guiones. */
export const aliasValido = (texto: string) => /^[A-Za-z0-9.-]{6,20}$/.test(texto.trim())

/*
  Lo que está mal en lo que se escribió, dicho para quien lo está
  copiando de un papel. Nulo si está bien o si está vacío (los dos son
  opcionales).
*/
export function problemaConCbu(texto: string): string | null {
  const v = limpiarCbu(texto)
  if (!texto.trim()) return null
  if (v.length !== 22) return `Tiene ${v.length} dígitos y un CBU o CVU tiene 22.`
  if (!cbuValido(v)) return 'Los dígitos verificadores no cierran: hay un número cambiado.'
  return null
}

export function problemaConAlias(texto: string): string | null {
  const t = texto.trim()
  if (!t) return null
  if (t.length < 6 || t.length > 20) return 'Un alias tiene entre 6 y 20 caracteres.'
  if (!aliasValido(t)) return 'Un alias sólo lleva letras, números, puntos y guiones.'
  return null
}
