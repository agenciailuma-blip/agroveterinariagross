import { supabase } from '@/lib/supabase'

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

  ─── UNA FILA POR ALÍCUOTA, NO POR COMPROBANTE ───

  Es la decisión de forma, y es la que un contador espera: una factura
  con 21% y 10,5% ocupa **dos renglones**, cada uno con su neto y su
  impuesto. Una sola fila con los dos netos sumados obliga a
  desarmarla a mano, que es justo lo que exportar viene a evitar.

  Los datos de cabecera —fecha, cliente, total— se repiten en los dos
  renglones. Es redundante y está bien: así cada fila se entiende sola
  y se puede filtrar y ordenar en Excel sin perder contexto.
  ─────────────────────────────────────────────────────────────
*/

export interface FilaLibroIva {
  /** +1 en una factura, −1 en una nota de crédito. Ya viene aplicado a los importes. */
  signo: number
  fecha: string
  tipo: string
  clase: string | null
  punto_venta: number
  numero: number
  cliente: string
  documento: string | null
  condicion_iva: string
  alicuota: number | null
  neto_gravado: number
  iva: number
  no_gravado: number
  exento: number
  percepciones: number
  total: number
  cae: string | null
  estado: string
}

interface CrudoAlicuota {
  alicuota_iva_id: number
  base_imponible: number
  importe: number
  alicuota: { porcentaje: number } | { porcentaje: number }[] | null
}

interface CrudoComprobante {
  id: string
  fecha: string
  numero: number
  neto_gravado: number
  neto_no_gravado: number
  exento: number
  iva_total: number
  tributos_total: number
  total: number
  cae: string | null
  estado: string
  receptor_nombre: string
  receptor_documento: string | null
  tipo:
    | { descripcion: string; clase: string | null; signo: number }
    | { descripcion: string; clase: string | null; signo: number }[]
    | null
  punto: { numero: number } | { numero: number }[] | null
  condicion: { descripcion: string } | { descripcion: string }[] | null
  comprobante_alicuota: CrudoAlicuota[] | null
}

const uno = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

/**
 * Las ventas de un período, desarmadas por alícuota.
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
      `id, fecha, numero, neto_gravado, neto_no_gravado, exento, iva_total,
       tributos_total, total, cae, estado,
       receptor_nombre, receptor_documento,
       tipo:tipo_comprobante_id(descripcion, clase, signo),
       punto:punto_venta_id(numero),
       condicion:receptor_condicion_iva_id(descripcion),
       comprobante_alicuota(alicuota_iva_id, base_imponible, importe,
                            alicuota:alicuota_iva_id(porcentaje))`,
    )
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .in('estado', ['autorizado', 'contingencia', 'informado'])
    .order('fecha')
    .order('numero')

  if (error) throw new Error(error.message)

  const filas: FilaLibroIva[] = []

  for (const c of (data ?? []) as unknown as CrudoComprobante[]) {
    const tipo = uno(c.tipo)
    const punto = uno(c.punto)
    const condicion = uno(c.condicion)

    /*
      El signo del tipo de comprobante: +1 en una factura, −1 en una
      nota de crédito. Se aplica a los importes.

      Es la decisión que hace que el archivo sirva: sumar la columna
      "Neto gravado" tiene que dar el neto del período. Con las notas
      de crédito en positivo daría de más, y el error es silencioso —
      un número plausible que está mal.

      Va además su propia columna, para que se vea de dónde sale y no
      parezca que el sistema devolvió importes negativos por error.
    */
    const signo = tipo?.signo ?? 1

    const cabecera = {
      fecha: c.fecha,
      tipo: tipo?.descripcion ?? '',
      clase: tipo?.clase ?? null,
      signo,
      punto_venta: punto?.numero ?? 0,
      numero: c.numero,
      cliente: c.receptor_nombre,
      documento: c.receptor_documento,
      condicion_iva: condicion?.descripcion ?? '',
      no_gravado: signo * Number(c.neto_no_gravado),
      exento: signo * Number(c.exento),
      percepciones: signo * Number(c.tributos_total),
      total: signo * Number(c.total),
      cae: c.cae,
      estado: c.estado,
    }

    const alicuotas = c.comprobante_alicuota ?? []

    if (alicuotas.length === 0) {
      /*
        Un comprobante sin alícuotas es legítimo: una factura
        íntegramente exenta o no gravada. Va igual, con la columna de
        alícuota vacía. Saltearlo dejaría un hueco en la numeración del
        libro, y un hueco es lo primero que un contador pregunta.
      */
      filas.push({ ...cabecera, alicuota: null, neto_gravado: 0, iva: 0 })
      continue
    }

    alicuotas.forEach((a, i) => {
      filas.push({
        ...cabecera,
        alicuota: Number(uno(a.alicuota)?.porcentaje ?? 0),
        neto_gravado: signo * Number(a.base_imponible),
        iva: signo * Number(a.importe),
        /*
          Los importes que son del comprobante y no de la alícuota —no
          gravado, exento, percepciones y total— van sólo en el primer
          renglón. Repetirlos en los dos haría que sumar la columna dé
          el doble, y sumar columnas es literalmente lo que se hace con
          este archivo.
        */
        ...(i > 0
          ? { no_gravado: 0, exento: 0, percepciones: 0, total: 0 }
          : {}),
      })
    })
  }

  return filas
}

