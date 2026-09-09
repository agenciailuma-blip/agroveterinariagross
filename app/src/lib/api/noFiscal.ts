import { supabase } from '@/lib/supabase'
import { datosEmisor } from '@/lib/api/comprobante'
import { encolar } from '@/lib/local/sync'
import { reservarNumeroNoFiscal } from '@/lib/local/consultas'
import {
  emitirNoFiscalLocal,
  emitirRemitoDirectoLocal,
  obtenerNoFiscalLocal,
} from '@/lib/local/noFiscal'

/*
  Presupuestos, remitos y comprobantes internos.

  Viven en una tabla aparte de los comprobantes fiscales, a propósito: sus
  números son de Gross y no de ARCA, y un documento no fiscal que se
  cuele en una consulta de facturación termina informándole a ARCA algo
  que para el fisco no existe. La separación es lo que hace imposible ese
  error, y por eso también son dos módulos y no uno.
*/

export type TipoNoFiscal = 'presupuesto' | 'remito' | 'comprobante_interno'

export const ETIQUETA_NO_FISCAL: Record<TipoNoFiscal, string> = {
  presupuesto: 'Presupuesto',
  remito: 'Remito',
  comprobante_interno: 'Comprobante interno',
}

export const SIGLA_NO_FISCAL: Record<TipoNoFiscal, string> = {
  presupuesto: 'PRE',
  remito: 'REM',
  comprobante_interno: 'CI',
}

export interface DatosEntrega {
  domicilio?: string | null
  localidad?: string | null
  contacto?: string | null
  transportista?: string | null
}

/** El número como se imprime: REM 0002-00000045 */
export function numeroNoFiscal(tipo: TipoNoFiscal, serie: string, numero: number): string {
  return `${SIGLA_NO_FISCAL[tipo]} ${serie}-${String(numero).padStart(8, '0')}`
}

/*
  Emitir, con o sin conexión.

  El número lo pone SIEMPRE la terminal, tenga internet o no. Podría
  pedírselo al servidor cuando hay conexión, pero entonces el camino sin
  conexión se usaría sólo el día que se corta internet — que es
  justamente el peor día para estrenarlo. Así se ejerce todos los días.

  No pueden chocar entre terminales porque la serie es el prefijo de
  cada una, y el contador local se alinea con el servidor al
  sincronizar.
*/
export async function emitirNoFiscal(
  ventaId: string,
  tipo: TipoNoFiscal,
  terminalId: string | null,
  opciones: {
    observaciones?: string | null
    validoHasta?: string | null
    entrega?: DatosEntrega
    /** El prefijo de la terminal. Sin él no se puede numerar. */
    serie?: string | null
    /*
      Sólo el remito. En false documenta un compromiso y no toca el
      inventario. Nunca fuerza el descuento: con true sigue rigiendo la
      regla de siempre —descuenta sólo si la venta no lo hizo ya—.
    */
    descuentaStock?: boolean
  } = {},
): Promise<{ id: string; serie: string; numero: number }> {
  const serie = (opciones.serie ?? '').trim() || 'T'
  const id = crypto.randomUUID()
  const numero = await reservarNumeroNoFiscal(tipo, serie)

  const datos = {
    p_venta_id: ventaId,
    p_tipo_clave: tipo,
    p_terminal_id: terminalId,
    p_lineas: null,
    p_observaciones: opciones.observaciones ?? null,
    p_valido_hasta: opciones.validoHasta ?? null,
    p_entrega_domicilio: opciones.entrega?.domicilio ?? null,
    p_entrega_localidad: opciones.entrega?.localidad ?? null,
    p_entrega_contacto: opciones.entrega?.contacto ?? null,
    p_transportista: opciones.entrega?.transportista ?? null,
    p_id: id,
    p_serie: serie,
    p_numero: numero,
    p_ocurrido_en: new Date().toISOString(),
    p_descuenta_stock: opciones.descuentaStock ?? true,
  }

  // Se guarda acá primero, siempre: es lo que permite imprimir el papel
  // en el acto, y sin conexión es lo único que hay.
  await emitirNoFiscalLocal({
    id,
    ventaId,
    tipo,
    serie,
    numero,
    observaciones: opciones.observaciones,
    validoHasta: opciones.validoHasta,
    entregaDomicilio: opciones.entrega?.domicilio,
    entregaLocalidad: opciones.entrega?.localidad,
    entregaContacto: opciones.entrega?.contacto,
    transportista: opciones.entrega?.transportista,
    descuentaStock: opciones.descuentaStock ?? true,
  })

  if (navigator.onLine) {
    const { error } = await supabase.rpc('emitir_comprobante_no_fiscal', datos)
    if (!error) return { id, serie, numero }
    /*
      Con conexión, un error del servidor puede ser una regla que no se
      cumple —la venta está anulada, falta permiso— o una caída. No hay
      forma barata de distinguirlas acá, así que se encola igual: si era
      una caída, sube sola; si era una regla, queda a la vista en la
      bandeja con su mensaje en vez de perderse.
    */
  }

  await encolar(ventaId, [
    {
      tipo: 'rpc',
      tabla: 'emitir_comprobante_no_fiscal',
      datos,
      descripcion: `${SIGLA_NO_FISCAL[tipo]} ${serie}-${String(numero).padStart(8, '0')}`,
    },
  ])

  return { id, serie, numero }
}

