import { supabase } from '@/lib/supabase'
import { db } from '@/lib/local/db'
import type { VentaLocal } from '@/lib/local/db'
import { sellarVenta } from '@/lib/local/cifrado'
import { encolar, subirPendientes } from '@/lib/local/sync'
import {
  aplicarListaLocal,
  cobrarLocal,
  editarVentaLocal,
  listarColaLocal,
  obtenerVentaLocal,
  saldoCuentaCorrienteLocal,
} from '@/lib/local/caja'
import type { LineaDeseada } from '@/lib/local/caja'

export interface Caja {
  id: string
  terminal_id: string
  cajero_id: string | null
  estado: 'abierta' | 'cerrada'
  monto_inicial: number
  abierta_en: string
}

export interface VentaEnCola {
  id: string
  codigo: string
  total: number
  ocurrido_en: string
  enviada_caja_en: string | null
  /** Cómo llamar a esta persona en voz alta. Lo escribió el vendedor. */
  nombre_para_llamar: string | null
  cliente: { nombre: string } | null
  vendedor: { nombre: string } | null
}

export interface LineaCobro {
  id: string
  orden: number
  codigo_producto: string
  descripcion: string
  cantidad: number
  precio_original: number
  precio_acordado: number
  precio_unitario: number
  motivo_modificacion: string | null
}

export interface VentaCompleta {
  id: string
  codigo: string
  estado: string
  total: number
  descuento_total: number
  lista_precio_id: string | null
  /** Recargo del plan de cuotas, ya incluido en los precios. */
  recargo_porcentaje?: number
  /** Lo que el vendedor ya le preguntó al cliente. */
  medio_pago_previsto_id: string | null
  cuotas_previstas: number | null
  /** Si se cobra con factura de ARCA o con comprobante no fiscal. */
  documentacion: 'fiscal' | 'no_fiscal'
  observaciones: string | null
  cliente: {
    id: string
    nombre: string
    condicion_iva_id: number
    cuenta_corriente: boolean
    limite_credito: number | null
  } | null
  vendedor: { id: string; nombre: string } | null
  venta_linea: LineaCobro[]
}

export interface PagoNuevo {
  medio_pago_id: string
  importe: number
  cuotas: number
  referencia: string | null
}

/*
  La caja abierta, recordada en la máquina.

  Regla del proyecto: nada en el camino de arranque puede depender de una
  respuesta del servidor. Ya pasó dos veces —el perfil del usuario y la
  terminal asignada— que una consulta al arranque dejaba la aplicación
  entera esperando sin conexión.

  Acá es lo mismo: si la caja no sabe que está abierta, no puede cobrar
  aunque todo lo demás funcione. Se guarda al abrirla y se lee de ahí
  cuando el servidor no contesta.
*/
const CLAVE_CAJA = 'gross.caja'

function recordarCaja(terminalId: string, caja: Caja | null) {
  if (caja) localStorage.setItem(`${CLAVE_CAJA}.${terminalId}`, JSON.stringify(caja))
  else localStorage.removeItem(`${CLAVE_CAJA}.${terminalId}`)
}

function cajaRecordada(terminalId: string): Caja | null {
  try {
    const crudo = localStorage.getItem(`${CLAVE_CAJA}.${terminalId}`)
    return crudo ? (JSON.parse(crudo) as Caja) : null
  } catch {
    return null
  }
}

export async function cajaAbierta(terminalId: string): Promise<Caja | null> {
  if (navigator.onLine) {
    const { data, error } = await supabase
      .from('caja')
      .select('id, terminal_id, cajero_id, estado, monto_inicial, abierta_en')
      .eq('terminal_id', terminalId)
      .eq('estado', 'abierta')
      .maybeSingle<Caja>()

    // Sólo se cree la respuesta del servidor si de verdad contestó. Una
    // consulta que falla no significa "no hay caja abierta": significa
    // que no sabemos, y en ese caso vale lo último que sí supimos.
    if (!error) {
      recordarCaja(terminalId, data)
      return data
    }
  }
  return cajaRecordada(terminalId)
}

