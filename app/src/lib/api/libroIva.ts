import { supabase } from '@/lib/supabase'
import type { Celda, ColumnaDeListado, Listado } from '@/lib/importacion/exportar'

/*
  ─────────────────────────────────────────────────────────────
  La exportación de ventas para el contador

  ─── QUÉ ES Y QUÉ NO ES ───

  **No armamos el Libro de IVA.** Lo arma el contador. Y las facturas
  de COMPRA las baja él de ARCA, de *Mis Comprobantes*, donde ya están
  todas las que le emitieron a Gross.

  Lo único que Gross tiene que entregarle es **un Excel con sus
  ventas**. Eso es este archivo.

  Aclarado por Francisco el 09/09, y cambió el tamaño del trabajo: se
  pensaba que había que producir el libro entero, quizás en el formato
  oficial de ARCA. Es una exportación.

  ─── POR QUÉ NO HIZO FALTA TOCAR LA BASE ───

  Todo lo que un libro de IVA Ventas necesita ya se guarda desde
  agosto:

  · `comprobante` — fecha, receptor completo, neto gravado, no gravado,
    exento, IVA total, tributos y total
  · `comprobante_alicuota` — base imponible e importe **por alícuota**,
    que es exactamente la forma que pide el libro
  · `comprobante_tributo` — las percepciones, con su base y su importe

  ─── EL FORMATO, EL DEL CONTADOR ───

  El 16/11 el contador mandó cómo lo quiere: **las mismas columnas que
  Mis Comprobantes Emitidos de ARCA**, una fila por comprobante, con
  las notas de crédito en negativo. Antes salía una fila por alícuota y
  con columnas propias (signo, condición de IVA, alícuota); se cambió a
  la suya para que lo use sin retocar nada.

  Una factura con 21 % y 10,5 % queda en una fila con los netos e IVA
  sumados, igual que en ARCA. Las percepciones no van: él tampoco las
  tiene en esa planilla, y salen en su propio archivo.
  ─────────────────────────────────────────────────────────────
*/

export interface FilaLibroIva {
  /** +1 en una factura, −1 en una nota de crédito. Ya viene aplicado a los importes. */
  signo: number
  /** dd/mm/aaaa, que es lo que el Excel de Gross toma como fecha. */
  fecha: string
  /** Con el código de ARCA adelante: «1 - Factura A». */
  tipo: string
  punto_venta: number
  numero: number
  /** Siempre vacío: cada comprobante es una fila. Está porque ARCA lo trae. */
  numero_hasta: string
  cae: string | null
  /** «CUIT», o el código de ARCA del documento (96 DNI, 99 sin identificar), como en ARCA. */
  tipo_documento: string
  documento: string
  cliente: string
  tipo_cambio: number
  moneda: string
  neto_gravado: number
  no_gravado: number
  exento: number
  iva: number
  total: number
  /** No va en el archivo; sirve para avisarlo en pantalla. */
  percepciones: number
}