/*
  ─────────────────────────────────────────────────────────────
  El remito que nace solo

  Pedido de Lucas el 07/09. Gross emite remitos para la
  municipalidad —y para clientes por pedido— de mercadería que
  todavía no entró al local: se pide especialmente para ese cliente
  y se documenta antes de tenerla.

  Ese remito no puede salir de una venta, porque no hay venta; y no
  puede descontar stock, porque descontaría algo que no está. Por eso
  van juntas las dos cosas: `descuentaStock` en false es lo que lo
  vuelve un documento de compromiso en vez de una salida.

  Las líneas pueden ser de dos clases y se distinguen por una sola
  cosa: si traen `producto_id` o no.

  · Con producto, el nombre y el código salen del catálogo, así el
    papel dice lo mismo que el sistema.
  · Sin producto es una LÍNEA LIBRE —el "producto comodín"—: se
    escribe para la ocasión, no se crea nada en el catálogo, y no
    mueve stock porque no tiene existencias que mover.
  ─────────────────────────────────────────────────────────────
*/
export interface LineaRemito {
  /** Nulo en una línea libre. */
  producto_id: string | null
  codigo: string
  descripcion: string
  cantidad: number
  precio_unitario: number
}

export async function emitirRemitoDirecto(
  clienteId: string,
  lineas: LineaRemito[],
  opciones: {
    descuentaStock?: boolean
    terminalId?: string | null
    serie?: string | null
    observaciones?: string | null
    entrega?: DatosEntrega
  } = {},
): Promise<{ id: string; serie: string; numero: number }> {
  if (!lineas.length) throw new Error('El remito no tiene ninguna línea.')

  const serie = (opciones.serie ?? '').trim() || 'T'
  const id = crypto.randomUUID()
  const numero = await reservarNumeroNoFiscal('remito', serie)

  const datos = {
    p_cliente_id: clienteId,
    p_lineas: lineas.map((l) => ({
      producto_id: l.producto_id,
      codigo: l.codigo,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precio_unitario: l.precio_unitario,
    })),
    p_descuenta_stock: opciones.descuentaStock ?? true,
    p_terminal_id: opciones.terminalId ?? null,
    p_observaciones: opciones.observaciones ?? null,
    p_entrega_domicilio: opciones.entrega?.domicilio ?? null,
    p_entrega_localidad: opciones.entrega?.localidad ?? null,
    p_entrega_contacto: opciones.entrega?.contacto ?? null,
    p_transportista: opciones.entrega?.transportista ?? null,
    p_id: id,
    p_serie: serie,
    p_numero: numero,
    p_ocurrido_en: new Date().toISOString(),
  }

  // Igual que el otro camino: se guarda acá primero, siempre. Es lo que
  // permite imprimir el papel en el acto, y sin conexión es lo único
  // que hay.
  await emitirRemitoDirectoLocal({
    id,
    serie,
    numero,
    clienteId,
    lineas,
    descuentaStock: opciones.descuentaStock ?? true,
    observaciones: opciones.observaciones ?? null,
    entrega: opciones.entrega,
  })

  if (navigator.onLine) {
    const { error } = await supabase.rpc('emitir_remito_directo', datos)
    if (!error) return { id, serie, numero }
  }

  await encolar(id, [
    {
      tipo: 'rpc',
      tabla: 'emitir_remito_directo',
      datos,
      descripcion: `REM ${serie}-${String(numero).padStart(8, '0')}`,
    },
  ])

  return { id, serie, numero }
}

