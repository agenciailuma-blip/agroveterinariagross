/*
  ─────────────────────────────────────────────────────────────
  Lectura de la planilla de productos

  El archivo lo arma una persona en Excel, no un sistema. Eso quiere
  decir que va a venir con espacios de más, encabezados escritos de
  cualquier manera, números con separador de miles y filas vacías en el
  medio. Nada de eso es un error del archivo: es cómo son los archivos
  reales, y el importador tiene que aguantarlo sin quejarse.

  Lo que NO se tolera es adivinar. Si una columna no se reconoce, se
  muestra para que una persona la mapee a mano; si un número no se
  entiende, la fila se marca con error y se sigue. Importar un precio mal
  interpretado es peor que no importarlo.
  ─────────────────────────────────────────────────────────────
*/

/** Campos del sistema a los que se puede mapear una columna. */
export const CAMPOS = {
  codigo: 'Código',
  nombre_interno: 'Nombre',
  nombre_publico: 'Nombre público',
  precio_venta: 'Precio de venta',
  costo: 'Costo',
  categoria: 'Rubro',
  subrubro: 'Subrubro',
  grupo: 'Grupo',
  subgrupo: 'Subgrupo',
  marca: 'Marca',
  es_veterinario: 'Es veterinario',
  requiere_receta: 'Requiere receta',
  es_fitosanitario: 'Es fitosanitario',
  alicuota_porcentaje: 'Alícuota de IVA',
  unidad_medida: 'Unidad',
  codigo_barra: 'Código de barra',
} as const

export type Campo = keyof typeof CAMPOS

export const OBLIGATORIOS: Campo[] = ['codigo', 'nombre_interno']

export const NUMERICOS: Campo[] = ['precio_venta', 'costo', 'alicuota_porcentaje']

/*
  Nombres con los que cada campo puede aparecer en el encabezado.

  Salen de cómo lo escribiría alguien en OBTech o en una planilla propia.
  La lista no pretende ser completa: lo que no reconoce queda sin mapear
  y la pantalla se lo pregunta a la persona.
*/
const SINONIMOS: Record<Campo, string[]> = {
  codigo: ['codigo', 'cod', 'codigo interno', 'sku', 'articulo', 'art', 'codigo articulo'],
  nombre_interno: ['nombre', 'descripcion', 'detalle', 'producto', 'articulo descripcion', 'nombre interno'],
  nombre_publico: ['nombre publico', 'nombre comercial', 'descripcion web', 'nombre web'],
  precio_venta: [
    'precio', 'precio venta', 'precio de venta', 'pvp', 'precio publico', 'venta',
    // Gross cotiza dos precios: el de contado es el que manda, y el de
    // tarjeta lo calcula la lista de precios a partir de él.
    'precio contado', 'precio de contado', 'contado',
  ],
  costo: ['costo', 'precio costo', 'costo unitario', 'precio de costo', 'compra'],
  categoria: ['rubro', 'categoria', 'familia'],
  subrubro: ['subrubro', 'sub rubro', 'subfamilia', 'sub familia'],
  grupo: ['grupo'],
  subgrupo: ['subgrupo', 'sub grupo'],
  marca: ['marca', 'laboratorio', 'fabricante', 'proveedor'],
  es_veterinario: ['es veterinario', 'veterinario', 'producto veterinario'],
  requiere_receta: ['requiere receta', 'receta', 'con receta'],
  es_fitosanitario: ['es fitosanitario', 'fitosanitario', 'agroquimico'],
  alicuota_porcentaje: ['iva', 'alicuota', 'alicuota iva', 'porcentaje iva', 'iva %', '% iva'],
  unidad_medida: ['unidad', 'unidad de medida', 'um', 'medida', 'presentacion'],
  codigo_barra: ['codigo de barra', 'codigo barra', 'ean', 'barra', 'codigo ean', 'cod barra'],
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Adivina a qué campo corresponde cada columna del archivo. */
export function proponerMapeo(encabezados: string[]): Record<number, Campo | null> {
  const mapeo: Record<number, Campo | null> = {}
  const usados = new Set<Campo>()

  encabezados.forEach((encabezado, i) => {
    const limpio = normalizar(encabezado ?? '')
    const campo = (Object.keys(SINONIMOS) as Campo[]).find(
      (c) => !usados.has(c) && SINONIMOS[c].includes(limpio),
    )
    if (campo) usados.add(campo)
    mapeo[i] = campo ?? null
  })

  return mapeo
}

/*
  Convierte a número lo que haya en la celda.

  El caso que importa: Excel devuelve "1.234,56" cuando la planilla está
  en formato argentino y "1,234.56" cuando quedó en inglés. Confundirlos
  cambia un precio por mil, y eso llega al mostrador.

  La regla: el ÚLTIMO separador que aparece es el decimal. Es lo que
  distingue 1.234,56 (coma decimal) de 1,234.56 (punto decimal), y
  funciona igual para 1234,56 y 1234.56.
*/
export function aNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null

  let texto = String(valor).trim()
  if (!texto) return null

  // Se sacan símbolos de moneda, espacios y el signo de porcentaje.
  texto = texto.replace(/[$\s%]/g, '')
  if (!texto) return null

  const ultimaComa = texto.lastIndexOf(',')
  const ultimoPunto = texto.lastIndexOf('.')

  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    // Están los dos: el último manda como decimal, el otro es de miles.
    if (ultimaComa > ultimoPunto) texto = texto.replace(/\./g, '').replace(',', '.')
    else texto = texto.replace(/,/g, '')
  } else if (ultimaComa >= 0 || ultimoPunto >= 0) {
    /*
      Hay un solo tipo de separador, y ahí está la trampa: no se sabe si
      es decimal o de miles. "12.500" en una lista argentina es doce mil
      quinientos; leerlo como doce con cinco pone un precio mil veces
      más barato en el mostrador.

      La regla: si quedan EXACTAMENTE tres dígitos después y el
      separador aparece una sola vez, es de miles. Con dos dígitos o
      menos es decimal, y si aparece más de una vez ("1.234.567") es de
      miles seguro.

      Queda ambiguo a propósito el caso "12.500" leído en inglés como
      12,5 — se elige la interpretación argentina porque es una planilla
      de precios de Oberá, no un archivo científico.
    */
    const separador = ultimaComa >= 0 ? ',' : '.'
    const posicion = ultimaComa >= 0 ? ultimaComa : ultimoPunto
    const despues = texto.length - posicion - 1
    const veces = texto.split(separador).length - 1

    const esDeMiles = veces > 1 || despues === 3
    texto = esDeMiles
      ? texto.split(separador).join('')
      : texto.replace(separador, '.')
  }

  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : null
}

