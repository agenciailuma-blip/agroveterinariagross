import { describe, expect, it } from 'vitest'
import {
  avanceDelMinimo,
  bultosDe,
  claveDeFila,
  pedirConBorrador,
  pedirInicial,
  renglonesAPedir,
  textoDelMinimo,
  textoParaWhatsapp,
  totalDelPedido,
} from '@/lib/api/pedidosProveedor'
import type { FilaParaPedido, PedidoCompleto } from '@/lib/api/pedidosProveedor'

/*
  El pedido a proveedor: lo que la pantalla calcula. Lo que se guarda lo
  prueba la base (supabase/pruebas/pedido-a-proveedor.sql).
*/

function fila(parcial: Partial<FilaParaPedido>): FilaParaPedido {
  return {
    producto_id: 'p1',
    codigo: 'P1',
    descripcion: 'Producto',
    unidad_medida: 'unidad',
    stock: 0,
    umbral_bajo: null,
    umbral_critico: null,
    estado: 'ok',
    costo: null,
    costo_de_este: false,
    peso_kg: null,
    unidades_por_bulto: null,
    es_del_proveedor: true,
    en_ordenes: 0,
    lineas_orden: [],
    ordenes: [],
    ...parcial,
  }
}

const alimento = fila({ producto_id: 'alim', descripcion: 'Alimento 15 kg', costo: 50000, peso_kg: 15, unidades_por_bulto: 1, en_ordenes: 5, lineas_orden: ['l1', 'l2'], ordenes: [12, 13] })
const pipeta = fila({ producto_id: 'pip', descripcion: 'Pipeta', costo: 4000, unidades_por_bulto: 12 })
const guantes = fila({ producto_id: null, codigo: null, descripcion: 'Guantes de látex', en_ordenes: 2, lineas_orden: ['l3'], ordenes: [12] })

describe('cuánto falta para el mínimo del proveedor', () => {
  const renglones = [
    { cantidad: 6, costo: 50000, peso_kg: 15, unidades_por_bulto: 1 },
    { cantidad: 24, costo: 4000, peso_kg: null, unidades_por_bulto: 12 },
  ]

  it('en kilos, cantidad por peso; lo que no tiene peso no suma y se cuenta aparte', () => {
    expect(avanceDelMinimo(renglones, 'kilos', 100)).toEqual({
      tipo: 'kilos', minimo: 100, llevado: 90, falta: 10, llega: false, sinDato: 1,
    })
  })

  it('en bultos, cantidad dividido lo que trae el bulto', () => {
    expect(avanceDelMinimo(renglones, 'bultos', 8)).toMatchObject({ llevado: 8, falta: 0, llega: true, sinDato: 0 })
  })

  it('en pesos, al último costo', () => {
    expect(avanceDelMinimo(renglones, 'monto', 500000)).toMatchObject({ llevado: 396000, falta: 104000, llega: false })
  })

  it('lo que está en cero no cuenta, ni como sin dato', () => {
    expect(avanceDelMinimo([{ cantidad: 0, costo: null, peso_kg: null, unidades_por_bulto: null }], 'kilos', 10))
      .toMatchObject({ llevado: 0, sinDato: 0 })
  })

  it('sin mínimo cargado, no hay nada que mostrar', () => {
    expect(avanceDelMinimo(renglones, null, null)).toBeNull()
    expect(avanceDelMinimo(renglones, 'kilos', 0)).toBeNull()
  })

  it('se escribe en la unidad del proveedor', () => {
    expect(textoDelMinimo('kilos', 500)).toBe('500 kg')
    expect(textoDelMinimo('bultos', 1)).toBe('1 bulto')
    expect(textoDelMinimo('bultos', 20)).toBe('20 bultos')
    expect(textoDelMinimo('monto', 500000)).toMatch(/500\.000/)
  })
})

describe('los bultos y el total', () => {
  it('bultos, si se sabe cuántas trae el bulto', () => {
    expect(bultosDe(24, 12)).toBe(2)
    expect(bultosDe(18, 12)).toBe(1.5)
    expect(bultosDe(5, null)).toBeNull()
  })

  it('el total suma sólo lo que tiene costo y cantidad', () => {
    expect(totalDelPedido([{ cantidad: 6, costo: 50000 }, { cantidad: 2, costo: null }, { cantidad: 0, costo: 10 }])).toBe(300000)
  })
})

describe('de la pantalla al pedido', () => {
  const filas = [guantes, alimento, pipeta]

  it('arranca con lo que pidieron las órdenes', () => {
    expect(pedirInicial(filas)).toEqual({ alim: 5, [claveDeFila(guantes)]: 2 })
  })

  it('manda sólo lo que tiene cantidad, con los renglones de orden de cada fila', () => {
    const lineas = renglonesAPedir(filas, { alim: 6, pip: 0, [claveDeFila(guantes)]: 2 })
    expect(lineas).toEqual([
      { producto_id: null, descripcion: 'Guantes de látex', cantidad: 2, costo: null, lineas_orden: ['l3'] },
      { producto_id: 'alim', descripcion: 'Alimento 15 kg', cantidad: 6, costo: 50000, lineas_orden: ['l1', 'l2'] },
    ])
  })

  it('una fila que se dejó en cero no da por pedida la orden que la pidió', () => {
    const lineas = renglonesAPedir(filas, { alim: 0, [claveDeFila(guantes)]: 2 })
    expect(lineas.flatMap((l) => l.lineas_orden)).toEqual(['l3'])
  })

  it('el borrador manda sobre lo de las órdenes, y lo que ya no está se olvida', () => {
    const pedir = pedirConBorrador(filas, { pedir: { alim: 0, pip: 12, viejo: 3 }, observacion: '' })
    expect(pedir).toEqual({ alim: 0, pip: 12, [claveDeFila(guantes)]: 2 })
  })
})

describe('el texto para WhatsApp', () => {
  const pedido: PedidoCompleto = {
    id: 'x', numero: 3, fecha: '2026-10-12', proveedor_id: 'a', proveedor: 'Proveedor A',
    proveedor_cuit: null, proveedor_contacto: null, proveedor_telefono: null, proveedor_email: null,
    observacion: 'Que venga con el viajante', estado: 'pedido', minimo_tipo: null, minimo_valor: null,
    creado_por: null, creado_en: '', anulado_por: null, motivo_anulacion: null, ordenes: [],
    lineas: [
      { renglon: 1, producto_id: 'alim', codigo: 'A1', descripcion: 'Alimento 15 kg', cantidad: 6, costo: 50000, peso_kg: 15, unidades_por_bulto: 1 },
      { renglon: 2, producto_id: 'pip', codigo: 'P1', descripcion: 'Pipeta', cantidad: 24, costo: 4000, peso_kg: null, unidades_por_bulto: 12 },
      { renglon: 3, producto_id: null, codigo: null, descripcion: 'Guantes de látex', cantidad: 2, costo: null, peso_kg: null, unidades_por_bulto: null },
    ],
  }

  it('dice número, fecha, cantidades y bultos, sin precios ni códigos', () => {
    const texto = textoParaWhatsapp(pedido, 'Agroveterinaria Gross')
    expect(texto).toBe(
      [
        '*Pedido N° 000003 — Agroveterinaria Gross*',
        'Fecha: 12/10/2026',
        '',
        '• 6 × Alimento 15 kg (6 bultos)',
        '• 24 × Pipeta (2 bultos)',
        '• 2 × Guantes de látex',
        '',
        'Observación: Que venga con el viajante',
      ].join('\n'),
    )
    expect(texto).not.toMatch(/50\.000|A1|P1/)
  })
})
