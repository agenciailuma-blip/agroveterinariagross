import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/lib/local/db'
import { abrirComprobante, sellarCliente, sellarVenta } from '@/lib/local/cifrado'
import {
  caeaVigente,
  emitirConCaeaLocal,
  hoyEnLaTerminal,
  sePuedeEmitirConCaea,
  siguienteNumero,
} from '@/lib/local/caea'

/*
  ─────────────────────────────────────────────────────────────
  Facturar sin internet, con el CAEA

  Lo que sale de acá se imprime y se entrega. No hay servidor que lo
  revise antes, y después no se puede renumerar ni corregir: el papel ya
  está en la calle.

  Las dos formas de equivocarse son caras y distintas. Emitir cuando NO
  corresponde —sin CAEA vigente, desde un mostrador— da un comprobante
  que ARCA va a rechazar cuando se lo informe, con la quincena entera
  atrás. No emitir cuando sí corresponde deja al cliente sin papel.
  ─────────────────────────────────────────────────────────────
*/

const AHORA = '2026-09-18T12:00:00.000Z'
const HOY = hoyEnLaTerminal(new Date(AHORA))

const VENTA = 'venta-caea-1'
const CLIENTE = 'cli-1'
const PV_CAEA = 'pv-9'
const PV_NORMAL = 'pv-1'
const CAEA_ID = 'caea-quincena'

interface Escenario {
  /** Condición del cliente frente al IVA. 1 = Responsable Inscripto. */
  condicion?: number
  /** Hasta dónde llegó la numeración según el servidor. */
  ultimoNumero?: number
  /** Si el CAEA bajado rige hoy. */
  caeaVigenteHoy?: boolean
  /** Si el punto de venta del régimen CAEA está cargado. */
  conPuntoCaea?: boolean
  total?: number
}

async function sembrar(e: Escenario = {}) {
  await Promise.all([
    db.venta.clear(),
    db.venta_linea.clear(),
    db.cliente.clear(),
    db.caea.clear(),
    db.punto_venta.clear(),
    db.alicuota_iva.clear(),
    db.condicion_iva.clear(),
    db.tipo_comprobante.clear(),
    db.secuencia.clear(),
    db.comprobante.clear(),
    db.comprobante_alicuota.clear(),
    db.comprobante_tributo.clear(),
    db.configuracion.clear(),
    db.outbox.clear(),
  ])

  await db.configuracion.bulkPut([
    { clave: 'arca.ambiente', valor: 'homologacion', actualizado_en: AHORA },
    { clave: 'arca.iibb_percepcion_alicuota', valor: 3.31, actualizado_en: AHORA },
    { clave: 'arca.iibb_percepcion_minimo', valor: 24000, actualizado_en: AHORA },
  ] as never)

  await db.alicuota_iva.bulkPut([
    { id: 5, descripcion: '21%', porcentaje: 21, activo: true },
    { id: 4, descripcion: '10,5%', porcentaje: 10.5, activo: true },
  ])

  await db.condicion_iva.bulkPut([
    { id: 1, descripcion: 'IVA Responsable Inscripto', tipo_comprobante: 'A', activo: true },
    { id: 5, descripcion: 'Consumidor Final', tipo_comprobante: 'B', activo: true },
  ])

  await db.tipo_comprobante.bulkPut([
    { id: 1, descripcion: 'Factura A', clase: 'A', familia: 'factura', activo: true },
    { id: 6, descripcion: 'Factura B', clase: 'B', familia: 'factura', activo: true },
  ])

  if (e.conPuntoCaea ?? true) {
    await db.punto_venta.put({
      id: PV_CAEA, numero: 9, nombre: 'Contingencia CAEA', es_respaldo: true,
      regimen_caea: true, activo: true, actualizado_en: AHORA, eliminado_en: null,
    })
  }
  await db.punto_venta.put({
    id: PV_NORMAL, numero: 1, nombre: 'Punto de venta 1', es_respaldo: false,
    regimen_caea: false, activo: true, actualizado_en: AHORA, eliminado_en: null,
  })

  const vigente = e.caeaVigenteHoy ?? true
  await db.caea.put({
    id: CAEA_ID,
    codigo: '86370874703771',
    periodo: 202609,
    quincena: 2,
    fecha_desde: vigente ? '2026-09-16' : '2026-08-01',
    fecha_hasta: vigente ? '2026-09-30' : '2026-08-15',
    fecha_tope_informar: '2026-10-05',
    estado: 'vigente',
    ambiente: 'homologacion',
    actualizado_en: AHORA,
  })

  if (e.ultimoNumero !== undefined) {
    await db.secuencia.put({
      clave: `${PV_CAEA}-6`,
      punto_venta_id: PV_CAEA,
      tipo_comprobante_id: 6,
      ultimo_numero: e.ultimoNumero,
      actualizado_en: AHORA,
    })
  }

  await db.cliente.put(
    await sellarCliente({
      id: CLIENTE, codigo: 'C1', nombre: 'Krause, Federico', numero_documento: '31456789',
      tipo_documento_id: 96, domicilio: 'Los Lapachos 67 Oberá',
      condicion_iva_id: e.condicion ?? 5, iibb_percepcion_excluido: false,
      descuento_porcentaje: 0, lista_precio_id: null, cuenta_corriente: false,
      limite_credito: null, dias_vencimiento: 30, activo: true,
      actualizado_en: AHORA, eliminado_en: null, busqueda: 'krause federico',
    }),
  )

  await db.venta.put(
    await sellarVenta({
      id: VENTA, codigo: 'CAJA1-000030', estado: 'cobrada', cliente_id: CLIENTE,
      vendedor_id: 'u-1', total: e.total ?? 6400, descuento_total: 0, lista_precio_id: null,
      medio_pago_previsto_id: null, cuotas_previstas: null, observaciones: null,
      ocurrido_en: AHORA, enviada_caja_en: AHORA, actualizado_en: AHORA,
    }),
  )

  await db.venta_linea.put({
    id: 'linea-1', venta_id: VENTA, orden: 1, producto_id: 'prod-1',
    codigo_producto: 'DEMO-007', descripcion: 'COLLAR NYLON REGULABLE M', cantidad: 1,
    precio_original: 6400, precio_acordado: 6400, precio_unitario: e.total ?? 6400,
    motivo_modificacion: null, alicuota_iva_id: 5, condicion_iva: 'gravado',
    actualizado_en: AHORA,
  })
}

