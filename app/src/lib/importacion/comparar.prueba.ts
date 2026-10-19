import { describe, expect, it } from 'vitest'
import { armarEnvio, clasificar, cuantosCambian } from './comparar'
import { COMPARADOR_CLIENTES, COMPARADOR_PRODUCTOS, condicionDesdeTexto } from './comparadores'
import { alicuotaDesdePrecios, prepararFilas, proponerMapeo, type Campo, type FilaImportada } from './planilla'
import { CLIENTES, type CampoCliente } from './definiciones'

const producto = (linea: number, datos: Partial<Record<Campo, string>>): FilaImportada<Campo> => ({
  linea,
  datos,
  errores: [],
})

const EN_LA_BASE = [
  {
    codigo: '1950', nombre_interno: '12 P 15', nombre_publico: null, precio_venta: 12500, costo: 8000,
    unidad_medida: 'unidad', peso_kg: null, unidades_por_bulto: null, es_producto_veterinario: false,
    requiere_receta: false, es_fitosanitario: false, alicuota: { porcentaje: 21 }, marca: null, categoria: null,
  },
  {
    codigo: 'ABC', nombre_interno: 'Pipeta', nombre_publico: null, precio_venta: 3000, costo: null,
    unidad_medida: 'unidad', peso_kg: null, unidades_por_bulto: null, es_producto_veterinario: true,
    requiere_receta: false, es_fitosanitario: false, alicuota: [{ porcentaje: 21 }], marca: { nombre: 'Bayer' },
    categoria: { nombre: 'Antiparasitarios' },
  },
]

describe('qué es nuevo y qué ya está', () => {
  const filas = [
    producto(7, { codigo: '1950', nombre_interno: '12 P 15', precio_venta: '13000', alicuota_porcentaje: '21' }),
    producto(8, { codigo: 'abc', nombre_interno: 'Pipeta x 3', precio_venta: '3000', marca: 'BAYER' }),
    producto(9, { codigo: '2000', nombre_interno: 'Nuevo', precio_venta: '100' }),
  ]
  const c = clasificar(filas, EN_LA_BASE, COMPARADOR_PRODUCTOS)

  it('reconoce los que ya están por el código, sin distinguir mayúsculas', () => {
    expect(c.nuevos.map((f) => f.datos.codigo)).toEqual(['2000'])
    expect(c.existentes.map((e) => e.fila.datos.codigo)).toEqual(['1950', 'abc'])
  })

  it('dice qué cambia, de cuánto a cuánto, y no cuenta lo que es igual', () => {
    const [p1950, pabc] = c.existentes
    expect(p1950.cambios).toEqual([
      { grupo: 'precio', etiqueta: 'Precio de venta', antes: '$ 12.500,00', despues: '$ 13.000,00', comparado: true },
    ])
    // El precio igual y la marca escrita en mayúsculas no son cambios.
    expect(pabc.cambios.map((x) => x.grupo)).toEqual(['nombre'])
    expect(cuantosCambian(c)).toEqual(new Map([['precio', 1], ['nombre', 1]]))
  })

  it('con «sólo el precio», el nombre nuevo no viaja', () => {
    const envio = armarEnvio(c, { crearNuevos: true, actualizarExistentes: true, grupos: new Set(['precio']) }, COMPARADOR_PRODUCTOS)
    expect(envio.map((f) => f.datos)).toEqual([
      { codigo: '1950', precio_venta: '13000' },
      { codigo: '2000', nombre_interno: 'Nuevo', precio_venta: '100' },
    ])
  })

  it('sin tocar los que ya están, viajan sólo los nuevos', () => {
    const envio = armarEnvio(c, { crearNuevos: true, actualizarExistentes: false, grupos: new Set(['precio', 'nombre']) }, COMPARADOR_PRODUCTOS)
    expect(envio.map((f) => f.datos.codigo)).toEqual(['2000'])
  })

  it('sin crear los nuevos, viajan sólo los cambios elegidos', () => {
    const envio = armarEnvio(c, { crearNuevos: false, actualizarExistentes: true, grupos: new Set(['nombre']) }, COMPARADOR_PRODUCTOS)
    expect(envio.map((f) => f.datos)).toEqual([{ codigo: 'abc', nombre_interno: 'Pipeta x 3' }])
  })

  it('lo que no se puede comparar se avisa como que se manda', () => {
    const conAviso = clasificar([producto(3, { codigo: '1950', stock_critico: '2' })], EN_LA_BASE, COMPARADOR_PRODUCTOS)
    expect(conAviso.existentes[0].cambios).toEqual([
      { grupo: 'aviso', etiqueta: 'Aviso de stock', antes: null, despues: null, comparado: false },
    ])
  })
})