/*
  Abrir la caja SÍ necesita internet, y es a propósito.

  Es una operación de una vez por turno, al empezar el día, y crea el
  contenedor contra el que después se arquea. Dejar que dos terminales
  abran cajas distintas sin coordinar, o que se abra una caja que el
  servidor nunca va a conocer, arruina el cierre del turno — que es
  justamente el momento en que se cuenta la plata.

  Cobrar sin conexión sí funciona, porque eso pasa en medio de la
  atención y no se puede frenar.
*/
export async function abrirCaja(terminalId: string, cajeroId: string, montoInicial: number) {
  if (!navigator.onLine) {
    throw new Error(
      'Para abrir la caja hace falta internet. Si ya estaba abierta antes de que se cortara, podés seguir cobrando igual.',
    )
  }

  const { data, error } = await supabase
    .from('caja')
    .insert({ terminal_id: terminalId, cajero_id: cajeroId, monto_inicial: montoInicial })
    .select('id, terminal_id, cajero_id, estado, monto_inicial, abierta_en')
    .single<Caja>()
  if (error) throw new Error(`No se pudo abrir la caja: ${error.message}`)

  recordarCaja(terminalId, data)
  return data
}

/*
  Lecturas: el servidor manda mientras haya conexión.

  La copia local es la red de contención, no la fuente. Con internet se
  lee del servidor porque ahí está la cola completa y actualizada —otra
  caja puede haber cobrado algo hace un segundo— y porque trae el nombre
  del vendedor, que la terminal no replica.

  Sin internet se lee lo que se alcanzó a bajar. Es menos, pero es lo que
  permite seguir cobrando.
*/
export async function listarVentasEnCola(): Promise<VentaEnCola[]> {
  if (!navigator.onLine) return listarColaLocal()

  const { data, error } = await supabase
    .from('venta')
    .select(
      'id, codigo, total, ocurrido_en, enviada_caja_en, nombre_para_llamar, cliente:cliente_id(nombre), vendedor:vendedor_id(nombre)',
    )
    .eq('estado', 'en_caja')
    .order('enviada_caja_en', { ascending: true })

  if (error) return listarColaLocal()
  return (data ?? []) as unknown as VentaEnCola[]
}

export async function obtenerVentaCompleta(id: string): Promise<VentaCompleta> {
  if (navigator.onLine) {
    const { data, error } = await supabase
      .from('venta')
      .select(
        `id, codigo, estado, total, descuento_total, lista_precio_id, recargo_porcentaje, medio_pago_previsto_id, cuotas_previstas, observaciones, documentacion,
         cliente:cliente_id(id, nombre, condicion_iva_id, cuenta_corriente, limite_credito),
         vendedor:vendedor_id(id, nombre),
         venta_linea(id, orden, codigo_producto, descripcion, cantidad,
                     precio_original, precio_acordado, precio_unitario, motivo_modificacion)`,
      )
      .eq('id', id)
      .single()

    if (!error && data) {
      const venta = data as unknown as VentaCompleta
      venta.venta_linea = [...venta.venta_linea].sort((a, b) => a.orden - b.orden)
      return venta
    }
  }

  const local = await obtenerVentaLocal(id)
  if (!local) {
    throw new Error(
      'Esta venta no está en esta computadora y no hay conexión para traerla. Se puede cobrar cuando vuelva internet.',
    )
  }
  /*
    La copia local puede no traer la marca de documentación todavía. Se
    asume "fiscal", que es el valor por omisión de la base y el que no
    puede hacer daño: como mucho se emite una factura de más, nunca una
    de menos.
  */
  return { ...local, documentacion: local.documentacion ?? 'fiscal' } as VentaCompleta
}

/*
  Aplica una lista y el recargo del plan de cuotas, y devuelve el total.

  El recargo va acá adentro —en el precio de la venta— y no sumado al
  importe del pago. Sumarlo al pago dejaba la venta valiendo menos que
  lo que el cliente pagaba, y como el cobro exige que los pagos cierren
  con el total, cobrar en cuotas era imposible. Ver la migración
  20260917200000.
*/
export async function aplicarLista(
  ventaId: string,
  listaId: string | null,
  recargoPorcentaje = 0,
): Promise<number> {
  if (navigator.onLine) {
    const { data, error } = await supabase.rpc('aplicar_lista_a_venta', {
      p_venta_id: ventaId,
      p_lista_id: listaId,
      p_recargo_porcentaje: recargoPorcentaje,
    })
    if (!error) {
      // El servidor recalculó: la copia local queda vieja y es contra
      // ella que se valida el cobro. Se refresca antes de seguir.
      await db.venta.delete(ventaId)
      await asegurarVentaLocal(ventaId)
      return Number(data)
    }
  }

  const total = await aplicarListaLocal(ventaId, listaId, recargoPorcentaje)

  /*
    Sin conexión el cambio TAMBIÉN tiene que viajar, y esto faltaba.

    Antes, elegir un medio de pago sin internet recalculaba sólo la copia
    local. Al volver la conexión subían los pagos con el importe nuevo,
    pero el servidor seguía teniendo el total viejo — y cobrar_venta()
    rechaza el cobro cuando los pagos no cierran con el total.

    O sea: cobrado en el mostrador, rechazado al subir, con el cliente ya
    en la casa. Se encola la misma llamada que se haría con internet.
  */
  await encolar(ventaId, [
    {
      tipo: 'rpc',
      tabla: 'aplicar_lista_a_venta',
      datos: {
        p_venta_id: ventaId,
        p_lista_id: listaId,
        p_recargo_porcentaje: recargoPorcentaje,
      },
      descripcion: 'lista de precios',
    },
  ])

  return total
}

