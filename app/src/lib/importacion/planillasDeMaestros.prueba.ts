import { describe, expect, it } from 'vitest'
import leerExcel from 'read-excel-file/universal'
import { clasificar, type Registro } from '@/lib/importacion/comparar'
import { COMPARADOR_CLIENTES, COMPARADOR_PRODUCTOS, COMPARADOR_PROVEEDORES } from '@/lib/importacion/comparadores'
import { CLIENTES, PROVEEDORES } from '@/lib/importacion/definiciones'
import { aExcel, armarHoja, nombreDeArchivo } from '@/lib/importacion/exportar'
import { detectarEncabezado, PRODUCTOS, prepararFilas, proponerMapeo, type DefinicionPlanilla } from '@/lib/importacion/planilla'
import {
  COLUMNAS_DE_CLIENTES,
  COLUMNAS_DE_PROVEEDORES,
  columnasDeProductos,
  rutaDeCategoria,
  type Categoria,
} from '@/lib/importacion/planillasDeMaestros'

/*
  La planilla que baja el sistema tiene que volver a entrar igual.

  Es lo que hace que sirva de plantilla: bajar, corregir en Excel y
  subir. Si una columna se baja distinto de cómo se lee —un número
  escrito como texto, un sí o no que no se entiende, una categoría que
  pierde su rama—, subirla sin tocar diría que cambió todo el catálogo,
  y Lucas no podría ver qué cambió de verdad.
*/

const categorias = new Map<string, Categoria>([
  ['c1', { id: 'c1', nombre: 'Alimentos', padre_id: null }],
  ['c2', { id: 'c2', nombre: 'Gatos', padre_id: 'c1' }],
  ['c3', { id: 'c3', nombre: 'Secos', padre_id: 'c2' }],
])

const productos: Registro[] = [
  {
    codigo: 'ALIM-10', nombre_interno: 'ALIM BAL ROYAL GATO AD 7.5KG', nombre_publico: 'Royal Canin Gato Adulto 7,5 kg',
    precio_venta: '62300.0000', costo: '41500.5000', unidad_medida: 'bolsa', peso_kg: '7.5000', unidades_por_bulto: '1',
    es_producto_veterinario: false, requiere_receta: false, es_fitosanitario: false, categoria_id: 'c3',
    cantidad_por_envase: null, alicuota: { porcentaje: '10.50' }, marca: { nombre: 'Royal Canin' },
    categoria: { nombre: 'Secos' }, envase: null,
    codigos: [
      { codigo: '7790000000099', es_principal: false, eliminado_en: null },
      { codigo: '7790000000002', es_principal: true, eliminado_en: null },
    ],
    umbral: [{ bajo: '5.0000', critico: '2.0000', ambito: 'producto', eliminado_en: null }],
  },
  {
    // La pastilla que sale de una caja, con un peso de tres decimales: el
    // caso que en un CSV volvía mil veces más grande.
    codigo: 'PIPETA-2-S', nombre_interno: 'PIPETA SUELTA', nombre_publico: null,
    precio_venta: '4000.0100', costo: null, unidad_medida: 'unidad', peso_kg: '0.1250', unidades_por_bulto: null,
    es_producto_veterinario: true, requiere_receta: true, es_fitosanitario: false, categoria_id: null,
    cantidad_por_envase: '10.0000', alicuota: { porcentaje: '21.00' }, marca: null, categoria: null,
    envase: { codigo: 'PIPETA-2' }, codigos: [], umbral: [],
  },
]

const clientes: Registro[] = [
  {
    codigo: '0042', nombre: 'Veterinaria del Centro SRL', condicion_iva_id: 1, numero_documento: '30712345671',
    calle: 'San Martín 123', localidad: 'Oberá', provincia: 'Misiones', codigo_postal: '3360', telefono: '3755 401234',
    email: 'compras@vetcentro.com.ar', cuenta_corriente: true, limite_credito: '500000.0000', dias_vencimiento: 30,
  },
  {
    codigo: '0043', nombre: 'María Gómez', condicion_iva_id: 5, numero_documento: '30111222', calle: null,
    localidad: null, provincia: null, codigo_postal: null, telefono: null, email: null, cuenta_corriente: false,
    limite_credito: null, dias_vencimiento: null,
  },
  {
    codigo: '0044', nombre: 'Juan Pérez', condicion_iva_id: 6, numero_documento: '20123456786', calle: 'Ruta 14 km 3',
    localidad: 'Campo Viera', provincia: 'Misiones', codigo_postal: null, telefono: null, email: null,
    cuenta_corriente: true, limite_credito: '0.0000', dias_vencimiento: 15,
  },
]

/** Lo que haría el importador con las filas leídas: encabezado, columnas, filas y comparación. */
function volverASubir<C extends string>(filas: unknown[][], def: DefinicionPlanilla<C>) {
  const encabezado = detectarEncabezado(filas, def)
  const mapeo = proponerMapeo(filas[encabezado].map((c) => String(c ?? '')), def)
  return { mapeo, preparadas: prepararFilas(filas.slice(encabezado + 1), mapeo, encabezado + 2, def) }
}

