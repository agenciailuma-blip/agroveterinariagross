import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { pedirTexto } from '@/components/Dialogo'
import { TeclaAtajo } from '@/components/Atajos'
import { datosEmisor } from '@/lib/api/comprobante'
import {
  ESTADO_PEDIDO,
  anularPedido,
  avanceDelMinimo,
  borrarBorrador,
  bultosDe,
  claveDeFila,
  guardarBorrador,
  hacerPedido,
  leerBorrador,
  listarPedidos,
  listarProveedoresParaPedido,
  numeroDePedido,
  obtenerPedido,
  pedirConBorrador,
  productosParaPedido,
  renglonesAPedir,
  textoDelMinimo,
  textoParaWhatsapp,
  totalDelPedido,
} from '@/lib/api/pedidosProveedor'
import type { AvanceDelMinimo, EstadoPedido, FilaParaPedido, ProveedorParaPedido } from '@/lib/api/pedidosProveedor'
import { numeroDeOrden } from '@/lib/api/ordenesInternas'
import { useBotonConAtajo } from '@/lib/atajos'
import { enCastellano } from '@/lib/errores'
import { ESTADO_STOCK, moneda, numero } from '@/lib/tipos'
import { boton } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  Pedidos a proveedores — pedido de Lucas del 07/10

  Se elige el proveedor y aparecen todos sus productos: cuánto hay, con
  cuánto avisa, el último costo y lo que pidieron las órdenes internas.
  «Pedir» arranca con lo de las órdenes y se completa a mano —«un poco
  de cada cosa»—, y la pantalla va diciendo cuánto falta para el mínimo
  del proveedor, en lo que él lo cuente: pesos, bultos o kilos.

  Hecho el pedido, se imprime o se copia para WhatsApp. Las órdenes
  internas que entraron quedan pedidas.

  Lo ve quien compra (`compras.ver`); lo hace y lo anula quien registra
  compras (`compras.registrar`).
  ─────────────────────────────────────────────────────────────
*/

const claseInput =
  'w-full rounded-lg border border-borde px-2.5 py-1.5 text-sm text-tinta outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20'

const FILTROS: { valor: EstadoPedido | null; etiqueta: string }[] = [
  { valor: 'pedido', etiqueta: 'Pedidos' },
  { valor: 'anulado', etiqueta: 'Anulados' },
  { valor: null, etiqueta: 'Todos' },
]

const fechaCorta = (f: string) => new Date(`${f}T00:00:00`).toLocaleDateString('es-AR')