/*
  La caja corrige la venta: cantidades, quitar y agregar.

  Se manda la venta entera como tiene que quedar, no los cambios. Es lo
  que hace que reintentar desde la bandeja de salida sea inofensivo:
  "sacale una unidad" aplicado dos veces saca dos.

  No se manda ningún precio, y eso es el límite de la decisión B1 hecho
  código: lo acordado por el vendedor no se toca por este camino.
*/
export async function editarVentaEnCaja(
  ventaId: string,
  lineas: LineaDeseada[],
  cajeroId: string,
  terminalId: string | null,
): Promise<number> {
  const datos = {
    p_venta_id: ventaId,
    p_lineas: lineas.map((l) => ({
      venta_linea_id: l.venta_linea_id,
      producto_id: l.producto_id,
      cantidad: l.cantidad,
    })),
    p_cajero_id: cajeroId,
    p_terminal_id: terminalId,
  }

  if (navigator.onLine) {
    const { data, error } = await supabase.rpc('editar_venta_en_caja', datos)
    if (!error) {
      await db.venta.delete(ventaId)
      await asegurarVentaLocal(ventaId)
      return Number(data)
    }
    // Un error del servidor con conexión es una regla que no se cumple
    // —permiso, venta ya cobrada—, no una caída. No se encola: se avisa.
    throw new Error(error.message)
  }

  const total = await editarVentaLocal(ventaId, lineas)
  await encolar(ventaId, [
    { tipo: 'rpc', tabla: 'editar_venta_en_caja', datos, descripcion: 'corrección en la caja' },
  ])
  return total
}

/*
  Lleva el total a un importe acordado con el cliente.

  "Dale, te queda en mil." La base lo prorratea entre las líneas, deja
  motivo y responsable, y ajusta el precio acordado para que la rebaja
  no se evapore si después cambia el medio de pago.
*/
export async function ajustarTotal(
  ventaId: string,
  nuevoTotal: number,
  motivo: string,
  usuarioId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('ajustar_total_venta', {
    p_venta_id: ventaId,
    p_nuevo_total: nuevoTotal,
    p_motivo: motivo,
    p_usuario_id: usuarioId,
  })
  if (error) throw new Error(error.message)
  return Number(data)
}

export async function saldoCuentaCorriente(clienteId: string): Promise<number> {
  if (navigator.onLine) {
    const { data, error } = await supabase
      .from('cuenta_corriente_saldo')
      .select('saldo')
      .eq('cliente_id', clienteId)
      .maybeSingle<{ saldo: number }>()
    if (!error) return Number(data?.saldo ?? 0)
  }
  return saldoCuentaCorrienteLocal(clienteId)
}

