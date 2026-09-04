import { db } from '@/lib/local/db'
import { encolar } from '@/lib/local/sync'
import type { VentaLineaLocal, VentaLocal } from '@/lib/local/db'

/*
  ─────────────────────────────────────────────────────────────
  Cobro sin conexión

  Cobrar es la operación más delicada del sistema: mueve plata, descuenta
  stock y genera deuda, las tres cosas a la vez. En el servidor eso lo
  resuelve cobrar_venta() en una sola transacción — todo o nada.

  Sin conexión no hay transacción posible contra el servidor, así que la
  pregunta es qué se replica acá. La respuesta NO es reescribir la lógica
  en JavaScript: dos implementaciones de la misma regla en dos lenguajes
  se separan con el tiempo, y el día que se separen nadie va a saber cuál
  de las dos tiene razón.

  Lo que se hace es partir la operación en dos mitades:

    VALIDAR acá. Las mismas cuatro condiciones que verifica el servidor,
    para no aceptar en el mostrador un cobro que después va a rebotar.
    Un cobro rechazado tres horas más tarde, con el cliente en la casa,
    no se puede deshacer.

    ESCRIBIR allá. Los pagos y la llamada a cobrar_venta() van a la
    bandeja de salida. Cuando vuelve internet, el servidor ejecuta la
    misma función de siempre y sigue siendo la única autoridad sobre lo
    que realmente pasó.

  Lo local queda como un adelanto de lo que va a pasar, no como la
  verdad. Por eso el estado local se puede pisar sin miedo cuando baja
  el dato real.
  ─────────────────────────────────────────────────────────────
*/

export interface VentaCola {
  id: string
  codigo: string
  total: number
  ocurrido_en: string
  enviada_caja_en: string | null
  cliente: { nombre: string } | null
  vendedor: { nombre: string } | null
}

export async function listarColaLocal(): Promise<VentaCola[]> {
  const ventas = await db.venta.where('estado').equals('en_caja').toArray()
  ventas.sort((a, b) => (a.enviada_caja_en ?? '').localeCompare(b.enviada_caja_en ?? ''))

  const clientes = new Map((await db.cliente.toArray()).map((c) => [c.id, c.nombre]))

  return ventas.map((v) => ({
    id: v.id,
    codigo: v.codigo,
    total: Number(v.total),
    ocurrido_en: v.ocurrido_en,
    enviada_caja_en: v.enviada_caja_en,
    cliente: { nombre: clientes.get(v.cliente_id) ?? 'Consumidor Final' },
    // El nombre del vendedor no está en la base local: no se replican
    // usuarios. Sin conexión la caja ve la venta igual, sin ese dato.
    vendedor: null,
  }))
}

export async function hayColaLocal(): Promise<boolean> {
  return (await db.venta.where('estado').equals('en_caja').count()) > 0
}

export interface VentaCompletaLocal {
  id: string
  codigo: string
  estado: string
  total: number
  descuento_total: number
  lista_precio_id: string | null
  medio_pago_previsto_id: string | null
  cuotas_previstas: number | null
  /*
    Opcional a propósito: una terminal que se sincronizó antes de que
    esta columna existiera no la tiene guardada. Quien la lee asume
    'fiscal', que es el valor por omisión de la base y el único que no
    puede hacer daño — como mucho se emite una factura de más.
  */
  documentacion?: 'fiscal' | 'no_fiscal'
  observaciones: string | null
  cliente: {
    id: string
    nombre: string
    condicion_iva_id: number
    cuenta_corriente: boolean
    limite_credito: number | null
  } | null
  vendedor: { id: string; nombre: string } | null
  venta_linea: {
    id: string
    orden: number
    codigo_producto: string
    descripcion: string
    cantidad: number
    precio_original: number
    precio_acordado: number
    precio_unitario: number
    motivo_modificacion: string | null
  }[]
}