/** 2026-10-01 → 01/10/2026. */
export function fechaArgentina(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export interface CrudoComprobante {
  fecha: string
  numero: number
  neto_gravado: number | string
  neto_no_gravado: number | string
  exento: number | string
  iva_total: number | string
  tributos_total: number | string
  total: number | string
  cae: string | null
  moneda: string | null
  cotizacion: number | string | null
  receptor_nombre: string
  receptor_tipo_documento_id: number | null
  receptor_documento: string | null
  tipo:
    | { id: number; descripcion: string; signo: number }
    | { id: number; descripcion: string; signo: number }[]
    | null
  punto: { numero: number } | { numero: number }[] | null
}

const uno = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

/*
  Un comprobante, como fila del archivo.

  Afuera de la consulta para poder probar las reglas sin base: el signo
  de la nota de crédito, el tipo con su código y el documento como lo
  muestra ARCA.
*/
export function comoFilaDeVenta(c: CrudoComprobante): FilaLibroIva {
  const tipo = uno(c.tipo)
  const punto = uno(c.punto)

  /*
    El signo del tipo de comprobante: +1 en una factura, −1 en una nota
    de crédito. Sumar la columna «Imp. Total» tiene que dar el mes; con
    las notas de crédito en positivo daría de más, y el error es
    silencioso. El contador las tiene así en su planilla.
  */
  const signo = tipo?.signo ?? 1
  const tipoDoc = c.receptor_tipo_documento_id ?? 99

  return {
    signo,
    fecha: fechaArgentina(c.fecha),
    tipo: tipo ? `${tipo.id} - ${tipo.descripcion}` : '',
    punto_venta: punto?.numero ?? 0,
    numero: c.numero,
    numero_hasta: '',
    cae: c.cae,
    tipo_documento: tipoDoc === 80 ? 'CUIT' : String(tipoDoc),
    documento: tipoDoc === 99 ? '0' : (c.receptor_documento ?? '0'),
    cliente: c.receptor_nombre,
    tipo_cambio: Number(c.cotizacion ?? 1),
    moneda: !c.moneda || c.moneda === 'PES' ? '$' : c.moneda,
    neto_gravado: signo * Number(c.neto_gravado),
    no_gravado: signo * Number(c.neto_no_gravado),
    exento: signo * Number(c.exento),
    iva: signo * Number(c.iva_total),
    total: signo * Number(c.total),
    percepciones: signo * Number(c.tributos_total),
  }
}

/**
 * Las ventas de un período, una fila por comprobante.
 *
 * Se traen sólo los comprobantes que existen para el fisco: los
 * autorizados y los emitidos por contingencia. Un pendiente o un
 * rechazado no tiene CAE, no le fue informado a ARCA y no puede entrar
 * en un libro de IVA — meterlo sería declarar algo que no existe.
 */
export async function ventasParaElContador(
  desde: string,
  hasta: string,
): Promise<FilaLibroIva[]> {
  const { data, error } = await supabase
    .from('comprobante')
    .select(
      `fecha, numero, neto_gravado, neto_no_gravado, exento, iva_total,
       tributos_total, total, cae, moneda, cotizacion,
       receptor_nombre, receptor_tipo_documento_id, receptor_documento,
       tipo:tipo_comprobante_id(id, descripcion, signo),
       punto:punto_venta_id(numero)`,
    )
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .in('estado', ['autorizado', 'contingencia', 'informado'])
    .order('fecha')
    .order('numero')

  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as CrudoComprobante[]).map(comoFilaDeVenta)
}