export interface ResumenNoFiscal {
  id: string
  tipo_clave: TipoNoFiscal
  serie: string
  numero: number
  fecha: string
  receptor_nombre: string
  total: number
  estado: string
}

/** Lo emitido para una venta. Para mostrar el número recién sacado. */
export async function noFiscalesDeVenta(ventaId: string): Promise<ResumenNoFiscal[]> {
  const { data, error } = await supabase
    .from('comprobante_no_fiscal')
    .select('id, tipo_clave, serie, numero, fecha, receptor_nombre, total, estado')
    .eq('venta_id', ventaId)
    .order('creado_en', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ResumenNoFiscal[]
}

/*
  Marca si la venta se cobra con factura o sin ella.

  Los dos candados —el permiso propio y que a un Responsable Inscripto no
  se le entregue otra cosa— los verifica la base. Acá no se repiten: una
  regla escrita en dos lugares se separa con el tiempo, y el día que se
  separe nadie sabe cuál tiene razón.
*/
export async function marcarDocumentacion(
  ventaId: string,
  documentacion: 'fiscal' | 'no_fiscal',
): Promise<void> {
  const { error } = await supabase.rpc('marcar_documentacion_venta', {
    p_venta_id: ventaId,
    p_documentacion: documentacion,
  })
  if (error) throw new Error(error.message)
}

export interface LineaNoFiscal {
  orden: number
  codigo_producto: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  importe: number
}

/*
  El documento completo, para imprimirlo.

  Mirá lo que NO está en este tipo: no hay `cae`, no hay `clase`, no hay
  alícuotas de IVA. No es una omisión: es la garantía. Un componente que
  recibe esto no tiene de dónde sacar un CAE aunque alguien se lo pida,
  y por eso ningún camino de código puede imprimir algo con aspecto de
  factura.
*/
export interface NoFiscalCompleto {
  /** Sólo el remito: si tocó el inventario o documenta un compromiso. */
  descuenta_stock?: boolean
  id: string
  tipo_clave: TipoNoFiscal
  tipo_descripcion: string
  serie: string
  numero: number
  fecha: string
  estado: string
  receptor_nombre: string
  receptor_documento: string | null
  receptor_documento_sigla: string
  receptor_condicion: string
  receptor_domicilio: string | null
  total: number
  observaciones: string | null
  valido_hasta: string | null
  entrega_domicilio: string | null
  entrega_localidad: string | null
  entrega_contacto: string | null
  transportista: string | null
  venta_codigo: string | null
  creado_en: string
  lineas: LineaNoFiscal[]
  emisor: Record<string, string>
}

export async function obtenerNoFiscalCompleto(id: string): Promise<NoFiscalCompleto> {
  /*
    Sin conexión se imprime desde la copia local.

    Es la razón de ser de todo esto: el remito recién emitido tiene que
    poder salir de la impresora aunque el servidor no exista todavía
    para él. Sale con una etiqueta menos —la sigla del documento del
    cliente y su condición de IVA viven en tablas que la terminal no
    replica— y con todo lo demás.
  */
  if (!navigator.onLine) {
    const local = await obtenerNoFiscalLocal(id)
    if (!local) {
      throw new Error(
        'Ese comprobante no está en esta computadora y no hay conexión para traerlo.',
      )
    }
    return {
      ...local.doc,
      tipo_clave: local.doc.tipo_clave as TipoNoFiscal,
      tipo_descripcion: ETIQUETA_NO_FISCAL[local.doc.tipo_clave as TipoNoFiscal] ?? '',
      lineas: local.lineas,
      emisor: local.emisor,
    }
  }

  const { data: d, error } = await supabase
    .from('comprobante_no_fiscal')
    .select(
      `id, tipo_clave, serie, numero, fecha, estado, total, observaciones, valido_hasta,
       entrega_domicilio, entrega_localidad, entrega_contacto, transportista, descuenta_stock,
       receptor_nombre, receptor_documento, receptor_domicilio, creado_en,
       tipo:tipo_clave(descripcion),
       condicion:receptor_condicion_iva_id(descripcion),
       documento:receptor_tipo_documento_id(sigla),
       venta:venta_id(codigo)`,
    )
    .eq('id', id)
    .single()

  if (error || !d) throw new Error(error?.message ?? 'No se encontró el comprobante.')

  // PostgREST devuelve las relaciones como objeto o como arreglo de uno
  // según cómo infiera la cardinalidad. Se normaliza acá, igual que en
  // el comprobante fiscal.
  const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)
  const tipo = uno(d.tipo as never) as { descripcion: string } | null
  const cond = uno(d.condicion as never) as { descripcion: string } | null
  const doc = uno(d.documento as never) as { sigla: string } | null
  const vta = uno(d.venta as never) as { codigo: string } | null

  const [lineas, emisor] = await Promise.all([
    supabase
      .from('comprobante_no_fiscal_linea')
      .select('orden, codigo_producto, descripcion, cantidad, precio_unitario, importe')
      .eq('comprobante_no_fiscal_id', id)
      .order('orden'),
    datosEmisor(),
  ])

  return {
    id: d.id as string,
    tipo_clave: d.tipo_clave as TipoNoFiscal,
    tipo_descripcion: tipo?.descripcion ?? '',
    serie: d.serie as string,
    numero: d.numero as number,
    fecha: d.fecha as string,
    estado: d.estado as string,
    receptor_nombre: d.receptor_nombre as string,
    receptor_documento: d.receptor_documento as string | null,
    receptor_documento_sigla: doc?.sigla ?? '',
    receptor_condicion: cond?.descripcion ?? '',
    receptor_domicilio: d.receptor_domicilio as string | null,
    total: Number(d.total),
    observaciones: d.observaciones as string | null,
    valido_hasta: d.valido_hasta as string | null,
    entrega_domicilio: d.entrega_domicilio as string | null,
    entrega_localidad: d.entrega_localidad as string | null,
    entrega_contacto: d.entrega_contacto as string | null,
    transportista: d.transportista as string | null,
    venta_codigo: vta?.codigo ?? null,
    creado_en: d.creado_en as string,
    lineas: ((lineas.data ?? []) as unknown as LineaNoFiscal[]).map((l) => ({
      ...l,
      cantidad: Number(l.cantidad),
      precio_unitario: Number(l.precio_unitario),
      importe: Number(l.importe),
    })),
    emisor,
  }
}