export async function obtenerVentaLocal(id: string): Promise<VentaCompletaLocal | null> {
  const v = await db.venta.get(id)
  if (!v) return null

  const lineas = await db.venta_linea.where('venta_id').equals(id).toArray()
  lineas.sort((a, b) => a.orden - b.orden)

  const cliente = await db.cliente.get(v.cliente_id)

  return {
    id: v.id,
    codigo: v.codigo,
    estado: v.estado,
    total: Number(v.total),
    descuento_total: Number(v.descuento_total ?? 0),
    lista_precio_id: v.lista_precio_id,
    medio_pago_previsto_id: v.medio_pago_previsto_id,
    cuotas_previstas: v.cuotas_previstas,
    observaciones: v.observaciones,
    cliente: cliente
      ? {
          id: cliente.id,
          nombre: cliente.nombre,
          condicion_iva_id: cliente.condicion_iva_id,
          cuenta_corriente: cliente.cuenta_corriente,
          limite_credito: cliente.limite_credito,
        }
      : null,
    vendedor: null,
    venta_linea: lineas.map((l) => ({
      id: l.id,
      orden: l.orden,
      codigo_producto: l.codigo_producto,
      descripcion: l.descripcion,
      cantidad: Number(l.cantidad),
      precio_original: Number(l.precio_original),
      precio_acordado: Number(l.precio_acordado),
      precio_unitario: Number(l.precio_unitario),
      motivo_modificacion: l.motivo_modificacion,
    })),
  }
}

function totalDeLineas(lineas: VentaLineaLocal[]): number {
  return Math.round(lineas.reduce((s, l) => s + Number(l.cantidad) * Number(l.precio_unitario), 0) * 100) / 100
}

/*
  Recalcula la venta con otra lista de precios.

  Réplica exacta de aplicar_lista_a_venta(): siempre parte del precio
  ACORDADO, nunca del último calculado. Es lo que evita que cambiar dos
  veces de medio de pago acumule recargos sobre recargos, o que pise la
  rebaja que el vendedor le hizo al cliente.

  Ojo: acá el cambio queda sólo en la copia local. La lista definitiva la
  aplica el servidor al procesar el cobro, con la misma función de
  siempre — por eso se manda el id de la lista junto con el cobro.
*/
export async function aplicarListaLocal(ventaId: string, listaId: string | null): Promise<number> {
  const venta = await db.venta.get(ventaId)
  if (!venta) throw new Error('La venta no está en esta computadora.')
  if (!['borrador', 'en_caja'].includes(venta.estado)) {
    throw new Error(`La venta está ${venta.estado} y ya no admite cambios de precio.`)
  }

  let ajuste = 0
  if (listaId) {
    const lista = await db.lista_precio.get(listaId)
    if (!lista || !lista.activo || lista.eliminado_en) {
      throw new Error('La lista de precios no está disponible en esta computadora.')
    }
    ajuste = Number(lista.ajuste_porcentaje ?? 0)
  }

  const lineas = await db.venta_linea.where('venta_id').equals(ventaId).toArray()
  const recalculadas = lineas.map((l) => ({
    ...l,
    precio_unitario: Math.round(Number(l.precio_acordado) * (1 + ajuste / 100) * 100) / 100,
  }))
  await db.venta_linea.bulkPut(recalculadas)

  const total = totalDeLineas(recalculadas)
  await db.venta.update(ventaId, { lista_precio_id: listaId, total })
  return total
}

export async function saldoCuentaCorrienteLocal(clienteId: string): Promise<number> {
  const fila = await db.saldo_cuenta_corriente.get(clienteId)
  return Number(fila?.saldo ?? 0)
}

export interface PagoLocal {
  medio_pago_id: string
  importe: number
  cuotas: number
  referencia: string | null
}

/*
  Las mismas validaciones que hace cobrar_venta() en el servidor.

  Se mantienen en el mismo orden y con los mismos mensajes a propósito:
  si alguna vez divergen, que sea evidente al leerlas una al lado de la
  otra. Cualquier cambio en la función de la base tiene que replicarse
  acá, y al revés.
*/
async function validarCobro(
  venta: VentaLocal,
  lineas: VentaLineaLocal[],
  pagos: PagoLocal[],
): Promise<void> {
  if (!['borrador', 'en_caja'].includes(venta.estado)) {
    throw new Error(`La venta está ${venta.estado} y no se puede cobrar.`)
  }
  if (!lineas.length) throw new Error('La venta no tiene productos.')

  const pagado = Math.round(pagos.reduce((s, p) => s + Number(p.importe), 0) * 100) / 100
  if (Math.abs(pagado - Number(venta.total)) > 0.01) {
    throw new Error(`Los pagos suman ${pagado} y el total es ${venta.total}.`)
  }

  // Parte financiada en cuenta corriente
  const medios = new Map((await db.medio_pago.toArray()).map((m) => [m.id, m]))
  const ctaCte = pagos
    .filter((p) => medios.get(p.medio_pago_id)?.tipo === 'cuenta_corriente')
    .reduce((s, p) => s + Number(p.importe), 0)

  if (ctaCte <= 0) return

  const cliente = await db.cliente.get(venta.cliente_id)
  if (!cliente) {
    throw new Error('El cliente no está en esta computadora, no se puede validar el crédito.')
  }
  if (!cliente.cuenta_corriente) {
    throw new Error(`El cliente ${cliente.nombre} no tiene cuenta corriente habilitada.`)
  }
  if (cliente.limite_credito != null) {
    const saldo = await saldoCuentaCorrienteLocal(cliente.id)
    if (saldo + ctaCte > Number(cliente.limite_credito)) {
      throw new Error(
        `Excede el límite de crédito: saldo ${saldo}, esta venta ${ctaCte}, límite ${cliente.limite_credito}.`,
      )
    }
  }
}