// Los títulos, tal cual los trae ARCA en Mis Comprobantes Emitidos.
const COLUMNAS: ColumnaDe<FilaLibroIva>[] = [
  { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
  { clave: 'tipo', titulo: 'Tipo', ancho: 20 },
  { clave: 'punto_venta', titulo: 'Punto de venta', tipo: 'numero' },
  { clave: 'numero', titulo: 'Número Desde', tipo: 'numero' },
  { clave: 'numero_hasta', titulo: 'Número hasta' },
  { clave: 'cae', titulo: 'Cód. Autorización', ancho: 17 },
  { clave: 'tipo_documento', titulo: 'Tipo Doc. Receptor' },
  { clave: 'documento', titulo: 'Nro. Doc. Receptor' },
  { clave: 'cliente', titulo: 'Denominación Receptor', ancho: 30 },
  { clave: 'tipo_cambio', titulo: 'Tipo Cambio', tipo: 'numero' },
  { clave: 'moneda', titulo: 'Moneda' },
  { clave: 'neto_gravado', titulo: 'Imp. Neto Gravado', tipo: 'importe' },
  { clave: 'no_gravado', titulo: 'Imp. Neto No Gravado', tipo: 'importe' },
  { clave: 'exento', titulo: 'Imp. Op. Exentas', tipo: 'importe' },
  { clave: 'iva', titulo: 'IVA', tipo: 'importe' },
  { clave: 'total', titulo: 'Imp. Total', tipo: 'importe' },
]

type ColumnaDe<T> = ColumnaDeListado & { clave: keyof T }

/*
  El listado que se baja como Excel (.xlsx): títulos, una fila por
  registro y, si hace falta, renglones sueltos arriba. Los importes van
  como número —con su signo— para que sumar la columna dé el mes.
*/
function armarListado<T>(filas: T[], columnas: ColumnaDe<T>[], antes: string[] = []): Listado {
  const valor = (v: unknown): Celda =>
    v === null || v === undefined ? null : typeof v === 'number' ? v : String(v)
  return {
    antes,
    columnas: columnas.map(({ titulo, tipo, ancho }) => ({ titulo, tipo, ancho })),
    filas: filas.map((f) => columnas.map((c) => valor(f[c.clave]))),
  }
}

export function ventasAListado(filas: FilaLibroIva[]): Listado {
  return armarListado(filas, COLUMNAS)
}

/*
  ─────────────────────────────────────────────────────────────
  Las percepciones de IIBB, para la presentación ante Rentas

  ─── POR QUÉ ES UN ARCHIVO APARTE Y NO UNA COLUMNA MÁS ───

  El de arriba es el de VENTAS y lleva la percepción como un total por
  comprobante, que es lo que un libro de IVA necesita. Lo que Rentas
  pide es otra cosa: **una fila por percepción**, con la base sobre la
  que se calculó, la alícuota aplicada y a quién se le percibió.

  Gross es **agente de percepción** de IIBB en Misiones —régimen 14, RG
  DGR 012/93, número de agente = su CUIT— y eso lo confirmó el contador
  por escrito. **No es agente de retención**, así que no practica
  retenciones y no hay comprobantes de retención que emitir. La
  distinción importa porque son dos regímenes con dos presentaciones
  distintas, y confundirlos manda a construir lo que no es.

  ─── LO QUE NO SE HACE ACÁ, A PROPÓSITO ───

  No se produce el archivo con el formato oficial de la aplicación de
  Rentas. Es el mismo criterio que con el libro de IVA: **lo presenta el
  contador**, y lo que necesita de Gross es el detalle en algo que abra
  en Excel. Producir un formato oficial sin tenerlo confirmado sería
  adivinar un ancho de campo.
  ─────────────────────────────────────────────────────────────
*/

export interface FilaPercepcion {
  /** +1 en una factura, −1 en una nota de crédito. Ya viene aplicado. */
  signo: number
  fecha: string
  tipo: string
  punto_venta: number
  numero: number
  cliente: string
  documento: string | null
  concepto: string
  base_imponible: number
  alicuota: number | null
  importe: number
}

export interface CrudoTributo {
  descripcion: string | null
  base_imponible: number | string
  alicuota: number | string | null
  importe: number | string
  comprobante: {
    fecha: string
    numero: number
    receptor_nombre: string
    receptor_documento: string | null
    tipo: { descripcion: string; signo: number } | { descripcion: string; signo: number }[]
    punto: { numero: number } | { numero: number }[]
  } | null
}

/*
  Una percepción, como va en el archivo.

  Está afuera de la consulta para poder probar la regla del signo sin
  una base de datos de por medio: **la nota de crédito devuelve la
  percepción, así que resta**. Si sumara en positivo, la declaración
  diría que se percibió más de lo que se percibió — y esa diferencia se
  paga.

  Los importes llegan siempre positivos de la base; el signo lo pone el
  tipo de comprobante. Es la misma decisión que en las compras: dos
  formas de representar lo mismo terminan contradiciéndose.
*/
export function comoFilaDePercepcion(t: CrudoTributo): FilaPercepcion {
  const c = t.comprobante!
  const tipo = uno(c.tipo)
  const punto = uno(c.punto)
  const signo = tipo?.signo ?? 1

  return {
    signo,
    fecha: c.fecha,
    tipo: tipo?.descripcion ?? '',
    punto_venta: punto?.numero ?? 0,
    numero: c.numero,
    cliente: c.receptor_nombre,
    documento: c.receptor_documento,
    concepto: t.descripcion ?? 'Percepción de IIBB',
    base_imponible: signo * Number(t.base_imponible),
    alicuota: t.alicuota === null ? null : Number(t.alicuota),
    importe: signo * Number(t.importe),
  }
}

export async function percepcionesParaRentas(
  desde: string,
  hasta: string,
): Promise<FilaPercepcion[]> {
  const { data, error } = await supabase
    .from('comprobante_tributo')
    .select(
      `descripcion, base_imponible, alicuota, importe,
       comprobante:comprobante_id!inner(
         fecha, numero, receptor_nombre, receptor_documento, estado,
         tipo:tipo_comprobante_id(descripcion, signo),
         punto:punto_venta_id(numero)
       )`,
    )
    .gte('comprobante.fecha', desde)
    .lte('comprobante.fecha', hasta)
    .in('comprobante.estado', ['autorizado', 'contingencia', 'informado'])

  if (error) throw new Error(error.message)

  const filas = ((data ?? []) as unknown as CrudoTributo[])
    .filter((t) => t.comprobante)
    .map(comoFilaDePercepcion)

  // El orden lo pone la pantalla y no la base: la consulta filtra por
  // una tabla embebida y el orden por esa tabla no viaja.
  return filas.sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.punto_venta - b.punto_venta || a.numero - b.numero,
  )
}