/** La leyenda que hace que este papel no se pueda confundir con una factura. */
export const LEYENDA_NO_FISCAL = 'DOCUMENTO NO VÁLIDO COMO FACTURA'

export interface FilaNoFiscal {
  id: string
  tipo_clave: TipoNoFiscal
  serie: string
  numero: number
  fecha: string
  receptor_nombre: string
  total: number
  estado: string
  valido_hasta: string | null
  entrega_localidad: string | null
  transportista: string | null
  /*
    Sólo el remito. En false documenta mercadería que todavía no entró
    al local: no tocó el inventario. Se muestra en el listado porque un
    remito que no descontó y uno que sí se ven idénticos, y son cosas
    muy distintas para quien mira el stock.
  */
  descuenta_stock: boolean
  venta_id: string | null
  venta_codigo: string | null
  venta_estado: string | null
}

export async function listarNoFiscales(tipo: TipoNoFiscal | 'todos'): Promise<FilaNoFiscal[]> {
  let q = supabase
    .from('comprobante_no_fiscal')
    .select(
      `id, tipo_clave, serie, numero, fecha, receptor_nombre, total, estado, valido_hasta,
       entrega_localidad, transportista, descuenta_stock, venta_id, venta:venta_id(codigo, estado)`,
    )
    .order('creado_en', { ascending: false })
    .limit(200)

  if (tipo !== 'todos') q = q.eq('tipo_clave', tipo)

  const { data, error } = await q
  if (error) throw new Error(error.message)

  return ((data ?? []) as unknown as (Omit<FilaNoFiscal, 'venta_codigo' | 'venta_estado'> & {
    venta: { codigo: string; estado: string } | { codigo: string; estado: string }[] | null
  })[]).map((f) => {
    const v = Array.isArray(f.venta) ? f.venta[0] : f.venta
    return {
      ...f,
      total: Number(f.total),
      venta_codigo: v?.codigo ?? null,
      venta_estado: v?.estado ?? null,
    }
  })
}