const emitir = () => emitirConCaeaLocal(VENTA, { usuarioId: 'u-1', terminalId: 't-caja' })

describe('cuándo se puede emitir por contingencia', () => {
  beforeEach(() => sembrar())

  it('la caja puede, con CAEA vigente y punto de venta cargado', async () => {
    const r = await sePuedeEmitirConCaea(true)
    expect(r.puede).toBe(true)
    expect(r.caea?.codigo).toBe('86370874703771')
  })

  /*
    Un mostrador no emite: si dos máquinas numeraran a la vez sin verse,
    entregarían dos facturas con el mismo número. La venta le llega a la
    caja por la red del local y factura ella.
  */
  it('un mostrador no emite, y lo dice', async () => {
    const r = await sePuedeEmitirConCaea(false)
    expect(r.puede).toBe(false)
    expect(r.motivo).toMatch(/la caja/i)
  })

  it('sin CAEA vigente para hoy, no se emite', async () => {
    await sembrar({ caeaVigenteHoy: false })
    expect(await caeaVigente(HOY)).toBeNull()
    const r = await sePuedeEmitirConCaea(true)
    expect(r.puede).toBe(false)
    expect(r.motivo).toMatch(/CAEA vigente/)
  })

  it('sin punto de venta del régimen CAEA, no se emite', async () => {
    await sembrar({ conPuntoCaea: false })
    const r = await sePuedeEmitirConCaea(true)
    expect(r.puede).toBe(false)
    expect(r.motivo).toMatch(/punto de venta/)
  })

  /*
    Un CAEA de otro ambiente no sirve: el de homologación no existe para
    la ARCA de producción, y al revés.
  */
  it('no toma un CAEA de otro ambiente', async () => {
    await db.configuracion.put({ clave: 'arca.ambiente', valor: 'produccion', actualizado_en: AHORA } as never)
    expect(await caeaVigente(HOY)).toBeNull()
  })
})