export interface FilaImportada {
  /** Número de fila en el archivo, contando el encabezado. Para el informe. */
  linea: number
  datos: Partial<Record<Campo, string>>
  errores: string[]
}

/*
  Aplica el mapeo a las filas crudas y valida.

  Se valida acá y no en el servidor porque la persona tiene el archivo
  abierto al lado: decirle "la fila 340 tiene el precio mal" mientras
  puede corregirlo vale mucho más que rechazar 3.000 filas al final.
*/
export function prepararFilas(
  filas: unknown[][],
  mapeo: Record<number, Campo | null>,
  /*
    Número de la primera fila de datos EN EL ARCHIVO, contando desde 1
    como lo hace Excel. Por defecto 2, que es el caso de siempre:
    encabezado en la 1 y datos desde la 2. Si el encabezado está más
    abajo —la planilla de Gross lo tiene en la 2— hay que decirlo, o el
    informe de errores manda a la persona a la fila equivocada, que es
    peor que no decirle nada.
  */
  primeraLinea = 2,
): FilaImportada[] {
  const preparadas: FilaImportada[] = []

  filas.forEach((fila, i) => {
    const datos: Partial<Record<Campo, string>> = {}
    const errores: string[] = []

    for (const [indice, campo] of Object.entries(mapeo)) {
      if (!campo) continue
      const crudo = fila[Number(indice)]
      if (crudo === null || crudo === undefined) continue

      const texto = String(crudo).trim()
      if (!texto) continue

      if (NUMERICOS.includes(campo)) {
        const numero = aNumero(texto)
        if (numero === null) {
          errores.push(`${CAMPOS[campo]}: no se entiende el número “${texto}”.`)
          continue
        }
        if (numero < 0) {
          errores.push(`${CAMPOS[campo]}: no puede ser negativo.`)
          continue
        }
        datos[campo] = String(numero)
      } else {
        datos[campo] = texto
      }
    }

    // Fila entera vacía: se saltea sin decir nada. Las planillas suelen
    // traer filas en blanco al final o separando secciones.
    if (Object.keys(datos).length === 0) return

    /*
      La fila de ejemplo de nuestra propia plantilla.

      La plantilla que se le mandó a Gross trae un renglón de muestra
      con el código "(ejemplo)" para que se vea cómo completar cada
      columna. Nadie lo borra —no molesta a la vista— y sin esto se
      importaría como un producto más, con precio y todo.
    */
    if (/^\(.*\)$/.test(datos.codigo?.trim() ?? '')) return

    for (const obligatorio of OBLIGATORIOS) {
      if (!datos[obligatorio]) errores.push(`Falta ${CAMPOS[obligatorio].toLowerCase()}.`)
    }

    preparadas.push({ linea: i + primeraLinea, datos, errores })
  })

  return preparadas
}

/** Códigos repetidos dentro del mismo archivo. */
export function codigosDuplicados(filas: FilaImportada[]): Map<string, number[]> {
  const vistos = new Map<string, number[]>()
  for (const f of filas) {
    const codigo = f.datos.codigo?.toUpperCase()
    if (!codigo) continue
    vistos.set(codigo, [...(vistos.get(codigo) ?? []), f.linea])
  }
  return new Map([...vistos].filter(([, lineas]) => lineas.length > 1))
}