/*
  Anular, con motivo.

  El motivo lo exige la base, no la pantalla: un comprobante que se le
  entregó a alguien y después desaparece sin explicación es exactamente
  lo que este módulo tiene prohibido. Si era un remito, la base también
  devuelve la mercadería al stock.
*/
export async function anularNoFiscal(id: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('anular_comprobante_no_fiscal', {
    p_id: id,
    p_motivo: motivo,
  })
  if (error) throw new Error(error.message)
}

export interface RemitoSinCobrar {
  id: string
  serie: string
  numero: number
  fecha: string
  receptor_nombre: string
  total: number
  entrega_domicilio: string | null
  entrega_localidad: string | null
  venta_codigo: string
  dias: number
}

/*
  Remitos entregados cuya venta todavía no se cobró.

  Es stock que salió del local y plata que no entró. Sin este panel un
  remito olvidado no aparece en ninguna pantalla: el inventario está
  bien —la mercadería realmente no está— pero nadie está mirando que
  falta cobrarla.
*/
export async function remitosSinCobrar(): Promise<RemitoSinCobrar[]> {
  const { data, error } = await supabase
    .from('remito_sin_cobrar')
    .select('id, serie, numero, fecha, receptor_nombre, total, entrega_domicilio, entrega_localidad, venta_codigo, dias')
    .order('dias', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as RemitoSinCobrar[]).map((r) => ({
    ...r,
    total: Number(r.total),
    dias: Number(r.dias),
  }))
}

export interface VentaParaRemitir {
  id: string
  codigo: string
  estado: string
  total: number
  ocurrido_en: string
  cliente_nombre: string
  cliente_domicilio: string | null
  cliente_localidad: string | null
  cliente_telefono: string | null
}

/*
  Las ventas a las que se les puede hacer un remito.

  Se excluyen las anuladas y las que ya tienen uno emitido. Un segundo
  remito sobre la misma venta es un caso real —una entrega parcial y
  después el resto— pero exige elegir qué líneas van en cada uno, y eso
  es trabajo aparte: hacerlo mal duplicaría la salida de stock.
*/
export async function ventasParaRemitir(busqueda: string): Promise<VentaParaRemitir[]> {
  const { data: conRemito } = await supabase
    .from('comprobante_no_fiscal')
    .select('venta_id')
    .eq('tipo_clave', 'remito')
    .neq('estado', 'anulado')
    .not('venta_id', 'is', null)

  const yaTienen = new Set((conRemito ?? []).map((r) => r.venta_id as string))

  let q = supabase
    .from('venta')
    .select(
      `id, codigo, estado, total, ocurrido_en,
       cliente:cliente_id(nombre, calle, numero, piso_depto, localidad, telefono)`,
    )
    .neq('estado', 'anulada')
    .order('ocurrido_en', { ascending: false })
    .limit(100)

  const texto = busqueda.trim()
  if (texto) q = q.ilike('codigo', `%${texto}%`)

  const { data, error } = await q
  if (error) throw new Error(error.message)

  type Cliente = {
    nombre: string
    calle: string | null
    numero: string | null
    piso_depto: string | null
    localidad: string | null
    telefono: string | null
  }

  return ((data ?? []) as unknown as (Omit<
    VentaParaRemitir,
    'cliente_nombre' | 'cliente_domicilio' | 'cliente_localidad' | 'cliente_telefono'
  > & { cliente: Cliente | Cliente[] | null })[])
    .filter((v) => !yaTienen.has(v.id))
    .map((v) => {
      const c = Array.isArray(v.cliente) ? v.cliente[0] : v.cliente
      const domicilio = [c?.calle, c?.numero, c?.piso_depto].filter(Boolean).join(' ')
      return {
        id: v.id,
        codigo: v.codigo,
        estado: v.estado,
        total: Number(v.total),
        ocurrido_en: v.ocurrido_en,
        cliente_nombre: c?.nombre ?? '—',
        cliente_domicilio: domicilio || null,
        cliente_localidad: c?.localidad ?? null,
        cliente_telefono: c?.telefono ?? null,
      }
    })
}

