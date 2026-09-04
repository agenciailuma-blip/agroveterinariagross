import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import {
  abrirToma,
  anularToma,
  borrarConteo,
  buscarParaContar,
  cerrarToma,
  lineasDeToma,
  listarTomas,
  registrarConteo,
} from '@/lib/api/inventario'
import type { LineaConteo, ProductoParaContar, TomaInventario } from '@/lib/api/inventario'
import { moneda, numero } from '@/lib/tipos'

/*
  Toma de inventario por sectores.

  El local sigue abierto mientras se cuenta: se cuenta una góndola en un
  rato tranquilo, otra al día siguiente. Por eso cada toma es de un
  sector y se cierra sola, sin frenar la venta.

  Lo que define esta pantalla es el ritmo: escanear, tipear cantidad,
  Enter, y que el foco vuelva solo al buscador. Sobre 3.000 productos,
  cada clic de más son horas.
*/
export default function Inventario() {
  const { tienePermiso } = useAuth()
  const [abierta, setAbierta] = useState<string | null>(null)

  if (!tienePermiso('stock.ver')) {
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        No tenés permiso para ver el inventario.
      </p>
    )
  }

  return abierta ? (
    <Contando id={abierta} onSalir={() => setAbierta(null)} />
  ) : (
    <Listado onAbrir={setAbierta} />
  )
}

