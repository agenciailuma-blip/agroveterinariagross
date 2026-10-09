import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import {
  avisosPorCategoria,
  definirAvisoCategoria,
  definirAvisoGeneral,
  leerAvisoGeneral,
  problemaConAviso,
  productosConAvisoPropio,
} from '@/lib/api/avisos'
import type { Aviso, AvisoDeCategoria } from '@/lib/api/avisos'
import { enCastellano } from '@/lib/errores'
import { numero } from '@/lib/tipos'
import { boton, botonChico } from '@/estilos'

/*
  Avisos de stock — con cuántos avisa cada producto que hay que pedir.

  Hueco del alcance de V1-A encontrado el 05/10: los avisos tenían tres
  niveles en la base desde agosto, pero sólo el del producto tenía dónde
  cargarse. Acá están los otros dos —el general y el de cada categoría—
  y la lista de los productos que tienen uno propio, que son las
  excepciones.

  Gana el más específico. Por eso cada categoría dice a cuántos
  productos les rige: cambiar la de Alimentos le cambia el aviso a todos
  los alimentos que no tengan uno propio.
*/

const claseInput =
  'w-full rounded-lg border border-borde px-2.5 py-1.5 text-right text-sm tabular-nums text-tinta outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20'

const texto = (a: Aviso) => `${numero.format(a.bajo)} / ${numero.format(a.critico)}`

