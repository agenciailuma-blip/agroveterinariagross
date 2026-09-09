import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/local/db'
import {
  aplicarListaLocal,
  cobrarLocal,
  listarColaLocal,
  obtenerVentaLocal,
  saldoCuentaCorrienteLocal,
} from '@/lib/local/caja'

/*
  ─────────────────────────────────────────────────────────────
  Cobro sin conexión

  Es el código que mueve plata, descuenta stock y genera deuda sin que
  haya un servidor del otro lado validando. Si algo de acá está mal, el
  error no se ve: se ve tres días después, en un arqueo que no cierra o
  en un cliente al que se le cobró dos veces.

  Las validaciones son un espejo de las de cobrar_venta() en la base.
  Si alguna vez se toca esa función, estas pruebas tienen que fallar —
  para eso están.
  ─────────────────────────────────────────────────────────────
*/

const AHORA = '2026-08-21T12:00:00.000Z'

const VENTA = 'venta-1'
const CLIENTE = 'cli-1'
const PRODUCTO = 'prod-1'
const EFECTIVO = 'mp-efectivo'
const CUENTA_CORRIENTE = 'mp-cc'
const LISTA_CONTADO = 'lp-contado'
const LISTA_TARJETA = 'lp-tarjeta'

interface Escenario {
  /** Límite de crédito del cliente. null = sin límite. */
  limite?: number | null
  /** ¿Tiene cuenta corriente habilitada? */
  cuentaCorriente?: boolean
  /** Cuánto debe hoy. */
  saldo?: number
  /** Existencia del producto antes de vender. */
  stock?: number
}

/** Deja la base local con una venta de $1.000 esperando en la caja. */
async function sembrar(e: Escenario = {}) {
  await Promise.all([
    db.venta.clear(),
    db.venta_linea.clear(),
    db.cliente.clear(),
    db.medio_pago.clear(),
    db.lista_precio.clear(),
    db.saldo.clear(),
    db.saldo_cuenta_corriente.clear(),
    db.outbox.clear(),
  ])

  await db.cliente.put({
    id: CLIENTE,
    codigo: 'C1',
    nombre: 'Cliente de Prueba',
    numero_documento: null,
    condicion_iva_id: 5,
    descuento_porcentaje: 0,
    lista_precio_id: null,
    cuenta_corriente: e.cuentaCorriente ?? false,
    limite_credito: e.limite ?? null,
    dias_vencimiento: 30,
    activo: true,
    actualizado_en: AHORA,
    eliminado_en: null,
    busqueda: 'cliente de prueba',
  })

  await db.saldo_cuenta_corriente.put({
    cliente_id: CLIENTE,
    saldo: e.saldo ?? 0,
    actualizado_en: AHORA,
  })

  await db.medio_pago.bulkPut([
    {
      id: EFECTIVO, nombre: 'Efectivo', tipo: 'efectivo', lista_precio_id: LISTA_CONTADO,
      admite_cuotas: false, cuotas_maximas: 1, afecta_caja: true, orden: 1, activo: true,
      actualizado_en: AHORA, eliminado_en: null,
    },
    {
      id: CUENTA_CORRIENTE, nombre: 'Cuenta corriente', tipo: 'cuenta_corriente',
      lista_precio_id: null, admite_cuotas: false, cuotas_maximas: 1, afecta_caja: false,
      orden: 2, activo: true, actualizado_en: AHORA, eliminado_en: null,
    },
  ])

  await db.lista_precio.bulkPut([
    {
      id: LISTA_CONTADO, nombre: 'Contado', ajuste_porcentaje: 0, es_predeterminada: true,
      activo: true, actualizado_en: AHORA, eliminado_en: null,
    },
    {
      id: LISTA_TARJETA, nombre: 'Tarjeta', ajuste_porcentaje: 10, es_predeterminada: false,
      activo: true, actualizado_en: AHORA, eliminado_en: null,
    },
  ])

  await db.saldo.put({ producto_id: PRODUCTO, cantidad: e.stock ?? 50, actualizado_en: AHORA })

  await db.venta.put({
    id: VENTA, codigo: 'CAJA1-000001', estado: 'en_caja', cliente_id: CLIENTE,
    vendedor_id: 'u-1', total: 1000, descuento_total: 0, lista_precio_id: LISTA_CONTADO,
    observaciones: null, ocurrido_en: AHORA, enviada_caja_en: AHORA, actualizado_en: AHORA,
    medio_pago_previsto_id: null, cuotas_previstas: null,
  })

  await db.venta_linea.put({
    id: 'linea-1', venta_id: VENTA, orden: 1, producto_id: PRODUCTO,
    codigo_producto: 'P1', descripcion: 'Producto de prueba', cantidad: 2,
    precio_original: 500, precio_acordado: 500, precio_unitario: 500,
    motivo_modificacion: null, alicuota_iva_id: 5, condicion_iva: 'gravado',
    actualizado_en: AHORA,
  })
}

function cobrar(importe: number, medio = EFECTIVO) {
  return cobrarLocal({
    ventaId: VENTA,
    cajaId: 'caja-1',
    cajeroId: 'u-1',
    pagos: [{ medio_pago_id: medio, importe, cuotas: 1, referencia: null }],
  })
}

