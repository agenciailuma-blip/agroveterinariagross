import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { confirmar, pedirTexto } from '@/components/Dialogo'
import { depositoPropuesto, listarDepositos, stockPorDeposito } from '@/lib/api/depositos'
import {
  MOTIVOS,
  anularEntradaSalida,
  buscarParaAjustar,
  lineasDeEntradaSalida,
  listarEntradasSalidas,
  problemaDelAjuste,
  quedaDespues,
  registrarEntradaSalida,
} from '@/lib/api/entradasSalidas'
import type {
  EntradaSalida,
  LineaAAjustar,
  Motivo,
  ProductoParaAjustar,
  Sentido,
} from '@/lib/api/entradasSalidas'
import { enCastellano } from '@/lib/errores'
import { useTerminal } from '@/lib/terminal'
import { numero } from '@/lib/tipos'
import { boton, botonChico, campo, tarjeta } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  Entradas y salidas: mercadería que aparece o desaparece sin compra ni
  venta, con su motivo

  Como en OBTech (Almacén → Stock → Entradas y Salidas): se elige si
  entra o sale y por qué, se pasa el lector, cantidad, Enter, y se
  confirma la lista una vez. El ritmo es el de la transferencia.
  ─────────────────────────────────────────────────────────────
*/
export default function EntradasYSalidas() {
  const { tienePermiso } = useAuth()

  if (!tienePermiso('stock.ver')) {
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        No tenés permiso para ver el stock.
      </p>
    )
  }

  return <Pantalla puedeAjustar={tienePermiso('stock.ajustar')} />
}

function Pantalla({ puedeAjustar }: { puedeAjustar: boolean }) {
  const depositos = useQuery({ queryKey: ['depositos'], queryFn: listarDepositos })
  const activos = (depositos.data ?? []).filter((d) => d.activo)
  const [aviso, setAviso] = useState<string | null>(null)

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-tinta">Entradas y salidas</h1>
        <p className="text-sm text-piedra-500">
          Mercadería que sale o entra sin venta ni compra: una bolsa rota, lo que se usa en el local, lo
          que se abre para fraccionar, un cambio.
        </p>
      </div>

      {aviso && (
        <p className="rounded-xl bg-verde-50 px-4 py-3 text-sm text-verde-800 ring-1 ring-verde-200">{aviso}</p>
      )}

      {puedeAjustar && activos.length > 0 && <Nueva depositos={activos} onListo={setAviso} />}

      <Historial puedeAnular={puedeAjustar} conDeposito={activos.length > 1} onAviso={setAviso} />
    </div>
  )
}