const COLUMNAS_PERCEPCION: ColumnaDe<FilaPercepcion>[] = [
  { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
  { clave: 'tipo', titulo: 'Tipo de comprobante', ancho: 20 },
  { clave: 'signo', titulo: 'Signo', tipo: 'numero' },
  { clave: 'punto_venta', titulo: 'Punto de venta', tipo: 'numero' },
  { clave: 'numero', titulo: 'Número', tipo: 'numero' },
  { clave: 'cliente', titulo: 'Cliente percibido', ancho: 30 },
  { clave: 'documento', titulo: 'CUIT / DNI' },
  { clave: 'concepto', titulo: 'Concepto', ancho: 26 },
  { clave: 'base_imponible', titulo: 'Base imponible', tipo: 'importe' },
  { clave: 'alicuota', titulo: 'Alícuota %', tipo: 'numero' },
  { clave: 'importe', titulo: 'Percibido', tipo: 'importe' },
]

export function percepcionesAListado(filas: FilaPercepcion[]): Listado {
  return armarListado(filas, COLUMNAS_PERCEPCION)
}

export function totalesDePercepciones(filas: FilaPercepcion[]) {
  return {
    percepciones: filas.length,
    // Los clientes se cuentan por documento: es lo que identifica al
    // percibido en la presentación, no el nombre.
    clientes: new Set(filas.map((f) => f.documento ?? f.cliente)).size,
    base: filas.reduce((s, f) => s + f.base_imponible, 0),
    percibido: filas.reduce((s, f) => s + f.importe, 0),
  }
}

/** Los totales del período, para poder controlar el archivo de un vistazo. */
export function totales(filas: FilaLibroIva[]) {
  return {
    comprobantes: filas.length,
    neto: filas.reduce((s, f) => s + f.neto_gravado, 0),
    iva: filas.reduce((s, f) => s + f.iva, 0),
    percepciones: filas.reduce((s, f) => s + f.percepciones, 0),
    total: filas.reduce((s, f) => s + f.total, 0),
  }
}

/*
  ─────────────────────────────────────────────────────────────
  Las compras del mes, para el contador

  El contador baja las facturas de compra de ARCA (Mis Comprobantes), así
  que esto no es imprescindible para él. Existe porque las facturas ya se
  cargan en el sistema desde el 10/09, y con este archivo puede
  controlar lo cargado contra lo que tiene ARCA sin pedirle nada a nadie.
  Decidido el 28/09.

  El formato es el que mandó el 16/11, el de su programa: arriba el
  comercio, el CUIT y el período; después **una fila por comprobante**,
  con el tipo abreviado (Fac, N.C., N.D.), exento y no gravado en una
  sola columna, y cada percepción en la suya. Las notas de crédito en
  negativo, para que sumar la columna dé el mes.
  ─────────────────────────────────────────────────────────────
*/

export interface FilaLibroCompras {
  signo: number
  fecha: string
  tipo: string
  letra: string | null
  suc: number
  numero: number
  proveedor: string
  cuit: string | null
  neto: number
  iva: number
  imp_internos: number
  exento_no_gravado: number
  perc_dgr: number
  perc_iva: number
  perc_ganancias: number
  ret_suss: number
  /** Lo cargado como «Otro»: no tiene columna en su planilla y no puede perderse. */
  otros: number
  total: number
}

export interface CrudoCompra {
  fecha: string
  punto_venta: number
  numero: number
  neto_gravado: number | string
  neto_no_gravado: number | string
  exento: number | string
  iva_total: number | string
  total: number | string
  proveedor: { nombre: string; numero_documento: string | null } | { nombre: string; numero_documento: string | null }[] | null
  tipo:
    | { descripcion: string; clase: string | null; familia: string | null; signo: number }
    | { descripcion: string; clase: string | null; familia: string | null; signo: number }[]
    | null
  compra_tributo: { descripcion: string; importe: number | string }[] | null
}

const TIPO_ABREVIADO: Record<string, string> = {
  factura: 'Fac',
  nota_credito: 'N.C.',
  nota_debito: 'N.D.',
}

/*
  En qué columna va cada concepto de la pantalla de Compras. La
  retención de ganancias va en «Perc.GAN.», que es la columna de
  ganancias que tiene su planilla.
*/
const COLUMNA_DEL_TRIBUTO: Record<string, keyof FilaLibroCompras> = {
  'Percepción de IIBB': 'perc_dgr',
  'Percepción de IVA': 'perc_iva',
  'Retención de Ganancias': 'perc_ganancias',
  'Retención SUSS': 'ret_suss',
  'Impuestos internos': 'imp_internos',
}

/** Una factura de compra, como fila del archivo. */
export function comoFilaDeCompra(c: CrudoCompra): FilaLibroCompras {
  const tipo = uno(c.tipo)
  const proveedor = uno(c.proveedor)
  const signo = tipo?.signo ?? 1

  const fila: FilaLibroCompras = {
    signo,
    fecha: fechaArgentina(c.fecha),
    tipo: TIPO_ABREVIADO[tipo?.familia ?? ''] ?? tipo?.descripcion ?? '',
    letra: tipo?.clase ?? null,
    suc: c.punto_venta,
    numero: c.numero,
    proveedor: proveedor?.nombre ?? '',
    cuit: proveedor?.numero_documento ?? null,
    neto: signo * Number(c.neto_gravado),
    iva: signo * Number(c.iva_total),
    imp_internos: 0,
    exento_no_gravado: signo * (Number(c.exento) + Number(c.neto_no_gravado)),
    perc_dgr: 0,
    perc_iva: 0,
    perc_ganancias: 0,
    ret_suss: 0,
    otros: 0,
    total: signo * Number(c.total),
  }

  for (const t of c.compra_tributo ?? []) {
    const columna = COLUMNA_DEL_TRIBUTO[t.descripcion] ?? 'otros'
    ;(fila[columna] as number) += signo * Number(t.importe)
  }
  return fila
}

export async function comprasParaElContador(desde: string, hasta: string): Promise<FilaLibroCompras[]> {
  const { data, error } = await supabase
    .from('compra')
    .select(
      `fecha, punto_venta, numero, neto_gravado, neto_no_gravado, exento, iva_total, total,
       proveedor:proveedor_id(nombre, numero_documento),
       tipo:tipo_comprobante_id(descripcion, clase, familia, signo),
       compra_tributo(descripcion, importe)`,
    )
    .is('eliminado_en', null)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha')
    .order('numero')

  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as CrudoCompra[]).map(comoFilaDeCompra)
}