describe('el IVA a partir del precio con y sin IVA', () => {
  it('21 y 10,5, y el redondeo de los precios chicos', () => {
    expect(alicuotaDesdePrecios(12500, 10330.58)).toBe(21)
    expect(alicuotaDesdePrecios(1105, 1000)).toBe(10.5)
    // $1 con IVA es $0,83 sin IVA: la cuenta da 20,5 y es el 21.
    expect(alicuotaDesdePrecios(1, 0.83)).toBe(21)
  })

  it('sin precio no hay cuenta, y lo que no es de ARCA no se adivina', () => {
    expect(alicuotaDesdePrecios(0, 0)).toBeNull()
    expect(alicuotaDesdePrecios(115, 100)).toBeNaN()
  })

  it('lee el listado de precios de OBTech sin que nadie mapee a mano', () => {
    const cabecera = ['Código', 'Descripción', 'Precio 1 S/IVA', 'Precio 1 C/IVA', 'Precio 2 S/IVA', 'Precio 2 C/IVA']
    const mapeo = proponerMapeo(cabecera)
    expect(Object.values(mapeo)).toEqual(['codigo', 'nombre_interno', 'precio_sin_iva', 'precio_venta', null, null])

    const [fila] = prepararFilas([[1950, '12 P 15', 10330.58, 12500, 11570.25, 14000]], mapeo, 7)
    expect(fila.errores).toEqual([])
    expect(fila.datos.alicuota_porcentaje).toBe('21')
    expect(fila.datos.precio_venta).toBe('12500')
  })

  it('frena la fila cuando los dos precios no dan un IVA de ARCA', () => {
    const mapeo = { 0: 'codigo', 1: 'nombre_interno', 2: 'precio_sin_iva', 3: 'precio_venta' } as Record<number, Campo>
    const [fila] = prepararFilas([['X', 'Raro', 100, 115]], mapeo)
    expect(fila.errores[0]).toContain('15,0 %')
  })
})

describe('el listado de clientes de OBTech', () => {
  const cabecera = [
    'Código', 'Nombre', 'Nombre Fantasia', 'Dirección', 'Tel/Fax', 'Localidad', 'Nombre Localidad', 'Zona',
    'Nombre Zona', 'Vendedor', 'Nombre Vendedor', 'Condición de Iva', 'Cuit',
  ]
  const mapeo = proponerMapeo(cabecera, CLIENTES)

  it('toma el nombre de la localidad y no su número', () => {
    expect(mapeo[5]).toBeNull()
    expect(mapeo[6]).toBe('localidad')
    expect(mapeo[12]).toBe('documento')
  })

  it('el CUIT en cero, el teléfono de ceros y el «n/n» no son datos', () => {
    const [f] = prepararFilas(
      [[2, 'PEREZ JUAN  ', '  ', 'n/n', '(00000) 00000000', 1, 'OBERA', 0, null, 1, 'UNICO', 'Consumidor Final', 0]],
      mapeo, 6, CLIENTES,
    )
    expect(f.errores).toEqual([])
    expect(f.datos).toEqual({ codigo: '2', nombre: 'PEREZ JUAN', localidad: 'OBERA', condicion_iva: 'Consumidor Final' })
  })

  it('el consumidor final genérico no entra como cliente', () => {
    const [f] = prepararFilas([[1, 'Consumidor final', null, 'n/n', '', 1, 'OBERA', 0, null, 1, 'UNICO', 'Consumidor Final', 0]], mapeo, 6, CLIENTES)
    expect(f.errores).toEqual(['Es el consumidor final genérico: el sistema ya tiene el suyo.'])
  })

  it('«Monotributista» y «Monotributo» son la misma condición', () => {
    expect(condicionDesdeTexto('Monotributista')).toBe(6)
    const c = clasificar(
      [{ linea: 2, errores: [], datos: { codigo: '4003', nombre: 'ANDREA', condicion_iva: 'Monotributista', documento: '27392266432' } as Partial<Record<CampoCliente, string>> }],
      [{ codigo: null, nombre: 'ANDREA', condicion_iva_id: 6, numero_documento: '27392266432' }],
      COMPARADOR_CLIENTES,
    )
    // Lo encuentra por el CUIT, y la condición no cambia.
    expect(c.existentes).toHaveLength(1)
    expect(c.existentes[0].cambios).toEqual([])
  })
})

describe('el mismo CUIT con otro código', () => {
  it('no se cuenta como el cliente que ya está: la base lo frena', () => {
    const c = clasificar(
      [{ linea: 3, errores: [], datos: { codigo: '651', nombre: 'FACULTAD DE ARTES', documento: '30598218095' } as Partial<Record<CampoCliente, string>> }],
      [{ codigo: '391', nombre: 'COMEDOR UNIVERSITARIO', numero_documento: '30598218095' }],
      COMPARADOR_CLIENTES,
    )
    expect(c.existentes).toHaveLength(0)
    expect(c.nuevos).toHaveLength(1)
  })
})