/*
  Cobra la venta desde la terminal.

  Se encola en el orden en que el servidor lo necesita: primero los
  pagos, después cobrar_venta(), que los lee para validar que sumen el
  total. El lote es el id de la venta, así el motor de sincronización ya
  sabe que van juntos y en orden — y si uno falla, corta el lote entero
  en vez de dejar una venta cobrada a medias.

  Los ids de los pagos los genera la terminal, igual que los de la venta:
  si un reenvío duplica el pedido, choca contra la clave primaria en vez
  de cargar el pago dos veces.
*/
export async function cobrarLocal(datos: {
  ventaId: string
  cajaId: string | null
  cajeroId: string
  pagos: PagoLocal[]
}): Promise<void> {
  const venta = await db.venta.get(datos.ventaId)
  if (!venta) throw new Error('La venta no está en esta computadora.')

  const lineas = await db.venta_linea.where('venta_id').equals(datos.ventaId).toArray()
  await validarCobro(venta, lineas, datos.pagos)

  await encolar(datos.ventaId, [
    ...datos.pagos.map((p, i) => ({
      tipo: 'insert' as const,
      tabla: 'venta_pago',
      datos: {
        id: crypto.randomUUID(),
        venta_id: datos.ventaId,
        medio_pago_id: p.medio_pago_id,
        importe: p.importe,
        cuotas: p.cuotas,
        referencia: p.referencia,
      },
      descripcion: `${venta.codigo} · pago ${i + 1}`,
    })),
    {
      tipo: 'rpc' as const,
      tabla: 'cobrar_venta',
      datos: {
        p_venta_id: datos.ventaId,
        p_caja_id: datos.cajaId,
        p_cajero_id: datos.cajeroId,
      },
      descripcion: `${venta.codigo} · cobro`,
    },
  ])

  await aplicarEfectoLocal(venta, lineas, datos.pagos)
}

/*
  Adelanta en la copia local lo que el servidor va a hacer.

  No es la verdad: es para que el cajero vea la venta salir de la cola y
  el vendedor de al lado no le venda la última unidad que se acaba de
  llevar el cliente. Cuando la operación sube, el servidor recalcula
  todo desde los movimientos y lo que baje pisa esto sin problema.

  El stock puede quedar momentáneamente distinto del real si otra
  terminal vendió lo mismo estando también sin conexión. Es exactamente
  el caso que el diseño "por movimientos y no por saldos" viene a
  resolver: entran las dos ventas, el saldo queda negativo, y eso es una
  alerta visible en vez de una venta perdida en silencio.
*/
async function aplicarEfectoLocal(
  venta: VentaLocal,
  lineas: VentaLineaLocal[],
  pagos: PagoLocal[],
): Promise<void> {
  await db.venta.update(venta.id, { estado: 'cobrada' })

  for (const l of lineas) {
    if (!l.producto_id) continue
    const saldo = await db.saldo.get(l.producto_id)
    if (!saldo) continue
    await db.saldo.update(l.producto_id, {
      cantidad: Number(saldo.cantidad) - Number(l.cantidad),
    })
  }

  const medios = new Map((await db.medio_pago.toArray()).map((m) => [m.id, m]))
  const ctaCte = pagos
    .filter((p) => medios.get(p.medio_pago_id)?.tipo === 'cuenta_corriente')
    .reduce((s, p) => s + Number(p.importe), 0)

  if (ctaCte > 0) {
    const actual = await db.saldo_cuenta_corriente.get(venta.cliente_id)
    await db.saldo_cuenta_corriente.put({
      cliente_id: venta.cliente_id,
      saldo: Number(actual?.saldo ?? 0) + ctaCte,
      actualizado_en: new Date().toISOString(),
    })
  }
}
