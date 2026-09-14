import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/local/db'
import { emitirNoFiscalLocal, obtenerNoFiscalLocal } from '@/lib/local/noFiscal'
import type { EmisionLocal } from '@/lib/local/noFiscal'
import { alinearNumeroNoFiscal, reservarNumeroNoFiscal } from '@/lib/local/consultas'
import { sellarCliente } from '@/lib/local/cifrado'

/*
  ─────────────────────────────────────────────────────────────
  Emitir un remito sin conexión

  El remito es el papel que sale a la calle. Si el reparto sale un
  martes y justo se cortó internet, la mercadería se va igual y alguien
  tiene que firmar algo.

  Lo que estas pruebas cuidan es el número. Un número repetido en dos
  papeles que ya están afuera no se puede arreglar después: no hay a
  quién pedirle que devuelva el suyo.
  ─────────────────────────────────────────────────────────────
*/

const AHORA = '2026-09-07T12:00:00.000Z'
const VENTA = 'venta-1'
const CLIENTE = 'cli-1'

async function sembrar() {
  await Promise.all([
    db.venta.clear(),
    db.venta_linea.clear(),
    db.cliente.clear(),
    db.contador.clear(),
    db.no_fiscal.clear(),
    db.no_fiscal_linea.clear(),
    db.configuracion.clear(),
  ])

  await db.cliente.put(await sellarCliente({
    id: CLIENTE,
    codigo: 'C1',
    nombre: 'Granja Tres Colonias',
    numero_documento: '30743567890',
    condicion_iva_id: 6,
    descuento_porcentaje: 0,
    lista_precio_id: null,
    cuenta_corriente: false,
    limite_credito: null,
    dias_vencimiento: 30,
    activo: true,
    actualizado_en: AHORA,
    eliminado_en: null,
    busqueda: 'granja',
  }))

  await db.configuracion.bulkPut([
    { clave: 'comercio.razon_social', valor: 'GROSS ERNESTO HUGO', actualizado_en: AHORA },
    { clave: 'comercio.cuit', valor: '20146369767', actualizado_en: AHORA },
    { clave: 'pin.longitud', valor: 4, actualizado_en: AHORA },
  ])

  await db.venta.put({
    id: VENTA,
    codigo: 'CAJA1-000010',
    estado: 'en_caja',
    cliente_id: CLIENTE,
    vendedor_id: 'u-1',
    total: 3000,
    descuento_total: 0,
    lista_precio_id: null,
    observaciones: null,
    ocurrido_en: AHORA,
    enviada_caja_en: AHORA,
    actualizado_en: AHORA,
    medio_pago_previsto_id: null,
    cuotas_previstas: null,
  })

  await db.venta_linea.bulkPut([
    {
      id: 'l-1', venta_id: VENTA, orden: 1, producto_id: 'p-1', codigo_producto: 'P1',
      descripcion: 'Alimento 20 kg', cantidad: 2, precio_original: 1000,
      precio_acordado: 1000, precio_unitario: 1000, motivo_modificacion: null,
      alicuota_iva_id: 5, condicion_iva: 'gravado', actualizado_en: AHORA,
    },
    {
      id: 'l-2', venta_id: VENTA, orden: 2, producto_id: 'p-2', codigo_producto: 'P2',
      descripcion: 'Antiparasitario', cantidad: 1, precio_original: 1000,
      precio_acordado: 1000, precio_unitario: 1000, motivo_modificacion: null,
      alicuota_iva_id: 5, condicion_iva: 'gravado', actualizado_en: AHORA,
    },
  ])
}

function emitir(extra: Partial<EmisionLocal> = {}) {
  return emitirNoFiscalLocal({
    id: 'doc-1',
    ventaId: VENTA,
    tipo: 'remito',
    serie: 'CAJA1',
    numero: 45,
    ...extra,
  })
}

