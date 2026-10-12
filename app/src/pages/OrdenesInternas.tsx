import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { pedirTexto } from '@/components/Dialogo'
import {
  ESTADO_ORDEN,
  anularOrden,
  buscarClientesParaOrden,
  buscarProductosParaOrden,
  crearSector,
  guardarOrden,
  listarOrdenes,
  listarProveedoresParaOrden,
  listarSectores,
  marcarOrden,
  numeroDeOrden,
  obtenerOrden,
  porProveedor,
  problemaConOrden,
} from '@/lib/api/ordenesInternas'
import type { EstadoOrden, RenglonOrden, Sector } from '@/lib/api/ordenesInternas'
import { numeroDePedido } from '@/lib/api/pedidosProveedor'
import { enCastellano } from '@/lib/errores'
import { numero } from '@/lib/tipos'
import { boton, botonChico } from '@/estilos'

/*
  Órdenes de compra internas — pedido de Lucas del 07/10, con su modelo
  del 08/10.

  Un sector le pide a otro lo que hay que comprar: «que él me presente
  una hoja, no que sea todo de palabra». Se carga como una factura —
  código, descripción, proveedor y cantidad—, se imprime y se firma.
  Compras la marca pedida cuando la pidió.

  La hace cualquier puesto (`compras.solicitar`); marcarla pedida es de
  quien compra (`compras.ver`).
*/

const claseInput =
  'w-full rounded-lg border border-borde px-2.5 py-1.5 text-sm text-tinta outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20'

const FILTROS: { valor: EstadoOrden | null; etiqueta: string }[] = [
  { valor: 'pendiente', etiqueta: 'Pendientes' },
  { valor: 'pedida', etiqueta: 'Pedidas' },
  { valor: 'anulada', etiqueta: 'Anuladas' },
  { valor: null, etiqueta: 'Todas' },
]

const hoy = () => new Date().toLocaleDateString('en-CA')
const fechaCorta = (f: string) => new Date(`${f}T00:00:00`).toLocaleDateString('es-AR')

interface Formulario {
  id: string
  /** El número, si ya existe: se está corrigiendo una pendiente. */
  numero: number | null
  fecha: string
  emiteId: string
  recibeId: string
  observacion: string
  clienteId: string | null
  clienteNombre: string | null
  contacto: string
  lineas: (RenglonOrden & { clave: string })[]
}

function formularioNuevo(sectores: Sector[]): Formulario {
  return {
    id: crypto.randomUUID(),
    numero: null,
    fecha: hoy(),
    emiteId: '',
    // Casi siempre se le pide a Compras.
    recibeId: sectores.find((s) => s.nombre === 'Compras')?.id ?? '',
    observacion: '',
    clienteId: null,
    clienteNombre: null,
    contacto: '',
    lineas: [],
  }
}

