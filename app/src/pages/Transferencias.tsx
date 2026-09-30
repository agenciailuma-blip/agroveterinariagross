import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { confirmar, pedirTexto } from '@/components/Dialogo'
import {
  anularTransferencia,
  buscarParaTransferir,
  depositoPropuesto,
  lineasDeTransferencia,
  listarDepositos,
  listarTransferencias,
  problemaDeLaTransferencia,
  quedaEnOrigen,
  registrarTransferencia,
  stockPorDeposito,
} from '@/lib/api/depositos'
import type { LineaATransferir, ProductoParaTransferir, Transferencia } from '@/lib/api/depositos'
import { enCastellano } from '@/lib/errores'
import { useTerminal } from '@/lib/terminal'
import { numero } from '@/lib/tipos'
import { boton, botonChico, campo, tarjeta } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  Transferencias: mover mercadería de un depósito a otro

  Hace falta desde que hay dos lugares: la bolsa que se lleva del local
  al segundo local tiene que dejar de contar acá y empezar a contar
  allá, sin que el total se mueva.

  Sale y entra en el mismo momento, como en OBTech. El ritmo es el de la
  toma de inventario: pasar el lector, tipear cuánto, Enter, y el foco
  vuelve solo al buscador. Se arma la lista entera y se confirma una vez.
  ─────────────────────────────────────────────────────────────
*/
export default function Transferencias() {
  const { tienePermiso } = useAuth()

  if (!tienePermiso('stock.ver')) {
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        No tenés permiso para ver el stock.
      </p>
    )
  }

  return <Pantalla puedeTransferir={tienePermiso('stock.transferir')} puedeConfigurar={tienePermiso('configuracion.gestionar')} />
}

function Pantalla({ puedeTransferir, puedeConfigurar }: { puedeTransferir: boolean; puedeConfigurar: boolean }) {
  const depositos = useQuery({ queryKey: ['depositos'], queryFn: listarDepositos })
  const activos = (depositos.data ?? []).filter((d) => d.activo)
  const [aviso, setAviso] = useState<string | null>(null)

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-tinta">Transferencias</h1>
        <p className="text-sm text-piedra-500">
          Mercadería que pasa de un depósito a otro. Sale de uno y entra en el otro en el momento; el
          total no cambia.
        </p>
      </div>

      {aviso && (
        <p className="rounded-xl bg-verde-50 px-4 py-3 text-sm text-verde-800 ring-1 ring-verde-200">{aviso}</p>
      )}

      {!depositos.isPending && activos.length < 2 ? (
        <div className={`${tarjeta} p-5 text-sm text-piedra-600`}>
          <p className="font-medium text-tinta">Hace falta un segundo depósito.</p>
          <p className="mt-1">
            Hoy hay uno solo, así que no hay adónde mover la mercadería. Cuando abra el segundo local, se
            agrega en{' '}
            {puedeConfigurar ? (
              <Link to="/configuracion?pestana=local" className="text-marca-700 hover:underline">
                Configuración → El local
              </Link>
            ) : (
              'Configuración → El local'
            )}
            .
          </p>
        </div>
      ) : (
        puedeTransferir &&
        activos.length >= 2 && <NuevaTransferencia depositos={activos} onListo={setAviso} />
      )}

      <Historial puedeAnular={puedeTransferir} onAviso={setAviso} />
    </div>
  )
}