/*
  Cobra la venta.

  SIEMPRE pasa por la bandeja de salida, haya o no conexión — el mismo
  criterio que ya usa el mostrador para enviar ventas a caja. Que sea
  siempre el mismo camino es lo que evita que el modo sin conexión sea un
  caso especial lleno de bifurcaciones: es el camino normal, que a veces
  tarda más en llegar.

  La validación (pagos que sumen, límite de crédito) ocurre antes de
  encolar, así un cobro que el servidor va a rechazar se frena acá y no
  tres horas después con el cliente en la casa.

  Devuelve si la operación llegó a subir. No es un error que no suba:
  significa que la venta está cobrada y esperando. Pero el que llama
  necesita saberlo, porque sin haber subido no se puede facturar.
*/
/*
  Baja la venta a la copia local si todavía no está.

  La caja lee la cola del servidor cuando hay conexión, pero cobrar se
  resuelve contra la copia local. Entre una cosa y la otra hay hasta un
  minuto —lo que tarda el próximo ciclo de sincronización— y en ese rato
  el cajero ve en pantalla una venta que su computadora todavía no
  tiene. Sin esto, cobrarla falla con "la venta no está en esta
  computadora", que además suena a que se perdió algo.
*/
async function asegurarVentaLocal(ventaId: string): Promise<void> {
  if (await db.venta.get(ventaId)) return

  if (!navigator.onLine) {
    throw new Error(
      'Esta venta todavía no llegó a esta computadora y no hay conexión para traerla. Se puede cobrar cuando vuelva internet.',
    )
  }

  const [venta, lineas] = await Promise.all([
    supabase
      .from('venta')
      .select(
        'id, codigo, estado, cliente_id, vendedor_id, total, descuento_total, lista_precio_id, medio_pago_previsto_id, cuotas_previstas, ' +
          'observaciones, ocurrido_en, enviada_caja_en, actualizado_en',
      )
      .eq('id', ventaId)
      .single(),
    supabase
      .from('venta_linea')
      .select(
        'id, venta_id, orden, producto_id, codigo_producto, descripcion, cantidad, ' +
          'precio_original, precio_acordado, precio_unitario, motivo_modificacion, ' +
          'alicuota_iva_id, condicion_iva, actualizado_en',
      )
      .eq('venta_id', ventaId),
  ])

  if (venta.error || !venta.data) {
    throw new Error(`No se pudo traer la venta: ${venta.error?.message ?? 'no existe'}`)
  }

  // Cifrada: trae el nombre para llamar y las observaciones.
  await db.venta.put(await sellarVenta(venta.data as unknown as VentaLocal))
  if (lineas.data?.length) await db.venta_linea.bulkPut(lineas.data as never)
}

export async function cobrar(
  ventaId: string,
  cajaId: string,
  cajeroId: string,
  pagos: PagoNuevo[],
): Promise<{ subida: boolean }> {
  await asegurarVentaLocal(ventaId)
  await cobrarLocal({ ventaId, cajaId, cajeroId, pagos })

  if (!navigator.onLine) return { subida: false }

  try {
    await subirPendientes()
  } catch {
    // Ya está guardada y encolada: que falle el envío no la pierde.
  }

  // Se pregunta por el lote de esta venta y no por el resultado general:
  // pueden estar fallando operaciones viejas de otra venta y esta haber
  // subido perfecto, o al revés.
  const quedanPendientes = await db.outbox.where('lote').equals(ventaId).count()
  return { subida: quedanPendientes === 0 }
}

export async function anular(ventaId: string, motivo: string) {
  const { error } = await supabase.rpc('anular_venta', {
    p_venta_id: ventaId,
    p_motivo: motivo,
  })
  if (error) throw new Error(error.message)
}

export interface ResultadoCierre {
  esperado: number
  declarado: number
  diferencia: number
}

/*
  Cerrar también necesita internet: el arqueo compara contra las ventas
  del turno, y si hay cobros esperando subir, el número contra el que se
  arquea estaría incompleto. Cerrar con la mitad de las ventas sin
  registrar produce una diferencia de caja que no existe y que después
  alguien tiene que explicar.
*/
export async function cerrarCaja(cajaId: string, terminalId: string, montoDeclarado: number) {
  if (!navigator.onLine) {
    throw new Error('Para cerrar la caja hace falta internet: el arqueo se calcula en el servidor.')
  }

  const pendientes = await db.outbox.where('estado').anyOf('pendiente', 'error', 'enviando').count()
  if (pendientes > 0) {
    await subirPendientes()
    const quedan = await db.outbox.where('estado').anyOf('pendiente', 'error').count()
    if (quedan > 0) {
      throw new Error(
        `Quedan ${quedan} operaciones sin subir. Esperá a que terminen de enviarse antes de cerrar, o el arqueo va a dar diferencia.`,
      )
    }
  }

  const { data, error } = await supabase.rpc('cerrar_caja', {
    p_caja_id: cajaId,
    p_monto_declarado: montoDeclarado,
  })
  if (error) throw new Error(error.message)

  recordarCaja(terminalId, null)
  const filas = (data ?? []) as ResultadoCierre[]
  return filas[0]
}

export async function resumenCaja(cajaId: string) {
  const [ventas, movimientos] = await Promise.all([
    supabase
      .from('venta')
      .select('id, total')
      .eq('caja_id', cajaId)
      .eq('estado', 'cobrada'),
    supabase.from('caja_movimiento').select('importe').eq('caja_id', cajaId),
  ])
  return {
    ventas: ventas.data?.length ?? 0,
    facturado: (ventas.data ?? []).reduce((s, v) => s + Number(v.total), 0),
    movimientos: (movimientos.data ?? []).reduce((s, m) => s + Number(m.importe), 0),
  }
}
