import { supabase } from '@/lib/supabase'
import type { Celda, ColumnaDeListado, Listado } from '@/lib/importacion/exportar'

/*
  ─────────────────────────────────────────────────────────────
  Buscar comprobantes: por número, por cliente y por fecha

  Pedido de Lucas el 19/10, con la pantalla de Proformas de OBTech como
  ejemplo —pestañas Clave, Fecha y Cliente—: ver todas las facturas,
  reimprimirlas y bajarlas. Y las percepciones igual, con el neto, el
  IVA y lo percibido de cada factura y el total al pie.

  Las dos pantallas —Facturas emitidas y Percepciones— son la misma
  búsqueda con distinto filtro de partida, y por eso viven acá juntas:
  los períodos, la lectura del número, los totales y el archivo.

  ─── EL SIGNO ───

  La base devuelve los importes positivos y el signo del tipo aparte
  (−1 en una nota de crédito). Se aplica acá, al sumar y al exportar:
  una nota de crédito devuelve la percepción, y si sumara en positivo
  el total diría que se percibió más de lo que se percibió. Es la misma
  regla que el archivo del contador.
  ─────────────────────────────────────────────────────────────
*/

export interface FilaBusqueda {
  id: string
  venta_id: string | null
  cliente_id: string | null
  estado: string
  modalidad: string
  tipo: string
  familia: 'factura' | 'nota_credito' | 'nota_debito'
  clase: string | null
  signo: number
  punto_venta: number
  numero: number
  comprobante: string
  fecha: string
  receptor_nombre: string
  receptor_documento: string | null
  neto_gravado: number
  neto_no_gravado: number
  exento: number
  iva_total: number
  tributos_total: number
  total: number
  cae: string | null
  cae_vencimiento: string | null
  impresiones: number
}

// ───────────────────────────────────────────────────────────────
// Los períodos
// ───────────────────────────────────────────────────────────────

export type Periodo = 'hoy' | 'semana' | 'mes' | 'mes_anterior' | 'anio' | 'personalizado'

export const ETIQUETA_PERIODO: Record<Periodo, string> = {
  hoy: 'Hoy',
  semana: 'Esta semana',
  mes: 'Este mes',
  mes_anterior: 'Mes anterior',
  anio: 'Este año',
  personalizado: 'Elegir fechas',
}

const dos = (n: number) => String(n).padStart(2, '0')

/** Una fecha como la guarda la base, en la hora del local y no en UTC. */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
}

/*
  Desde y hasta de un período, contando desde hoy.

  La semana arranca el lunes, como la cuenta cualquiera en el local: el
  domingo es el último día de la semana, no el primero de la que viene.
*/
export function rangoDe(periodo: Exclude<Periodo, 'personalizado'>, hoy = new Date()) {
  const a = hoy.getFullYear()
  const m = hoy.getMonth()
  switch (periodo) {
    case 'hoy':
      return { desde: isoLocal(hoy), hasta: isoLocal(hoy) }
    case 'semana': {
      const lunes = new Date(a, m, hoy.getDate() - ((hoy.getDay() + 6) % 7))
      const domingo = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6)
      return { desde: isoLocal(lunes), hasta: isoLocal(domingo) }
    }
    case 'mes':
      return { desde: isoLocal(new Date(a, m, 1)), hasta: isoLocal(new Date(a, m + 1, 0)) }
    case 'mes_anterior':
      return { desde: isoLocal(new Date(a, m - 1, 1)), hasta: isoLocal(new Date(a, m, 0)) }
    case 'anio':
      return { desde: `${a}-01-01`, hasta: `${a}-12-31` }
  }
}

// ───────────────────────────────────────────────────────────────
// El número
// ───────────────────────────────────────────────────────────────

/*
  Lo que se escribe en «Número».

  Se acepta como lo dice la gente y como sale impreso: «29», «1-29»,
  «0001-00000029» o «0001 00000029». Con punto de venta busca ése solo;
  sin él, el número en cualquier punto de venta —son pocos y casi
  nunca se pisan—. Lo que no es un número no filtra nada y se avisa.
*/
export function leerNumero(texto: string): { punto_venta: number | null; numero: number } | null {
  const t = texto.trim()
  if (!t) return null
  const partes = t.split(/[\s\-/]+/).filter(Boolean)
  if (partes.length > 2 || partes.some((p) => !/^\d+$/.test(p))) return null
  if (partes.length === 2) return { punto_venta: Number(partes[0]), numero: Number(partes[1]) }
  return { punto_venta: null, numero: Number(partes[0]) }
}

