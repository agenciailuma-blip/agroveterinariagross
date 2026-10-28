import { describe, expect, it } from 'vitest'
import {
  agregarLinea,
  cambiarCantidad,
  cantidadesCorregidas,
  enlaceMapa,
  filtrarClientes,
  numeroWhatsapp,
  rutasDe,
  totalDe,
  type ClienteMayorista,
  type LineaPedidoMayorista,
  type ProductoMayorista,
} from '@/lib/api/mayorista'

const producto = (id: string, precio: number): ProductoMayorista => ({
  producto_id: id,
  codigo: id.toUpperCase(),
  nombre: `Producto ${id}`,
  precio,
  stock: null,
  unidades_por_bulto: null,
})

const cliente = (c: Partial<ClienteMayorista>): ClienteMayorista => ({
  id: c.nombre ?? 'x',
  nombre: 'Sin nombre',
  nombre_fantasia: null,
  tipo_documento_id: 99,
  numero_documento: null,
  condicion_iva_id: 5,
  calle: null,
  numero: null,
  localidad: null,
  zona: null,
  ruta: null,
  telefono: null,
  email: null,
  latitud: null,
  longitud: null,
  cuenta_corriente: true,
  saldo: null,
  vencido: null,
  vencimiento_mas_antiguo: null,
  ultimo_pedido_en: null,
  ultimo_pedido_numero: null,
  ...c,
})

describe('armar el pedido', () => {
  it('el mismo producto dos veces suma la cantidad, no repite el renglón', () => {
    let l = agregarLinea([], producto('a', 100), 2)
    l = agregarLinea(l, producto('a', 100), 3)
    expect(l).toHaveLength(1)
    expect(l[0].cantidad).toBe(5)
  })

  it('el precio es el de la lista', () => {
    const [l] = agregarLinea([], producto('a', 1250.5), 1)
    expect(l.precio).toBe(1250.5)
    expect(l.precio_lista).toBe(1250.5)
  })

  it('una cantidad de cero o menos no agrega, y cambiar a cero saca', () => {
    expect(agregarLinea([], producto('a', 1), 0)).toEqual([])
    const l = agregarLinea(agregarLinea([], producto('a', 1), 1), producto('b', 1), 1)
    expect(cambiarCantidad(l, 'a', 0).map((x) => x.producto_id)).toEqual(['b'])
    expect(cambiarCantidad(l, 'b', 4).find((x) => x.producto_id === 'b')?.cantidad).toBe(4)
  })

  it('el total redondea cada renglón al centavo, como la base', () => {
    expect(totalDe([{ cantidad: 3, precio: 0.335 }, { cantidad: 1, precio: 10 }])).toBeCloseTo(11.01, 2)
  })
})

describe('lo que corrige el depósito', () => {
  const lineas: LineaPedidoMayorista[] = [
    { producto_id: 'a', codigo: 'A', nombre: 'A', cantidad: 3, precio: 1, precio_lista: 1, stock: 5 },
    { producto_id: 'b', codigo: 'B', nombre: 'B', cantidad: 2, precio: 1, precio_lista: 1, stock: 0 },
  ]

  it('se mandan sólo las cantidades que cambiaron', () => {
    expect(cantidadesCorregidas(lineas, { a: 3, b: 0 })).toEqual([{ producto_id: 'b', cantidad: 0 }])
    expect(cantidadesCorregidas(lineas, {})).toEqual([])
  })
})

describe('el número para WhatsApp', () => {
  it('todas las maneras de cargar el mismo celular llevan al mismo chat', () => {
    for (const t of ['3764 15-123456', '03764-15123456', '+54 9 3764 123456', '3764123456', '54 3764 123456']) {
      expect(numeroWhatsapp(t), t).toBe('5493764123456')
    }
  })

  it('un número que no se entiende no da enlace', () => {
    expect(numeroWhatsapp('123')).toBeNull()
    expect(numeroWhatsapp(null)).toBeNull()
  })
})

describe('el mapa', () => {
  it('con la ubicación guardada, va al punto exacto', () => {
    expect(enlaceMapa({ latitud: -27.48, longitud: -55.12, calle: 'X', numero: '1', localidad: 'Oberá' })).toContain(
      '-27.48,-55.12',
    )
  })

  it('sin ubicación, busca el domicilio; sin domicilio, no hay mapa', () => {
    expect(enlaceMapa({ latitud: null, longitud: null, calle: 'Sarmiento', numero: '120', localidad: 'Oberá' })).toContain(
      encodeURIComponent('Sarmiento 120 Oberá Misiones'),
    )
    expect(enlaceMapa({ latitud: null, longitud: null, calle: null, numero: null, localidad: 'Oberá' })).toBeNull()
  })
})

describe('buscar entre los clientes', () => {
  const clientes = [
    cliente({ nombre: 'Agro San José', localidad: 'Oberá', ruta: 'Ruta 14', vencido: 5000 }),
    cliente({ nombre: 'Forrajería López', localidad: 'Campo Viera', ruta: 'Ruta 14' }),
    cliente({ nombre: 'El Tractor', localidad: 'Apóstoles', ruta: 'Ruta 12' }),
  ]

  it('sin acentos y por cualquier dato', () => {
    expect(filtrarClientes(clientes, { texto: 'obera', ruta: '', soloConVencido: false }).map((c) => c.nombre)).toEqual([
      'Agro San José',
    ])
    expect(filtrarClientes(clientes, { texto: 'lopez viera', ruta: '', soloConVencido: false })).toHaveLength(1)
  })

  it('por ruta, y sólo los que tienen algo vencido', () => {
    expect(filtrarClientes(clientes, { texto: '', ruta: 'Ruta 14', soloConVencido: false })).toHaveLength(2)
    expect(filtrarClientes(clientes, { texto: '', ruta: '', soloConVencido: true }).map((c) => c.nombre)).toEqual([
      'Agro San José',
    ])
  })

  it('las rutas, una vez cada una y en orden', () => {
    expect(rutasDe(clientes)).toEqual(['Ruta 12', 'Ruta 14'])
  })
})