function Listado({ onAbrir }: { onAbrir: (id: string) => void }) {
  const { perfil, tienePermiso } = useAuth()
  const qc = useQueryClient()
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [sector, setSector] = useState('')
  const [error, setError] = useState<string | null>(null)

  const puedeInventariar = tienePermiso('stock.inventariar')
  const tomas = useQuery({ queryKey: ['tomas-inventario'], queryFn: listarTomas })

  const abrir = useMutation({
    mutationFn: () => abrirToma(nombre.trim(), sector.trim() || null, perfil!.id),
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['tomas-inventario'] })
      setCreando(false)
      setNombre('')
      setSector('')
      onAbrir(id)
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo abrir.'),
  })

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-tinta">Toma de inventario</h1>
          <p className="text-sm text-piedra-500">
            Se cuenta por sectores, con el local abierto. Cada toma ajusta el stock al cerrarse.
          </p>
        </div>
        {puedeInventariar && !creando && (
          <button
            onClick={() => setCreando(true)}
            className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600"
          >
            Nueva toma
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      {creando && (
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-borde">
          <h2 className="font-medium text-tinta">Nueva toma</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-piedra-600">Nombre</span>
              <input
                autoFocus
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Conteo de agosto"
                className={claseInput}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-piedra-600">
                Sector <span className="font-normal text-piedra-400">(opcional)</span>
              </span>
              <input
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                placeholder="Góndola 3 — Alimentos"
                className={claseInput}
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => abrir.mutate()}
              disabled={!nombre.trim() || abrir.isPending}
              className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600 disabled:opacity-40"
            >
              {abrir.isPending ? 'Abriendo…' : 'Abrir y empezar a contar'}
            </button>
            <button
              onClick={() => setCreando(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-piedra-500 hover:bg-piedra-100"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-borde">
        <table className="w-full text-sm">
          <thead className="border-b border-borde bg-piedra-50 text-left text-xs tracking-wide text-piedra-500 uppercase">
            <tr>
              <th className="px-5 py-2.5 font-medium">Toma</th>
              <th className="py-2.5 font-medium">Estado</th>
              <th className="py-2.5 text-right font-medium">Contados</th>
              <th className="py-2.5 text-right font-medium">Con diferencia</th>
              <th className="py-2.5 text-right font-medium">Diferencia al costo</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-piedra-100">
            {tomas.isPending && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-piedra-400">
                  Cargando…
                </td>
              </tr>
            )}
            {tomas.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-piedra-400">
                  Todavía no se hizo ninguna toma.
                </td>
              </tr>
            )}
            {tomas.data?.map((t) => (
              <FilaToma key={t.id} t={t} onAbrir={onAbrir} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FilaToma({ t, onAbrir }: { t: TomaInventario; onAbrir: (id: string) => void }) {
  const etiqueta = {
    abierto: { texto: 'Abierta', clase: 'bg-amber-100 text-amber-800 ring-amber-200' },
    cerrado: { texto: 'Cerrada', clase: 'bg-verde-100 text-verde-800 ring-verde-200' },
    anulado: { texto: 'Anulada', clase: 'bg-piedra-100 text-piedra-600 ring-borde' },
  }[t.estado]

  return (
    <tr>
      <td className="px-5 py-2.5">
        <p className="font-medium text-tinta">{t.nombre}</p>
        <p className="text-xs text-piedra-400">
          {t.sector ? `${t.sector} · ` : ''}
          {new Date(t.abierto_en).toLocaleDateString('es-AR')}
          {t.abierto_por_nombre ? ` · ${t.abierto_por_nombre}` : ''}
        </p>
      </td>
      <td className="py-2.5">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${etiqueta.clase}`}>
          {etiqueta.texto}
        </span>
      </td>
      <td className="py-2.5 text-right tabular-nums text-tinta">{numero.format(t.contados)}</td>
      <td className="py-2.5 text-right tabular-nums text-tinta">
        {numero.format(t.con_diferencia)}
      </td>
      <td
        className={`py-2.5 text-right tabular-nums ${
          t.diferencia_valorizada < 0 ? 'text-red-700' : 'text-piedra-600'
        }`}
      >
        {moneda.format(t.diferencia_valorizada)}
      </td>
      <td className="px-5 py-2.5 text-right">
        <button onClick={() => onAbrir(t.id)} className="text-sm text-marca-700 hover:underline">
          {t.estado === 'abierto' ? 'Seguir contando' : 'Ver'}
        </button>
      </td>
    </tr>
  )
}

const claseInput =
  'w-full rounded-lg border border-borde px-2.5 py-1.5 text-sm text-tinta outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20'

function Contando({ id, onSalir }: { id: string; onSalir: () => void }) {
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()
  const [texto, setTexto] = useState('')
  const [elegido, setElegido] = useState<ProductoParaContar | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ultimo, setUltimo] = useState<{ nombre: string; diferencia: number } | null>(null)
  const [cerrando, setCerrando] = useState(false)

  const buscador = useRef<HTMLInputElement>(null)
  const campoCantidad = useRef<HTMLInputElement>(null)

  const puedeInventariar = tienePermiso('stock.inventariar')

  const tomas = useQuery({ queryKey: ['tomas-inventario'], queryFn: listarTomas })
  const toma = tomas.data?.find((t) => t.id === id)
  const abiertaLaToma = toma?.estado === 'abierto'

  const lineas = useQuery({ queryKey: ['lineas-inventario', id], queryFn: () => lineasDeToma(id) })

  const resultados = useQuery({
    queryKey: ['buscar-contar', texto],
    queryFn: () => buscarParaContar(texto),
    enabled: texto.trim().length > 0 && !elegido,
  })

  // Un solo resultado con búsqueda larga es casi seguro un escaneo: se
  // elige solo y el foco salta a la cantidad, sin tocar nada.
  useEffect(() => {
    const filas = resultados.data
    if (!elegido && filas?.length === 1 && texto.trim().length >= 6) {
      setElegido(filas[0])
      setTexto('')
    }
  }, [resultados.data, elegido, texto])

  useEffect(() => {
    if (elegido) campoCantidad.current?.focus()
    else buscador.current?.focus()
  }, [elegido])

  const contar = useMutation({
    mutationFn: () => registrarConteo(id, elegido!.producto_id, Number(cantidad)),
    onSuccess: (sistema) => {
      setUltimo({
        nombre: elegido!.nombre_interno,
        diferencia: Number(cantidad) - Number(sistema),
      })
      setElegido(null)
      setCantidad('')
      setTexto('')
      setError(null)
      qc.invalidateQueries({ queryKey: ['lineas-inventario', id] })
      qc.invalidateQueries({ queryKey: ['tomas-inventario'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo registrar el conteo.'),
  })

  const quitar = useMutation({
    mutationFn: (lineaId: string) => borrarConteo(lineaId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lineas-inventario', id] })
      qc.invalidateQueries({ queryKey: ['tomas-inventario'] })
    },
  })

  const cerrar = useMutation({
    mutationFn: () => cerrarToma(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tomas-inventario'] })
      qc.invalidateQueries({ queryKey: ['lineas-inventario', id] })
      qc.invalidateQueries({ queryKey: ['productos'] })
      setCerrando(false)
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo cerrar.'),
  })

  const anular = useMutation({
    mutationFn: () => anularToma(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tomas-inventario'] })
      onSalir()
    },
  })

  const conDiferencia = (lineas.data ?? []).filter((l) => Number(l.diferencia) !== 0)

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button onClick={onSalir} className="text-sm text-marca-700 hover:underline">
            ← Todas las tomas
          </button>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-tinta">{toma?.nombre}</h1>
          <p className="text-sm text-piedra-500">
            {toma?.sector ?? 'Sin sector'} ·{' '}
            {abiertaLaToma ? 'abierta' : toma?.estado === 'cerrado' ? 'cerrada' : 'anulada'} ·{' '}
            {numero.format(lineas.data?.length ?? 0)} productos contados
          </p>
        </div>
        {abiertaLaToma && puedeInventariar && (
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (window.confirm('¿Anular esta toma? No se va a ajustar ningún stock.')) {
                  anular.mutate()
                }
              }}
              className="rounded-lg px-3 py-2 text-sm font-medium text-piedra-500 hover:bg-piedra-100"
            >
              Anular
            </button>
            <button
              onClick={() => setCerrando(true)}
              disabled={!lineas.data?.length}
              className="rounded-lg bg-verde-600 px-4 py-2 text-sm font-medium text-white hover:bg-verde-500 disabled:opacity-40"
            >
              Cerrar y ajustar stock
            </button>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      {abiertaLaToma && puedeInventariar && (
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-borde">
          {!elegido ? (
            <>
              <input
                ref={buscador}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Escaneá el código de barra o buscá el producto…"
                className="w-full rounded-lg border border-borde px-3.5 py-3 text-tinta outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20"
              />
              {resultados.data && resultados.data.length > 0 && (
                <div className="mt-2 max-h-64 overflow-y-auto rounded-lg ring-1 ring-borde">
                  {resultados.data.map((p) => (
                    <button
                      key={p.producto_id}
                      onClick={() => {
                        setElegido(p)
                        setTexto('')
                      }}
                      className="block w-full border-b border-piedra-100 px-3 py-2 text-left last:border-0 hover:bg-piedra-50"
                    >
                      <span className="font-mono text-xs text-piedra-400">{p.codigo}</span>{' '}
                      <span className="text-sm text-tinta">{p.nombre_interno}</span>
                    </button>
                  ))}
                </div>
              )}
              {texto.trim() && resultados.data?.length === 0 && (
                <p className="mt-2 text-sm text-piedra-500">
                  No se encontró nada con “{texto}”. Si el producto no está en el catálogo, cargalo
                  desde Productos.
                </p>
              )}
            </>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs text-piedra-400">{elegido.codigo}</p>
                <p className="font-medium text-tinta">{elegido.nombre_interno}</p>
                <p className="text-xs text-piedra-500">
                  El sistema tiene {numero.format(elegido.cantidad)} {elegido.unidad_medida}
                </p>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-piedra-600">
                  ¿Cuántas hay?
                </span>
                <input
                  ref={campoCantidad}
                  type="number"
                  min="0"
                  step="0.01"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && cantidad !== '') contar.mutate()
                    if (e.key === 'Escape') {
                      setElegido(null)
                      setCantidad('')
                    }
                  }}
                  className="w-36 rounded-lg border border-borde px-3 py-2.5 text-right text-lg tabular-nums outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20"
                />
              </label>
              <button
                onClick={() => contar.mutate()}
                disabled={cantidad === '' || contar.isPending}
                className="rounded-lg bg-marca-700 px-5 py-2.5 font-medium text-white hover:bg-marca-600 disabled:opacity-40"
              >
                {contar.isPending ? 'Guardando…' : 'Registrar'}
              </button>
              <button
                onClick={() => {
                  setElegido(null)
                  setCantidad('')
                }}
                className="rounded-lg px-3 py-2.5 text-sm text-piedra-500 hover:bg-piedra-100"
              >
                Cancelar
              </button>
            </div>
          )}

          {/* Confirmación del último conteo: sin esto no hay forma de
              saber si el Enter tomó, y se cuenta dos veces. */}
          {ultimo && !elegido && (
            <p
              className={`mt-2 text-sm ${
                ultimo.diferencia === 0 ? 'text-verde-700' : 'text-amber-700'
              }`}
            >
              {ultimo.nombre}:{' '}
              {ultimo.diferencia === 0
                ? 'coincide con el sistema.'
                : `${ultimo.diferencia > 0 ? 'sobran' : 'faltan'} ${numero.format(Math.abs(ultimo.diferencia))}.`}
            </p>
          )}
        </div>
      )}

      {conDiferencia.length > 0 && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <strong>{numero.format(conDiferencia.length)}</strong> de{' '}
          {numero.format(lineas.data?.length ?? 0)} productos contados no coinciden con el sistema.
          {toma && (
            <span>
              {' '}
              Al costo son {moneda.format(toma.diferencia_valorizada)}.
            </span>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-borde">
        <div className="h-full overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b border-borde bg-piedra-50 text-left text-xs tracking-wide text-piedra-500 uppercase">
              <tr>
                <th className="px-5 py-2.5 font-medium">Producto</th>
                <th className="py-2.5 text-right font-medium">Sistema</th>
                <th className="py-2.5 text-right font-medium">Contado</th>
                <th className="py-2.5 text-right font-medium">Diferencia</th>
                <th className="py-2.5 text-right font-medium">Al costo</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-piedra-100">
              {lineas.data?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-piedra-400">
                    Todavía no se contó nada.
                  </td>
                </tr>
              )}
              {lineas.data?.map((l) => (
                <FilaConteo
                  key={l.id}
                  l={l}
                  puedeQuitar={abiertaLaToma && puedeInventariar}
                  onQuitar={() => quitar.mutate(l.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {cerrando && toma && (
        <ModalCierre
          conDiferencia={conDiferencia.length}
          valorizado={toma.diferencia_valorizada}
          cerrando={cerrar.isPending}
          resultado={cerrar.data ?? null}
          onCerrar={() => cerrar.mutate()}
          onCancelar={() => setCerrando(false)}
          onListo={() => {
            cerrar.reset()
            setCerrando(false)
          }}
        />
      )}
    </div>
  )
}

function FilaConteo({
  l,
  puedeQuitar,
  onQuitar,
}: {
  l: LineaConteo
  puedeQuitar: boolean
  onQuitar: () => void
}) {
  const dif = Number(l.diferencia)
  return (
    <tr className={l.aplicado ? 'opacity-60' : ''}>
      <td className="px-5 py-2">
        <p className="text-tinta">{l.nombre_interno}</p>
        <p className="font-mono text-xs text-piedra-400">
          {l.codigo}
          {l.contado_por_nombre ? ` · ${l.contado_por_nombre}` : ''}
        </p>
      </td>
      <td className="py-2 text-right tabular-nums text-piedra-500">
        {numero.format(Number(l.cantidad_sistema))}
      </td>
      <td className="py-2 text-right font-medium tabular-nums text-tinta">
        {numero.format(Number(l.cantidad_contada))}
      </td>
      <td
        className={`py-2 text-right font-medium tabular-nums ${
          dif === 0 ? 'text-piedra-400' : dif < 0 ? 'text-red-700' : 'text-marca-700'
        }`}
      >
        {dif === 0 ? '—' : `${dif > 0 ? '+' : ''}${numero.format(dif)}`}
      </td>
      <td className="py-2 text-right tabular-nums text-piedra-500">
        {dif === 0 ? '—' : moneda.format(Number(l.diferencia_valorizada))}
      </td>
      <td className="px-5 py-2 text-right">
        {puedeQuitar && (
          <button onClick={onQuitar} className="text-xs text-piedra-400 hover:text-red-600">
            Quitar
          </button>
        )}
      </td>
    </tr>
  )
}

function ModalCierre({
  conDiferencia,
  valorizado,
  cerrando,
  resultado,
  onCerrar,
  onCancelar,
  onListo,
}: {
  conDiferencia: number
  valorizado: number
  cerrando: boolean
  resultado: number | null
  onCerrar: () => void
  onCancelar: () => void
  onListo: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-tinta/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        {resultado === null ? (
          <>
            <h2 className="font-semibold text-tinta">Cerrar la toma</h2>
            <p className="mt-2 text-sm text-piedra-600">
              Se van a generar <strong>{numero.format(conDiferencia)} ajustes</strong> de stock, uno
              por cada producto que no coincide. Al costo representan{' '}
              <strong>{moneda.format(valorizado)}</strong>.
            </p>
            <p className="mt-2 rounded-lg bg-piedra-50 px-3 py-2 text-xs text-piedra-600">
              Los ajustes se calculan contra la diferencia encontrada <strong>al contar</strong>, no
              contra el stock de este momento. Lo que se vendió mientras contabas queda descontado
              igual.
            </p>
            <p className="mt-2 text-xs text-piedra-500">
              Una vez cerrada no se puede reabrir. Los ajustes quedan como movimientos con tu
              nombre.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={onCerrar}
                disabled={cerrando}
                className="flex-1 rounded-lg bg-verde-600 px-4 py-2.5 font-medium text-white hover:bg-verde-500 disabled:opacity-40"
              >
                {cerrando ? 'Cerrando…' : 'Cerrar y ajustar'}
              </button>
              <button
                onClick={onCancelar}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-piedra-500 hover:bg-piedra-100"
              >
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="font-semibold text-tinta">Toma cerrada</h2>
            <p className="mt-2 text-sm text-piedra-600">
              Se generaron <strong>{numero.format(resultado)}</strong>{' '}
              {resultado === 1 ? 'ajuste de stock' : 'ajustes de stock'}.
            </p>
            <button
              onClick={onListo}
              className="mt-4 w-full rounded-lg bg-marca-700 px-4 py-2.5 font-medium text-white hover:bg-marca-600"
            >
              Listo
            </button>
          </>
        )}
      </div>
    </div>
  )
}
