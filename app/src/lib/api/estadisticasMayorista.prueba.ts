import { describe, expect, it } from 'vitest'
import {
  agrupar,
  masVendidos,
  porcentajeCobrado,
  rangoDe,
  totales,
  type ClienteEnNumeros,
  type ProductoVendido,
} from '@/lib/api/estadisticasMayorista'

const cliente = (o: Partial<ClienteEnNumeros>): ClienteEnNumeros => ({
  cliente_id: 'x',
  nombre: 'Cliente',
  nombre_fantasia: null,
  localidad: null,
  ruta: null,
  zona: null,
  vendido: 0,
  ventas: 0,
  unidades: 0,
  pedidos: 0,
  cargado: 0,
  pendiente: 0,
  saldo: 0,
  vencido: 0,
  vencido_desde: null,
  ultimo_pedido_en: null,
  ultimo_pedido_numero: null,
  ...o,
})

const clientes = [
  cliente({ cliente_id: 'a', nombre: 'Uno', ruta: 'Ruta 14', vendido: 1000, pedidos: 2, cargado: 1000, pendiente: 250, ultimo_pedido_en: '2026-10-10T12:00:00Z' }),
  cliente({ cliente_id: 'b', nombre: 'Dos', ruta: 'ruta 14 ', vendido: 3000, pedidos: 1, cargado: 1000, pendiente: 750, ultimo_pedido_en: '2026-10-20T12:00:00Z' }),
  cliente({ cliente_id: 'c', nombre: 'Tres', ruta: 'Ruta 12', vendido: 500 }),
  cliente({ cliente_id: 'd', nombre: 'Cuatro', vendido: 9000 }),
]

describe('los cortes', () => {
  it('junta las rutas escritas distinto', () => {
    const g = agrupar(clientes, 'ruta')
    expect(g.map((x) => x.nombre)).toEqual(['Ruta 14', 'Ruta 12', 'Sin ruta'])
    expect(g[0]).toMatchObject({ clientes: ['a', 'b'], vendido: 4000, pedidos: 3, ultimo_pedido_en: '2026-10-20T12:00:00Z' })
  })
  it('lo que no tiene ruta va al final, aunque venda más', () => {
    expect(agrupar(clientes, 'ruta').at(-1)).toMatchObject({ nombre: 'Sin ruta', vendido: 9000 })
  })
  it('por cliente, cada uno es una fila, de lo que más vende a lo que menos', () => {
    expect(agrupar(clientes, 'cliente').map((x) => x.nombre)).toEqual(['Cuatro', 'Dos', 'Uno', 'Tres'])
  })
  it('los totales suman a todos', () => {
    expect(totales(clientes)).toMatchObject({ vendido: 13500, pedidos: 3, cargado: 2000, pendiente: 1000 })
    expect(totales([]).vendido).toBe(0)
  })
})

describe('lo cobrado', () => {
  it('es la parte de lo cargado que ya se pagó', () => {
    expect(porcentajeCobrado({ cargado: 1000, pendiente: 250 })).toBe(75)
    expect(porcentajeCobrado({ cargado: 2000, pendiente: 1000 })).toBe(50)
  })
  it('sin nada cargado a cuenta no hay porcentaje', () => {
    expect(porcentajeCobrado({ cargado: 0, pendiente: 0 })).toBeNull()
  })
})

describe('lo más vendido', () => {
  const productos: ProductoVendido[] = [
    { cliente_id: 'a', producto_id: 'p1', codigo: '1', nombre: 'Alimento', unidades: 2, vendido: 2000 },
    { cliente_id: 'b', producto_id: 'p1', codigo: '1', nombre: 'Alimento', unidades: 1, vendido: 1000 },
    { cliente_id: 'c', producto_id: 'p2', codigo: '2', nombre: 'Pipeta', unidades: 10, vendido: 2500 },
  ]
  it('suma cada producto entre los clientes', () => {
    expect(masVendidos(productos, null)).toMatchObject([
      { producto_id: 'p1', unidades: 3, vendido: 3000 },
      { producto_id: 'p2', vendido: 2500 },
    ])
  })
  it('sólo de los clientes del corte elegido', () => {
    expect(masVendidos(productos, ['c']).map((p) => p.producto_id)).toEqual(['p2'])
  })
})

describe('el período', () => {
  it('este mes, el pasado, tres meses y el año', () => {
    expect(rangoDe('este_mes', '2026-10-29')).toEqual({ desde: '2026-10-01', hasta: '2026-10-29' })
    expect(rangoDe('mes_pasado', '2026-10-29')).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' })
    expect(rangoDe('tres_meses', '2026-10-29')).toEqual({ desde: '2026-08-01', hasta: '2026-10-29' })
    expect(rangoDe('este_anio', '2026-10-29')).toEqual({ desde: '2026-01-01', hasta: '2026-10-29' })
  })
  it('en enero, el mes pasado es diciembre del año anterior', () => {
    expect(rangoDe('mes_pasado', '2027-01-15')).toEqual({ desde: '2026-12-01', hasta: '2026-12-31' })
  })
})