export default function PedidosProveedor() {
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()
  const puedePedir = tienePermiso('compras.registrar')

  const [filtro, setFiltro] = useState<EstadoPedido | null>('pedido')
  const [armando, setArmando] = useState(false)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const lista = useQuery({ queryKey: ['pedidos-proveedor', filtro], queryFn: () => listarPedidos(filtro) })

  function avisar(texto: string) {
    setAviso(texto)
    setError(null)
    setTimeout(() => setAviso(null), 6000)
  }

  function refrescar() {
    qc.invalidateQueries({ queryKey: ['pedidos-proveedor'] })
    qc.invalidateQueries({ queryKey: ['pedido-proveedor'] })
    qc.invalidateQueries({ queryKey: ['productos-para-pedido'] })
    qc.invalidateQueries({ queryKey: ['ordenes-internas'] })
    qc.invalidateQueries({ queryKey: ['orden-interna'] })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-tinta">Pedidos a proveedores</h1>
          <p className="text-sm text-piedra-500">
            Todo lo que se le compra a un proveedor, con su stock y lo que pidieron las órdenes internas.
          </p>
        </div>
        {puedePedir && !armando && (
          <button
            onClick={() => {
              setAbierto(null)
              setError(null)
              setArmando(true)
            }}
            className={boton.principal}
          >
            Nuevo pedido
          </button>
        )}
      </div>

      {aviso && <p className="rounded-lg bg-verde-50 px-3 py-2 text-sm text-verde-800 ring-1 ring-verde-200">{aviso}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      {armando && (
        <ArmarPedido
          onHecho={(id, n) => {
            setArmando(false)
            setAbierto(id)
            setFiltro('pedido')
            avisar(`Pedido ${numeroDePedido(n)} hecho. Imprimilo o copialo para mandarlo por WhatsApp.`)
            refrescar()
          }}
          onCancelar={() => {
            setArmando(false)
            setError(null)
          }}
          onError={setError}
        />
      )}

      {abierto && !armando && (
        <DetallePedido
          id={abierto}
          puedeAnular={puedePedir}
          onCerrar={() => setAbierto(null)}
          onAnulado={() => {
            avisar('Pedido anulado. Las órdenes internas que había cubierto vuelven a estar pendientes.')
            refrescar()
          }}
          onAviso={avisar}
          onError={setError}
        />
      )}

      <div className="flex flex-wrap gap-1 rounded-lg bg-piedra-100 p-1">
        {FILTROS.map((f) => (
          <button
            key={f.etiqueta}
            onClick={() => setFiltro(f.valor)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              filtro === f.valor ? 'bg-white text-tinta shadow-sm' : 'text-piedra-500 hover:text-tinta'
            }`}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>

      {lista.isPending ? (
        <p className="text-sm text-piedra-500">Cargando…</p>
      ) : lista.isError ? (
        <p className="text-sm text-red-700">{enCastellano(lista.error, 'No se pudieron traer los pedidos.')}</p>
      ) : !lista.data?.length ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-borde bg-white/60 py-12 text-center">
          <p className="text-sm text-piedra-500">
            {filtro === 'pedido' ? 'Todavía no se hizo ningún pedido.' : 'No hay pedidos en este estado.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-piedra-100 rounded-xl bg-white shadow-sm ring-1 ring-borde">
          {lista.data.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => {
                  setArmando(false)
                  setAbierto(p.id)
                }}
                className={`flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-left hover:bg-marca-50 ${
                  abierto === p.id ? 'bg-marca-50' : ''
                }`}
              >
                <span className="min-w-0">
                  <span className="block font-medium text-tinta">
                    N° {numeroDePedido(p.numero)} · {p.proveedor}
                  </span>
                  <span className="block text-xs text-piedra-500">
                    {fechaCorta(p.fecha)} · {numero.format(p.renglones)} {p.renglones === 1 ? 'renglón' : 'renglones'}
                    {p.total ? ` · ${moneda.format(p.total)}` : ''}
                  </span>
                  {p.observacion && <span className="block text-xs break-words text-piedra-400">{p.observacion}</span>}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${ESTADO_PEDIDO[p.estado].clase}`}>
                  {ESTADO_PEDIDO[p.estado].etiqueta}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/*
  ─────────────────────────────────────────────────────────────
  Armar el pedido
  ─────────────────────────────────────────────────────────────
*/

function ArmarPedido({
  onHecho,
  onCancelar,
  onError,
}: {
  onHecho: (id: string, numero: number) => void
  onCancelar: () => void
  onError: (e: string | null) => void
}) {
  const botonPedir = useBotonConAtajo('F9')
  const [proveedorId, setProveedorId] = useState('')
  const [pedir, setPedir] = useState<Record<string, number>>({})
  const [observacion, setObservacion] = useState('')
  const [buscar, setBuscar] = useState('')
  const [soloLoQueFalta, setSoloLoQueFalta] = useState(false)
  /*
    El id se genera una vez por pedido y no cambia. Si la base lo
    rechazó, no se creó nada y se puede volver a usar; si se cortó la
    conexión con el pedido ya hecho, reintentar devuelve el mismo número
    en vez de hacer otro.
  */
  const [idPedido] = useState(() => crypto.randomUUID())

  const proveedores = useQuery({ queryKey: ['proveedores-para-pedido'], queryFn: listarProveedoresParaPedido })
  const filas = useQuery({
    queryKey: ['productos-para-pedido', proveedorId],
    queryFn: () => productosParaPedido(proveedorId),
    enabled: !!proveedorId,
    // Mientras se arma no se recarga sola: lo escrito en «Pedir» no se pisa.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  })
  const proveedor = proveedores.data?.find((p) => p.id === proveedorId) ?? null

  // Al elegir el proveedor: el borrador de esta computadora, o lo que pidieron las órdenes.
  useEffect(() => {
    if (!filas.data || !proveedorId) return
    const b = leerBorrador(proveedorId)
    setPedir(pedirConBorrador(filas.data, b))
    setObservacion(b?.observacion ?? '')
  }, [filas.data, proveedorId])

  function cambiar(clave: string, valor: number) {
    const nuevo = { ...pedir, [clave]: valor }
    setPedir(nuevo)
    if (proveedorId) guardarBorrador(proveedorId, { pedir: nuevo, observacion })
  }

  const todas = filas.data ?? []
  const aMandar = renglonesAPedir(todas, pedir)
  const conDatos = aMandar.map((r) => {
    const f = todas.find((x) => claveDeFila(x) === claveDeFila({ producto_id: r.producto_id, lineas_orden: r.lineas_orden }))
    return { cantidad: r.cantidad, costo: r.costo, peso_kg: f?.peso_kg ?? null, unidades_por_bulto: f?.unidades_por_bulto ?? null }
  })
  const total = totalDelPedido(conDatos)
  const avance = avanceDelMinimo(conDatos, proveedor?.minimo_tipo ?? null, proveedor?.minimo_valor ?? null)

  const visibles = useMemo(() => {
    const texto = buscar.trim().toLowerCase()
    return todas.filter((f) => {
      if (texto && !`${f.codigo ?? ''} ${f.descripcion}`.toLowerCase().includes(texto)) return false
      if (soloLoQueFalta && f.estado === 'ok' && f.en_ordenes === 0 && !((pedir[claveDeFila(f)] ?? 0) > 0)) return false
      return true
    })
  }, [todas, buscar, soloLoQueFalta, pedir])

  const hacer = useMutation({
    mutationFn: () => hacerPedido({ id: idPedido, proveedorId, lineas: aMandar, observacion }),
    onSuccess: (n) => {
      borrarBorrador(proveedorId)
      onHecho(idPedido, n)
    },
    onError: (e) => {
      onError(enCastellano(e, 'No se pudo hacer el pedido.'))
      // Si una orden cambió mientras tanto, se vuelve a mirar cómo quedó.
      filas.refetch()
    },
  })

  return (
    <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-borde">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-0 flex-1 basis-64">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Proveedor</span>
          <select
            autoFocus
            value={proveedorId}
            onChange={(e) => {
              setProveedorId(e.target.value)
              setPedir({})
              setObservacion('')
              onError(null)
            }}
            className={claseInput}
          >
            <option value="">Elegí a quién se le pide…</option>
            {(proveedores.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <button onClick={onCancelar} className={boton.suave}>
          Cancelar
        </button>
      </div>

      {proveedor && <Minimo proveedor={proveedor} avance={avance} />}

      {proveedorId && filas.isPending && <p className="text-sm text-piedra-500">Trayendo sus productos…</p>}
      {filas.isError && (
        <p className="text-sm text-red-700">{enCastellano(filas.error, 'No se pudieron traer los productos.')}</p>
      )}

      {filas.data && (
        <>
          {filas.data.length === 0 ? (
            <p className="rounded-lg bg-piedra-50 px-3 py-2 text-sm text-piedra-600 ring-1 ring-borde">
              Este proveedor no tiene productos asignados ni órdenes internas pendientes. El proveedor de cada producto
              se elige en su ficha.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="search"
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                  placeholder="Buscar en sus productos…"
                  className={`${claseInput} min-w-0 flex-1 basis-48`}
                />
                <label className="flex items-center gap-2 text-sm text-piedra-600">
                  <input
                    type="checkbox"
                    checked={soloLoQueFalta}
                    onChange={(e) => setSoloLoQueFalta(e.target.checked)}
                    className="size-4 rounded border-borde accent-marca-700"
                  />
                  Sólo lo que hace falta
                </label>
              </div>

              <ul className="divide-y divide-piedra-100 rounded-lg ring-1 ring-borde">
                {visibles.map((f) => (
                  <FilaDelPedido
                    key={claveDeFila(f)}
                    f={f}
                    valor={pedir[claveDeFila(f)] ?? 0}
                    onCambio={(v) => cambiar(claveDeFila(f), v)}
                  />
                ))}
                {visibles.length === 0 && (
                  <li className="px-3 py-4 text-center text-sm text-piedra-500">Nada con ese filtro.</li>
                )}
              </ul>
            </>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-piedra-600">Observación para el proveedor</span>
            <textarea
              rows={2}
              value={observacion}
              onChange={(e) => {
                setObservacion(e.target.value)
                if (proveedorId) guardarBorrador(proveedorId, { pedir, observacion: e.target.value })
              }}
              placeholder="Que venga con el viajante"
              className={`${claseInput} resize-y`}
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-piedra-50 px-3 py-2.5 ring-1 ring-borde">
            <p className="text-sm text-piedra-600">
              <strong className="text-tinta">{numero.format(aMandar.length)}</strong>{' '}
              {aMandar.length === 1 ? 'renglón' : 'renglones'}
              {total > 0 && (
                <>
                  {' · '}
                  <strong className="text-tinta">{moneda.format(total)}</strong>{' '}
                  <span className="text-xs text-piedra-400">al último costo, con IVA</span>
                </>
              )}
            </p>
            <button
              ref={botonPedir}
              onClick={() => hacer.mutate()}
              disabled={!aMandar.length || hacer.isPending}
              className={boton.principal}
            >
              {hacer.isPending ? 'Haciendo el pedido…' : 'Hacer el pedido'}
              {!hacer.isPending && <TeclaAtajo tecla="F9" clara />}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

/** El mínimo del proveedor y cuánto falta, en su unidad. */
function Minimo({ proveedor, avance }: { proveedor: ProveedorParaPedido; avance: AvanceDelMinimo | null }) {
  if (!proveedor.minimo_tipo || !proveedor.minimo_valor) {
    return (
      <p className="rounded-lg bg-piedra-50 px-3 py-2 text-sm text-piedra-600 ring-1 ring-borde">
        No tiene un pedido mínimo cargado. Si pide uno, se carga en su ficha, en Compras → Proveedores.
      </p>
    )
  }
  const minimo = textoDelMinimo(proveedor.minimo_tipo, proveedor.minimo_valor)
  const llega = avance?.llega ?? false
  return (
    <div
      className={`rounded-lg px-3 py-2 text-sm ring-1 ${
        llega ? 'bg-verde-50 text-verde-800 ring-verde-200' : 'bg-amber-50 text-amber-900 ring-amber-200'
      }`}
    >
      <p>
        Pide un mínimo de <strong>{minimo}</strong>
        {proveedor.minimo_tipo === 'monto' && ' (con IVA)'}.{' '}
        {avance &&
          (llega ? (
            <strong>El pedido llega: lleva {textoDelMinimo(avance.tipo, avance.llevado)}.</strong>
          ) : (
            <>
              Lleva {textoDelMinimo(avance.tipo, avance.llevado)}:{' '}
              <strong>faltan {textoDelMinimo(avance.tipo, avance.falta)}.</strong>
            </>
          ))}
      </p>
      {avance && avance.sinDato > 0 && (
        <p className="mt-0.5 text-xs">
          {avance.sinDato === 1 ? 'Un renglón no se cuenta' : `${avance.sinDato} renglones no se cuentan`}:{' '}
          {avance.tipo === 'monto'
            ? `no ${avance.sinDato === 1 ? 'tiene' : 'tienen'} costo.`
            : avance.tipo === 'kilos'
              ? `no ${avance.sinDato === 1 ? 'tiene' : 'tienen'} el peso cargado.`
              : `no ${avance.sinDato === 1 ? 'dice' : 'dicen'} cuántas unidades trae el bulto.`}{' '}
          Se cargan en la ficha del producto.
        </p>
      )}
    </div>
  )
}

/*
  Una fila: qué es, cuánto hay y con cuánto avisa, lo que pidieron las
  órdenes, y cuánto pedir. En el celular se apila; nunca se desplaza
  hacia el costado.
*/
function FilaDelPedido({ f, valor, onCambio }: { f: FilaParaPedido; valor: number; onCambio: (v: number) => void }) {
  const bultos = valor > 0 ? bultosDe(valor, f.unidades_por_bulto) : null
  const esLibre = !f.producto_id

  return (
    <li className={`flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-3 py-2.5 ${valor > 0 ? 'bg-marca-50/40' : ''}`}>
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm font-medium break-words text-tinta">{f.descripcion}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-piedra-500">
          {f.codigo && <span className="font-mono text-piedra-400">{f.codigo}</span>}
          {esLibre ? (
            <span>No está en el catálogo</span>
          ) : (
            <>
              {f.estado !== 'ok' && (
                <span className={`rounded-full px-1.5 py-px text-[11px] font-medium ring-1 ${ESTADO_STOCK[f.estado].clase}`}>
                  {ESTADO_STOCK[f.estado].etiqueta}
                </span>
              )}
              <span>
                Hay {numero.format(f.stock ?? 0)}
                {f.umbral_bajo != null && ` · avisa con ${numero.format(f.umbral_bajo)}`}
              </span>
              {f.costo != null && (
                <span title={f.costo_de_este ? 'Última compra a este proveedor' : 'Costo de la ficha'}>
                  {moneda.format(f.costo)}
                  {!f.costo_de_este && ' (ficha)'}
                </span>
              )}
              {f.unidades_por_bulto != null && <span>bulto de {numero.format(f.unidades_por_bulto)}</span>}
              {f.peso_kg != null && <span>{numero.format(f.peso_kg)} kg</span>}
            </>
          )}
        </p>
        {f.en_ordenes > 0 && (
          <p className="mt-0.5 text-xs text-amber-800">
            Pidieron {numero.format(f.en_ordenes)} en {f.ordenes.length === 1 ? 'la orden' : 'las órdenes'}{' '}
            {f.ordenes.map(numeroDeOrden).join(', ')}
          </p>
        )}
        {!f.es_del_proveedor && !esLibre && (
          <p className="mt-0.5 text-xs text-piedra-400">En su ficha figura otro proveedor; una orden se lo pidió a éste.</p>
        )}
      </div>
      <label className="w-24 shrink-0 text-right">
        <span className="sr-only">Pedir</span>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={valor || ''}
          onChange={(e) => onCambio(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
          placeholder="0"
          className={`${claseInput} text-right tabular-nums`}
        />
        {bultos != null && (
          <span className="mt-0.5 block text-[11px] text-piedra-500">
            {numero.format(bultos)} {bultos === 1 ? 'bulto' : 'bultos'}
          </span>
        )}
      </label>
    </li>
  )
}

/*
  ─────────────────────────────────────────────────────────────
  Un pedido hecho
  ─────────────────────────────────────────────────────────────
*/

function DetallePedido({
  id,
  puedeAnular,
  onCerrar,
  onAnulado,
  onAviso,
  onError,
}: {
  id: string
  puedeAnular: boolean
  onCerrar: () => void
  onAnulado: () => void
  onAviso: (t: string) => void
  onError: (e: string | null) => void
}) {
  const pedido = useQuery({ queryKey: ['pedido-proveedor', id], queryFn: () => obtenerPedido(id) })
  const emisor = useQuery({ queryKey: ['emisor'], queryFn: datosEmisor })
  const [texto, setTexto] = useState<string | null>(null)

  const anular = useMutation({
    mutationFn: (motivo: string) => anularPedido(id, motivo),
    onSuccess: onAnulado,
    onError: (e) => onError(enCastellano(e, 'No se pudo anular el pedido.')),
  })

  const p = pedido.data
  if (pedido.isPending) return <p className="text-sm text-piedra-500">Abriendo el pedido…</p>
  if (!p) return null

  const avance = avanceDelMinimo(p.lineas, p.minimo_tipo, p.minimo_valor)
  const total = totalDelPedido(p.lineas)

  async function copiar() {
    const t = textoParaWhatsapp(p!, emisor.data?.nombre_fantasia || emisor.data?.razon_social || 'Agroveterinaria Gross')
    try {
      await navigator.clipboard.writeText(t)
      onAviso('Copiado. Pegalo en el chat del proveedor.')
      setTexto(null)
    } catch {
      // Sin permiso para el portapapeles: se muestra para copiarlo a mano.
      setTexto(t)
    }
  }

  return (
    <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-borde">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-piedra-500">Pedido a proveedor</p>
          <h2 className="text-lg font-semibold break-words text-tinta">
            N° {numeroDePedido(p.numero)} · {p.proveedor}
          </h2>
          <p className="text-xs text-piedra-400">
            {fechaCorta(p.fecha)} · lo hizo {p.creado_por ?? '—'}
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${ESTADO_PEDIDO[p.estado].clase}`}>
          {ESTADO_PEDIDO[p.estado].etiqueta}
        </span>
      </div>

      <ul className="mt-3 divide-y divide-piedra-100">
        {p.lineas.map((l) => {
          const bultos = bultosDe(l.cantidad, l.unidades_por_bulto)
          return (
            <li key={l.renglon} className="flex items-start justify-between gap-3 py-1.5 text-sm">
              <span className="min-w-0">
                <span className="block break-words text-tinta">{l.descripcion}</span>
                <span className="text-xs text-piedra-400">
                  {l.codigo && <span className="font-mono">{l.codigo}</span>}
                  {l.codigo && l.costo != null && ' · '}
                  {l.costo != null && `${moneda.format(l.costo)} c/u`}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-medium tabular-nums text-tinta">{numero.format(l.cantidad)}</span>
                {bultos != null && (
                  <span className="block text-[11px] text-piedra-500">
                    {numero.format(bultos)} {bultos === 1 ? 'bulto' : 'bultos'}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="mt-3 space-y-1 rounded-lg bg-piedra-50 px-3 py-2 text-sm ring-1 ring-borde">
        {total > 0 && (
          <p>
            <span className="text-piedra-500">Total, al último costo con IVA:</span> <strong>{moneda.format(total)}</strong>
          </p>
        )}
        {avance && (
          <p>
            <span className="text-piedra-500">Mínimo del proveedor:</span> {textoDelMinimo(avance.tipo, avance.minimo)} ·{' '}
            {avance.llega ? 'llegaba' : `faltaban ${textoDelMinimo(avance.tipo, avance.falta)}`}
          </p>
        )}
        {p.observacion && (
          <p>
            <span className="text-piedra-500">Observación:</span> {p.observacion}
          </p>
        )}
        {p.ordenes.length > 0 && (
          <p>
            <span className="text-piedra-500">
              Cubrió {p.ordenes.length === 1 ? 'la orden interna' : 'las órdenes internas'}:
            </span>{' '}
            {p.ordenes.map(numeroDeOrden).join(', ')}
          </p>
        )}
        {p.estado === 'anulado' && (
          <p className="text-piedra-500">
            Anulado por {p.anulado_por ?? '—'}
            {p.motivo_anulacion ? `: ${p.motivo_anulacion}` : ''}
          </p>
        )}
      </div>

      {texto && (
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Copialo desde acá</span>
          <textarea readOnly rows={6} value={texto} className={`${claseInput} font-mono text-xs`} onFocus={(e) => e.target.select()} />
        </label>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link to={`/pedido-proveedor/${p.id}`} className={boton.principal}>
          Imprimir
        </Link>
        <button onClick={copiar} className={boton.secundario}>
          Copiar para WhatsApp
        </button>
        {p.estado === 'pedido' && puedeAnular && (
          <button
            onClick={async () => {
              const motivo = await pedirTexto({
                titulo: `¿Anular el pedido ${numeroDePedido(p.numero)}?`,
                etiqueta: 'Por qué',
                ejemplo: 'El proveedor no tenía stock',
                minimo: 3,
                aceptar: 'Anular',
              })
              if (motivo) anular.mutate(motivo)
            }}
            disabled={anular.isPending}
            className={boton.suave}
          >
            Anular
          </button>
        )}
        <button onClick={onCerrar} className={boton.suave}>
          Cerrar
        </button>
      </div>
    </section>
  )
}
