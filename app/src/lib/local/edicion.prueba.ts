import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/local/db'
import { editarVentaLocal } from '@/lib/local/caja'
import { encolar } from '@/lib/local/sync'

/*
  ─────────────────────────────────────────────────────────────
  La caja corrige la venta, sin conexión

  Es la réplica local de editar_venta_en_caja(), y decide con plata: si
  el total local queda distinto del que el servidor va a calcular, el
  cobro se acepta en el mostrador y rebota al subir, con el cliente ya
  en la casa.

  Las dos propiedades que estas pruebas cuidan:

    1. El precio ACORDADO no se toca. Es el límite de la decisión B1.
    2. Declarar el resultado es a prueba de reintentos. La bandeja de
       salida reintenta lo que no llegó a confirmarse, y una corrección
       aplicada dos veces no puede sacar dos unidades.
  ─────────────────────────────────────────────────────────────
*/

const AHORA = '2026-09-04T12:00:00.000Z'
const VENTA = 'venta-1'
const LISTA_TARJETA = 'lp-tarjeta'
const NUEVO = 'prod-nuevo'

async function sembrar({ lista = null as string | null } = {}) {
  await Promise.all([
    db.venta.clear(),
    db.venta_linea.clear(),
    db.producto.clear(),
    db.lista_precio.clear(),
    db.outbox.clear(),
  ])

  await db.lista_precio.put({
    id: LISTA_TARJETA, nombre: 'Tarjeta', ajuste_porcentaje: 10, es_predeterminada: false,
    activo: true, actualizado_en: AHORA, eliminado_en: null,
  })

  await db.producto.put({
    id: NUEVO, codigo: 'P-NUEVO', nombre_interno: 'Bolsa que sumó el cliente',
    nombre_publico: null, precio_venta: 200, costo: null, margen_sobre_costo: null,
    unidad_medida: 'unidad', alicuota_iva_id: 5, condicion_iva: 'gravado',
    categoria_id: null, marca_id: null, activo: true, revisado_en: null,
    actualizado_en: AHORA, eliminado_en: null, busqueda: 'bolsa',
  })

  await db.venta.put({
    id: VENTA, codigo: 'CAJA1-000001', estado: 'en_caja', cliente_id: 'cli-1',
    vendedor_id: 'u-1', total: 2100, descuento_total: 0, lista_precio_id: lista,
    observaciones: null, ocurrido_en: AHORA, enviada_caja_en: AHORA, actualizado_en: AHORA,
    medio_pago_previsto_id: null, cuotas_previstas: null,
  })

  await db.venta_linea.bulkPut([
    {
      // Precio NEGOCIADO por el vendedor: de lista 1000, acordado 800.
      id: 'linea-1', venta_id: VENTA, orden: 1, producto_id: 'prod-1',
      codigo_producto: 'P1', descripcion: 'Con precio negociado', cantidad: 2,
      precio_original: 1000, precio_acordado: 800, precio_unitario: 800,
      motivo_modificacion: 'cliente habitual', alicuota_iva_id: 5,
      condicion_iva: 'gravado', actualizado_en: AHORA,
    },
    {
      id: 'linea-2', venta_id: VENTA, orden: 2, producto_id: 'prod-2',
      codigo_producto: 'P2', descripcion: 'Normal', cantidad: 1,
      precio_original: 500, precio_acordado: 500, precio_unitario: 500,
      motivo_modificacion: null, alicuota_iva_id: 5, condicion_iva: 'gravado',
      actualizado_en: AHORA,
    },
  ])
}

const quedan = () => db.venta_linea.where('venta_id').equals(VENTA).toArray()

