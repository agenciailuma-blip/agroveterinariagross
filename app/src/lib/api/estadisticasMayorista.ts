import { supabase } from '@/lib/supabase'
import { sumarDias } from '@/lib/api/cheques'

/*
  ─────────────────────────────────────────────────────────────
  Las estadísticas del mayorista

  Fase 03, punto 5.5. La base devuelve cada cliente mayorista con sus
  números del período, y lo vendido de cada producto a cada cliente. Acá
  se juntan por el corte que se elija —cliente, ciudad, ruta o zona—,
  así cambiar de corte no vuelve a preguntar.
  ─────────────────────────────────────────────────────────────
*/

export interface ClienteEnNumeros {
  cliente_id: string
  nombre: string
  nombre_fantasia: string | null
  localidad: string | null
  ruta: string | null
  zona: string | null
  /** Ventas cobradas del período, menos devoluciones. */
  vendido: number
  ventas: number
  unidades: number
  pedidos: number
  /** Lo cargado a la cuenta en el período… */
  cargado: number
  /** …y lo que todavía falta de eso. */
  pendiente: number
  /** Hoy. */
  saldo: number
  vencido: number
  vencido_desde: string | null
  ultimo_pedido_en: string | null
  ultimo_pedido_numero: number | null
}

export interface ProductoVendido {
  cliente_id: string
  producto_id: string
  codigo: string
  nombre: string
  unidades: number
  vendido: number
}

export interface EstadisticasMayorista {
  clientes: ClienteEnNumeros[]
  productos: ProductoVendido[]
}

export async function estadisticasMayorista(desde: string, hasta: string): Promise<EstadisticasMayorista> {
  const { data, error } = await supabase.rpc('mayorista_estadisticas', { p_desde: desde, p_hasta: hasta })
  if (error) throw new Error(error.message)
  const e = data as EstadisticasMayorista
  const n = (x: unknown) => Number(x ?? 0)
  return {
    clientes: e.clientes.map((c) => ({
      ...c,
      vendido: n(c.vendido),
      ventas: n(c.ventas),
      unidades: n(c.unidades),
      pedidos: n(c.pedidos),
      cargado: n(c.cargado),
      pendiente: n(c.pendiente),
      saldo: n(c.saldo),
      vencido: n(c.vencido),
      ultimo_pedido_numero: c.ultimo_pedido_numero === null ? null : n(c.ultimo_pedido_numero),
    })),
    productos: e.productos.map((p) => ({ ...p, unidades: n(p.unidades), vendido: n(p.vendido) })),
  }
}

// ─── El período ───

export type Periodo = 'este_mes' | 'mes_pasado' | 'tres_meses' | 'este_anio'

export const PERIODOS: Record<Periodo, string> = {
  este_mes: 'Este mes',
  mes_pasado: 'Mes pasado',
  tres_meses: 'Últimos 3 meses',
  este_anio: 'Este año',
}

/** Desde y hasta, en días de Oberá. «Hasta» es hoy salvo el mes pasado, que termina el último día. */
export function rangoDe(p: Periodo, hoy: string): { desde: string; hasta: string } {
  const [a, m] = hoy.split('-').map(Number)
  const primero = (anio: number, mes: number) => {
    const d = new Date(Date.UTC(anio, mes - 1, 1))
    return d.toISOString().slice(0, 10)
  }
  switch (p) {
    case 'este_mes':
      return { desde: primero(a, m), hasta: hoy }
    case 'mes_pasado':
      return { desde: primero(a, m - 1), hasta: sumarDias(primero(a, m), -1) }
    case 'tres_meses':
      return { desde: primero(a, m - 2), hasta: hoy }
    case 'este_anio':
      return { desde: `${a}-01-01`, hasta: hoy }
  }
}

// ─── Los cortes ───

export type Corte = 'cliente' | 'localidad' | 'ruta' | 'zona'

export const CORTES: Record<Corte, string> = {
  cliente: 'Cliente',
  localidad: 'Ciudad',
  ruta: 'Ruta',
  zona: 'Zona',
}

const SIN: Record<Exclude<Corte, 'cliente'>, string> = {
  localidad: 'Sin ciudad',
  ruta: 'Sin ruta',
  zona: 'Sin zona',
}