export default function OrdenesInternas() {
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()
  const puedeHacer = tienePermiso('compras.solicitar')
  const compra = tienePermiso('compras.ver')

  const [filtro, setFiltro] = useState<EstadoOrden | null>('pendiente')
  const [abierta, setAbierta] = useState<string | null>(null)
  const [form, setForm] = useState<Formulario | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const sectores = useQuery({ queryKey: ['sectores'], queryFn: listarSectores })
  const lista = useQuery({ queryKey: ['ordenes-internas', filtro], queryFn: () => listarOrdenes(filtro) })
  const detalle = useQuery({
    queryKey: ['orden-interna', abierta],
    queryFn: () => obtenerOrden(abierta!),
    enabled: !!abierta,
  })

  function avisar(texto: string) {
    setAviso(texto)
    setError(null)
    setTimeout(() => setAviso(null), 5000)
  }

  function refrescar() {
    qc.invalidateQueries({ queryKey: ['ordenes-internas'] })
    qc.invalidateQueries({ queryKey: ['orden-interna'] })
  }

  const guardar = useMutation({
    mutationFn: (f: Formulario) =>
      guardarOrden({
        id: f.id,
        emiteId: f.emiteId,
        recibeId: f.recibeId,
        fecha: f.fecha,
        observacion: f.observacion,
        clienteId: f.clienteId,
        contacto: f.contacto,
        lineas: f.lineas,
      }),
    onSuccess: (n, f) => {
      avisar(f.numero ? `Orden ${numeroDeOrden(n)} corregida.` : `Orden ${numeroDeOrden(n)} guardada. Ya se puede imprimir.`)
      setForm(null)
      setAbierta(f.id)
      refrescar()
    },
    onError: (e) => setError(enCastellano(e, 'No se pudo guardar la orden.')),
  })

  const marcar = useMutation({
    mutationFn: ({ id, pedida }: { id: string; pedida: boolean }) => marcarOrden(id, pedida),
    onSuccess: (_r, { pedida }) => {
      avisar(pedida ? 'Marcada como pedida.' : 'Vuelve a estar pendiente.')
      refrescar()
    },
    onError: (e) => setError(enCastellano(e, 'No se pudo cambiar la orden.')),
  })

  const anular = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) => anularOrden(id, motivo),
    onSuccess: () => {
      avisar('Orden anulada.')
      refrescar()
    },
    onError: (e) => setError(enCastellano(e, 'No se pudo anular la orden.')),
  })

  function nueva() {
    setAbierta(null)
    setError(null)
    setForm(formularioNuevo(sectores.data ?? []))
  }

  function corregir() {
    const o = detalle.data
    if (!o) return
    setError(null)
    setForm({
      id: o.id,
      numero: o.numero,
      fecha: o.fecha,
      emiteId: o.emite_id,
      recibeId: o.recibe_id,
      observacion: o.observacion ?? '',
      clienteId: o.cliente_id,
      clienteNombre: o.cliente,
      contacto: o.contacto ?? '',
      lineas: o.lineas.map((l) => ({ ...l, clave: crypto.randomUUID() })),
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-tinta">Órdenes de compra internas</h1>
          <p className="text-sm text-piedra-500">
            Lo que un sector le pide a otro que compre. Se imprime y la firma quien la emite.
          </p>
        </div>
        {puedeHacer && !form && (
          <button onClick={nueva} disabled={!sectores.data} className={boton.principal}>
            Nueva orden
          </button>
        )}
      </div>

      {aviso && <p className="rounded-lg bg-verde-50 px-3 py-2 text-sm text-verde-800 ring-1 ring-verde-200">{aviso}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}

      {form && sectores.data && (
        <Editor
          form={form}
          onCambio={setForm}
          sectores={sectores.data}
          onSectorCreado={() => qc.invalidateQueries({ queryKey: ['sectores'] })}
          guardando={guardar.isPending}
          onGuardar={() => {
            const problema = problemaConOrden(form)
            if (problema) setError(problema)
            else guardar.mutate(form)
          }}
          onCancelar={() => {
            setForm(null)
            setError(null)
          }}
        />
      )}

      {/* La orden abierta: lo mismo que el papel, con lo que se puede hacer. */}
      {abierta && !form && detalle.data && (
        <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-borde">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs text-piedra-500">Orden de compra interna</p>
              <h2 className="text-lg font-semibold text-tinta">
                N° {numeroDeOrden(detalle.data.numero)} · {fechaCorta(detalle.data.fecha)}
              </h2>
              <p className="text-sm text-piedra-600">
                Emite <strong>{detalle.data.emite}</strong> · recibe <strong>{detalle.data.recibe}</strong>
              </p>
              <p className="text-xs text-piedra-400">La cargó {detalle.data.creada_por ?? '—'}</p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${ESTADO_ORDEN[detalle.data.estado].clase}`}>
              {ESTADO_ORDEN[detalle.data.estado].etiqueta}
            </span>
          </div>

          <div className="mt-3 space-y-3">
            {porProveedor(detalle.data.lineas).map((g) => (
              <div key={g.proveedor ?? 'sin'}>
                <p className="text-xs font-semibold tracking-wide text-piedra-500 uppercase">
                  {g.proveedor ?? 'Sin proveedor'}
                </p>
                <ul className="divide-y divide-piedra-100">
                  {g.lineas.map((l) => (
                    <li key={l.renglon} className="flex items-start justify-between gap-3 py-1.5 text-sm">
                      <span className="min-w-0">
                        <span className="block text-tinta">{l.descripcion}</span>
                        {l.codigo && <span className="font-mono text-xs text-piedra-400">{l.codigo}</span>}
                        {l.pedido_numero != null && (
                          <span className="block text-xs text-verde-700">
                            En el pedido {numeroDePedido(l.pedido_numero)}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 tabular-nums font-medium text-tinta">{numero.format(l.cantidad)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {(detalle.data.observacion || detalle.data.cliente || detalle.data.contacto) && (
            <div className="mt-3 space-y-1 rounded-lg bg-piedra-50 px-3 py-2 text-sm ring-1 ring-borde">
              {detalle.data.observacion && (
                <p>
                  <span className="text-piedra-500">Observación:</span> {detalle.data.observacion}
                </p>
              )}
              {(detalle.data.cliente || detalle.data.contacto) && (
                <p>
                  <span className="text-piedra-500">Para el cliente:</span>{' '}
                  {[detalle.data.cliente, detalle.data.contacto].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          )}
          {detalle.data.estado === 'anulada' && detalle.data.motivo_anulacion && (
            <p className="mt-2 text-sm text-piedra-500">Anulada: {detalle.data.motivo_anulacion}</p>
          )}
          {detalle.data.estado === 'pedida' && (
            <p className="mt-2 text-sm text-piedra-500">Pedida por {detalle.data.pedida_por ?? '—'}.</p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link to={`/orden-interna/${detalle.data.id}`} className={boton.principal}>
              Imprimir
            </Link>
            {/* Con renglones ya pedidos no se corrige: perderían el vínculo con su pedido. */}
            {detalle.data.estado === 'pendiente' && puedeHacer && !detalle.data.lineas.some((l) => l.pedido_numero != null) && (
              <button onClick={corregir} className={boton.secundario}>
                Corregir
              </button>
            )}
            {detalle.data.estado === 'pendiente' && compra && (
              <button
                onClick={() => marcar.mutate({ id: detalle.data!.id, pedida: true })}
                disabled={marcar.isPending}
                className={boton.secundario}
              >
                Marcar pedida
              </button>
            )}
            {detalle.data.estado === 'pedida' && compra && (
              <button
                onClick={() => marcar.mutate({ id: detalle.data!.id, pedida: false })}
                disabled={marcar.isPending}
                className={boton.suave}
              >
                Volver a pendiente
              </button>
            )}
            {detalle.data.estado === 'pendiente' && puedeHacer && (
              <button
                onClick={async () => {
                  const motivo = await pedirTexto({
                    titulo: `¿Anular la orden ${numeroDeOrden(detalle.data!.numero)}?`,
                    etiqueta: 'Por qué',
                    ejemplo: 'Ya llegó por otro lado',
                    minimo: 3,
                    aceptar: 'Anular',
                  })
                  if (motivo) anular.mutate({ id: detalle.data!.id, motivo })
                }}
                className={boton.suave}
              >
                Anular
              </button>
            )}
            <button onClick={() => setAbierta(null)} className={boton.suave}>
              Cerrar
            </button>
          </div>
        </section>
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
        <p className="text-sm text-red-700">{enCastellano(lista.error, 'No se pudieron traer las órdenes.')}</p>
      ) : !lista.data?.length ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-borde bg-white/60 py-12 text-center">
          <p className="text-sm text-piedra-500">
            {filtro === 'pendiente' ? 'No hay órdenes esperando.' : 'No hay órdenes en este estado.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-piedra-100 rounded-xl bg-white shadow-sm ring-1 ring-borde">
          {lista.data.map((o) => (
            <li key={o.id}>
              <button
                onClick={() => {
                  setForm(null)
                  setAbierta(o.id)
                }}
                className={`flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-left hover:bg-marca-50 ${
                  abierta === o.id ? 'bg-marca-50' : ''
                }`}
              >
                <span className="min-w-0">
                  <span className="block font-medium text-tinta">
                    N° {numeroDeOrden(o.numero)} · {fechaCorta(o.fecha)}
                  </span>
                  <span className="block text-xs text-piedra-500">
                    {o.emite} → {o.recibe} · {numero.format(o.renglones)} {o.renglones === 1 ? 'renglón' : 'renglones'}
                    {o.cliente ? ` · para ${o.cliente}` : ''}
                  </span>
                  {o.observacion && <span className="block text-xs break-words text-piedra-400">{o.observacion}</span>}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${ESTADO_ORDEN[o.estado].clase}`}>
                  {ESTADO_ORDEN[o.estado].etiqueta}
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
  El formulario: como una factura
  ─────────────────────────────────────────────────────────────
*/

function SelectorDeSector({
  etiqueta,
  valor,
  sectores,
  onCambio,
  onCreado,
}: {
  etiqueta: string
  valor: string
  sectores: Sector[]
  onCambio: (id: string) => void
  onCreado: () => void
}) {
  const [nuevo, setNuevo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function crear() {
    if (!nuevo?.trim()) return
    try {
      const s = await crearSector(nuevo)
      onCreado()
      onCambio(s.id)
      setNuevo(null)
      setError(null)
    } catch (e) {
      setError(enCastellano(e, 'No se pudo sumar el sector.'))
    }
  }

  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between text-xs font-medium text-piedra-600">
        {etiqueta}
        {nuevo === null && (
          <button type="button" onClick={() => setNuevo('')} className="font-normal text-marca-700 hover:underline">
            + Otro sector
          </button>
        )}
      </span>
      {nuevo === null ? (
        <select value={valor} onChange={(e) => onCambio(e.target.value)} className={claseInput}>
          <option value="">Elegir…</option>
          {sectores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      ) : (
        <span className="flex gap-2">
          <input
            autoFocus
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                crear()
              }
              if (e.key === 'Escape') setNuevo(null)
            }}
            placeholder="Nombre del sector"
            className={claseInput}
          />
          <button type="button" onClick={crear} className={botonChico.principal}>
            Sumar
          </button>
        </span>
      )}
      {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
    </label>
  )
}

function Editor({
  form,
  onCambio,
  sectores,
  onSectorCreado,
  guardando,
  onGuardar,
  onCancelar,
}: {
  form: Formulario
  onCambio: (f: Formulario) => void
  sectores: Sector[]
  onSectorCreado: () => void
  guardando: boolean
  onGuardar: () => void
  onCancelar: () => void
}) {
  const [texto, setTexto] = useState('')
  const [debounced, setDebounced] = useState('')
  const [textoCliente, setTextoCliente] = useState('')
  const [debouncedCliente, setDebouncedCliente] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(texto.trim()), 250)
    return () => clearTimeout(t)
  }, [texto])
  useEffect(() => {
    const t = setTimeout(() => setDebouncedCliente(textoCliente.trim()), 250)
    return () => clearTimeout(t)
  }, [textoCliente])

  const proveedores = useQuery({ queryKey: ['proveedores-orden'], queryFn: listarProveedoresParaOrden })
  const productos = useQuery({
    queryKey: ['productos-orden', debounced],
    queryFn: () => buscarProductosParaOrden(debounced),
    enabled: debounced.length > 0,
  })
  const clientes = useQuery({
    queryKey: ['clientes-orden', debouncedCliente],
    queryFn: () => buscarClientesParaOrden(debouncedCliente),
    enabled: debouncedCliente.length > 1,
  })

  const set = (parcial: Partial<Formulario>) => onCambio({ ...form, ...parcial })
  const setLinea = (clave: string, parcial: Partial<RenglonOrden>) =>
    set({ lineas: form.lineas.map((l) => (l.clave === clave ? { ...l, ...parcial } : l)) })

  function agregarProducto(p: { id: string; codigo: string; nombre_interno: string; proveedor_id: string | null }) {
    // El mismo producto dos veces suma uno más: se escaneó otra vez.
    const ya = form.lineas.find((l) => l.producto_id === p.id)
    if (ya) {
      setLinea(ya.clave, { cantidad: ya.cantidad + 1 })
    } else {
      set({
        lineas: [
          ...form.lineas,
          {
            clave: crypto.randomUUID(),
            producto_id: p.id,
            codigo: p.codigo,
            descripcion: p.nombre_interno,
            proveedor_id: p.proveedor_id,
            cantidad: 1,
          },
        ],
      })
    }
    setTexto('')
  }

  function agregarLibre() {
    set({
      lineas: [
        ...form.lineas,
        { clave: crypto.randomUUID(), producto_id: null, codigo: null, descripcion: '', proveedor_id: null, cantidad: 1 },
      ],
    })
  }

  const problema = problemaConOrden(form)

  return (
    <section className="space-y-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-borde">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-tinta">
          {form.numero ? `Corregir la orden ${numeroDeOrden(form.numero)}` : 'Nueva orden de compra interna'}
        </h2>
        <label className="flex items-center gap-2 text-xs text-piedra-600">
          Fecha
          <input type="date" value={form.fecha} onChange={(e) => set({ fecha: e.target.value })} className={claseInput} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SelectorDeSector
          etiqueta="Emite"
          valor={form.emiteId}
          sectores={sectores}
          onCambio={(id) => set({ emiteId: id })}
          onCreado={onSectorCreado}
        />
        <SelectorDeSector
          etiqueta="Recibe"
          valor={form.recibeId}
          sectores={sectores}
          onCambio={(id) => set({ recibeId: id })}
          onCreado={onSectorCreado}
        />
      </div>

      {/* Los renglones. En el celular, cada uno es una tarjeta: en una tabla se irían hacia el costado. */}
      <div>
        <p className="mb-1 text-xs font-medium text-piedra-600">Qué hay que comprar</p>
        <div className="relative">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              // Enter con un solo resultado lo agrega: es el lector de códigos.
              if (e.key === 'Enter' && productos.data?.length === 1) {
                e.preventDefault()
                agregarProducto(productos.data[0])
              }
            }}
            placeholder="Buscar por código, nombre o escaneando"
            className={claseInput}
          />
          {debounced && (
            <div className="absolute top-full right-0 left-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-lg bg-white shadow-lg ring-1 ring-borde">
              {productos.isPending && <p className="px-3 py-2 text-xs text-piedra-400">Buscando…</p>}
              {!productos.isPending && !productos.data?.length && (
                <p className="px-3 py-2 text-xs text-piedra-400">
                  No está en el catálogo. Agregalo como renglón libre, abajo.
                </p>
              )}
              {productos.data?.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => agregarProducto(p)}
                  className="block w-full border-b border-piedra-100 px-3 py-2 text-left last:border-0 hover:bg-marca-50"
                >
                  <span className="block truncate text-sm text-tinta">{p.nombre_interno}</span>
                  <span className="font-mono text-xs text-piedra-400">{p.codigo}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {form.lineas.length > 0 && (
          <ul className="mt-2 divide-y divide-piedra-100 rounded-lg ring-1 ring-borde">
            {form.lineas.map((l, i) => (
              <li key={l.clave} className="grid gap-2 p-2 sm:grid-cols-[1fr_12rem_6rem_auto] sm:items-center">
                <div className="min-w-0">
                  {l.producto_id ? (
                    <>
                      <p className="text-sm text-tinta">{l.descripcion}</p>
                      <p className="font-mono text-xs text-piedra-400">{l.codigo}</p>
                    </>
                  ) : (
                    <input
                      value={l.descripcion}
                      onChange={(e) => setLinea(l.clave, { descripcion: e.target.value })}
                      placeholder={`Renglón ${i + 1}: qué hay que comprar`}
                      className={claseInput}
                    />
                  )}
                </div>
                <select
                  value={l.proveedor_id ?? ''}
                  onChange={(e) => setLinea(l.clave, { proveedor_id: e.target.value || null })}
                  aria-label="Proveedor"
                  className={claseInput}
                >
                  <option value="">Sin proveedor</option>
                  {(proveedores.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={Number.isFinite(l.cantidad) ? l.cantidad : ''}
                  onChange={(e) => setLinea(l.clave, { cantidad: e.target.value === '' ? NaN : Number(e.target.value) })}
                  aria-label="Cantidad"
                  className={`${claseInput} text-right tabular-nums`}
                />
                <button
                  type="button"
                  onClick={() => set({ lineas: form.lineas.filter((x) => x.clave !== l.clave) })}
                  className={botonChico.suave}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={agregarLibre} className={`${botonChico.secundario} mt-2`}>
          + Algo que no está en el catálogo
        </button>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-piedra-600">Observación</span>
        <textarea
          rows={2}
          value={form.observacion}
          onChange={(e) => set({ observacion: e.target.value })}
          placeholder="Urgente · se necesita para el 5 de marzo"
          className={claseInput}
        />
      </label>

      {/* Si es para un cliente: cuando llega, ya se sabe a quién avisarle. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium text-piedra-600">Para un cliente (opcional)</p>
          {form.clienteId ? (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-piedra-50 px-3 py-1.5 ring-1 ring-borde">
              <span className="truncate text-sm text-tinta">{form.clienteNombre}</span>
              <button
                type="button"
                onClick={() => set({ clienteId: null, clienteNombre: null })}
                className={botonChico.suave}
              >
                Quitar
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                value={textoCliente}
                onChange={(e) => setTextoCliente(e.target.value)}
                placeholder="Buscar por nombre, DNI o teléfono"
                className={claseInput}
              />
              {debouncedCliente.length > 1 && !!clientes.data?.length && (
                <div className="absolute top-full right-0 left-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-lg bg-white shadow-lg ring-1 ring-borde">
                  {clientes.data.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        set({ clienteId: c.id, clienteNombre: c.nombre, contacto: form.contacto || c.telefono || '' })
                        setTextoCliente('')
                      }}
                      className="block w-full border-b border-piedra-100 px-3 py-2 text-left last:border-0 hover:bg-marca-50"
                    >
                      <span className="block truncate text-sm text-tinta">{c.nombre}</span>
                      {c.telefono && <span className="text-xs text-piedra-400">{c.telefono}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Contacto</span>
          <input
            value={form.contacto}
            onChange={(e) => set({ contacto: e.target.value })}
            placeholder="Teléfono, o nombre y teléfono si no está cargado"
            className={claseInput}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onGuardar} disabled={guardando || !!problema} className={boton.principal}>
          {guardando ? 'Guardando…' : form.numero ? 'Guardar los cambios' : 'Guardar la orden'}
        </button>
        <button onClick={onCancelar} className={boton.suave}>
          Cancelar
        </button>
        {problema && form.lineas.length > 0 && <span className="text-xs text-amber-800">{problema}</span>}
      </div>
    </section>
  )
}
