/*
  ─────────────────────────────────────────────────────────────
  Dónde cae cada dato en la hoja del remito R

  La imprenta trae lo fijo y el sistema imprime sólo esto. Las medidas
  son milímetros desde la esquina de arriba a la izquierda de la hoja y
  «y» es la línea sobre la que apoya la letra, igual que en el dibujo de
  docs/remito-r/armar-plantilla.mjs: si se mueve un campo allá, se mueve
  acá.
  ─────────────────────────────────────────────────────────────
*/

export interface TextoEnHoja {
  x: number
  y: number
  texto: string
  /** En puntos. */
  tam: number
  negrita?: boolean
  ancla?: 'start' | 'middle' | 'end'
}

export interface DatosDeHoja {
  fecha: string
  nombre: string
  documento: string | null
  condicion: string
  domicilio: string | null
  localidad: string | null
  transportista: string | null
  pedido: number | null
  asociado: string | null
  lineas: { codigo: string; descripcion: string; cantidad: number }[]
}

/** Lo que mide un texto, en milímetros, con esa letra y ese tamaño. */
export type Medir = (texto: string, tam: number, negrita: boolean) => number

const Y_PRIMER_RENGLON = 84.5
const ALTO_RENGLON = 4.9
export const RENGLONES_POR_HOJA = 28
const X_CODIGO = 14
const X_DESCRIPCION = 42
const X_CANTIDAD = 197
const ANCHO_DESCRIPCION = 134
const ANCHO_CODIGO = 27
const TAM_RENGLON = 9.5

/** Corta el texto para que entre, con «…» si no entra. */
export function recortar(texto: string, ancho: number, tam: number, negrita: boolean, medir: Medir): string {
  let t = texto.trim()
  if (medir(t, tam, negrita) <= ancho) return t
  while (t.length > 1 && medir(`${t}…`, tam, negrita) > ancho) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

/** Parte una descripción en renglones por palabras: dos como mucho; lo que sobra, recortado. */
export function enRenglones(texto: string, ancho: number, tam: number, medir: Medir): string[] {
  const limpio = texto.trim()
  if (medir(limpio, tam, false) <= ancho) return [limpio]
  const palabras = limpio.split(/\s+/)
  let primero = ''
  let i = 0
  for (; i < palabras.length; i++) {
    const prueba = primero ? `${primero} ${palabras[i]}` : palabras[i]
    if (medir(prueba, tam, false) > ancho) break
    primero = prueba
  }
  // Una sola palabra más larga que el renglón: se corta adentro de la palabra.
  if (!primero) return [recortar(limpio, ancho, tam, false, medir)]
  return [primero, recortar(palabras.slice(i).join(' '), ancho, tam, false, medir)]
}

export interface RenglonDeHoja {
  codigo: string
  textos: string[]
  cantidad: number
}

/** Reparte los renglones en hojas, sin separar los dos renglones de un mismo producto. */
export function repartirEnHojas(lineas: DatosDeHoja['lineas'], medir: Medir): RenglonDeHoja[][] {
  const hojas: RenglonDeHoja[][] = [[]]
  let usados = 0
  for (const l of lineas) {
    const textos = enRenglones(l.descripcion, ANCHO_DESCRIPCION, TAM_RENGLON, medir)
    if (usados + textos.length > RENGLONES_POR_HOJA) {
      hojas.push([])
      usados = 0
    }
    hojas[hojas.length - 1].push({
      codigo: recortar(l.codigo, ANCHO_CODIGO, TAM_RENGLON, false, medir),
      textos,
      cantidad: l.cantidad,
    })
    usados += textos.length
  }
  return hojas
}

const cantidadComoTexto = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 3 })

/** Los textos de una hoja. `indice` es la hoja, contando desde cero; las unidades van en la última. */
export function textosDeHoja(
  d: DatosDeHoja,
  renglones: RenglonDeHoja[],
  indice: number,
  total: number,
  medir: Medir,
): TextoEnHoja[] {
  const [anio, mes, dia] = d.fecha.slice(0, 10).split('-')
  const textos: TextoEnHoja[] = [
    { x: 139.5, y: 36.2, texto: dia, tam: 11, ancla: 'middle' },
    { x: 152.5, y: 36.2, texto: mes, tam: 11, ancla: 'middle' },
    { x: 168, y: 36.2, texto: anio, tam: 11, ancla: 'middle' },
    { x: 30, y: 55.2, texto: recortar(d.nombre, 122, 10, true, medir), tam: 10, negrita: true },
  ]
  const dato = (x: number, y: number, valor: string | number | null | undefined, ancho: number) => {
    if (valor === null || valor === undefined || valor === '') return
    textos.push({ x, y, texto: recortar(String(valor), ancho, 9.5, false, medir), tam: 9.5 })
  }
  dato(170, 55.2, d.pedido, 30)
  dato(30, 62.5, d.domicilio, 93)
  dato(141, 62.5, d.localidad, 58)
  dato(30, 69.5, d.condicion, 93)
  dato(137, 69.5, d.documento, 62)
  dato(34, 246.5, d.transportista, 92)

  let fila = 0
  for (const r of renglones) {
    const y = Y_PRIMER_RENGLON + fila * ALTO_RENGLON
    textos.push({ x: X_CODIGO, y, texto: r.codigo, tam: TAM_RENGLON })
    textos.push({ x: X_CANTIDAD, y, texto: cantidadComoTexto(r.cantidad), tam: TAM_RENGLON, ancla: 'end' })
    r.textos.forEach((t, i) => {
      textos.push({ x: X_DESCRIPCION, y: y + i * ALTO_RENGLON, texto: t, tam: TAM_RENGLON })
    })
    fila += r.textos.length
  }

  if (total > 1) {
    textos.push({ x: X_CANTIDAD, y: 224.5, texto: `Hoja ${indice + 1} de ${total}`, tam: 8, ancla: 'end' })
  }
  if (indice === total - 1) {
    const unidades = d.lineas.reduce((s, l) => s + l.cantidad, 0)
    textos.push({ x: 198, y: 245, texto: cantidadComoTexto(unidades), tam: 9.5, negrita: true, ancla: 'end' })
  }
  if (d.asociado) textos.push({ x: 198, y: 266.2, texto: d.asociado, tam: 9.5, ancla: 'end' })
  return textos
}

/** La medida con el canvas del navegador, con la misma letra que se imprime. */
export function medidorDelNavegador(): Medir {
  const ctx = document.createElement('canvas').getContext('2d')
  const PT_A_MM = 0.3528
  return (texto, tam, negrita) => {
    // Sin canvas, una estimación: media letra por carácter.
    if (!ctx) return texto.length * tam * PT_A_MM * 0.55
    ctx.font = `${negrita ? 700 : 400} ${tam * PT_A_MM * 10}px Ubuntu, sans-serif`
    return ctx.measureText(texto).width / 10
  }
}