/* Los dos casilleros, con lo que la pantalla frena antes de guardar. */
function CamposDeAviso({
  bajo,
  critico,
  onBajo,
  onCritico,
}: {
  bajo: string
  critico: string
  onBajo: (v: string) => void
  onCritico: (v: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:w-80">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-piedra-600">Stock bajo (amarillo)</span>
        <input type="number" min="0" step="1" value={bajo} onChange={(e) => onBajo(e.target.value)} className={claseInput} />
        <span className="mt-1 block text-xs text-piedra-400">Hay que ir pidiendo</span>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-piedra-600">Crítico (rojo)</span>
        <input
          type="number"
          min="0"
          step="1"
          value={critico}
          onChange={(e) => onCritico(e.target.value)}
          className={claseInput}
        />
        <span className="mt-1 block text-xs text-piedra-400">Se queda sin stock</span>
      </label>
    </div>
  )
}

export default function Avisos() {
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()
  const puede = tienePermiso('stock.configurar_umbrales')

  const general = useQuery({ queryKey: ['aviso-general'], queryFn: leerAvisoGeneral })
  const categorias = useQuery({ queryKey: ['avisos-categorias'], queryFn: avisosPorCategoria })
  const propios = useQuery({ queryKey: ['avisos-propios'], queryFn: productosConAvisoPropio })

  const [bajoGeneral, setBajoGeneral] = useState<string | null>(null)
  const [criticoGeneral, setCriticoGeneral] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [bajo, setBajo] = useState('')
  const [critico, setCritico] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // El formulario arranca con lo guardado y recién cambia cuando se escribe.
  const bajoG = bajoGeneral ?? (general.data ? String(general.data.bajo) : '')
  const criticoG = criticoGeneral ?? (general.data ? String(general.data.critico) : '')
  const cambioGeneral =
    !!general.data && (bajoG !== String(general.data.bajo) || criticoG !== String(general.data.critico))
  const problemaGeneral = cambioGeneral ? problemaConAviso(bajoG, criticoG) : null

  function listo(mensaje: string) {
    setAviso(mensaje)
    setError(null)
    setTimeout(() => setAviso(null), 5000)
    // Cambia el estado de muchos productos a la vez: Stock, Productos e Inicio.
    qc.invalidateQueries({ queryKey: ['stock'] })
    qc.invalidateQueries({ queryKey: ['stock-resumen'] })
    qc.invalidateQueries({ queryKey: ['productos'] })
    qc.invalidateQueries({ queryKey: ['producto'] })
  }

  const guardarGeneral = useMutation({
    mutationFn: () => definirAvisoGeneral({ bajo: Number(bajoG), critico: Number(criticoG) }),
    onSuccess: () => {
      setBajoGeneral(null)
      setCriticoGeneral(null)
      qc.invalidateQueries({ queryKey: ['aviso-general'] })
      listo('Aviso general guardado.')
    },
    onError: (e) => setError(enCastellano(e, 'No se pudo guardar el aviso general.')),
  })

  const guardarCategoria = useMutation({
    mutationFn: ({ id, valor }: { id: string; valor: Aviso | null }) => definirAvisoCategoria(id, valor),
    onSuccess: (_r, { valor }) => {
      setEditando(null)
      qc.invalidateQueries({ queryKey: ['avisos-categorias'] })
      listo(valor ? 'Aviso de la categoría guardado.' : 'Aviso quitado: la categoría vuelve al general.')
    },
    onError: (e) => setError(enCastellano(e, 'No se pudo guardar el aviso de la categoría.')),
  })

  function editar(c: AvisoDeCategoria) {
    setEditando(c.categoria_id)
    setBajo(String(c.aviso?.bajo ?? general.data?.bajo ?? ''))
    setCritico(String(c.aviso?.critico ?? general.data?.critico ?? ''))
    setError(null)
  }

  const problemaCategoria = editando ? problemaConAviso(bajo, critico) : null

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-tinta">Avisos de stock</h1>
        <p className="text-sm text-piedra-500">
          Con cuántos avisa cada producto que hay que pedir. Gana el más específico: el del producto —en su ficha—,
          después el de su categoría, después el general.
        </p>
      </div>

      {aviso && (
        <p className="rounded-lg bg-verde-50 px-3 py-2 text-sm text-verde-800 ring-1 ring-verde-200">{aviso}</p>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      {/* ── El general ── */}
      <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-borde">
        <h2 className="font-semibold text-tinta">General</h2>
        <p className="mb-3 text-sm text-piedra-500">Para todo lo que no tenga uno propio ni de su categoría.</p>
        {general.isPending ? (
          <p className="text-sm text-piedra-400">Cargando…</p>
        ) : puede ? (
          <div className="flex flex-wrap items-end gap-3">
            <CamposDeAviso bajo={bajoG} critico={criticoG} onBajo={setBajoGeneral} onCritico={setCriticoGeneral} />
            <button
              onClick={() => guardarGeneral.mutate()}
              disabled={!cambioGeneral || !!problemaGeneral || guardarGeneral.isPending}
              className={`${boton.principal} mb-5`}
            >
              {guardarGeneral.isPending ? 'Guardando…' : 'Guardar'}
            </button>
            {problemaGeneral && <p className="w-full text-xs text-amber-800">{problemaGeneral}</p>}
          </div>
        ) : (
          general.data && (
            <p className="text-sm text-tinta">
              Avisa con <strong>{numero.format(general.data.bajo)}</strong> (bajo) y{' '}
              <strong>{numero.format(general.data.critico)}</strong> (crítico).
            </p>
          )
        )}
      </section>

      {/* ── Por categoría ── */}
      <section className="rounded-xl bg-white shadow-sm ring-1 ring-borde">
        <div className="border-b border-borde px-4 py-3">
          <h2 className="font-semibold text-tinta">Por categoría</h2>
          <p className="text-sm text-piedra-500">Le gana al general, para todos los productos de esa categoría.</p>
        </div>
        {categorias.isPending ? (
          <p className="px-4 py-3 text-sm text-piedra-400">Cargando…</p>
        ) : !categorias.data?.length ? (
          <p className="px-4 py-3 text-sm text-piedra-500">Todavía no hay categorías cargadas.</p>
        ) : (
          <ul className="divide-y divide-piedra-100">
            {categorias.data.map((c) => (
              <li key={c.categoria_id} className="px-4 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <p className="font-medium text-tinta">{c.nombre}</p>
                    <p className="text-xs text-piedra-500">
                      {numero.format(c.productos)} {c.productos === 1 ? 'producto' : 'productos'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {c.aviso ? (
                      <span className="text-sm tabular-nums text-tinta">Avisa con {texto(c.aviso)}</span>
                    ) : (
                      <span className="text-sm text-piedra-400">
                        Usa el general{general.data ? ` (${texto(general.data)})` : ''}
                      </span>
                    )}
                    {puede && editando !== c.categoria_id && (
                      <button onClick={() => editar(c)} className={botonChico.secundario}>
                        {c.aviso ? 'Cambiar' : 'Poner uno'}
                      </button>
                    )}
                  </div>
                </div>

                {/* El formulario va debajo y a todo el ancho: en una fila de tabla se iría hacia el costado. */}
                {editando === c.categoria_id && (
                  <div className="mt-3 space-y-3 rounded-lg bg-piedra-50 p-3 ring-1 ring-borde">
                    <CamposDeAviso bajo={bajo} critico={critico} onBajo={setBajo} onCritico={setCritico} />
                    {problemaCategoria && <p className="text-xs text-amber-800">{problemaCategoria}</p>}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() =>
                          guardarCategoria.mutate({
                            id: c.categoria_id,
                            valor: { bajo: Number(bajo), critico: Number(critico) },
                          })
                        }
                        disabled={!!problemaCategoria || guardarCategoria.isPending}
                        className={botonChico.principal}
                      >
                        Guardar
                      </button>
                      {c.aviso && (
                        <button
                          onClick={() => guardarCategoria.mutate({ id: c.categoria_id, valor: null })}
                          disabled={guardarCategoria.isPending}
                          className={botonChico.secundario}
                        >
                          Quitar y usar el general
                        </button>
                      )}
                      <button onClick={() => setEditando(null)} className={botonChico.suave}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Los que tienen uno propio ── */}
      <section className="rounded-xl bg-white shadow-sm ring-1 ring-borde">
        <div className="border-b border-borde px-4 py-3">
          <h2 className="font-semibold text-tinta">
            Productos con aviso propio{propios.data ? ` (${numero.format(propios.data.length)})` : ''}
          </h2>
          <p className="text-sm text-piedra-500">
            Les gana a su categoría y al general. Se cambian en la ficha de cada uno, en Productos.
          </p>
        </div>
        {propios.isPending ? (
          <p className="px-4 py-3 text-sm text-piedra-400">Cargando…</p>
        ) : !propios.data?.length ? (
          <p className="px-4 py-3 text-sm text-piedra-500">Ninguno: todos siguen a su categoría o al general.</p>
        ) : (
          <ul className="divide-y divide-piedra-100">
            {propios.data.map((p) => (
              <li key={p.producto_id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 px-4 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-tinta">{p.nombre_interno}</p>
                  <p className="font-mono text-xs text-piedra-400">{p.codigo}</p>
                </div>
                <span className="text-sm tabular-nums text-tinta">Avisa con {texto(p.aviso)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