/** Días que vale un presupuesto, salvo que se diga otra cosa. */
export const DIAS_VALIDEZ_PRESUPUESTO = 15

/*
  El presupuesto que el cliente se lleva a pensar.

  La venta se guarda en BORRADOR, no en la cola de la caja: nadie la está
  esperando para cobrar. Si el cliente vuelve, esa venta ya está armada y
  sólo hay que mandarla a cobrar — no se vuelve a cargar nada, que es
  justamente lo que un presupuesto tiene que ahorrar.

  Necesita conexión, y se avisa antes de armar nada. Un presupuesto que
  se guarda pero no se puede imprimir no le sirve a nadie: el cliente se
  tiene que ir con el papel en la mano.
*/
export async function emitirPresupuesto(
  ventaId: string,
  terminalId: string | null,
  serie: string | null = null,
  diasValidez = DIAS_VALIDEZ_PRESUPUESTO,
): Promise<string> {
  const hasta = new Date()
  hasta.setDate(hasta.getDate() + diasValidez)

  const { id } = await emitirNoFiscal(ventaId, 'presupuesto', terminalId, {
    serie,
    validoHasta: hasta.toISOString().slice(0, 10),
  })
  return id
}

/*
  El cliente volvió: el presupuesto pasa a la cola de la caja.

  No se convierte en factura acá — se convierte en una venta lista para
  cobrar, y la factura sale al cobrarla, por el camino de siempre. Meter
  un segundo camino a la facturación sería tener dos lugares donde se
  decide lo mismo.
*/
export async function mandarPresupuestoACaja(ventaId: string): Promise<void> {
  const { error } = await supabase
    .from('venta')
    .update({ estado: 'en_caja', enviada_caja_en: new Date().toISOString() })
    .eq('id', ventaId)
    .eq('estado', 'borrador')
  if (error) throw new Error(error.message)
}

/*
  El listado a CSV.

  "Registro, veo y exporto" — punto 12 de Lucas, que él mismo planteó
  como criterio y no como pedido. Un listado que no se puede sacar del
  sistema obliga a copiarlo a mano, y ahí es donde aparecen los números
  que no coinciden con nada.

  Separador de punto y coma y BOM al principio: es lo que hace que Excel
  en español abra el archivo con las columnas separadas y los acentos
  bien, sin que nadie tenga que importar nada.
*/
export function aCsv(filas: FilaNoFiscal[]): string {
  const escapar = (v: string | number | null) => {
    const t = String(v ?? '')
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }

  const cabecera = [
    'Tipo',
    'Numero',
    'Fecha',
    'Cliente',
    'Total',
    'Estado',
    'Destino',
    'Transporte',
    'Venta',
  ]

  const lineas = filas.map((f) =>
    [
      ETIQUETA_NO_FISCAL[f.tipo_clave],
      numeroNoFiscal(f.tipo_clave, f.serie, f.numero),
      f.fecha,
      f.receptor_nombre,
      // Coma decimal: es lo que espera Excel en español.
      f.total.toFixed(2).replace('.', ','),
      f.estado,
      f.entrega_localidad ?? '',
      f.transportista ?? '',
      f.venta_codigo ?? '',
    ]
      .map(escapar)
      .join(';'),
  )

  return '\uFEFF' + [cabecera.join(';'), ...lineas].join('\r\n')
}

/*
  Bajar el archivo.

  Adentro del programa instalado un enlace de descarga no siempre hace
  algo, así que se abre en una ventana y se deja que el sistema resuelva.
  En el navegador es una descarga común.
*/
export function descargarCsv(nombre: string, contenido: string) {
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
