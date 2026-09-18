import { db } from '@/lib/local/db'
import type {
  CaeaLocal,
  ComprobanteLocal,
  PuntoVentaLocal,
  VentaLineaLocal,
} from '@/lib/local/db'
import { abrirCliente, abrirVenta, sellarComprobante } from '@/lib/local/cifrado'
import { encolar } from '@/lib/local/sync'
import { armarComprobante } from '@/lib/local/factura'
import type { LineaFiscal } from '@/lib/local/factura'

/*
  ─────────────────────────────────────────────────────────────
  Facturar con internet cortado

  El CAEA es el código que ARCA entrega POR ADELANTADO, una vez por
  quincena, para poder seguir facturando cuando su servicio no está
  disponible. Hasta ahora el sistema lo usaba desde el servidor, así que
  cubría "ARCA está caído" pero no "no hay internet" — que es el caso
  de Oberá, donde se corta la luz de una zona y se lleva la conexión.

  Acá la terminal emite sola: numera, arma la factura con los mismos
  números que sacaría el servidor, la firma con el CAEA que ya tiene
  bajado, y la imprime. El cliente se va con su comprobante. Cuando
  vuelve internet, esa factura sube TAL COMO SE ENTREGÓ y la tarea
  diaria se la informa a ARCA.

  Tres cosas que no se pueden relajar:

  · Sólo emite la terminal de la CAJA. Es donde se cobra y se factura, y
    así una sola serie —la del punto de venta del régimen CAEA— basta.
    Si dos máquinas numeraran a la vez sin verse, entregarían dos
    papeles con el mismo número.
  · El número no se corrige después. Ya está impreso y entregado.
  · Sin CAEA vigente no se emite. Un código vencido o de otra quincena
    no vale, y ARCA rechaza el lote entero al informarlo.
  ─────────────────────────────────────────────────────────────
*/