describe('el cliente cambia de opinión en la caja', () => {
  beforeEach(() => sembrar())

  it('baja una cantidad y recalcula el total', async () => {
    const total = await editarVentaLocal(VENTA, [
      { venta_linea_id: 'linea-1', producto_id: null, cantidad: 1 },
      { venta_linea_id: 'linea-2', producto_id: null, cantidad: 1 },
    ])
    expect(total).toBe(1300) // 1x800 + 1x500
  })

  it('quita una línea', async () => {
    const total = await editarVentaLocal(VENTA, [
      { venta_linea_id: 'linea-1', producto_id: null, cantidad: 2 },
    ])
    expect(total).toBe(1600)
    expect(await quedan()).toHaveLength(1)
  })

  it('agrega un producto que el cliente sumó', async () => {
    const total = await editarVentaLocal(VENTA, [
      { venta_linea_id: 'linea-1', producto_id: null, cantidad: 2 },
      { venta_linea_id: 'linea-2', producto_id: null, cantidad: 1 },
      { venta_linea_id: null, producto_id: NUEVO, cantidad: 3 },
    ])
    expect(total).toBe(2700) // 2100 + 3x200
    expect(await quedan()).toHaveLength(3)
  })

  it('no deja la venta sin nada: para eso se anula', async () => {
    await expect(editarVentaLocal(VENTA, [])).rejects.toThrow(/al menos un producto/)
  })

  it('no acepta cantidad cero', async () => {
    await expect(
      editarVentaLocal(VENTA, [{ venta_linea_id: 'linea-1', producto_id: null, cantidad: 0 }]),
    ).rejects.toThrow(/mayor que cero/)
  })

  it('una venta ya cobrada no se corrige', async () => {
    await db.venta.update(VENTA, { estado: 'cobrada' })
    await expect(
      editarVentaLocal(VENTA, [{ venta_linea_id: 'linea-1', producto_id: null, cantidad: 1 }]),
    ).rejects.toThrow(/cobrada/)
  })
})

describe('el precio acordado por el vendedor no se toca', () => {
  beforeEach(() => sembrar())

  it('cambiar la cantidad deja el precio acordado intacto', async () => {
    await editarVentaLocal(VENTA, [
      { venta_linea_id: 'linea-1', producto_id: null, cantidad: 5 },
    ])
    const [linea] = await quedan()
    expect(linea.precio_acordado).toBe(800)
    expect(linea.precio_unitario).toBe(800)
    expect(linea.motivo_modificacion).toBe('cliente habitual')
  })

  it('el producto agregado entra con la lista que la venta ya tenía', async () => {
    // Sin esto, el renglón agregado en la caja saldría al precio de
    // contado mientras el resto de la venta va a precio de tarjeta.
    await sembrar({ lista: LISTA_TARJETA })
    await editarVentaLocal(VENTA, [
      { venta_linea_id: 'linea-1', producto_id: null, cantidad: 1 },
      { venta_linea_id: null, producto_id: NUEVO, cantidad: 1 },
    ])
    const agregada = (await quedan()).find((l) => l.producto_id === NUEVO)!
    expect(agregada.precio_acordado).toBe(200)
    expect(agregada.precio_unitario).toBe(220) // +10% de la lista Tarjeta
  })
})

describe('reintentar la misma corrección no la aplica dos veces', () => {
  beforeEach(() => sembrar())

  it('declarar el resultado es idempotente', async () => {
    const deseadas = [{ venta_linea_id: 'linea-1', producto_id: null, cantidad: 1 }]

    const primera = await editarVentaLocal(VENTA, deseadas)
    const segunda = await editarVentaLocal(VENTA, deseadas)

    expect(primera).toBe(800)
    expect(segunda).toBe(800)
    expect(await quedan()).toHaveLength(1)
  })
})

/*
  El orden dentro del lote.

  Un lote se llena en varias tandas: primero la corrección, después el
  cobro. Si la corrección subiera después, el servidor cobraría la venta
  vieja — y el cobro rebotaría, porque los pagos no cerrarían con el
  total que el servidor tiene.
*/
describe('la bandeja de salida respeta el orden entre tandas', () => {
  beforeEach(() => sembrar())

  it('la segunda tanda sigue la numeración de la primera', async () => {
    await encolar(VENTA, [
      { tipo: 'rpc', tabla: 'editar_venta_en_caja', datos: {}, descripcion: 'corrección' },
    ])
    await encolar(VENTA, [
      { tipo: 'insert', tabla: 'venta_pago', datos: {}, descripcion: 'pago' },
      { tipo: 'rpc', tabla: 'cobrar_venta', datos: {}, descripcion: 'cobro' },
    ])

    const cola = (await db.outbox.where('lote').equals(VENTA).toArray()).sort(
      (a, b) => a.orden - b.orden,
    )

    expect(cola.map((o) => o.orden)).toEqual([0, 1, 2])
    expect(cola.map((o) => o.tabla)).toEqual([
      'editar_venta_en_caja',
      'venta_pago',
      'cobrar_venta',
    ])
  })
})