describe('validaciones antes de aceptar el cobro', () => {
  beforeEach(() => sembrar())

  it('rechaza si los pagos no llegan al total', async () => {
    await expect(cobrar(900)).rejects.toThrow(/Los pagos suman 900 y el total es 1000/)
  })

  it('rechaza si los pagos se pasan del total', async () => {
    await expect(cobrar(1100)).rejects.toThrow(/Los pagos suman/)
  })

  // La base tolera un centavo de diferencia por redondeo. Si acá fuera
  // más estricto, la caja rechazaría cobros que el servidor acepta.
  it('tolera un centavo de redondeo, igual que el servidor', async () => {
    await expect(cobrar(1000.01)).resolves.toBeUndefined()
  })

  it('no cobra una venta que no está en esta computadora', async () => {
    await expect(
      cobrarLocal({ ventaId: 'no-existe', cajaId: null, cajeroId: 'u-1', pagos: [] }),
    ).rejects.toThrow(/no está en esta computadora/)
  })

  it('no permite cobrar dos veces la misma venta', async () => {
    await cobrar(1000)
    await expect(cobrar(1000)).rejects.toThrow(/está cobrada y no se puede cobrar/)
  })
})

describe('cuenta corriente y límite de crédito', () => {
  it('rechaza si el cliente no tiene cuenta corriente habilitada', async () => {
    await sembrar({ cuentaCorriente: false })
    await expect(cobrar(1000, CUENTA_CORRIENTE)).rejects.toThrow(
      /no tiene cuenta corriente habilitada/,
    )
  })

  it('rechaza si la venta hace pasar el límite de crédito', async () => {
    await sembrar({ cuentaCorriente: true, limite: 1500, saldo: 800 })
    await expect(cobrar(1000, CUENTA_CORRIENTE)).rejects.toThrow(/Excede el límite de crédito/)
  })

  it('acepta si queda justo en el límite', async () => {
    await sembrar({ cuentaCorriente: true, limite: 1800, saldo: 800 })
    await expect(cobrar(1000, CUENTA_CORRIENTE)).resolves.toBeUndefined()
  })

  it('sin límite de crédito no hay tope', async () => {
    await sembrar({ cuentaCorriente: true, limite: null, saldo: 999999 })
    await expect(cobrar(1000, CUENTA_CORRIENTE)).resolves.toBeUndefined()
  })

  it('suma la deuda al saldo local', async () => {
    await sembrar({ cuentaCorriente: true, limite: 5000, saldo: 800 })
    await cobrar(1000, CUENTA_CORRIENTE)
    expect(await saldoCuentaCorrienteLocal(CLIENTE)).toBe(1800)
  })

  it('un pago en efectivo no toca la cuenta corriente', async () => {
    await sembrar({ cuentaCorriente: true, limite: 5000, saldo: 800 })
    await cobrar(1000, EFECTIVO)
    expect(await saldoCuentaCorrienteLocal(CLIENTE)).toBe(800)
  })
})

describe('lo que la terminal adelanta en su copia local', () => {
  beforeEach(async () => {
    await sembrar()
    await cobrar(1000)
  })

  it('saca la venta de la cola del cajero', async () => {
    expect(await listarColaLocal()).toHaveLength(0)
  })

  it('descuenta el stock de lo vendido', async () => {
    const saldo = await db.saldo.get(PRODUCTO)
    expect(Number(saldo?.cantidad)).toBe(48) // 50 - 2
  })
})

/*
  El producto comodín, pedido por Lucas el 07/09.

  Una línea escrita a mano no existe en el catálogo, así que no tiene
  existencias que mover. Lo que esta prueba cuida es que el cobro no
  intente descontarlas igual: sin el filtro, la terminal iría a buscar
  un saldo con producto_id nulo y podría dejar el stock de otro
  producto tocado, o romper el cobro entero en el mostrador.

  El servidor tiene el mismo filtro (`producto_id is not null` en
  cobrar_venta), y por eso mismo esto se prueba de los dos lados.
*/
describe('una línea escrita a mano no mueve stock', () => {
  beforeEach(async () => {
    await sembrar()
    // Se suma una línea libre a la venta sembrada: sin producto, con su
    // propia alícuota, por $600.
    await db.venta_linea.put({
      id: 'linea-libre', venta_id: VENTA, orden: 2, producto_id: null,
      codigo_producto: 'LIBRE', descripcion: 'Comedero por pedido', cantidad: 3,
      precio_original: 200, precio_acordado: 200, precio_unitario: 200,
      motivo_modificacion: null, alicuota_iva_id: 4, condicion_iva: 'gravado',
      actualizado_en: AHORA,
    })
    await db.venta.update(VENTA, { total: 1600 })
    await cobrar(1600)
  })

  it('cobra la venta entera, con la línea libre incluida', async () => {
    expect(await listarColaLocal()).toHaveLength(0)
  })

  it('descuenta sólo el producto del catálogo', async () => {
    const saldo = await db.saldo.get(PRODUCTO)
    expect(Number(saldo?.cantidad)).toBe(48) // 50 - 2, y nada por la línea libre
  })
})