/*
  El día de la terminal, no el del meridiano de Greenwich.

  `toISOString()` devuelve UTC: después de las nueve de la noche en
  Argentina ya es mañana, y una factura fechada mañana es una factura
  que ARCA observa. La terminal está en Oberá, así que su propio día es
  el correcto.
*/
export function hoyEnLaTerminal(ahora = new Date()): string {
  const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

async function ambienteConfigurado(): Promise<string> {
  const fila = await db.configuracion.get('arca.ambiente')
  return String(fila?.valor ?? 'homologacion')
}

async function numeroDeConfiguracion(clave: string, porOmision: number): Promise<number> {
  const fila = await db.configuracion.get(clave)
  const n = Number(fila?.valor)
  return Number.isFinite(n) ? n : porOmision
}

/** El CAEA que rige hoy, del ambiente configurado. */
export async function caeaVigente(hoy = hoyEnLaTerminal()): Promise<CaeaLocal | null> {
  const ambiente = await ambienteConfigurado()
  const todos = await db.caea.toArray()
  return (
    todos.find(
      (c) =>
        c.estado === 'vigente' &&
        c.ambiente === ambiente &&
        c.fecha_desde <= hoy &&
        hoy <= c.fecha_hasta,
    ) ?? null
  )
}

/** El punto de venta dado de alta en ARCA bajo el régimen CAEA. */
export async function puntoVentaDeContingencia(): Promise<PuntoVentaLocal | null> {
  const puntos = await db.punto_venta.toArray()
  return (
    puntos
      .filter((p) => p.regimen_caea && p.activo && !p.eliminado_en)
      .sort((a, b) => a.numero - b.numero)[0] ?? null
  )
}

/*
  El número que sigue en la serie.

  Se toma el mayor entre lo que dice el servidor —hasta dónde llegó la
  numeración la última vez que hubo internet— y lo que esta terminal ya
  emitió sin conexión. Mirar sólo lo del servidor repetiría los números
  del corte; mirar sólo lo local los repetiría después de reinstalar.
*/
export async function siguienteNumero(puntoVentaId: string, tipoId: number): Promise<number> {
  const secuencia = await db.secuencia.get(`${puntoVentaId}-${tipoId}`)
  const delServidor = Number(secuencia?.ultimo_numero ?? 0)

  const emitidos = await db.comprobante
    .where('[punto_venta_id+tipo_comprobante_id]')
    .equals([puntoVentaId, tipoId])
    .toArray()
  const local = emitidos.reduce((mayor, c) => Math.max(mayor, Number(c.numero)), 0)

  return Math.max(delServidor, local) + 1
}

export interface PuedeEmitir {
  puede: boolean
  motivo?: string
  caea?: CaeaLocal
  puntoVenta?: PuntoVentaLocal
}

/*
  Si esta terminal puede emitir por contingencia ahora mismo.

  Se pregunta ANTES de cobrar, no después: si no se va a poder emitir,
  el cajero tiene que saberlo mientras el cliente todavía está
  decidiendo, no con la plata ya en el cajón.
*/
export async function sePuedeEmitirConCaea(esCaja: boolean): Promise<PuedeEmitir> {
  if (!esCaja) {
    return { puede: false, motivo: 'Durante un corte, la factura la emite la terminal de la caja.' }
  }

  const puntoVenta = await puntoVentaDeContingencia()
  if (!puntoVenta) {
    return {
      puede: false,
      motivo:
        'No hay punto de venta del régimen CAEA cargado en esta computadora. Sincronizá con internet.',
    }
  }

  const caea = await caeaVigente()
  if (!caea) {
    return {
      puede: false,
      motivo:
        'No hay CAEA vigente para hoy en esta computadora. Se pide por adelantado, con internet, una vez por quincena.',
    }
  }

  return { puede: true, caea, puntoVenta }
}

export interface DatosEmision {
  usuarioId: string | null
  terminalId: string | null
  /** Por qué se emitió por contingencia. Queda en el registro que exige la RG. */
  motivo?: string
}

/*
  Emite la factura de una venta ya cobrada, con el CAEA.

  Devuelve el comprobante tal como quedó guardado en esta máquina, que
  es el que se imprime y se entrega. La misma información se encola para
  el servidor: allá no se renumera ni se recalcula nada — ver
  `registrar_comprobante_caea()`.
*/
export async function emitirConCaeaLocal(
  ventaId: string,
  datos: DatosEmision,
): Promise<ComprobanteLocal> {
  const guardada = await db.venta.get(ventaId)
  if (!guardada) throw new Error('La venta no está en esta computadora.')
  const venta = await abrirVenta(guardada)

  if (venta.estado !== 'cobrada') {
    throw new Error(`Sólo se factura una venta cobrada. Esta está ${venta.estado}.`)
  }

  const yaEmitido = await db.comprobante.where('venta_id').equals(ventaId).first()
  if (yaEmitido) throw new Error('La venta ya tiene un comprobante emitido en esta computadora.')

  const permiso = await sePuedeEmitirConCaea(true)
  if (!permiso.puede || !permiso.caea || !permiso.puntoVenta) {
    throw new Error(permiso.motivo ?? 'No se puede emitir por contingencia.')
  }
  const { caea, puntoVenta } = permiso

  const clienteGuardado = await db.cliente.get(venta.cliente_id)
  if (!clienteGuardado) throw new Error('El cliente de la venta no está en esta computadora.')
  const cliente = await abrirCliente(clienteGuardado)

  /*
    La clase la decide la condición del cliente frente al IVA, igual que
    en el servidor: a un Responsable Inscripto le corresponde A, al
    resto B. Emitirle la clase equivocada es un problema fiscal del
    cliente, no nuestro, y por eso no se adivina: si el catálogo no
    bajó, se para.
  */
  const condicion = await db.condicion_iva.get(cliente.condicion_iva_id)
  if (!condicion) {
    throw new Error(
      'Falta la tabla de condiciones frente al IVA en esta computadora. Sincronizá con internet.',
    )
  }

  const tipos = await db.tipo_comprobante.toArray()
  const tipo = tipos.find(
    (t) => t.clase === condicion.tipo_comprobante && t.familia === 'factura' && t.activo,
  )
  if (!tipo) {
    throw new Error(
      `No está el tipo de comprobante para la Factura ${condicion.tipo_comprobante} en esta computadora.`,
    )
  }

  const lineas: VentaLineaLocal[] = await db.venta_linea.where('venta_id').equals(ventaId).toArray()
  const porcentajes = new Map(
    (await db.alicuota_iva.toArray()).map((a) => [a.id, Number(a.porcentaje)]),
  )

  const armado = armarComprobante({
    lineas: lineas.map(
      (l): LineaFiscal => ({
        importe: Number(l.cantidad) * Number(l.precio_unitario),
        alicuota_iva_id: l.alicuota_iva_id,
        condicion_iva: l.condicion_iva,
      }),
    ),
    totalVenta: Number(venta.total),
    porcentajes,
    clase: condicion.tipo_comprobante,
    tipo_comprobante_id: tipo.id,
    percepcion: {
      condicion_iva_id: cliente.condicion_iva_id,
      excluido: !!cliente.iibb_percepcion_excluido,
      alicuota: await numeroDeConfiguracion('arca.iibb_percepcion_alicuota', 0),
      minimo: await numeroDeConfiguracion('arca.iibb_percepcion_minimo', 0),
    },
  })

  const numero = await siguienteNumero(puntoVenta.id, tipo.id)
  const ahora = new Date().toISOString()

  const comprobante: ComprobanteLocal = {
    id: crypto.randomUUID(),
    venta_id: ventaId,
    tipo_comprobante_id: tipo.id,
    punto_venta_id: puntoVenta.id,
    punto_venta_numero: puntoVenta.numero,
    numero,
    fecha: hoyEnLaTerminal(),
    concepto: 1,
    cliente_id: cliente.id,
    receptor_nombre: cliente.nombre,
    receptor_documento: cliente.numero_documento,
    // 99 = "sin identificar", el que usa ARCA para consumidor final.
    receptor_tipo_documento_id: cliente.tipo_documento_id ?? 99,
    receptor_condicion_iva_id: cliente.condicion_iva_id,
    receptor_domicilio: cliente.domicilio ?? null,
    neto_gravado: armado.neto_gravado,
    neto_no_gravado: 0,
    exento: armado.exento,
    iva_total: armado.iva_total,
    tributos_total: armado.tributos_total,
    total: armado.total,
    moneda: 'PES',
    cotizacion: 1,
    modalidad: 'caea',
    estado: 'contingencia',
    caea_id: caea.id,
    cae: caea.codigo,
    cae_vencimiento: caea.fecha_hasta,
    motivo: datos.motivo ?? 'Sin conexión',
    usuario_id: datos.usuarioId,
    terminal_id: datos.terminalId,
    creado_en: ahora,
    impresiones: 0,
  }

  const alicuotas = armado.alicuotas.map((a) => ({
    id: crypto.randomUUID(),
    comprobante_id: comprobante.id,
    ...a,
  }))
  const tributos = armado.tributos.map((t) => ({
    id: crypto.randomUUID(),
    comprobante_id: comprobante.id,
    ...t,
  }))

  /*
    Se cifra ANTES de tocar la base, nunca adentro de la transacción.
    Esperar el cifrado con la escritura ya abierta es lo que cierra las
    transacciones de IndexedDB — ya costó un día entero el 14/09.
  */
  const sellado = await sellarComprobante(comprobante)

  await db.comprobante.put(sellado)
  if (alicuotas.length) await db.comprobante_alicuota.bulkPut(alicuotas)
  if (tributos.length) await db.comprobante_tributo.bulkPut(tributos)

  // La serie local sube, así el próximo comprobante del corte sigue.
  await db.secuencia.put({
    clave: `${puntoVenta.id}-${tipo.id}`,
    punto_venta_id: puntoVenta.id,
    tipo_comprobante_id: tipo.id,
    ultimo_numero: numero,
    actualizado_en: ahora,
  })

  await encolar(ventaId, [
    {
      tipo: 'rpc',
      tabla: 'registrar_comprobante_caea',
      datos: { p_datos: { ...comprobante, alicuotas: armado.alicuotas, tributos: armado.tributos } },
      descripcion: `factura ${String(puntoVenta.numero).padStart(4, '0')}-${String(numero).padStart(8, '0')} emitida con CAEA`,
    },
  ])

  return comprobante
}