describe('la numeración de la serie', () => {
  beforeEach(() => sembrar({ ultimoNumero: 12 }))

  it('sigue desde donde llegó el servidor', async () => {
    expect(await siguienteNumero(PV_CAEA, 6)).toBe(13)
  })

  it('dos facturas seguidas toman números consecutivos', async () => {
    const primera = await emitir()
    expect(primera.numero).toBe(13)

    // La segunda necesita otra venta: una venta se factura una sola vez.
    await db.venta.put(
      await sellarVenta({
        id: 'venta-2', codigo: 'CAJA1-000031', estado: 'cobrada', cliente_id: CLIENTE,
        vendedor_id: 'u-1', total: 1000, descuento_total: 0, lista_precio_id: null,
        medio_pago_previsto_id: null, cuotas_previstas: null, observaciones: null,
        ocurrido_en: AHORA, enviada_caja_en: AHORA, actualizado_en: AHORA,
      }),
    )
    await db.venta_linea.put({
      id: 'linea-2', venta_id: 'venta-2', orden: 1, producto_id: 'prod-1',
      codigo_producto: 'DEMO-007', descripcion: 'COLLAR', cantidad: 1,
      precio_original: 1000, precio_acordado: 1000, precio_unitario: 1000,
      motivo_modificacion: null, alicuota_iva_id: 5, condicion_iva: 'gravado',
      actualizado_en: AHORA,
    })

    const segunda = await emitirConCaeaLocal('venta-2', { usuarioId: 'u-1', terminalId: 't-caja' })
    expect(segunda.numero).toBe(14)
  })

  /*
    Después de reinstalar, el servidor puede venir atrasado respecto de
    lo que esta máquina ya entregó. Se toma el mayor de los dos: mirar
    sólo uno repite números que ya están impresos.
  */
  it('no repite un número que esta terminal ya emitió', async () => {
    await emitir()
    await db.secuencia.put({
      clave: `${PV_CAEA}-6`, punto_venta_id: PV_CAEA, tipo_comprobante_id: 6,
      ultimo_numero: 5, actualizado_en: AHORA,
    })
    expect(await siguienteNumero(PV_CAEA, 6)).toBe(14)
  })
})

describe('la factura que sale sin internet', () => {
  beforeEach(() => sembrar({ ultimoNumero: 12 }))

  it('sale con el CAEA, en contingencia y en el punto de venta 9', async () => {
    const c = await emitir()

    expect(c.modalidad).toBe('caea')
    expect(c.estado).toBe('contingencia')
    expect(c.cae).toBe('86370874703771')
    expect(c.cae_vencimiento).toBe('2026-09-30')
    expect(c.punto_venta_numero).toBe(9)
    expect(c.numero).toBe(13)
  })

  it('con los mismos números que sacaría el servidor', async () => {
    const c = await emitir()
    expect(c.neto_gravado).toBe(5289.26)
    expect(c.iva_total).toBe(1110.74)
    expect(c.total).toBe(6400)

    const alicuotas = await db.comprobante_alicuota.where('comprobante_id').equals(c.id).toArray()
    expect(alicuotas).toHaveLength(1)
    expect(alicuotas[0].base_imponible).toBe(5289.26)
  })

  it('a un Consumidor Final le emite Factura B', async () => {
    const c = await emitir()
    expect(c.tipo_comprobante_id).toBe(6)
  })

  it('a un Responsable Inscripto le emite Factura A, con percepción', async () => {
    await sembrar({ condicion: 1, total: 1000000, ultimoNumero: 0 })
    const c = await emitir()

    expect(c.tipo_comprobante_id).toBe(1)
    expect(c.tributos_total).toBe(27355.37)
    expect(c.total).toBe(1027355.37)

    const tributos = await db.comprobante_tributo.where('comprobante_id').equals(c.id).toArray()
    expect(tributos[0].descripcion).toBe('Percepción IIBB Misiones')
  })

  /*
    Lo que identifica al cliente queda cifrado en el disco, igual que en
    el resto del sistema. Una factura guardada en claro sería la lista de
    clientes con nombre, documento y domicilio, servida.
  */
  it('guarda al receptor cifrado, y se puede volver a leer', async () => {
    const c = await emitir()
    const guardado = await db.comprobante.get(c.id)

    expect(String(JSON.stringify(guardado))).not.toContain('Krause')
    const abierto = await abrirComprobante(guardado!)
    expect(abierto.receptor_nombre).toBe('Krause, Federico')
    expect(abierto.receptor_domicilio).toBe('Los Lapachos 67 Oberá')
  })

  it('queda encolada para el servidor, sin renumerar nada', async () => {
    const c = await emitir()
    const cola = await db.outbox.toArray()
    const rpc = cola.find((o) => o.tabla === 'registrar_comprobante_caea')

    expect(rpc).toBeTruthy()
    expect(rpc?.descripcion).toContain('0009-00000013')
    expect(c.numero).toBe(13)
  })

  it('una venta no se factura dos veces', async () => {
    await emitir()
    await expect(emitir()).rejects.toThrow(/ya tiene un comprobante/)
  })

  it('no factura una venta que no está cobrada', async () => {
    const guardada = await db.venta.get(VENTA)
    await db.venta.put({ ...guardada!, estado: 'en_caja' })
    await expect(emitir()).rejects.toThrow(/Sólo se factura una venta cobrada/)
  })

  /*
    Sin los catálogos de ARCA bajados no se inventa nada: se para y se
    dice qué hacer. Una factura con la clase o la alícuota equivocada ya
    está entregada cuando alguien la mira.
  */
  it('se planta si falta un catálogo de ARCA', async () => {
    await db.condicion_iva.clear()
    await expect(emitir()).rejects.toThrow(/Sincronizá con internet/)
  })
})
