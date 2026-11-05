import { supabase } from '@/lib/supabase'

/*
  ─────────────────────────────────────────────────────────────
  Ingresos, egresos y el cierre de caja

  Pedido en la reunión del 05/11, mirando las pantallas del sistema
  anterior: la plata que entra o sale del cajón sin ser una venta, y un
  cierre que muestre cada medio de pago y se pueda imprimir.

  Todo pasa por la base (ver registrar_movimiento_caja y
  resumen_de_caja): el efectivo que tiene que haber se calcula en un solo
  lugar, el mismo que usa el cierre, para que la planilla y el arqueo no
  digan nunca dos números distintos.

  Necesita internet, igual que abrir y cerrar la caja: el cierre se
  calcula en el servidor, y un egreso que quedara en la terminal sin
  subir haría que el arqueo dé una diferencia que no existe.
  ─────────────────────────────────────────────────────────────
*/

export type CategoriaIngreso = 'ingreso' | 'saldo_anterior'
export type CategoriaEgreso = 'gasto' | 'anticipo_haberes' | 'pago_proveedor' | 'retiro_socios'
export type Categoria = CategoriaIngreso | CategoriaEgreso

export const CATEGORIAS_DE_INGRESO: { valor: CategoriaIngreso; nombre: string }[] = [
  { valor: 'ingreso', nombre: 'Ingreso a caja' },
  { valor: 'saldo_anterior', nombre: 'Saldo de caja anterior' },
]

export const CATEGORIAS_DE_EGRESO: { valor: CategoriaEgreso; nombre: string }[] = [
  { valor: 'gasto', nombre: 'Gasto autorizado' },
  { valor: 'anticipo_haberes', nombre: 'Anticipo de haberes' },
  { valor: 'pago_proveedor', nombre: 'Pago a proveedor o acreedor' },
  { valor: 'retiro_socios', nombre: 'Retiro de socios' },
]

/** Cómo se llama cada categoría en plural, para los subtotales de la planilla. */
export const TITULO_DE_CATEGORIA: Record<Categoria, string> = {
  ingreso: 'Ingresos a caja',
  saldo_anterior: 'Saldo de caja anterior',
  gasto: 'Gastos autorizados',
  anticipo_haberes: 'Anticipos de haberes',
  pago_proveedor: 'Pagos a proveedores y acreedores',
  retiro_socios: 'Retiros de socios',
}

/** Las que necesitan que se escriba de qué son. Las otras ya lo dicen solas. */
export function pideDescripcion(c: Categoria): boolean {
  return c === 'ingreso' || c === 'gasto'
}

export interface MovimientoCaja {
  id: string
  tipo: 'ingreso' | 'egreso'
  categoria: Categoria
  forma: 'efectivo' | 'cheques'
  /** Con signo: los egresos son negativos. */
  importe: number
  concepto: string
  excluir_del_cierre: boolean
  creado_en: string
  anulado_en: string | null
  motivo_anulacion: string | null
  usuario: string | null
  empleado: string | null
  proveedor: string | null
  cheques: { nombre: string; importe: number; fecha_pago: string }[]
}

export interface PorMedio {
  medio: string
  cantidad: number
  importe: number
  afecta_caja?: boolean
}

export interface ResumenCaja {
  caja: {
    id: string
    terminal: string | null
    cajero: string | null
    estado: 'abierta' | 'cerrada'
    abierta_en: string
    cerrada_en: string | null
    monto_inicial: number
    monto_declarado: number | null
    monto_esperado: number | null
    diferencia: number | null
  }
  ventas: {
    cantidad: number
    total: number
    anuladas: number
    por_medio: PorMedio[]
    por_documentacion: { documentacion: 'fiscal' | 'no_fiscal' | 'a_facturar'; cantidad: number; total: number }[]
  }
  cobranzas: {
    por_medio: PorMedio[]
    detalle: { numero: string; emitido_en: string; total: number; cliente: string | null; anulado: boolean; medios: string | null }[]
  }
  movimientos: MovimientoCaja[]
  cheques_recibidos: { nombre: string; importe: number; fecha_pago: string; cliente: string | null }[]
  efectivo: {
    inicial: number
    ventas: number
    cobranzas: number
    ingresos: number
    /** Negativo. */
    egresos: number
    /** Nulo mientras la caja está abierta: el arqueo es a ciegas. */
    esperado: number | null
  }
}

// La base devuelve los importes como texto (numeric): se pasan a número una vez, acá.
const n = (x: unknown) => (x == null ? 0 : Number(x))
const nn = (x: unknown) => (x == null ? null : Number(x))

function aNumeros(r: ResumenCaja): ResumenCaja {
  return {
    caja: {
      ...r.caja,
      monto_inicial: n(r.caja.monto_inicial),
      monto_declarado: nn(r.caja.monto_declarado),
      monto_esperado: nn(r.caja.monto_esperado),
      diferencia: nn(r.caja.diferencia),
    },
    ventas: {
      ...r.ventas,
      total: n(r.ventas.total),
      por_medio: r.ventas.por_medio.map((m) => ({ ...m, importe: n(m.importe) })),
      por_documentacion: r.ventas.por_documentacion.map((d) => ({ ...d, total: n(d.total) })),
    },
    cobranzas: {
      por_medio: r.cobranzas.por_medio.map((m) => ({ ...m, importe: n(m.importe) })),
      detalle: r.cobranzas.detalle.map((d) => ({ ...d, total: n(d.total) })),
    },
    movimientos: r.movimientos.map((m) => ({
      ...m,
      importe: n(m.importe),
      cheques: m.cheques.map((c) => ({ ...c, importe: n(c.importe) })),
    })),
    cheques_recibidos: r.cheques_recibidos.map((c) => ({ ...c, importe: n(c.importe) })),
    efectivo: {
      inicial: n(r.efectivo.inicial),
      ventas: n(r.efectivo.ventas),
      cobranzas: n(r.efectivo.cobranzas),
      ingresos: n(r.efectivo.ingresos),
      egresos: n(r.efectivo.egresos),
      esperado: nn(r.efectivo.esperado),
    },
  }
}