// Los títulos, tal cual vienen en la planilla del contador.
const COLUMNAS_COMPRAS: ColumnaDe<FilaLibroCompras>[] = [
  { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
  { clave: 'tipo', titulo: 'Tipo Comp.' },
  { clave: 'letra', titulo: 'Letra' },
  { clave: 'suc', titulo: 'Suc', tipo: 'numero' },
  { clave: 'numero', titulo: 'Numero', tipo: 'numero' },
  { clave: 'proveedor', titulo: 'Proveedor', ancho: 30 },
  { clave: 'cuit', titulo: 'Cuit' },
  { clave: 'neto', titulo: 'Neto', tipo: 'importe' },
  { clave: 'iva', titulo: 'Iva', tipo: 'importe' },
  { clave: 'imp_internos', titulo: 'Imp.Int.', tipo: 'importe' },
  { clave: 'exento_no_gravado', titulo: 'Exento y No Grabado', tipo: 'importe' },
  { clave: 'perc_dgr', titulo: 'Perc.DGR', tipo: 'importe' },
  { clave: 'perc_iva', titulo: 'Perc.IVA', tipo: 'importe' },
  { clave: 'perc_ganancias', titulo: 'Perc.GAN.', tipo: 'importe' },
  { clave: 'ret_suss', titulo: 'Ret.Sus.', tipo: 'importe' },
  { clave: 'otros', titulo: 'Otros', tipo: 'importe' },
  { clave: 'total', titulo: 'Total', tipo: 'importe' },
]

export interface EncabezadoDeCompras {
  nombre: string
  razonSocial: string
  cuit: string
  desde: string
  hasta: string
}

/** 20146369767 → 20-14636976-7. */
function cuitConGuiones(cuit: string): string {
  const d = cuit.replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : cuit
}

export function comprasAListado(filas: FilaLibroCompras[], e: EncabezadoDeCompras): Listado {
  return armarListado(filas, COLUMNAS_COMPRAS, [
    e.nombre.toUpperCase(),
    `${e.razonSocial} Cuit: ${cuitConGuiones(e.cuit)}`,
    '',
    'Mis comprobantes recibidos',
    `Periodo Desde: ${fechaArgentina(e.desde)} Hasta: ${fechaArgentina(e.hasta)}`,
  ])
}

export function totalesDeCompras(filas: FilaLibroCompras[]) {
  return {
    comprobantes: filas.length,
    neto: filas.reduce((s, f) => s + f.neto, 0),
    iva: filas.reduce((s, f) => s + f.iva, 0),
    percepciones: filas.reduce(
      (s, f) => s + f.imp_internos + f.perc_dgr + f.perc_iva + f.perc_ganancias + f.ret_suss + f.otros,
      0,
    ),
    total: filas.reduce((s, f) => s + f.total, 0),
  }
}