const COLUMNAS: { clave: keyof FilaLibroIva; titulo: string }[] = [
  { clave: 'fecha', titulo: 'Fecha' },
  { clave: 'tipo', titulo: 'Tipo de comprobante' },
  { clave: 'clase', titulo: 'Letra' },
  { clave: 'signo', titulo: 'Signo' },
  { clave: 'punto_venta', titulo: 'Punto de venta' },
  { clave: 'numero', titulo: 'Número' },
  { clave: 'cliente', titulo: 'Cliente' },
  { clave: 'documento', titulo: 'CUIT / DNI' },
  { clave: 'condicion_iva', titulo: 'Condición IVA' },
  { clave: 'alicuota', titulo: 'Alícuota %' },
  { clave: 'neto_gravado', titulo: 'Neto gravado' },
  { clave: 'iva', titulo: 'IVA' },
  { clave: 'no_gravado', titulo: 'No gravado' },
  { clave: 'exento', titulo: 'Exento' },
  { clave: 'percepciones', titulo: 'Percepciones' },
  { clave: 'total', titulo: 'Total' },
  { clave: 'cae', titulo: 'CAE' },
]

/*
  El CSV que abre bien en el Excel que usa Gross.

  Tres cosas, y las tres importan: punto y coma como separador, coma
  decimal, y el BOM del principio para que los acentos no salgan rotos.
  Sin eso el archivo abre con todo en una sola columna y hay que
  rehacerlo a mano — que es justo lo que exportar viene a evitar.

  Es el mismo criterio que ya usa la exportación de comprobantes no
  fiscales, y está probado.
*/
function armarCsv<T>(filas: T[], columnas: { clave: keyof T; titulo: string }[]): string {
  const escapar = (v: unknown): string => {
    if (v === null || v === undefined) return ''
    if (typeof v === 'number') return String(v).replace('.', ',')
    const s = String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const encabezado = columnas.map((c) => c.titulo).join(';')
  const cuerpo = filas.map((f) => columnas.map((c) => escapar(f[c.clave])).join(';'))
  return [encabezado, ...cuerpo].join('\n')
}

export function aCsv(filas: FilaLibroIva[]): string {
  return armarCsv(filas, COLUMNAS)
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

const COLUMNAS_PERCEPCION: { clave: keyof FilaPercepcion; titulo: string }[] = [
  { clave: 'fecha', titulo: 'Fecha' },
  { clave: 'tipo', titulo: 'Tipo de comprobante' },
  { clave: 'signo', titulo: 'Signo' },
  { clave: 'punto_venta', titulo: 'Punto de venta' },
  { clave: 'numero', titulo: 'Número' },
  { clave: 'cliente', titulo: 'Cliente percibido' },
  { clave: 'documento', titulo: 'CUIT / DNI' },
  { clave: 'concepto', titulo: 'Concepto' },
  { clave: 'base_imponible', titulo: 'Base imponible' },
  { clave: 'alicuota', titulo: 'Alícuota %' },
  { clave: 'importe', titulo: 'Percibido' },
]

export function percepcionesACsv(filas: FilaPercepcion[]): string {
  return armarCsv(filas, COLUMNAS_PERCEPCION)
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
    comprobantes: new Set(filas.map((f) => `${f.punto_venta}-${f.numero}-${f.tipo}`)).size,
    neto: filas.reduce((s, f) => s + f.neto_gravado, 0),
    iva: filas.reduce((s, f) => s + f.iva, 0),
    percepciones: filas.reduce((s, f) => s + f.percepciones, 0),
    total: filas.reduce((s, f) => s + f.total, 0),
  }
}