export interface Grupo {
  clave: string
  nombre: string
  clientes: string[]
  vendido: number
  ventas: number
  unidades: number
  pedidos: number
  cargado: number
  pendiente: number
  saldo: number
  vencido: number
  ultimo_pedido_en: string | null
}

/* «Ruta 14», «ruta 14 » y «RUTA 14» son la misma: se escriben a mano. */
const normal = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es')

export function agrupar(clientes: ClienteEnNumeros[], corte: Corte): Grupo[] {
  const grupos = new Map<string, Grupo>()
  for (const c of clientes) {
    let clave: string
    let nombre: string
    if (corte === 'cliente') {
      clave = c.cliente_id
      nombre = c.nombre_fantasia ? `${c.nombre} (${c.nombre_fantasia})` : c.nombre
    } else {
      const valor = c[corte]?.trim()
      clave = valor ? normal(valor) : ''
      nombre = valor || SIN[corte]
    }
    const g =
      grupos.get(clave) ??
      ({
        clave,
        nombre,
        clientes: [],
        vendido: 0,
        ventas: 0,
        unidades: 0,
        pedidos: 0,
        cargado: 0,
        pendiente: 0,
        saldo: 0,
        vencido: 0,
        ultimo_pedido_en: null,
      } satisfies Grupo)
    g.clientes.push(c.cliente_id)
    g.vendido += c.vendido
    g.ventas += c.ventas
    g.unidades += c.unidades
    g.pedidos += c.pedidos
    g.cargado += c.cargado
    g.pendiente += c.pendiente
    g.saldo += c.saldo
    g.vencido += c.vencido
    if (c.ultimo_pedido_en && (!g.ultimo_pedido_en || c.ultimo_pedido_en > g.ultimo_pedido_en)) {
      g.ultimo_pedido_en = c.ultimo_pedido_en
    }
    grupos.set(clave, g)
  }
  // Lo que más vende arriba; a igual venta, por nombre. Los «sin ruta» al final.
  return [...grupos.values()].sort(
    (a, b) =>
      Number(a.clave === '') - Number(b.clave === '') ||
      b.vendido - a.vendido ||
      a.nombre.localeCompare(b.nombre, 'es'),
  )
}

/** De lo cargado a la cuenta en el período, qué parte ya se cobró. Null si no se cargó nada. */
export function porcentajeCobrado(g: Pick<Grupo, 'cargado' | 'pendiente'>): number | null {
  if (g.cargado <= 0.009) return null
  return Math.max(0, Math.min(100, Math.round(((g.cargado - g.pendiente) / g.cargado) * 100)))
}

/** Todos los clientes juntos: los números de arriba. */
export function totales(clientes: ClienteEnNumeros[]): Grupo {
  const todos = agrupar(
    clientes.map((c) => ({ ...c, localidad: 'Todos' })),
    'localidad',
  )
  return (
    todos[0] ?? {
      clave: 'todos',
      nombre: 'Todos',
      clientes: [],
      vendido: 0,
      ventas: 0,
      unidades: 0,
      pedidos: 0,
      cargado: 0,
      pendiente: 0,
      saldo: 0,
      vencido: 0,
      ultimo_pedido_en: null,
    }
  )
}

/** Lo más vendido, en plata, a esos clientes; o a todos si no se dice. */
export function masVendidos(productos: ProductoVendido[], clientes: string[] | null, cuantos = 10) {
  const de = clientes ? new Set(clientes) : null
  const suma = new Map<string, { producto_id: string; codigo: string; nombre: string; unidades: number; vendido: number }>()
  for (const p of productos) {
    if (de && !de.has(p.cliente_id)) continue
    const s = suma.get(p.producto_id) ?? { producto_id: p.producto_id, codigo: p.codigo, nombre: p.nombre, unidades: 0, vendido: 0 }
    s.unidades += p.unidades
    s.vendido += p.vendido
    suma.set(p.producto_id, s)
  }
  return [...suma.values()].sort((a, b) => b.vendido - a.vendido || b.unidades - a.unidades).slice(0, cuantos)
}
