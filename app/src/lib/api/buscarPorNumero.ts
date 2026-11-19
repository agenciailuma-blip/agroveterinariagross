import { supabase } from '@/lib/supabase'
import { leerPapel, mismaSerie } from '@/lib/api/buscarComprobantes'
import { numeroNoFiscal, type TipoNoFiscal } from '@/lib/api/noFiscal'
import { listarRecibos, numeroRecibo } from '@/lib/api/recibos'
import type { Papel } from '@/lib/api/papeles'

/*
  ─────────────────────────────────────────────────────────────
  Un número, en todos los papeles

  Auditoría de integralidad, punto 8. Lo que emite el sistema está en
  ocho pestañas, y con un número en la mano («¿qué es el
  0001-00000123?») había que probar una por una. Esto lo busca en las
  facturas y notas, en los papeles no fiscales (presupuestos, proformas,
  remitos, comprobantes de entrega) y en los recibos, todo junto.

  Se escribe como sale impreso o como lo dice la gente: «123»,
  «1-123», «0001-00000123», y con la sigla delante si se la copia del
  papel («PRE CAJA1-00000012», «FAC B 1-23»): la sigla se ignora y la
  serie del puesto, con letras y todo, se respeta.

  Cada fuente se pregunta por separado: quien no tiene permiso para ver
  recibos igual encuentra las facturas.
  ─────────────────────────────────────────────────────────────
*/

export interface PapelEncontrado {
  papel: Papel
  /** Qué es, en palabras: «Factura B», «Presupuesto», «Recibo». */
  clase: string
  numero: string
  quien: string
  fecha: string
  total: number
  anulado: boolean
}

/*
  Con la sigla delante se busca sólo ese tipo: «PRE 10» es el presupuesto
  10, no también el remito 10. Sin sigla, todos.
*/
type Fuente = 'factura' | TipoNoFiscal | 'recibo'
const SIGLAS: [RegExp, Fuente][] = [
  [/^\s*pre(supuesto)?\b/i, 'presupuesto'],
  [/^\s*rem(ito)?\b/i, 'remito'],
  [/^\s*pro(forma)?\b/i, 'comprobante_interno'],
  [/^\s*ent(rega)?\b/i, 'comprobante_entrega'],
  [/^\s*rec(ibo)?\b/i, 'recibo'],
  [/^\s*(fac(tura)?|nc|nd|nota)\b/i, 'factura'],
]

export function siglaDe(texto: string): Fuente | null {
  return SIGLAS.find(([r]) => r.test(texto))?.[1] ?? null
}

const CLASE_NO_FISCAL: Record<TipoNoFiscal, string> = {
  presupuesto: 'Presupuesto',
  remito: 'Remito',
  comprobante_interno: 'Proforma',
  comprobante_entrega: 'Comprobante de entrega',
}


export async function buscarPorNumero(
  texto: string,
  permisos: { facturas: boolean; noFiscales: boolean; recibos: boolean },
): Promise<PapelEncontrado[]> {
  const leido = leerPapel(texto)
  if (!leido) return []
  const { serie, numero } = leido
  const sigla = siglaDe(texto)
  const busca = (f: Fuente) => sigla == null || sigla === f
  // Una factura tiene punto de venta, que es un número: con «CAJA1» no hay factura que buscar.
  const puntoVenta = serie == null ? null : /^\d+$/.test(serie) ? Number(serie) : NaN

  const facturas = async (): Promise<PapelEncontrado[]> => {
    if (!permisos.facturas || !busca('factura') || Number.isNaN(puntoVenta)) return []
    let q = supabase
      .from('vista_comprobante_estado')
      .select('id, tipo, comprobante, punto_venta, receptor_nombre, fecha, total, estado')
      .eq('numero', numero)
      .limit(20)
    if (puntoVenta != null) q = q.eq('punto_venta', puntoVenta)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return ((data ?? []) as {
      id: string
      tipo: string
      comprobante: string
      receptor_nombre: string
      fecha: string
      total: number
      estado: string
    }[]).map((c) => ({
      papel: { tipo: 'comprobante', id: c.id },
      clase: c.tipo,
      numero: c.comprobante,
      quien: c.receptor_nombre,
      fecha: c.fecha,
      total: Number(c.total),
      anulado: c.estado === 'anulado',
    }))
  }

  const noFiscales = async (): Promise<PapelEncontrado[]> => {
    if (!permisos.noFiscales || sigla === 'factura' || sigla === 'recibo') return []
    const { data, error } = await supabase
      .from('comprobante_no_fiscal')
      .select('id, tipo_clave, serie, numero, receptor_nombre, fecha, total, estado')
      .eq('numero', numero)
      .limit(40)
    if (error) throw new Error(error.message)
    return ((data ?? []) as {
      id: string
      tipo_clave: TipoNoFiscal
      serie: string
      numero: number
      receptor_nombre: string
      fecha: string
      total: number
      estado: string
    }[])
      .filter((n) => busca(n.tipo_clave) && mismaSerie(n.serie, serie))
      .map((n) => ({
        papel: { tipo: 'no_fiscal', id: n.id },
        clase: CLASE_NO_FISCAL[n.tipo_clave] ?? n.tipo_clave,
        numero: numeroNoFiscal(n.tipo_clave, n.serie, n.numero),
        quien: n.receptor_nombre,
        fecha: n.fecha,
        total: Number(n.total),
        anulado: n.estado === 'anulado',
      }))
  }

  const recibos = async (): Promise<PapelEncontrado[]> => {
    if (!permisos.recibos || !busca('recibo')) return []
    const filas = await listarRecibos(String(numero))
    return filas
      .filter((r) => Number(r.numero) === numero && mismaSerie(r.serie, serie))
      .map((r) => ({
        papel: { tipo: 'recibo', id: r.id },
        clase: 'Recibo',
        numero: numeroRecibo(r.serie, r.numero),
        quien: r.cliente_nombre,
        fecha: r.fecha,
        total: r.total,
        anulado: !!r.anulado_en,
      }))
  }

  // Una fuente que falla no tapa a las otras.
  const partes = await Promise.allSettled([facturas(), noFiscales(), recibos()])
  const encontrados = partes.flatMap((p) => (p.status === 'fulfilled' ? p.value : []))
  if (!encontrados.length && partes.every((p) => p.status === 'rejected')) {
    throw (partes[0] as PromiseRejectedResult).reason
  }
  // Lo más nuevo primero: con un número corto puede haber varios.
  return encontrados.sort((a, b) => b.fecha.localeCompare(a.fecha))
}