/*
  Un número de cualquier papel, con su serie si la tiene.

  Los papeles no fiscales y los recibos llevan como serie el prefijo del
  puesto, que puede tener letras («PRE CAJA1-00000010»); las facturas,
  el punto de venta. Las palabras sueltas sin números —la sigla, la
  letra de la factura, «N°»— se ignoran.
*/
export function leerPapel(texto: string): { serie: string | null; numero: number } | null {
  const partes = texto
    .split(/[\s\-/]+/)
    .map((p) => p.replace(/[.:#°º]/g, ''))
    .filter((p) => /\d/.test(p))
  if (!partes.length || partes.length > 2) return null
  const ultimo = partes[partes.length - 1]
  if (!/^\d+$/.test(ultimo) || !Number(ultimo)) return null
  return { serie: partes.length === 2 ? partes[0].toUpperCase() : null, numero: Number(ultimo) }
}

/** Si la serie de un papel es la que se escribió: «1» y «0001» son la misma; «CAJA1», tal cual. */
export function mismaSerie(serie: string | number, escrita: string | null): boolean {
  if (escrita == null) return true
  const s = String(serie).toUpperCase()
  if (/^\d+$/.test(s) && /^\d+$/.test(escrita)) return Number(s) === Number(escrita)
  return s === escrita
}

// ───────────────────────────────────────────────────────────────
// La consulta
// ───────────────────────────────────────────────────────────────

export type Familia = 'todas' | 'factura' | 'nota_credito' | 'nota_debito'
export type Situacion = 'validos' | 'todos' | 'sin_cae'

export interface Filtros {
  desde: string
  hasta: string
  /** Nombre o CUIT/DNI, como se escriba. */
  cliente?: string
  numero?: string
  familia?: Familia
  /** A, B o C. */
  letra?: string
  situacion?: Situacion
  soloConPercepcion?: boolean
}

/*
  Los que existen para el fisco: con CAE o con CAEA. Un pendiente o un
  rechazado no es un comprobante todavía, y un anulado ya no lo es; se
  ven eligiendo «Todos».
*/
const VALIDOS = ['autorizado', 'contingencia', 'informado']

/*
  Hasta cuántos se traen. Un mes de Gross son cientos, no miles; si una
  búsqueda pasa de esto, la pantalla lo dice y pide acotar las fechas en
  vez de mostrar un total que no es el total.
*/
export const TOPE = 5000
const PAGINA = 1000

export async function buscarComprobantes(
  f: Filtros,
): Promise<{ filas: FilaBusqueda[]; cortado: boolean }> {
  const num = leerNumero(f.numero ?? '')
  const cliente = (f.cliente ?? '').trim()

  const filas: FilaBusqueda[] = []
  for (let desde = 0; desde < TOPE; desde += PAGINA) {
    let q = supabase
      .from('vista_comprobante_busqueda')
      .select('*')
      .gte('fecha', f.desde)
      .lte('fecha', f.hasta)

    if (num) {
      q = q.eq('numero', num.numero)
      if (num.punto_venta !== null) q = q.eq('punto_venta', num.punto_venta)
    }
    if (cliente) {
      // Las comas y paréntesis rompen el «or» de la consulta; en un nombre
      // o un CUIT no hacen falta para encontrarlo.
      const limpio = cliente.replace(/[,()*%]/g, ' ').trim()
      const soloDigitos = limpio.replace(/\D/g, '')
      q = /^[\d\s.-]+$/.test(limpio) && soloDigitos
        ? q.ilike('receptor_documento', `%${soloDigitos}%`)
        : q.or(`receptor_nombre.ilike.%${limpio}%,receptor_documento.ilike.%${limpio}%`)
    }
    if (f.familia && f.familia !== 'todas') q = q.eq('familia', f.familia)
    if (f.letra) q = q.eq('clase', f.letra)
    if ((f.situacion ?? 'validos') === 'validos') q = q.in('estado', VALIDOS)
    if (f.situacion === 'sin_cae') q = q.in('estado', ['pendiente', 'rechazado'])
    if (f.soloConPercepcion) q = q.gt('tributos_total', 0)

    const { data, error } = await q
      .order('fecha', { ascending: true })
      .order('punto_venta', { ascending: true })
      .order('numero', { ascending: true })
      .range(desde, desde + PAGINA - 1)
    if (error) throw new Error(error.message)

    const pagina = (data ?? []) as FilaBusqueda[]
    filas.push(
      ...pagina.map((r) => ({
        ...r,
        neto_gravado: Number(r.neto_gravado),
        neto_no_gravado: Number(r.neto_no_gravado),
        exento: Number(r.exento),
        iva_total: Number(r.iva_total),
        tributos_total: Number(r.tributos_total),
        total: Number(r.total),
      })),
    )
    if (pagina.length < PAGINA) return { filas, cortado: false }
  }
  return { filas, cortado: true }
}

// ───────────────────────────────────────────────────────────────
// La búsqueda que dice la dirección
// ───────────────────────────────────────────────────────────────

/*
  Los filtros viven en la dirección de la página y no en la memoria de
  la pantalla: al abrir una factura y volver, la búsqueda sigue como
  estaba, y el listado para imprimir lee la misma sin que haya que
  pasársela de otra forma.
*/
export type Modo = 'facturas' | 'percepciones'

export interface Busqueda extends Filtros {
  periodo: Periodo
  agrupar: Agrupar
}

/** La búsqueda que dice la dirección, con lo que falta completado. */
export function busquedaDe(p: URLSearchParams, modo: Modo): Busqueda {
  const periodo = (p.get('p') as Periodo) || 'mes'
  const rango =
    periodo === 'personalizado'
      ? { desde: p.get('d') || rangoDe('mes').desde, hasta: p.get('h') || rangoDe('mes').hasta }
      : rangoDe(periodo in ETIQUETA_PERIODO ? periodo : 'mes')
  return {
    periodo: periodo in ETIQUETA_PERIODO ? periodo : 'mes',
    ...rango,
    cliente: p.get('c') ?? '',
    numero: p.get('n') ?? '',
    familia: (p.get('t') as Familia) || 'todas',
    letra: p.get('l') ?? '',
    situacion: (p.get('s') as Situacion) || 'validos',
    agrupar: (p.get('g') as Agrupar) || 'nada',
    soloConPercepcion: modo === 'percepciones',
  }
}

// ───────────────────────────────────────────────────────────────
// Totales y grupos
// ───────────────────────────────────────────────────────────────

export interface Totales {
  comprobantes: number
  neto: number
  iva: number
  percepciones: number
  total: number
}

const redondear = (n: number) => Math.round(n * 100) / 100

/*
  Los totales, con el signo aplicado.

  «Neto» suma el gravado, el no gravado y el exento: es lo que la
  factura dice antes de impuestos. En las de Gross casi todo es gravado;
  separarlos acá sería una columna vacía en la pantalla.
*/
export function totalesDe(filas: FilaBusqueda[]): Totales {
  const t = { comprobantes: filas.length, neto: 0, iva: 0, percepciones: 0, total: 0 }
  for (const f of filas) {
    t.neto += f.signo * (f.neto_gravado + f.neto_no_gravado + f.exento)
    t.iva += f.signo * f.iva_total
    t.percepciones += f.signo * f.tributos_total
    t.total += f.signo * f.total
  }
  return {
    comprobantes: t.comprobantes,
    neto: redondear(t.neto),
    iva: redondear(t.iva),
    percepciones: redondear(t.percepciones),
    total: redondear(t.total),
  }
}

export type Agrupar = 'nada' | 'semana' | 'mes'

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

const corta = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

/** A qué semana o mes pertenece una fecha, con el nombre que se le muestra. */
export function grupoDe(fecha: string, agrupar: Exclude<Agrupar, 'nada'>): { clave: string; titulo: string } {
  const [a, m, d] = fecha.split('-').map(Number)
  if (agrupar === 'mes') {
    return { clave: `${a}-${dos(m)}`, titulo: `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} ${a}` }
  }
  const dia = new Date(a, m - 1, d)
  const lunes = new Date(a, m - 1, d - ((dia.getDay() + 6) % 7))
  const domingo = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6)
  return {
    clave: isoLocal(lunes),
    titulo: `Semana del ${corta(isoLocal(lunes))} al ${corta(isoLocal(domingo))}`,
  }
}

export interface Grupo {
  clave: string
  titulo: string
  filas: FilaBusqueda[]
  totales: Totales
}

/*
  Los comprobantes partidos por semana o por mes, cada parte con su
  subtotal. Es lo que en la pantalla se elige como «Clasificar». Llegan
  ordenados por fecha, así que los grupos salen en orden solos.
*/
export function agruparPor(filas: FilaBusqueda[], agrupar: Agrupar): Grupo[] {
  if (agrupar === 'nada') return [{ clave: 'todo', titulo: '', filas, totales: totalesDe(filas) }]
  const grupos = new Map<string, Grupo>()
  for (const f of filas) {
    const { clave, titulo } = grupoDe(f.fecha, agrupar)
    const g = grupos.get(clave) ?? { clave, titulo, filas: [], totales: totalesDe([]) }
    g.filas.push(f)
    grupos.set(clave, g)
  }
  return [...grupos.values()]
    .sort((x, y) => x.clave.localeCompare(y.clave))
    .map((g) => ({ ...g, totales: totalesDe(g.filas) }))
}

// ───────────────────────────────────────────────────────────────
// El archivo
// ───────────────────────────────────────────────────────────────

/** La fecha como se lee en el local. */
export const fechaAr = (iso: string) => {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

/*
  El archivo de una búsqueda, para abrir en Excel (.xlsx).

  Los importes van con su signo, y al pie va la fila de totales —y la
  de cada semana o mes, si se clasificó—, igual que en pantalla: es la
  que pidieron poder ver y exportar. Esas filas salen en negrita.
*/
export function busquedaAListado(grupos: Grupo[], conPercepcion: boolean): Listado {
  const columnas: ColumnaDeListado[] = [
    { titulo: 'Fecha', tipo: 'fecha' },
    { titulo: 'Comprobante', ancho: 20 },
    { titulo: 'Letra', ancho: 6 },
    { titulo: 'Número', ancho: 16 },
    { titulo: 'Cliente', ancho: 30 },
    { titulo: 'CUIT / DNI' },
    { titulo: 'Neto', tipo: 'importe' },
    { titulo: 'IVA', tipo: 'importe' },
    ...(conPercepcion ? [{ titulo: 'Percepción', tipo: 'importe' as const }] : []),
    { titulo: 'Total', tipo: 'importe' },
    { titulo: 'CAE', ancho: 17 },
  ]
  const filas: Celda[][] = []
  const resaltadas: number[] = []

  const importes = (t: { neto: number; iva: number; percepciones: number; total: number }) => [
    t.neto,
    t.iva,
    ...(conPercepcion ? [t.percepciones] : []),
    t.total,
  ]

  for (const g of grupos) {
    for (const f of g.filas) {
      const neto = f.signo * (f.neto_gravado + f.neto_no_gravado + f.exento)
      filas.push([
        f.fecha,
        f.tipo,
        f.clase ?? null,
        f.comprobante,
        f.receptor_nombre,
        f.receptor_documento ?? null,
        ...importes({
          neto,
          iva: f.signo * f.iva_total,
          percepciones: f.signo * f.tributos_total,
          total: f.signo * f.total,
        }),
        f.cae ?? null,
      ])
    }
    if (grupos.length > 1) {
      resaltadas.push(filas.length)
      filas.push([null, `Subtotal ${g.titulo}`, null, null, `${g.totales.comprobantes} comprobantes`, null,
        ...importes(g.totales), null])
    }
  }

  const total = totalesDe(grupos.flatMap((g) => g.filas))
  resaltadas.push(filas.length)
  filas.push([null, 'TOTAL', null, null, `${total.comprobantes} comprobantes`, null, ...importes(total), null])

  return { columnas, filas, resaltadas }
}

/** Un nombre de archivo que dice qué tiene adentro. */
export function nombreDeArchivo(base: string, desde: string, hasta: string): string {
  return desde === hasta ? `${base}-${desde}.xlsx` : `${base}-${desde}-al-${hasta}.xlsx`
}