describe('productos: bajar y volver a subir sin tocar', () => {
  const columnas = columnasDeProductos(categorias)
  const hoja = armarHoja(PRODUCTOS, columnas, productos)

  it('cada columna se reconoce como su campo', () => {
    const { mapeo } = volverASubir(hoja, PRODUCTOS)
    expect(Object.values(mapeo)).toEqual(columnas.map((c) => c.campo))
  })

  it('ninguna fila tiene errores y no cambia nada', () => {
    const { preparadas } = volverASubir(hoja, PRODUCTOS)
    expect(preparadas.flatMap((p) => p.errores)).toEqual([])
    const c = clasificar(preparadas, productos, COMPARADOR_PRODUCTOS)
    expect(c.nuevos).toHaveLength(0)
    expect(c.existentes.flatMap((e) => e.cambios)).toEqual([])
  })

  it('y si se cambia un precio, cambia sólo el precio', () => {
    const tocada = hoja.map((f) => [...f])
    tocada[1][3] = 65000
    const { preparadas } = volverASubir(tocada, PRODUCTOS)
    const cambios = clasificar(preparadas, productos, COMPARADOR_PRODUCTOS).existentes.flatMap((e) => e.cambios)
    expect(cambios.map((x) => x.grupo)).toEqual(['precio'])
  })

  it('la categoría baja con toda su rama', () => {
    expect(rutaDeCategoria('c3', categorias)).toEqual(['Alimentos', 'Gatos', 'Secos'])
    expect(hoja[1].slice(6, 10)).toEqual(['Alimentos', 'Gatos', 'Secos', null])
  })
})

describe('clientes: bajar y volver a subir sin tocar', () => {
  const hoja = armarHoja(CLIENTES, COLUMNAS_DE_CLIENTES, clientes)

  it('cada columna se reconoce como su campo', () => {
    const { mapeo } = volverASubir(hoja, CLIENTES)
    expect(Object.values(mapeo)).toEqual(COLUMNAS_DE_CLIENTES.map((c) => c.campo))
  })

  it('ninguna fila tiene errores y no cambia nada', () => {
    const { preparadas } = volverASubir(hoja, CLIENTES)
    expect(preparadas.flatMap((p) => p.errores)).toEqual([])
    const c = clasificar(preparadas, clientes, COMPARADOR_CLIENTES)
    expect(c.nuevos).toHaveLength(0)
    expect(c.existentes.flatMap((e) => e.cambios)).toEqual([])
  })
})

const proveedores: Registro[] = [
  {
    codigo: 'P-01', nombre: 'Laboratorios Bagó S.A.', nombre_fantasia: 'Bagó', condicion_iva_id: 1,
    numero_documento: '30999999995', domicilio: 'Bernardo de Irigoyen 248', localidad: 'CABA', provincia: 'Buenos Aires',
    telefono: '011 4344 2000', email: 'pedidos@bago.com.ar', contacto: 'Carla', cbu: '2850590940090418135201',
    alias: 'BAGO.PEDIDOS', minimo_tipo: 'monto', minimo_valor: '350000.0000', observaciones: 'Entrega los martes',
  },
  {
    codigo: null, nombre: 'Distribuidora del Norte', nombre_fantasia: null, condicion_iva_id: 6, numero_documento: null,
    domicilio: null, localidad: null, provincia: null, telefono: null, email: null, contacto: null, cbu: null,
    alias: null, minimo_tipo: 'kilos', minimo_valor: '25.5000', observaciones: null,
  },
]

describe('proveedores: bajar y volver a subir sin tocar', () => {
  const hoja = armarHoja(PROVEEDORES, COLUMNAS_DE_PROVEEDORES, proveedores)

  it('cada columna se reconoce como su campo', () => {
    const { mapeo } = volverASubir(hoja, PROVEEDORES)
    expect(Object.values(mapeo)).toEqual(COLUMNAS_DE_PROVEEDORES.map((c) => c.campo))
  })

  it('ninguna fila tiene errores y no cambia nada', () => {
    const { preparadas } = volverASubir(hoja, PROVEEDORES)
    expect(preparadas.flatMap((p) => p.errores)).toEqual([])
    const c = clasificar(preparadas, proveedores, COMPARADOR_PROVEEDORES)
    expect(c.nuevos).toHaveLength(0)
    expect(c.existentes.flatMap((e) => e.cambios)).toEqual([])
  })

  it('el mínimo baja con palabras y vuelve igual', () => {
    expect(hoja[1][13]).toBe('Monto')
    expect(hoja[2][13]).toBe('Kilos')
  })
})

describe('el archivo de Excel de verdad', () => {
  it('los números vuelven como números, y el peso de 0,125 no se vuelve 125', async () => {
    const hoja = armarHoja(PRODUCTOS, columnasDeProductos(categorias), productos)
    const archivo = await aExcel(hoja)
    const [leida] = await leerExcel(archivo)
    const { preparadas } = volverASubir(leida.data as unknown[][], PRODUCTOS)
    expect(preparadas[1].datos.peso_kg).toBe('0.125')
    expect(preparadas[0].datos.codigo_barra).toBe('7790000000002')
    const c = clasificar(preparadas, productos, COMPARADOR_PRODUCTOS)
    expect(c.existentes.flatMap((e) => e.cambios)).toEqual([])
  })

  it('el nombre lleva la fecha', () => {
    expect(nombreDeArchivo('productos', new Date(2026, 9, 21))).toBe('productos-2026-10-21.xlsx')
  })
})