describe('lo que se encola para el servidor', () => {
  beforeEach(async () => {
    await sembrar()
    await cobrar(1000)
  })

  /*
    El orden no es un detalle: cobrar_venta() lee venta_pago para
    validar que los pagos sumen el total. Si la llamada subiera antes que
    los pagos, el servidor vería cero y rechazaría la venta.
  */
  it('manda los pagos antes de la llamada a cobrar_venta', async () => {
    const ops = (await db.outbox.where('lote').equals(VENTA).toArray()).sort(
      (a, b) => a.orden - b.orden,
    )
    expect(ops.map((o) => `${o.tipo}:${o.tabla}`)).toEqual([
      'insert:venta_pago',
      'rpc:cobrar_venta',
    ])
  })

  it('agrupa todo en el lote de la venta, para que suba junto o no suba', async () => {
    const ops = await db.outbox.where('lote').equals(VENTA).toArray()
    expect(ops).toHaveLength(2)
    expect(ops.every((o) => o.lote === VENTA)).toBe(true)
  })

  it('la llamada lleva venta, caja y cajero', async () => {
    const rpc = await db.outbox.where('lote').equals(VENTA).and((o) => o.tipo === 'rpc').first()
    expect(rpc?.datos).toEqual({
      p_venta_id: VENTA,
      p_caja_id: 'caja-1',
      p_cajero_id: 'u-1',
    })
  })

  /*
    El id lo genera la terminal, no la base. Es lo que hace que reenviar
    sea seguro: si el pago ya había llegado, el segundo intento choca
    contra la clave primaria en vez de cargarlo de nuevo.
  */
  it('el pago viaja con un id propio de la terminal', async () => {
    const pago = await db.outbox.where('lote').equals(VENTA).and((o) => o.tabla === 'venta_pago').first()
    expect(pago?.datos.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(pago?.datos.venta_id).toBe(VENTA)
    expect(pago?.datos.importe).toBe(1000)
  })

  it('un cobro con varios medios encola un pago por cada uno', async () => {
    await sembrar({ cuentaCorriente: true, limite: 5000 })
    await cobrarLocal({
      ventaId: VENTA,
      cajaId: 'caja-1',
      cajeroId: 'u-1',
      pagos: [
        { medio_pago_id: EFECTIVO, importe: 600, cuotas: 1, referencia: null },
        { medio_pago_id: CUENTA_CORRIENTE, importe: 400, cuotas: 1, referencia: null },
      ],
    })
    const ops = (await db.outbox.where('lote').equals(VENTA).toArray()).sort(
      (a, b) => a.orden - b.orden,
    )
    expect(ops.map((o) => `${o.tipo}:${o.tabla}`)).toEqual([
      'insert:venta_pago',
      'insert:venta_pago',
      'rpc:cobrar_venta',
    ])
  })
})

describe('recálculo por lista de precios', () => {
  beforeEach(() => sembrar())

  it('la lista Tarjeta aplica su recargo', async () => {
    expect(await aplicarListaLocal(VENTA, LISTA_TARJETA)).toBe(1100)
  })

  /*
    La regla de los tres precios: recalcular parte SIEMPRE del precio
    acordado. Si partiera del último calculado, ir a Tarjeta y volver a
    Contado dejaría 990 en vez de 1000 — y cada ida y vuelta le comería
    otro pedazo al precio, sin que nadie lo note.
  */
  it('volver a Contado devuelve el precio original, no acumula', async () => {
    await aplicarListaLocal(VENTA, LISTA_TARJETA)
    expect(await aplicarListaLocal(VENTA, LISTA_CONTADO)).toBe(1000)
  })

  it('ir y volver tres veces sigue dando lo mismo', async () => {
    for (let i = 0; i < 3; i++) {
      await aplicarListaLocal(VENTA, LISTA_TARJETA)
      await aplicarListaLocal(VENTA, LISTA_CONTADO)
    }
    expect(await aplicarListaLocal(VENTA, LISTA_CONTADO)).toBe(1000)
  })

  it('no cambia el precio de una venta ya cobrada', async () => {
    await cobrar(1000)
    await expect(aplicarListaLocal(VENTA, LISTA_TARJETA)).rejects.toThrow(
      /ya no admite cambios de precio/,
    )
  })

  it('avisa si la lista no está en esta computadora', async () => {
    await expect(aplicarListaLocal(VENTA, 'lista-que-no-bajó')).rejects.toThrow(
      /no está disponible en esta computadora/,
    )
  })
})

describe('lectura de la venta desde la copia local', () => {
  beforeEach(() => sembrar())

  it('trae la venta con sus líneas y su cliente', async () => {
    const v = await obtenerVentaLocal(VENTA)
    expect(v?.codigo).toBe('CAJA1-000001')
    expect(v?.venta_linea).toHaveLength(1)
    expect(v?.cliente?.nombre).toBe('Cliente de Prueba')
  })

  it('devuelve nulo si la venta no bajó a esta computadora', async () => {
    expect(await obtenerVentaLocal('no-existe')).toBeNull()
  })
})
