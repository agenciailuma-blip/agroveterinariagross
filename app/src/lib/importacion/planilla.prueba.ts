import { describe, expect, it } from 'vitest'
import {
  aNumero,
  aPayloadImportacion,
  codigosDuplicados,
  detectarEncabezado,
  elegirHoja,
  leerCsv,
  ordenarPorEnvase,
  prepararFilas,
  proponerMapeo,
} from '@/lib/importacion/planilla'
import type { Campo } from '@/lib/importacion/planilla'

/*
  ─────────────────────────────────────────────────────────────
  Lectura de la planilla de productos

  Lo que se prueba acá es lo que decide precios. Un separador de miles
  leído como decimal pone un producto mil veces más barato en el
  mostrador, y nadie lo nota hasta que alguien se lo lleva.
  ─────────────────────────────────────────────────────────────
*/

describe('interpretar un número de una celda', () => {
  it('deja pasar lo que ya es número', () => {
    expect(aNumero(1234.5)).toBe(1234.5)
    expect(aNumero(0)).toBe(0)
  })

  it('devuelve null cuando no hay nada que interpretar', () => {
    expect(aNumero(null)).toBeNull()
    expect(aNumero(undefined)).toBeNull()
    expect(aNumero('')).toBeNull()
    expect(aNumero('   ')).toBeNull()
    expect(aNumero('abc')).toBeNull()
    expect(aNumero(Number.NaN)).toBeNull()
    expect(aNumero(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('saca el símbolo de moneda, los espacios y el porcentaje', () => {
    expect(aNumero('$ 78500')).toBe(78500)
    expect(aNumero('21%')).toBe(21)
    expect(aNumero('$')).toBeNull()
  })

  it('con los dos separadores, el último es el decimal', () => {
    // Formato argentino y formato inglés dicen cosas distintas con los
    // mismos caracteres. Confundirlos cambia el precio por mil.
    expect(aNumero('12.500,50')).toBe(12500.5)
    expect(aNumero('1,234.56')).toBe(1234.56)
  })

  it('con un solo separador y tres dígitos detrás, es de miles', () => {
    expect(aNumero('12.500')).toBe(12500)
    expect(aNumero('12,500')).toBe(12500)
    expect(aNumero('1.234.567')).toBe(1234567)
  })

  it('con un solo separador y menos de tres dígitos detrás, es decimal', () => {
    expect(aNumero('1234,56')).toBe(1234.56)
    expect(aNumero('1234.5')).toBe(1234.5)
    // Este sale tal cual de la planilla de Gross
    expect(aNumero('4000.01')).toBe(4000.01)
  })

  it('interpreta los negativos, aunque después no se acepten', () => {
    expect(aNumero('-5')).toBe(-5)
  })
})

describe('reconocer las columnas', () => {
  it('no se marea con mayúsculas, acentos ni signos', () => {
    const mapeo = proponerMapeo(['CÓDIGO', 'Descripción', 'Precio de Venta'])
    expect(mapeo[0]).toBe('codigo')
    expect(mapeo[1]).toBe('nombre_interno')
    expect(mapeo[2]).toBe('precio_venta')
  })

  it('no le da el mismo campo a dos columnas', () => {
    // Dos columnas de precio: la primera se lo queda, la segunda queda
    // sin mapear para que la persona decida.
    const mapeo = proponerMapeo(['Precio', 'Precio'])
    expect(mapeo[0]).toBe('precio_venta')
    expect(mapeo[1]).toBeNull()
  })

  it('deja sin mapear lo que no reconoce, en vez de adivinar', () => {
    const mapeo = proponerMapeo(['Código', 'Vaya a saber'])
    expect(mapeo[1]).toBeNull()
  })
})

describe('preparar las filas', () => {
  const mapeo = { 0: 'codigo' as Campo, 1: 'nombre_interno' as Campo, 2: 'precio_venta' as Campo }

  it('marca la fila con error cuando el número no se entiende, y sigue', () => {
    const filas = prepararFilas(
      [
        ['1', 'Producto bueno', '1000'],
        ['2', 'Producto malo', 'como diez mil'],
        ['3', 'Otro bueno', '2000'],
      ],
      mapeo,
    )
    expect(filas).toHaveLength(3)
    expect(filas[0].errores).toEqual([])
    expect(filas[1].errores[0]).toContain('no se entiende')
    expect(filas[2].errores).toEqual([])
  })

  it('no acepta precios negativos', () => {
    const filas = prepararFilas([['1', 'X', '-100']], mapeo)
    expect(filas[0].errores[0]).toContain('negativo')
  })

  it('saltea las filas vacías sin decir nada', () => {
    const filas = prepararFilas([['1', 'X', '10'], [null, null, null], ['', '', '']], mapeo)
    expect(filas).toHaveLength(1)
  })

  it('saltea la fila de ejemplo de la plantilla', () => {
    // Nadie borra el renglón de muestra, y sin esto entraba como un
    // producto más con precio y todo.
    const filas = prepararFilas([['(ejemplo)', 'ALIM BAL', '78500'], ['1', 'Real', '10']], mapeo)
    expect(filas.map((f) => f.datos.codigo)).toEqual(['1'])
  })

  it('avisa cuando falta un dato obligatorio', () => {
    const filas = prepararFilas([['', 'Sin código', '10']], mapeo)
    expect(filas[0].errores.join(' ')).toContain('código')
  })

  it('numera las filas como las numera Excel', () => {
    // Por defecto: encabezado en la 1, datos desde la 2.
    const filas = prepararFilas([['1', 'X', '10'], ['2', 'Y', '20']], mapeo)
    expect(filas.map((f) => f.linea)).toEqual([2, 3])

    // Y si el encabezado está más abajo, el informe tiene que mandar a
    // la fila correcta: si no, la persona busca el error donde no está.
    const corridas = prepararFilas([['1', 'X', '10'], ['2', 'Y', '20']], mapeo, 4)
    expect(corridas.map((f) => f.linea)).toEqual([4, 5])
  })
})

describe('códigos repetidos dentro del mismo archivo', () => {
  it('los encuentra sin distinguir mayúsculas y dice en qué filas están', () => {
    const filas = prepararFilas(
      [['a1', 'X', '1'], ['A1', 'Y', '2'], ['b2', 'Z', '3']],
      { 0: 'codigo' as Campo, 1: 'nombre_interno' as Campo, 2: 'precio_venta' as Campo },
    )
    const dup = codigosDuplicados(filas)
    expect(dup.size).toBe(1)
    expect(dup.get('A1')).toEqual([2, 3])
  })
})

describe('leer un CSV', () => {
  it('usa punto y coma cuando la primera línea tiene más punto y coma que comas', () => {
    expect(leerCsv('a;b;c\n1;2;3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('respeta las comas que están adentro de comillas', () => {
    expect(leerCsv('codigo,nombre\n1,"Alimento, perro adulto"')).toEqual([
      ['codigo', 'nombre'],
      ['1', 'Alimento, perro adulto'],
    ])
  })

  it('entiende las comillas dobles como una comilla', () => {
    expect(leerCsv('a\n"Bolsa de 15"" x 3"')).toEqual([['a'], ['Bolsa de 15" x 3']])
  })

  it('aguanta los finales de línea de Windows y la marca de orden de bytes', () => {
    expect(leerCsv('﻿a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

/*
  ─────────────────────────────────────────────────────────────
  La planilla real de Gross, tal como la mandó Lucas el 25/08

  Dos hojas: la primera son los valores permitidos de cada desplegable
  y la segunda son los productos. Los productos no arrancan en A1: la
  fila 1 es el título, la 2 el encabezado y la 3 una fila de ejemplo.

  Se prueba con estas filas y no con un archivo de laboratorio porque
  el error que hubo era exactamente de este tipo: se leía la hoja
  equivocada y se tomaba el título como encabezado.
  ─────────────────────────────────────────────────────────────
*/

const HOJA_LISTAS: unknown[][] = [
  ['Rubro', 'Subrubro', 'Grupo', 'Subgrupo', 'Marca', 'Animal', 'SI/NO'],
  ['Alimentos', 'Pequeños Animales', 'Alimentos húmedos', 'Adulto', 'Bagó', 'Perros', 'SI'],
  ['Farmacia', 'Grandes Animales', 'Alimentos Secos', 'Cachorro', 'Bravecto', 'Gatos', 'NO'],
]

const HOJA_PRODUCTOS: unknown[][] = [
  ['PLANTILLA DE CATEGORIZACIÓN', null, null, null, null, null, null, null, null, null, null, null, null],
  [
    'Código', 'Descripción', 'Precio contado', 'Precio tarjeta', 'Rubro', 'Subrubro',
    'Grupo', 'Subgrupo', 'Marca', 'Animal', 'Es veterinario', 'Requiere receta', 'Es fitosanitario',
  ],
  [
    '(ejemplo)', 'ALIM BAL PROPLAN PERRO AD 15', '78500', '86350', 'Alimentos', 'Alimento seco',
    'Perro adulto', 'Raza mediana', 'Pro Plan', 'Perros', 'NO', 'NO', 'NO',
  ],
  [
    '1950', 'SIEGER ADULTO x 15', '78500', '86350', 'Alimentos', 'Pequeños Animales',
    'Alimentos Secos', 'Adulto', 'Sieger', 'Perros', 'NO', 'NO', 'NO',
  ],
  [
    '605', 'BAGO VACUNA MULTI', '12500', '13750', 'Farmacia', 'Grandes Animales',
    'Vacunas', 'Multidosis', 'Bagó', 'Bovinos', 'SI', 'SI', 'NO',
  ],
]

const cabecera = (HOJA_PRODUCTOS[1] ?? []).map((c) => String(c ?? ''))

describe('la planilla de categorización de Gross', () => {
  it('elige la hoja de productos y no la de listas', () => {
    expect(elegirHoja([{ filas: HOJA_LISTAS }, { filas: HOJA_PRODUCTOS }]).indice).toBe(1)
  })

  it('encuentra el encabezado aunque la primera fila sea el título', () => {
    expect(detectarEncabezado(HOJA_PRODUCTOS)).toBe(1)
  })

  it('reconoce las columnas que Lucas usó, sin que nadie las mapee a mano', () => {
    const mapeo = proponerMapeo(cabecera)
    const porColumna = (nombre: string) => mapeo[cabecera.indexOf(nombre)]

    expect(porColumna('Código')).toBe('codigo')
    expect(porColumna('Descripción')).toBe('nombre_interno')
    expect(porColumna('Precio contado')).toBe('precio_venta')
    expect(porColumna('Rubro')).toBe('categoria')
    expect(porColumna('Subrubro')).toBe('subrubro')
    expect(porColumna('Grupo')).toBe('grupo')
    expect(porColumna('Subgrupo')).toBe('subgrupo')
    expect(porColumna('Marca')).toBe('marca')
    expect(porColumna('Es veterinario')).toBe('es_veterinario')
    expect(porColumna('Requiere receta')).toBe('requiere_receta')
    expect(porColumna('Es fitosanitario')).toBe('es_fitosanitario')
  })

  it('“Grupo” es su propia columna y no se la lleva la categoría', () => {
    // Antes 'grupo' era sinónimo de categoría. Con esta planilla eso
    // hacía que el Grupo pisara al Rubro y se perdiera un nivel entero.
    const mapeo = proponerMapeo(['Rubro', 'Grupo'])
    expect(mapeo[0]).toBe('categoria')
    expect(mapeo[1]).toBe('grupo')
  })

  it('arma la ruta de categorías con los cuatro niveles, en orden', () => {
    const filas = prepararFilas(HOJA_PRODUCTOS.slice(2), proponerMapeo(cabecera))
    const sieger = filas.find((f) => f.datos.codigo === '1950')!
    const payload = aPayloadImportacion(sieger.datos)

    expect(payload.categoria_ruta).toEqual([
      'Alimentos',
      'Pequeños Animales',
      'Alimentos Secos',
      'Adulto',
    ])
    // Los niveles no viajan además sueltos: el servidor los ignoraría.
    expect(payload.subrubro).toBeUndefined()
    expect(payload.grupo).toBeUndefined()
  })

  it('lleva las tres banderas y el precio de contado', () => {
    const filas = prepararFilas(HOJA_PRODUCTOS.slice(2), proponerMapeo(cabecera))
    const vacuna = filas.find((f) => f.datos.codigo === '605')!
    const payload = aPayloadImportacion(vacuna.datos)

    expect(payload.precio_venta).toBe('12500')
    expect(payload.es_veterinario).toBe('SI')
    expect(payload.requiere_receta).toBe('SI')
    expect(payload.es_fitosanitario).toBe('NO')
    expect(payload.marca).toBe('Bagó')
  })

  it('no manda la ruta cuando el producto no está categorizado', () => {
    // Es lo que pasa con los 2.175 que Lucas todavía no tocó: importar
    // una ruta vacía les borraría la categoría que ya tuvieran.
    const payload = aPayloadImportacion({ codigo: '1', nombre_interno: 'X' })
    expect(payload.categoria_ruta).toBeUndefined()
  })
})

/*
  ─────────────────────────────────────────────────────────────
  El mínimo y la suelta en la planilla

  Lucas va a poner el mínimo al dar de alta los productos (07/10), y
  hay productos que se venden por caja, tableta y pastilla (08/10). Lo
  que se guarda lo prueba la base (supabase/pruebas/importar-minimo-y-
  suelta.sql); acá, lo que la pantalla reconoce y avisa antes.
  ─────────────────────────────────────────────────────────────
*/

describe('el mínimo y la suelta', () => {
  it('reconoce las columnas como las escribiría Lucas', () => {
    const mapeo = proponerMapeo(['Código', 'Descripción', 'Stock mínimo', 'Stock bajo', 'Sale de', 'Cuántas trae'])
    expect(Object.values(mapeo)).toEqual([
      'codigo', 'nombre_interno', 'stock_critico', 'stock_bajo', 'sale_de', 'cantidad_por_envase',
    ])
  })

  it('el mínimo es el crítico, como lo dijo Lucas', () => {
    // «Cuando tenga dos bolsas, avisame que estoy en crítico.»
    expect(proponerMapeo(['Mín.'])[0]).toBe('stock_critico')
    expect(proponerMapeo(['Mínimo'])[0]).toBe('stock_critico')
  })

  it('no confunde la columna Envase ni las unidades por caja con la suelta', () => {
    // «Bidón», «Frasco»: es la presentación, no de qué caja sale.
    const mapeo = proponerMapeo(['Código', 'Envase', 'Unidades por caja'])
    expect(mapeo[1]).toBeNull()
    expect(mapeo[2]).toBeNull()
  })

  const mapeo = proponerMapeo(['Código', 'Nombre', 'Stock bajo', 'Stock mínimo', 'Sale de', 'Trae'])

  it('lee el mínimo con formato argentino', () => {
    const [fila] = prepararFilas([['B1', 'Bolsa', '1.000', '2,5', '', '']], mapeo)
    expect(fila.errores).toEqual([])
    expect(fila.datos.stock_bajo).toBe('1000')
    expect(fila.datos.stock_critico).toBe('2.5')
  })

  it('frena un crítico mayor que el bajo, que es un error de tipeo', () => {
    const [fila] = prepararFilas([['B1', 'Bolsa', '2', '5', '', '']], mapeo)
    expect(fila.errores).toEqual(['El stock crítico no puede ser mayor que el bajo.'])
  })

  it('acepta uno solo de los dos números', () => {
    const filas = prepararFilas([['B1', 'Bolsa', '', '2', '', ''], ['B2', 'Otra', '6', '', '', '']], mapeo)
    expect(filas.map((f) => f.errores)).toEqual([[], []])
  })

  it('no acepta un mínimo negativo', () => {
    const [fila] = prepararFilas([['B1', 'Bolsa', '', '-2', '', '']], mapeo)
    expect(fila.errores[0]).toMatch(/no puede ser negativo/)
  })

  it('la suelta necesita las dos columnas: de qué sale y cuántas trae', () => {
    const [sinCuantas, sinEnvase] = prepararFilas(
      [['P1', 'Pastilla', '', '', 'CAJA1', ''], ['P2', 'Pastilla', '', '', '', '10']],
      mapeo,
    )
    expect(sinCuantas.errores).toEqual(['Sale de CAJA1, pero falta cuántas trae.'])
    expect(sinEnvase.errores).toEqual(['Dice cuántas trae, pero no de qué envase sale.'])
  })

  it('frena «trae 0» y el producto que sale de sí mismo', () => {
    const [cero, propio] = prepararFilas(
      [['P1', 'Pastilla', '', '', 'CAJA1', '0'], ['p2', 'Pastilla', '', '', 'P2', '10']],
      mapeo,
    )
    expect(cero.errores).toEqual(['Cuántas trae el envase tiene que ser más que cero.'])
    expect(propio.errores).toEqual(['Un producto no puede salir de adentro de sí mismo.'])
  })

  it('la suelta viaja con el código de su envase y cuántas trae', () => {
    const [fila] = prepararFilas([['P1', 'Pastilla', '', '', 'TAB1', '10']], mapeo)
    const payload = aPayloadImportacion(fila.datos)
    expect(payload.sale_de).toBe('TAB1')
    expect(payload.cantidad_por_envase).toBe('10')
  })
})

describe('las cajas viajan antes que sus sueltas', () => {
  const mapeo = proponerMapeo(['Código', 'Nombre', 'Sale de', 'Trae'])
  const codigos = (filas: { datos: { codigo?: string } }[]) => filas.map((f) => f.datos.codigo)

  it('ordena caja, tableta y pastilla aunque en el Excel estén al revés', () => {
    const filas = prepararFilas(
      [
        ['PAST', 'Pastilla', 'tab', '10'],
        ['OTRO', 'Collar', '', ''],
        ['TAB', 'Tableta', 'CAJA', '10'],
        ['CAJA', 'Caja', '', ''],
      ],
      mapeo,
    )
    expect(codigos(ordenarPorEnvase(filas))).toEqual(['OTRO', 'CAJA', 'TAB', 'PAST'])
  })

  it('no cambia el orden de lo que no tiene suelta, ni de la suelta cuyo envase ya está cargado', () => {
    const filas = prepararFilas(
      [['B', 'Uno', '', ''], ['S', 'Suelta', 'YA-CARGADA', '5'], ['A', 'Dos', '', '']],
      mapeo,
    )
    expect(codigos(ordenarPorEnvase(filas))).toEqual(['B', 'S', 'A'])
  })

  it('una vuelta escrita en la planilla no lo cuelga', () => {
    const filas = prepararFilas([['A', 'Uno', 'B', '2'], ['B', 'Dos', 'A', '2']], mapeo)
    expect(codigos(ordenarPorEnvase(filas)).sort()).toEqual(['A', 'B'])
  })
})