describe('el número no se puede repetir', () => {
  beforeEach(() => sembrar())

  it('se reserva antes de usarse y avanza de a uno', async () => {
    expect(await reservarNumeroNoFiscal('remito', 'CAJA1')).toBe(1)
    expect(await reservarNumeroNoFiscal('remito', 'CAJA1')).toBe(2)
    expect(await reservarNumeroNoFiscal('remito', 'CAJA1')).toBe(3)
  })

  it('cada tipo lleva su propia serie', async () => {
    await reservarNumeroNoFiscal('remito', 'CAJA1')
    await reservarNumeroNoFiscal('remito', 'CAJA1')
    // El presupuesto arranca en uno aunque ya haya dos remitos.
    expect(await reservarNumeroNoFiscal('presupuesto', 'CAJA1')).toBe(1)
  })

  it('cada terminal lleva la suya: dos sin conexión no chocan', async () => {
    await reservarNumeroNoFiscal('remito', 'CAJA1')
    await reservarNumeroNoFiscal('remito', 'CAJA1')
    expect(await reservarNumeroNoFiscal('remito', 'MOS1')).toBe(1)
  })

  it('la serie no distingue mayúsculas', async () => {
    await reservarNumeroNoFiscal('remito', 'caja1')
    expect(await reservarNumeroNoFiscal('remito', 'CAJA1')).toBe(2)
  })

  it('alinear con el servidor sube el contador de una terminal reinstalada', async () => {
    await alinearNumeroNoFiscal('remito', 'CAJA1', 120)
    expect(await reservarNumeroNoFiscal('remito', 'CAJA1')).toBe(121)
  })

  it('alinear NUNCA lo baja: lo de más adelante todavía no subió', async () => {
    await reservarNumeroNoFiscal('remito', 'CAJA1')
    await reservarNumeroNoFiscal('remito', 'CAJA1')
    await reservarNumeroNoFiscal('remito', 'CAJA1')
    await alinearNumeroNoFiscal('remito', 'CAJA1', 1)
    expect(await reservarNumeroNoFiscal('remito', 'CAJA1')).toBe(4)
  })
})

describe('el papel se puede imprimir sin conexión', () => {
  beforeEach(() => sembrar())

  it('guarda el documento con sus líneas y su total', async () => {
    const doc = await emitir()
    expect(doc.total).toBe(3000)

    const leido = await obtenerNoFiscalLocal('doc-1')
    expect(leido).not.toBeNull()
    expect(leido!.lineas).toHaveLength(2)
    expect(leido!.lineas[0].descripcion).toBe('Alimento 20 kg')
    expect(leido!.doc.receptor_nombre).toBe('Granja Tres Colonias')
    expect(leido!.doc.venta_codigo).toBe('CAJA1-000010')
  })

  it('trae los datos del emisor de la copia local', async () => {
    await emitir()
    const leido = await obtenerNoFiscalLocal('doc-1')
    expect(leido!.emisor.razon_social).toBe('GROSS ERNESTO HUGO')
    expect(leido!.emisor.cuit).toBe('20146369767')
    // Lo que no es del comercio no se cuela en el encabezado.
    expect(leido!.emisor).not.toHaveProperty('longitud')
  })

  it('el remito guarda a dónde va y quién lleva', async () => {
    await emitir({
      entregaDomicilio: 'Ruta 14 km 8',
      entregaLocalidad: 'Campo Ramón',
      transportista: 'Camioneta 1',
    })
    const leido = await obtenerNoFiscalLocal('doc-1')
    expect(leido!.doc.entrega_domicilio).toBe('Ruta 14 km 8')
    expect(leido!.doc.transportista).toBe('Camioneta 1')
  })

  it('un presupuesto no hereda los datos de entrega del remito', async () => {
    await emitir({
      tipo: 'presupuesto',
      validoHasta: '2026-09-22',
      entregaDomicilio: 'Ruta 14 km 8',
      transportista: 'Camioneta 1',
    })
    const leido = await obtenerNoFiscalLocal('doc-1')
    expect(leido!.doc.valido_hasta).toBe('2026-09-22')
    expect(leido!.doc.entrega_domicilio).toBeNull()
    expect(leido!.doc.transportista).toBeNull()
  })

  it('un remito no se queda con la fecha de validez del presupuesto', async () => {
    await emitir({ validoHasta: '2026-09-22' })
    const leido = await obtenerNoFiscalLocal('doc-1')
    expect(leido!.doc.valido_hasta).toBeNull()
  })

  it('no emite sobre una venta que no está en esta máquina', async () => {
    await expect(emitir({ ventaId: 'no-existe' })).rejects.toThrow(/no está en esta computadora/)
  })

  it('no emite sobre una venta sin productos', async () => {
    await db.venta_linea.clear()
    await expect(emitir()).rejects.toThrow(/no tiene productos/)
  })
})