function Nueva({
  depositos,
  onListo,
}: {
  depositos: { id: string; nombre: string; es_principal: boolean; activo: boolean }[]
  onListo: (aviso: string) => void
}) {
  const qc = useQueryClient()
  const { terminal } = useTerminal()

  const [sentido, setSentido] = useState<Sentido>('salida')
  const [motivo, setMotivo] = useState<Motivo | null>('rotura')
  // Con un solo depósito no se pregunta: es ese.
  const [deposito, setDeposito] = useState<string | null>(() => depositoPropuesto(depositos, terminal?.deposito_id))
  const [lineas, setLineas] = useState<Omit<LineaAAjustar, 'hay'>[]>([])
  const [observacion, setObservacion] = useState('')
  const [texto, setTexto] = useState('')
  const [elegido, setElegido] = useState<ProductoParaAjustar | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [id, setId] = useState(() => crypto.randomUUID())

  const buscador = useRef<HTMLInputElement>(null)
  const campoCantidad = useRef<HTMLInputElement>(null)

  const nombreDeposito = depositos.find((d) => d.id === deposito)?.nombre ?? ''

  function cambiarSentido(s: Sentido) {
    setSentido(s)
    // El motivo de una salida no sirve para una entrada: se propone el primero del otro lado.
    setMotivo(MOTIVOS[s][0].valor)
  }

  const resultados = useQuery({
    queryKey: ['buscar-ajustar', texto, deposito],
    queryFn: () => buscarParaAjustar(texto, deposito!),
    enabled: texto.trim().length > 0 && !elegido && !!deposito,
  })

  // Cuánto hay de lo que ya está en la lista, en el depósito elegido.
  const idsEnLista = useMemo(() => lineas.map((l) => l.producto_id).sort(), [lineas])
  const existencias = useQuery({
    queryKey: ['stock-por-deposito', idsEnLista],
    queryFn: () => stockPorDeposito(idsEnLista),
    enabled: idsEnLista.length > 0,
  })
  const hay = (productoId: string) => (deposito && existencias.data?.get(productoId)?.get(deposito)) || 0

  const completas: LineaAAjustar[] = lineas.map((l) => ({ ...l, hay: hay(l.producto_id) }))
  const problema = problemaDelAjuste(sentido, motivo, observacion, completas)

  // Un solo resultado con búsqueda larga es un escaneo: se elige solo.
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

  function agregar() {
    if (!elegido || !(Number(cantidad) > 0)) return
    setLineas((actuales) => {
      const ya = actuales.find((l) => l.producto_id === elegido.producto_id)
      if (ya) {
        return actuales.map((l) =>
          l === ya ? { ...l, cantidad: String(Number(l.cantidad || 0) + Number(cantidad)) } : l,
        )
      }
      return [
        ...actuales,
        {
          producto_id: elegido.producto_id,
          codigo: elegido.codigo,
          nombre_interno: elegido.nombre_interno,
          unidad_medida: elegido.unidad_medida,
          cantidad,
        },
      ]
    })
    setElegido(null)
    setCantidad('')
    setTexto('')
  }

  const registrar = useMutation({
    mutationFn: () =>
      registrarEntradaSalida({
        id,
        sentido,
        motivo: motivo!,
        depositoId: deposito,
        lineas: completas.map((l) => ({ producto_id: l.producto_id, cantidad: Number(l.cantidad) })),
        observacion,
      }),
    onSuccess: (n) => {
      const unidades = completas.reduce((s, l) => s + Number(l.cantidad), 0)
      const nombreMotivo = MOTIVOS[sentido].find((m) => m.valor === motivo)?.nombre ?? ''
      onListo(
        `${sentido === 'salida' ? 'Salida' : 'Entrada'} ${n} (${nombreMotivo}): ${completas.length} producto${completas.length === 1 ? '' : 's'}, ${numero.format(unidades)} en total.`,
      )
      setLineas([])
      setObservacion('')
      setError(null)
      setId(crypto.randomUUID())
      qc.invalidateQueries({ queryKey: ['entradas-salidas'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['stock-resumen'] })
      qc.invalidateQueries({ queryKey: ['stock-por-deposito'] })
      qc.invalidateQueries({ queryKey: ['movimientos'] })
    },
    onError: (e) => setError(enCastellano(e, 'No se pudo registrar.')),
  })

  async function confirmarRegistro() {
    const negativos = sentido === 'salida' ? completas.filter((l) => quedaDespues(sentido, l) < 0) : []
    if (negativos.length) {
      const primero = negativos[0]
      const sigue = await confirmar({
        titulo: 'Queda en negativo',
        detalle:
          negativos.length === 1
            ? `Según el sistema hay ${numero.format(primero.hay)} de ${primero.nombre_interno} y quedaría en ${numero.format(quedaDespues(sentido, primero))}. Si la mercadería estaba, registrala igual y después corregí el stock contándolo.`
            : `${negativos.length} productos quedarían en negativo. Si la mercadería estaba, registrala igual y después corregí el stock contándolo.`,
        aceptar: 'Registrar igual',
      })
      if (!sigue) return
    }
    setError(null)
    registrar.mutate()
  }

  const unidades = completas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0)
  const verbo = sentido === 'salida' ? 'Sale' : 'Entra'

  return (
    <div className={`${tarjeta} p-5`}>
      <div className="flex flex-wrap items-end gap-3">
        {/* Entrada o salida: dos botones, no un desplegable. Es lo primero que se decide. */}
        <div role="radiogroup" aria-label="Entra o sale" className="flex rounded-lg bg-piedra-100 p-1">
          {(['salida', 'entrada'] as Sentido[]).map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={sentido === s}
              onClick={() => cambiarSentido(s)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                sentido === s
                  ? s === 'salida'
                    ? 'bg-white text-red-700 shadow-sm'
                    : 'bg-white text-verde-800 shadow-sm'
                  : 'text-piedra-500 hover:text-tinta'
              }`}
            >
              {s === 'salida' ? 'Salida' : 'Entrada'}
            </button>
          ))}
        </div>

        <label className="block w-full min-w-0 sm:w-56">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Motivo</span>
          <select value={motivo ?? ''} onChange={(e) => setMotivo(e.target.value as Motivo)} className={campo}>
            {MOTIVOS[sentido].map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.nombre}
              </option>
            ))}
          </select>
        </label>

        {depositos.length > 1 && (
          <label className="block w-full min-w-0 sm:w-48">
            <span className="mb-1 block text-xs font-medium text-piedra-600">Depósito</span>
            <select value={deposito ?? ''} onChange={(e) => setDeposito(e.target.value)} className={campo}>
              {depositos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* El buscador y la cantidad, en una línea: escanear, cantidad, Enter. */}
      <div className="mt-4 flex flex-wrap items-start gap-3">
        {elegido ? (
          <div className="min-w-0 flex-1 basis-64 rounded-lg bg-piedra-50 px-3 py-2 ring-1 ring-borde">
            <p className="text-sm font-medium text-tinta">{elegido.nombre_interno}</p>
            <p className="text-xs text-piedra-500">
              <span className="font-mono">{elegido.codigo}</span> · hay {numero.format(elegido.hay)}
              {depositos.length > 1 && ` en ${nombreDeposito}`}
            </p>
          </div>
        ) : (
          <div className="relative min-w-0 flex-1 basis-64">
            <input
              ref={buscador}
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Pasá el lector o buscá por código o nombre"
              className={campo}
            />
            {texto.trim() && (resultados.data?.length ?? 0) > 0 && (
              <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-lg bg-white shadow-lg ring-1 ring-borde">
                {resultados.data!.map((p) => (
                  <li key={p.producto_id}>
                    <button
                      onClick={() => {
                        setElegido(p)
                        setTexto('')
                      }}
                      className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-piedra-50"
                    >
                      <span className="min-w-0">
                        <span className="text-tinta">{p.nombre_interno}</span>{' '}
                        <span className="font-mono text-xs text-piedra-400">{p.codigo}</span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-piedra-500">
                        hay {numero.format(p.hay)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {texto.trim() && resultados.data?.length === 0 && (
              <p className="mt-1 text-xs text-piedra-400">No se encontró ningún producto.</p>
            )}
          </div>
        )}
        <div className="w-28">
          <input
            ref={campoCantidad}
            type="number"
            min="0"
            step="0.01"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') agregar()
              if (e.key === 'Escape') {
                setElegido(null)
                setCantidad('')
              }
            }}
            placeholder="Cantidad"
            disabled={!elegido}
            className={`${campo} text-right tabular-nums`}
          />
        </div>
        <button onClick={agregar} disabled={!elegido || !(Number(cantidad) > 0)} className={boton.secundario}>
          Agregar
        </button>
        {elegido && (
          <button
            onClick={() => {
              setElegido(null)
              setCantidad('')
            }}
            className={boton.suave}
          >
            Otro
          </button>
        )}
      </div>

      {lineas.length > 0 && (
        <table className="mt-4 w-full text-sm">
          <thead className="border-b border-borde text-left text-xs tracking-wide text-piedra-500 uppercase">
            <tr>
              <th className="py-2 pr-3 font-medium">Producto</th>
              <th className="py-2 pr-3 text-right font-medium">{verbo}</th>
              <th className="hidden py-2 pr-3 text-right font-medium sm:table-cell">Queda</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-piedra-100">
            {completas.map((l) => {
              const queda = quedaDespues(sentido, l)
              return (
                <tr key={l.producto_id}>
                  <td className="py-2 pr-3">
                    <p className="text-tinta">{l.nombre_interno}</p>
                    <p className="font-mono text-xs text-piedra-400">{l.codigo}</p>
                    {!existencias.isPending && (
                      <p className="text-xs text-piedra-500 sm:hidden">
                        Queda: <span className={queda < 0 ? 'font-medium text-red-700' : ''}>{numero.format(queda)}</span>
                      </p>
                    )}
                  </td>
                  <td className="w-24 py-2 pr-3 text-right">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={l.cantidad}
                      onChange={(e) =>
                        setLineas((actuales) =>
                          actuales.map((x) => (x.producto_id === l.producto_id ? { ...x, cantidad: e.target.value } : x)),
                        )
                      }
                      aria-label={`Cantidad de ${l.nombre_interno}`}
                      className={`${campo} text-right tabular-nums`}
                    />
                  </td>
                  <td
                    className={`hidden py-2 pr-3 text-right tabular-nums sm:table-cell ${
                      queda < 0 ? 'font-medium text-red-700' : 'text-piedra-600'
                    }`}
                  >
                    {existencias.isPending ? '…' : numero.format(queda)}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => setLineas((actuales) => actuales.filter((x) => x.producto_id !== l.producto_id))}
                      className={botonChico.suave}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-piedra-100 pt-4">
        <label className="block min-w-0 flex-1 basis-64">
          <span className="mb-1 block text-xs font-medium text-piedra-600">
            Observación{' '}
            {motivo !== 'otro' && <span className="font-normal text-piedra-400">(opcional)</span>}
          </span>
          <input
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            placeholder={sentido === 'salida' ? 'Se mojó con la lluvia' : 'La devolvió Juan Pérez'}
            className={campo}
          />
        </label>
        <button onClick={confirmarRegistro} disabled={!!problema || registrar.isPending} className={boton.principal}>
          {registrar.isPending
            ? 'Registrando…'
            : lineas.length
              ? `Registrar ${sentido} (${lineas.length} producto${lineas.length === 1 ? '' : 's'}, ${numero.format(unidades)})`
              : `Registrar ${sentido}`}
        </button>
      </div>

      {lineas.length > 0 && problema && <p className="mt-2 text-sm text-piedra-500">{problema}</p>}
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}
    </div>
  )
}

function Historial({
  puedeAnular,
  conDeposito,
  onAviso,
}: {
  puedeAnular: boolean
  conDeposito: boolean
  onAviso: (aviso: string) => void
}) {
  const qc = useQueryClient()
  const registros = useQuery({ queryKey: ['entradas-salidas'], queryFn: listarEntradasSalidas })
  const [abierta, setAbierta] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const anular = useMutation({
    mutationFn: ({ e, motivo }: { e: EntradaSalida; motivo: string }) => anularEntradaSalida(e.id, motivo),
    onSuccess: (_, { e }) => {
      onAviso(
        `${e.sentido === 'salida' ? 'Salida' : 'Entrada'} ${e.numero} anulada: el stock volvió a como estaba.`,
      )
      setError(null)
      qc.invalidateQueries({ queryKey: ['entradas-salidas'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['stock-resumen'] })
      qc.invalidateQueries({ queryKey: ['stock-por-deposito'] })
      qc.invalidateQueries({ queryKey: ['movimientos'] })
    },
    onError: (err) => setError(enCastellano(err, 'No se pudo anular.')),
  })

  async function pedirAnulacion(e: EntradaSalida) {
    const motivo = await pedirTexto({
      titulo: `¿Anular la ${e.sentido} ${e.numero}?`,
      detalle:
        e.sentido === 'salida'
          ? 'La mercadería vuelve al stock. Queda en la lista, anulada y con el motivo.'
          : 'La mercadería sale del stock. Queda en la lista, anulada y con el motivo.',
      etiqueta: 'Motivo',
      ejemplo: 'Se cargó dos veces',
      minimo: 5,
      aceptar: 'Anular',
      peligro: true,
    })
    if (motivo) anular.mutate({ e, motivo })
  }

  const filas = registros.data ?? []

  return (
    <div className={`${tarjeta} overflow-hidden`}>
      <h2 className="px-5 pt-4 font-medium text-tinta">Las últimas</h2>
      {error && (
        <p role="alert" className="mx-5 mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}
      <table className="mt-2 w-full text-sm">
        <thead className="border-y border-borde bg-piedra-50 text-left text-xs tracking-wide text-piedra-500 uppercase">
          <tr>
            <th className="px-5 py-2.5 font-medium">N°</th>
            <th className="py-2.5 pr-3 font-medium">Qué</th>
            <th className="py-2.5 pr-3 text-right font-medium">Productos</th>
            <th className="hidden py-2.5 pr-3 font-medium sm:table-cell">Quién</th>
            <th className="px-5 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-piedra-100">
          {registros.isPending && (
            <tr>
              <td colSpan={5} className="px-5 py-8 text-center text-piedra-400">
                Cargando…
              </td>
            </tr>
          )}
          {!registros.isPending && filas.length === 0 && (
            <tr>
              <td colSpan={5} className="px-5 py-8 text-center text-piedra-400">
                Todavía no se registró ninguna entrada ni salida.
              </td>
            </tr>
          )}
          {filas.map((e) => (
            <Fragment key={e.id}>
              <tr className={e.anulada_en ? 'text-piedra-400' : ''}>
                <td className="px-5 py-2.5 align-top">
                  <p className="font-medium tabular-nums text-tinta">{e.numero}</p>
                  <p className="text-xs text-piedra-400">
                    {new Date(e.ocurrido_en).toLocaleString('es-AR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </td>
                <td className="py-2.5 pr-3 align-top">
                  <p className={e.anulada_en ? 'line-through' : 'text-tinta'}>
                    <span className={e.anulada_en ? '' : e.sentido === 'salida' ? 'text-red-700' : 'text-verde-800'}>
                      {e.sentido === 'salida' ? 'Salida' : 'Entrada'}
                    </span>{' '}
                    · {e.motivo_nombre}
                    {conDeposito && <span className="text-piedra-500"> · {e.deposito}</span>}
                  </p>
                  {e.observacion && <p className="text-xs text-piedra-500">{e.observacion}</p>}
                  {e.anulada_en && (
                    <p className="text-xs text-red-700">
                      Anulada{e.anulada_por_nombre ? ` por ${e.anulada_por_nombre}` : ''}: {e.motivo_anulacion}
                    </p>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-right align-top tabular-nums">
                  {numero.format(e.productos)}
                  <span className="ml-1 text-xs text-piedra-400">({numero.format(e.unidades)})</span>
                </td>
                <td className="hidden py-2.5 pr-3 align-top text-piedra-500 sm:table-cell">
                  {e.usuario_nombre ?? '—'}
                </td>
                <td className="py-2.5 pr-3 text-right align-top sm:px-5">
                  <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end">
                    <button onClick={() => setAbierta(abierta === e.id ? null : e.id)} className={botonChico.suave}>
                      {abierta === e.id ? 'Cerrar' : 'Ver'}
                    </button>
                    {puedeAnular && !e.anulada_en && (
                      <button
                        onClick={() => pedirAnulacion(e)}
                        disabled={anular.isPending}
                        className="rounded-lg px-3 py-1.5 text-xs text-piedra-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                      >
                        Anular
                      </button>
                    )}
                  </div>
                </td>
              </tr>
              {abierta === e.id && (
                <tr>
                  <td colSpan={5} className="bg-piedra-50/60 px-5 py-3">
                    <Detalle id={e.id} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Detalle({ id }: { id: string }) {
  const lineas = useQuery({ queryKey: ['entrada-salida-lineas', id], queryFn: () => lineasDeEntradaSalida(id) })

  if (lineas.isPending) return <p className="text-sm text-piedra-400">Cargando…</p>

  return (
    <ul className="space-y-1 text-sm">
      {lineas.data?.map((l) => (
        <li key={l.id} className="flex justify-between gap-3">
          <span className="min-w-0">
            <span className="text-tinta">{l.nombre_interno}</span>{' '}
            <span className="font-mono text-xs text-piedra-400">{l.codigo}</span>
          </span>
          <span className="shrink-0 tabular-nums text-tinta">
            {numero.format(l.cantidad)} <span className="text-xs text-piedra-400">{l.unidad_medida}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