/*
  CSV a mano, sin dependencia.

  Excel en español exporta con punto y coma, porque la coma ya la usa
  como decimal. Se detecta cuál separa mirando la primera línea: la que
  más aparece, gana.
*/
export function leerCsv(texto: string): unknown[][] {
  const limpio = texto.replace(/^﻿/, '') // marca de orden de bytes
  const primeraLinea = limpio.slice(0, limpio.indexOf('\n') + 1 || undefined)
  const separador = (primeraLinea.match(/;/g) ?? []).length >
    (primeraLinea.match(/,/g) ?? []).length
    ? ';'
    : ','

  const filas: unknown[][] = []
  let fila: string[] = []
  let celda = ''
  let entreComillas = false

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i]

    if (entreComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') {
          celda += '"'
          i++
        } else entreComillas = false
      } else celda += c
      continue
    }

    if (c === '"') entreComillas = true
    else if (c === separador) {
      fila.push(celda)
      celda = ''
    } else if (c === '\n') {
      fila.push(celda.replace(/\r$/, ''))
      filas.push(fila)
      fila = []
      celda = ''
    } else celda += c
  }

  if (celda || fila.length) {
    fila.push(celda.replace(/\r$/, ''))
    filas.push(fila)
  }

  return filas
}

/*
  De lo que se leyó de la planilla a lo que entiende el importador.

  Los cuatro niveles de categoría viajan como una ruta, no como cuatro
  campos sueltos: del lado de la base son un árbol, y un árbol se
  camina de arriba hacia abajo. Mandarlos por separado obligaría al
  servidor a adivinar cuál cuelga de cuál.
*/
const NIVELES_CATEGORIA: Campo[] = ['categoria', 'subrubro', 'grupo', 'subgrupo']

export function aPayloadImportacion(
  datos: Partial<Record<Campo, string>>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}

  for (const [campo, valor] of Object.entries(datos)) {
    if (NIVELES_CATEGORIA.includes(campo as Campo)) continue
    payload[campo] = valor
  }

  const ruta = NIVELES_CATEGORIA.map((n) => datos[n]?.trim() ?? '')
  // Si no vino ningún nivel no se manda la ruta: mandarla vacía borraría
  // la categoría que el producto ya tenía.
  if (ruta.some(Boolean)) payload.categoria_ruta = ruta

  return payload
}

/*
  ─────────────────────────────────────────────────────────────
  Dónde empieza la tabla

  Una planilla hecha por una persona casi nunca arranca en A1. La de
  Gross tiene el título en la primera fila, el encabezado en la
  segunda y una fila de ejemplo en la tercera. Tomar siempre la
  primera fila como encabezado importaría el título como si fuera una
  columna, y con eso se cae todo lo demás.

  El criterio es simple y verificable: el encabezado es la fila que
  reconoce más campos. No se adivina nada — si ninguna reconoce nada,
  se devuelve la primera y la pantalla le pide el mapeo a la persona.
  ─────────────────────────────────────────────────────────────
*/

/** Cuántos campos se reconocen si se toma esta fila como encabezado. */
export function camposReconocidos(fila: unknown[]): number {
  const textos = fila.map((c) => String(c ?? ''))
  const mapeo = proponerMapeo(textos)
  return Object.values(mapeo).filter(Boolean).length
}

/** Sólo se buscan en las primeras filas: un encabezado no está en la 40. */
const FILAS_A_MIRAR = 10

export function detectarEncabezado(filas: unknown[][]): number {
  let mejor = 0
  let puntaje = -1

  for (let i = 0; i < Math.min(filas.length, FILAS_A_MIRAR); i++) {
    const p = camposReconocidos(filas[i] ?? [])
    // Estricto: ante un empate gana la fila de más arriba, que es la
    // que una persona señalaría con el dedo.
    if (p > puntaje) {
      puntaje = p
      mejor = i
    }
  }

  return mejor
}

export interface HojaElegida {
  indice: number
  encabezado: number
}

/*
  Cuál de las hojas tiene los productos.

  Gana la que reconoce más campos en su encabezado. Con la planilla de
  Gross eso deja afuera la hoja "Listas" —que sólo tiene los valores
  permitidos— sin que nadie tenga que saber que existe.
*/
export function elegirHoja(hojas: { filas: unknown[][] }[]): HojaElegida {
  let elegida: HojaElegida = { indice: 0, encabezado: 0 }
  let puntaje = -1

  hojas.forEach((hoja, indice) => {
    const encabezado = detectarEncabezado(hoja.filas)
    const p = camposReconocidos(hoja.filas[encabezado] ?? [])
    if (p > puntaje) {
      puntaje = p
      elegida = { indice, encabezado }
    }
  })

  return elegida
}
