import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { hoyEnObera } from '@/lib/api/cheques'
import {
  CORTES,
  PERIODOS,
  agrupar,
  estadisticasMayorista,
  masVendidos,
  porcentajeCobrado,
  rangoDe,
  totales,
  type Corte,
  type Grupo,
  type Periodo,
} from '@/lib/api/estadisticasMayorista'
import { enCastellano } from '@/lib/errores'
import { moneda, numero } from '@/lib/tipos'
import { campoDeFiltro, tarjeta } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  Las estadísticas del mayorista

  Fase 03, punto 5.5. Lo vendido, los pedidos, la deuda, cuánto se
  cobró y lo más vendido, por cliente, ciudad, ruta o zona. Arriba, todo
  junto; tocar una fila muestra lo más vendido de esa fila.

  La deuda y lo vencido son de hoy; lo demás, del período elegido.
  ─────────────────────────────────────────────────────────────
*/
export default function MayoristaEstadisticas() {
  const { tienePermiso } = useAuth()
  const puede = tienePermiso('mayorista.atender') || tienePermiso('reportes.ver')
  const hoy = hoyEnObera()
  const [periodo, setPeriodo] = useState<Periodo | 'otro'>('este_mes')
  const [propio, setPropio] = useState(() => rangoDe('este_mes', hoy))
  const [corte, setCorte] = useState<Corte>('ruta')
  const [elegido, setElegido] = useState<string | null>(null)

  const { desde, hasta } = periodo === 'otro' ? propio : rangoDe(periodo, hoy)
  const valido = /^\d{4}-\d{2}-\d{2}$/.test(desde) && /^\d{4}-\d{2}-\d{2}$/.test(hasta) && desde <= hasta

  const datos = useQuery({
    queryKey: ['mayorista-estadisticas', desde, hasta],
    queryFn: () => estadisticasMayorista(desde, hasta),
    enabled: puede && valido,
  })

  if (!puede) {
    return (
      <p className="rounded-xl bg-piedra-50 px-4 py-3 text-sm text-piedra-600 ring-1 ring-borde">
        No tenés permiso para ver las estadísticas del mayorista.
      </p>
    )
  }

  const clientes = datos.data?.clientes ?? []
  const grupos = agrupar(clientes, corte)
  const total = totales(clientes)
  const grupo = grupos.find((g) => g.clave === elegido) ?? null
  const top = masVendidos(datos.data?.productos ?? [], grupo ? grupo.clientes : null)
  const cobrado = porcentajeCobrado(total)

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-tinta">Estadísticas del mayorista</h1>
        <p className="text-sm text-piedra-500">Por cliente, ciudad, ruta o zona. La deuda es la de hoy.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(PERIODOS) as Periodo[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriodo(p)}
            className={`rounded-full px-3 py-1 text-sm ring-1 ${
              periodo === p ? 'bg-marca-700 text-white ring-marca-700' : 'text-marca-700 ring-borde hover:bg-marca-50'
            }`}
          >
            {PERIODOS[p]}
          </button>
        ))}
        <button
          onClick={() => {
            setPropio({ desde, hasta })
            setPeriodo('otro')
          }}
          className={`rounded-full px-3 py-1 text-sm ring-1 ${
            periodo === 'otro' ? 'bg-marca-700 text-white ring-marca-700' : 'text-marca-700 ring-borde hover:bg-marca-50'
          }`}
        >
          Otras fechas
        </button>
      </div>
      {periodo === 'otro' && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-piedra-600">
          <span>Del</span>
          <input
            type="date"
            value={propio.desde}
            onChange={(e) => setPropio({ ...propio, desde: e.target.value })}
            className={campoDeFiltro}
          />
          <span>al</span>
          <input
            type="date"
            value={propio.hasta}
            onChange={(e) => setPropio({ ...propio, hasta: e.target.value })}
            className={campoDeFiltro}
          />
          {!valido && <span className="text-xs text-red-700">La primera fecha va antes que la segunda.</span>}
        </div>
      )}

      {datos.isPending && valido ? (
        <p className="text-sm text-piedra-500">Cargando…</p>
      ) : datos.isError ? (
        <p role="alert" className="text-sm text-red-700">
          {enCastellano(datos.error, 'No se pudieron leer las estadísticas.')}
        </p>
      ) : clientes.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-borde bg-white/60 px-4 py-12">
          <p className="text-center text-sm text-piedra-400">Todavía no hay clientes mayoristas.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Dato
              titulo="Vendido"
              valor={moneda.format(total.vendido)}
              detalle={`${cantidad(total.ventas, 'venta', 'ventas')} · ${numero.format(total.unidades)} unidades`}
            />
            <Dato
              titulo="Pedidos"
              valor={numero.format(total.pedidos)}
              detalle={`de ${cantidad(clientes.filter((c) => c.pedidos > 0).length, 'cliente', 'clientes')}`}
            />
            <Dato
              titulo="Deuda hoy"
              valor={moneda.format(total.saldo)}
              detalle={total.vencido > 0.009 ? `${moneda.format(total.vencido)} vencido` : 'Nada vencido'}
              alerta={total.vencido > 0.009}
            />
            <Dato
              titulo="Cobrado"
              valor={cobrado === null ? '—' : `${cobrado} %`}
              detalle={
                cobrado === null
                  ? 'No se cargó nada a cuenta'
                  : `de ${moneda.format(total.cargado)} cargado a cuenta`
              }
            />
          </div>

          <div className="flex rounded-lg bg-piedra-100 p-0.5 text-sm sm:w-fit">
            {(Object.keys(CORTES) as Corte[]).map((c) => (
              <button
                key={c}
                onClick={() => {
                  setCorte(c)
                  setElegido(null)
                }}
                className={`flex-1 rounded-md px-3 py-1.5 ${corte === c ? 'bg-white font-medium text-tinta shadow-sm' : 'text-piedra-500'}`}
              >
                {CORTES[c]}
              </button>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <ul className={`${tarjeta} min-w-0 divide-y divide-piedra-100`}>
              {grupos.map((g) => (
                <Fila
                  key={g.clave}
                  g={g}
                  corte={corte}
                  elegido={g.clave === elegido}
                  onElegir={() => setElegido(g.clave === elegido ? null : g.clave)}
                />
              ))}
            </ul>

            <section className={`${tarjeta} min-w-0 self-start p-4`}>
              <h2 className="text-sm font-semibold text-tinta">Lo más vendido</h2>
              <p className="text-xs [overflow-wrap:anywhere] text-piedra-500">
                {grupo ? grupo.nombre : 'A todos los mayoristas'}
                {grupo && (
                  <button onClick={() => setElegido(null)} className="ml-2 text-marca-700 hover:underline">
                    Ver todos
                  </button>
                )}
              </p>
              {top.length === 0 ? (
                <p className="mt-3 text-sm text-piedra-400">Nada vendido en el período.</p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {top.map((p, i) => (
                    <li key={p.producto_id} className="flex items-baseline gap-2 text-sm">
                      <span className="w-5 shrink-0 text-right text-xs text-piedra-400">{i + 1}</span>
                      <span className="min-w-0 flex-1 [overflow-wrap:anywhere] text-tinta">{p.nombre}</span>
                      <span className="shrink-0 text-right tabular-nums">
                        <span className="block font-medium text-tinta">{moneda.format(p.vendido)}</span>
                        <span className="block text-xs text-piedra-500">{numero.format(p.unidades)} u.</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

const cantidad = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${numero.format(n)} ${varios}`)

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric', year: '2-digit' })

function Dato({ titulo, valor, detalle, alerta }: { titulo: string; valor: string; detalle: string; alerta?: boolean }) {
  return (
    <div className={`${tarjeta} min-w-0 p-4`}>
      <p className="text-xs font-medium tracking-wide text-piedra-400 uppercase">{titulo}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${alerta ? 'text-red-700' : 'text-tinta'}`}>{valor}</p>
      <p className="mt-0.5 text-xs text-piedra-500">{detalle}</p>
    </div>
  )
}

function Fila({ g, corte, elegido, onElegir }: { g: Grupo; corte: Corte; elegido: boolean; onElegir: () => void }) {
  const cobrado = porcentajeCobrado(g)
  return (
    <li>
      <button
        onClick={onElegir}
        className={`flex w-full flex-wrap items-start gap-x-4 gap-y-1.5 px-4 py-3 text-left hover:bg-marca-50/40 ${
          elegido ? 'bg-marca-50/60' : ''
        }`}
      >
        <span className="min-w-0 flex-1 basis-48">
          <span className="block [overflow-wrap:anywhere] text-sm font-medium text-tinta">{g.nombre}</span>
          <span className="block text-xs text-piedra-500">
            {corte !== 'cliente' && `${cantidad(g.clientes.length, 'cliente', 'clientes')} · `}
            {cantidad(g.pedidos, 'pedido', 'pedidos')}
            {g.ultimo_pedido_en && ` · último el ${fechaCorta(g.ultimo_pedido_en)}`}
          </span>
        </span>
        <span className="shrink-0 text-right tabular-nums">
          <span className="block text-sm font-medium text-tinta">{moneda.format(g.vendido)}</span>
          <span className="block text-xs text-piedra-500">{numero.format(g.unidades)} unidades</span>
        </span>
        <span className="w-full text-xs text-piedra-500 sm:w-auto sm:basis-44 sm:text-right">
          {g.saldo > 0.009 ? `Debe ${moneda.format(g.saldo)}` : 'No debe'}
          {g.vencido > 0.009 && <span className="font-medium text-red-700"> · {moneda.format(g.vencido)} vencido</span>}
          <span className="block">{cobrado === null ? 'Sin cargos a cuenta' : `Cobrado ${cobrado} %`}</span>
        </span>
      </button>
    </li>
  )
}