export async function resumenDeCaja(cajaId: string): Promise<ResumenCaja> {
  const { data, error } = await supabase.rpc('resumen_de_caja', { p_caja_id: cajaId })
  if (error) throw new Error(error.message)
  return aNumeros(data as ResumenCaja)
}

export interface MovimientoNuevo {
  categoria: Categoria
  importe: number
  concepto: string
  excluir: boolean
  empleadoId?: string | null
  proveedorId?: string | null
  /** Cheques de la cartera: sólo en un pago a un proveedor. El importe sale de ellos. */
  cheques?: string[]
}

export async function registrarMovimiento(cajaId: string, m: MovimientoNuevo): Promise<string> {
  if (!navigator.onLine) {
    throw new Error('Para cargar un ingreso o un egreso hace falta internet: el cierre se calcula en el servidor.')
  }
  const { data, error } = await supabase.rpc('registrar_movimiento_caja', {
    p_id: crypto.randomUUID(),
    p_caja_id: cajaId,
    p_categoria: m.categoria,
    p_importe: m.importe,
    p_concepto: m.concepto.trim() || null,
    p_excluir: m.excluir,
    p_empleado_id: m.categoria === 'anticipo_haberes' ? (m.empleadoId ?? null) : null,
    p_proveedor_id: m.categoria === 'pago_proveedor' ? (m.proveedorId ?? null) : null,
    p_cheques: m.cheques?.length ? m.cheques : null,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function anularMovimiento(id: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc('anular_movimiento_caja', { p_id: id, p_motivo: motivo })
  if (error) throw new Error(error.message)
}

/** A quién se le puede dar un anticipo: los usuarios activos del sistema, que son los empleados. */
export async function listarEmpleados(): Promise<{ id: string; nombre: string }[]> {
  const { data, error } = await supabase
    .from('usuario')
    .select('id, nombre')
    .eq('activo', true)
    .is('eliminado_en', null)
    .order('nombre')
  if (error) throw new Error(error.message)
  return data ?? []
}

export interface CierreAnterior {
  id: string
  estado: 'abierta' | 'cerrada'
  abierta_en: string
  cerrada_en: string | null
  monto_inicial: number
  monto_declarado: number | null
  monto_esperado: number | null
  diferencia: number | null
  terminal: { nombre: string } | null
  cajero: { nombre: string } | null
}

/** Las cajas de un período, la más nueva primero. */
export async function listarCierres(desde: string, hasta: string): Promise<CierreAnterior[]> {
  const { data, error } = await supabase
    .from('caja')
    .select(
      'id, estado, abierta_en, cerrada_en, monto_inicial, monto_declarado, monto_esperado, diferencia, terminal:terminal_id(nombre), cajero:cajero_id(nombre)',
    )
    .gte('abierta_en', `${desde}T00:00:00-03:00`)
    .lte('abierta_en', `${hasta}T23:59:59-03:00`)
    .order('abierta_en', { ascending: false })
    .limit(500)
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as CierreAnterior[]).map((c) => ({
    ...c,
    monto_inicial: n(c.monto_inicial),
    monto_declarado: nn(c.monto_declarado),
    monto_esperado: nn(c.monto_esperado),
    diferencia: nn(c.diferencia),
  }))
}

/*
  Los movimientos cargados a mano, agrupados para la planilla: un bloque
  por categoría con su subtotal. Lo anulado, lo que no va en el cierre y
  lo pagado con cheques se muestran pero no suman: el subtotal es
  efectivo, y tiene que coincidir con lo que descuenta el arqueo.
*/
export interface GrupoDeMovimientos {
  categoria: Categoria
  titulo: string
  movimientos: MovimientoCaja[]
  /** Con signo. Sólo lo que cuenta para el cierre. */
  total: number
}

export function cuentaParaElCierre(m: MovimientoCaja): boolean {
  return !m.anulado_en && !m.excluir_del_cierre && m.forma === 'efectivo'
}

export function agruparMovimientos(movimientos: readonly MovimientoCaja[]): GrupoDeMovimientos[] {
  const orden: Categoria[] = [
    'saldo_anterior',
    'ingreso',
    'gasto',
    'anticipo_haberes',
    'pago_proveedor',
    'retiro_socios',
  ]
  return orden
    .map((categoria) => {
      const de = movimientos.filter((m) => m.categoria === categoria)
      const total = de.filter(cuentaParaElCierre).reduce((s, m) => s + m.importe, 0)
      return { categoria, titulo: TITULO_DE_CATEGORIA[categoria], movimientos: de, total: Math.round(total * 100) / 100 }
    })
    .filter((g) => g.movimientos.length > 0)
}