function NuevaTransferencia({
  depositos,
  onListo,
}: {
  depositos: { id: string; nombre: string; es_principal: boolean; activo: boolean }[]
  onListo: (aviso: string) => void
}) {
  const qc = useQueryClient()
  const { terminal } = useTerminal()

  // Se propone llevar DESDE donde está esta PC: lo normal es cargar la
  // lista con la mercadería delante, en el depósito del que sale.
  const [origen, setOrigen] = useState<string | null>(() => depositoPropuesto(depositos, terminal?.deposito_id))
  const [destino, setDestino] = useState<string | null>(
    () => depositos.find((d) => d.id !== depositoPropuesto(depositos, terminal?.deposito_id))?.id ?? null,
  )
  const [lineas, setLineas] = useState<Omit<LineaATransferir, 'en_origen'>[]>([])
  const [observacion, setObservacion] = useState('')
  const [texto, setTexto] = useState('')
  const [elegido, setElegido] = useState<ProductoParaTransferir | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Uno por transferencia: si la respuesta se pierde y se vuelve a
  // apretar, la base la reconoce y no mueve dos veces.
  const [id, setId] = useState(() => crypto.randomUUID())

  const buscador = useRef<HTMLInputElement>(null)
  const campoCantidad = useRef<HTMLInputElement>(null)

  const nombreDe = (depId: string | null) => depositos.find((d) => d.id === depId)?.nombre ?? '—'

  const resultados = useQuery({
    queryKey: ['buscar-transferir', texto, origen, destino],
    queryFn: () => buscarParaTransferir(texto, origen!, destino!),
    enabled: texto.trim().length > 0 && !elegido && !!origen && !!destino && origen !== destino,
  })

  /*
    Cuánto hay en cada punta de lo que ya está en la lista. Se pide
    aparte y no se guarda en cada renglón: si se cambia el origen con la
    lista armada, los números tienen que ser los del depósito nuevo.
  */
  const idsEnLista = useMemo(() => lineas.map((l) => l.producto_id).sort(), [lineas])
  const existencias = useQuery({
    queryKey: ['stock-por-deposito', idsEnLista],
    queryFn: () => stockPorDeposito(idsEnLista),
    enabled: idsEnLista.length > 0,
  })
  const hay = (productoId: string, depId: string | null) =>
    (depId && existencias.data?.get(productoId)?.get(depId)) || 0

  const completas: LineaATransferir[] = lineas.map((l) => ({ ...l, en_origen: hay(l.producto_id, origen) }))
  const problema = problemaDeLaTransferencia(origen, destino, completas)

  // Un solo resultado con búsqueda larga es casi seguro un escaneo: se
  // elige solo y el foco salta a la cantidad.
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
      // Pasar dos veces la misma bolsa suma: es otra bolsa igual.
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

  function invertir() {
    setOrigen(destino)
    setDestino(origen)
  }

  const transferir = useMutation({
    mutationFn: () =>
      registrarTransferencia({
        id,
        origenId: origen!,
        destinoId: destino!,
        lineas: completas.map((l) => ({ producto_id: l.producto_id, cantidad: Number(l.cantidad) })),
        observacion,
      }),
    onSuccess: (n) => {
      const unidades = completas.reduce((s, l) => s + Number(l.cantidad), 0)
      onListo(
        `Transferencia ${n}: ${completas.length} producto${completas.length === 1 ? '' : 's'} (${numero.format(unidades)} en total) de ${nombreDe(origen)} a ${nombreDe(destino)}.`,
      )
      setLineas([])
      setObservacion('')
      setError(null)
      setId(crypto.randomUUID())
      qc.invalidateQueries({ queryKey: ['transferencias'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['stock-resumen'] })
      qc.invalidateQueries({ queryKey: ['stock-por-deposito'] })
    },
    onError: (e) => setError(enCastellano(e, 'No se pudo registrar la transferencia.')),
  })

  async function confirmarTransferencia() {
    const quedanNegativos = completas.filter((l) => quedaEnOrigen(l) < 0)
    if (quedanNegativos.length) {
      const primero = quedanNegativos[0]
      const sigue = await confirmar({
        titulo: `En ${nombreDe(origen)} no alcanza`,
        detalle:
          quedanNegativos.length === 1
            ? `Según el sistema hay ${numero.format(primero.en_origen)} de ${primero.nombre_interno} y quedaría en ${numero.format(quedaEnOrigen(primero))}. Si la mercadería está, transferí igual y después corregí el stock contándolo.`
            : `${quedanNegativos.length} productos quedarían en negativo en ${nombreDe(origen)}. Si la mercadería está, transferí igual y después corregí el stock contándolo.`,
        aceptar: 'Transferir igual',
      })
      if (!sigue) return
    }
    setError(null)
    transferir.mutate()
  }

  const unidades = completas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0)

  return (
    <div className={`${tarjeta} p-5`}>
      <h2 className="font-medium text-tinta">Nueva transferencia</h2>

      {/* Origen ⇄ destino en una fila, también en el celular: cada uno toma la mitad. */}
      <div className="mt-3 grid max-w-lg grid-cols-[1fr_auto_1fr] items-end gap-2">
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Sale de</span>
          <select value={origen ?? ''} onChange={(e) => setOrigen(e.target.value)} className={campo}>
            {depositos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={invertir}
          title="Invertir: que salga del destino y vaya al origen"
          aria-label="Invertir origen y destino"
          className={`${botonChico.suave} text-base`}
        >
          ⇄
        </button>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Va a</span>
          <select value={destino ?? ''} onChange={(e) => setDestino(e.target.value)} className={campo}>
            {depositos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      {origen === destino && (
        <p className="mt-2 text-sm text-amber-800">El origen y el destino son el mismo depósito.</p>
      )}

      {/* El buscador y la cantidad, en una línea: escanear, cantidad, Enter. */}
      <div className="mt-4 flex flex-wrap items-start gap-3">
        {elegido ? (
          <div className="min-w-64 flex-1 rounded-lg bg-piedra-50 px-3 py-2 ring-1 ring-borde">
            <p className="text-sm font-medium text-tinta">{elegido.nombre_interno}</p>
            <p className="text-xs text-piedra-500">
              <span className="font-mono">{elegido.codigo}</span> · en {nombreDe(origen)} hay{' '}
              {numero.format(elegido.en_origen)} · en {nombreDe(destino)} hay {numero.format(elegido.en_destino)}
            </p>
          </div>
        ) : (
          <div className="relative min-w-64 flex-1">
            <input
              ref={buscador}
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Pasá el lector o buscá por código o nombre"
              disabled={!origen || !destino || origen === destino}
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
                      <span>
                        <span className="text-tinta">{p.nombre_interno}</span>{' '}
                        <span className="font-mono text-xs text-piedra-400">{p.codigo}</span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-piedra-500">
                        hay {numero.format(p.en_origen)}
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
        {/*
          El ancho va en un envoltorio y no junto a `campo`: las dos son
          utilidades de ancho y gana la que la hoja de estilos pone
          última, no la que se escribe después (ver estilos.ts).
        */}
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
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-borde text-left text-xs tracking-wide text-piedra-500 uppercase">
              <tr>
                <th className="py-2 pr-3 font-medium">Producto</th>
                <th className="py-2 pr-3 text-right font-medium">Se lleva</th>
                <th className="hidden py-2 pr-3 text-right font-medium sm:table-cell">
                  Queda en {nombreDe(origen)}
                </th>
                <th className="hidden py-2 pr-3 text-right font-medium sm:table-cell">
                  Queda en {nombreDe(destino)}
                </th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-piedra-100">
              {completas.map((l) => {
                const queda = quedaEnOrigen(l)
                return (
                  <tr key={l.producto_id}>
                    <td className="py-2 pr-3">
                      <p className="text-tinta">{l.nombre_interno}</p>
                      <p className="font-mono text-xs text-piedra-400">{l.codigo}</p>
                      {/* En el celular, las dos columnas de «queda» van acá. */}
                      {!existencias.isPending && (
                        <p className="text-xs text-piedra-500 sm:hidden">
                          Queda en {nombreDe(origen)}:{' '}
                          <span className={queda < 0 ? 'font-medium text-red-700' : ''}>{numero.format(queda)}</span>
                          {' · '}en {nombreDe(destino)}:{' '}
                          {numero.format(hay(l.producto_id, destino) + (Number(l.cantidad) || 0))}
                        </p>
                      )}
                    </td>
                    <td className="w-28 py-2 pr-3 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={l.cantidad}
                        onChange={(e) =>
                          setLineas((actuales) =>
                            actuales.map((x) =>
                              x.producto_id === l.producto_id ? { ...x, cantidad: e.target.value } : x,
                            ),
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
                    <td className="hidden py-2 pr-3 text-right tabular-nums text-piedra-600 sm:table-cell">
                      {existencias.isPending
                        ? '…'
                        : numero.format(hay(l.producto_id, destino) + (Number(l.cantidad) || 0))}
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
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-piedra-100 pt-4">
        <label className="block min-w-64 flex-1">
          <span className="mb-1 block text-xs font-medium text-piedra-600">
            Observación <span className="font-normal text-piedra-400">(opcional)</span>
          </span>
          <input
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            placeholder="La lleva Juan en la camioneta"
            className={campo}
          />
        </label>
        <button
          onClick={confirmarTransferencia}
          disabled={!!problema || transferir.isPending}
          className={boton.principal}
        >
          {transferir.isPending
            ? 'Transfiriendo…'
            : lineas.length
              ? `Transferir ${lineas.length} producto${lineas.length === 1 ? '' : 's'} (${numero.format(unidades)})`
              : 'Transferir'}
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

function Historial({ puedeAnular, onAviso }: { puedeAnular: boolean; onAviso: (aviso: string) => void }) {
  const qc = useQueryClient()
  const transferencias = useQuery({ queryKey: ['transferencias'], queryFn: listarTransferencias })
  const [abierta, setAbierta] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const anular = useMutation({
    mutationFn: ({ t, motivo }: { t: Transferencia; motivo: string }) => anularTransferencia(t.id, motivo),
    onSuccess: (_, { t }) => {
      onAviso(`Transferencia ${t.numero} anulada: la mercadería volvió a ${t.origen}.`)
      setError(null)
      qc.invalidateQueries({ queryKey: ['transferencias'] })
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['stock-resumen'] })
      qc.invalidateQueries({ queryKey: ['stock-por-deposito'] })
    },
    onError: (e) => setError(enCastellano(e, 'No se pudo anular.')),
  })

  async function pedirAnulacion(t: Transferencia) {
    const motivo = await pedirTexto({
      titulo: `¿Anular la transferencia ${t.numero}?`,
      detalle: `La mercadería vuelve a ${t.origen}. La transferencia queda en la lista, anulada y con el motivo.`,
      etiqueta: 'Motivo',
      ejemplo: 'Se cargó al revés',
      minimo: 5,
      aceptar: 'Anular',
      peligro: true,
    })
    if (motivo) anular.mutate({ t, motivo })
  }

  const filas = transferencias.data ?? []

  return (
    <div className={`${tarjeta} overflow-hidden`}>
      <h2 className="px-5 pt-4 font-medium text-tinta">Las últimas</h2>
      {error && (
        <p role="alert" className="mx-5 mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}
      <div className="mt-2">
        <table className="w-full text-sm">
          <thead className="border-y border-borde bg-piedra-50 text-left text-xs tracking-wide text-piedra-500 uppercase">
            <tr>
              <th className="px-5 py-2.5 font-medium">N°</th>
              <th className="py-2.5 pr-3 font-medium">De → a</th>
              <th className="py-2.5 pr-3 text-right font-medium">Productos</th>
              <th className="hidden py-2.5 pr-3 font-medium sm:table-cell">Quién</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-piedra-100">
            {transferencias.isPending && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-piedra-400">
                  Cargando…
                </td>
              </tr>
            )}
            {!transferencias.isPending && filas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-piedra-400">
                  Todavía no se hizo ninguna transferencia.
                </td>
              </tr>
            )}
            {filas.map((t) => (
              <Fragment key={t.id}>
                <tr className={t.anulada_en ? 'text-piedra-400' : ''}>
                  <td className="px-5 py-2.5 align-top">
                    <p className="font-medium tabular-nums text-tinta">{t.numero}</p>
                    <p className="text-xs text-piedra-400">
                      {new Date(t.ocurrido_en).toLocaleString('es-AR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </td>
                  <td className="py-2.5 pr-3 align-top">
                    <p className={t.anulada_en ? 'line-through' : 'text-tinta'}>
                      {t.origen} → {t.destino}
                    </p>
                    {t.observacion && <p className="text-xs text-piedra-500">{t.observacion}</p>}
                    {t.anulada_en && (
                      <p className="text-xs text-red-700">
                        Anulada{t.anulada_por_nombre ? ` por ${t.anulada_por_nombre}` : ''}: {t.motivo_anulacion}
                      </p>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right align-top tabular-nums">
                    {numero.format(t.productos)}
                    <span className="ml-1 text-xs text-piedra-400">({numero.format(t.unidades)})</span>
                  </td>
                  <td className="hidden py-2.5 pr-3 align-top text-piedra-500 sm:table-cell">
                    {t.usuario_nombre ?? '—'}
                  </td>
                  <td className="py-2.5 pr-3 text-right align-top sm:px-5">
                    <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end">
                      <button onClick={() => setAbierta(abierta === t.id ? null : t.id)} className={botonChico.suave}>
                        {abierta === t.id ? 'Cerrar' : 'Ver'}
                      </button>
                      {puedeAnular && !t.anulada_en && (
                        <button
                          onClick={() => pedirAnulacion(t)}
                          disabled={anular.isPending}
                          className="rounded-lg px-3 py-1.5 text-xs text-piedra-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                        >
                          Anular
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {abierta === t.id && (
                  <tr>
                    <td colSpan={5} className="bg-piedra-50/60 px-5 py-3">
                      <Detalle transferenciaId={t.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Detalle({ transferenciaId }: { transferenciaId: string }) {
  const lineas = useQuery({
    queryKey: ['transferencia-lineas', transferenciaId],
    queryFn: () => lineasDeTransferencia(transferenciaId),
  })

  if (lineas.isPending) return <p className="text-sm text-piedra-400">Cargando…</p>

  return (
    <ul className="space-y-1 text-sm">
      {lineas.data?.map((l) => (
        <li key={l.id} className="flex justify-between gap-3">
          <span>
            <span className="text-tinta">{l.nombre_interno}</span>{' '}
            <span className="font-mono text-xs text-piedra-400">{l.codigo}</span>
          </span>
          <span className="tabular-nums text-tinta">
            {numero.format(l.cantidad)} <span className="text-xs text-piedra-400">{l.unidad_medida}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
