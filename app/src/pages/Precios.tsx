import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { confirmar } from '@/components/Dialogo'
import {
  TIPOS_MEDIO_PAGO,
  cargarPreciosServidor,
  darDeBajaLista,
  darDeBajaMedioPago,
  guardarCuota,
  guardarLista,
  guardarMedioPago,
  previsualizarPrecio,
} from '@/lib/api/precios'
import type { ListaPrecio, MedioPago } from '@/lib/api/precios'
import { elegirListaDeLaTienda, listaDeLaTienda } from '@/lib/api/ventaOnline'
import { moneda } from '@/lib/tipos'
import { campoDeFiltro } from '@/estilos'

/*
  Precios y medios de pago.

  Acá se administra cómo cobra el local. En Argentina las formas de pago
  cambian varias veces por año —promociones, planes de cuotas, recargos
  nuevos— así que todo tiene que ser editable sin depender de una
  actualización del sistema. Eso está comprometido en el alcance.

  Las reglas que importan viven en la base, no en esta pantalla: que
  haya una sola lista predeterminada, que no se dé de baja una lista en
  uso, que no quede la caja sin medio de pago. Acá sólo se muestran.
*/
const PRECIO_EJEMPLO = 10000

/** Una venta redonda, para mostrar cuánto suma cada plan de cuotas. */
const VENTA_EJEMPLO = 100000

export default function Precios() {
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [editandoLista, setEditandoLista] = useState<Partial<ListaPrecio> | null>(null)
  const [editandoMedio, setEditandoMedio] = useState<Partial<MedioPago> | null>(null)

  const puedeGestionar = tienePermiso('configuracion.gestionar')

  // Del servidor y no de la copia local: acá se administra, y hay que
  // ver el efecto del cambio enseguida, no en la próxima sincronización.
  const datos = useQuery({ queryKey: ['precios-admin'], queryFn: cargarPreciosServidor })
  const listaTienda = useQuery({ queryKey: ['lista-tienda'], queryFn: listaDeLaTienda })

  function avisar(texto: string) {
    setAviso(texto)
    setError(null)
    setTimeout(() => setAviso(null), 4000)
  }

  function refrescar() {
    qc.invalidateQueries({ queryKey: ['precios-admin'] })
    qc.invalidateQueries({ queryKey: ['precios'] })
  }

  const alGuardar = (texto: string) => () => {
    avisar(texto)
    refrescar()
    setEditandoLista(null)
    setEditandoMedio(null)
  }
  const alFallar = (e: unknown) =>
    setError(e instanceof Error ? e.message : 'No se pudo guardar.')

  const mutarLista = useMutation({
    mutationFn: (l: Partial<ListaPrecio>) =>
      guardarLista({
        id: l.id,
        nombre: l.nombre ?? '',
        ajuste_porcentaje: Number(l.ajuste_porcentaje ?? 0),
        es_predeterminada: !!l.es_predeterminada,
        orden: Number(l.orden ?? 0),
      }),
    onSuccess: alGuardar('Lista guardada'),
    onError: alFallar,
  })

  const bajaLista = useMutation({
    mutationFn: (id: string) => darDeBajaLista(id),
    onSuccess: alGuardar('Lista dada de baja'),
    onError: alFallar,
  })

  const mutarMedio = useMutation({
    mutationFn: (m: Partial<MedioPago>) =>
      guardarMedioPago({
        id: m.id,
        nombre: m.nombre ?? '',
        tipo: m.tipo ?? 'otro',
        lista_precio_id: m.lista_precio_id ?? null,
        admite_cuotas: !!m.admite_cuotas,
        cuotas_maximas: Number(m.cuotas_maximas ?? 1),
        afecta_caja: m.afecta_caja ?? true,
        orden: Number(m.orden ?? 0),
      }),
    onSuccess: alGuardar('Medio de pago guardado'),
    onError: alFallar,
  })

  const bajaMedio = useMutation({
    mutationFn: (id: string) => darDeBajaMedioPago(id),
    onSuccess: alGuardar('Medio de pago dado de baja'),
    onError: alFallar,
  })

  const mutarListaTienda = useMutation({
    mutationFn: (id: string) => elegirListaDeLaTienda(id),
    onSuccess: () => {
      avisar('Lista de la tienda cambiada')
      qc.invalidateQueries({ queryKey: ['lista-tienda'] })
      qc.invalidateQueries({ queryKey: ['tienda-listado'] })
      qc.invalidateQueries({ queryKey: ['producto'] })
    },
    onError: alFallar,
  })

  const mutarCuota = useMutation({
    mutationFn: ({ medio, cuotas, recargo }: { medio: string; cuotas: number; recargo: number }) =>
      guardarCuota(medio, cuotas, recargo),
    onSuccess: () => {
      avisar('Recargo guardado')
      refrescar()
    },
    onError: alFallar,
  })

  if (!puedeGestionar) {
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        No tenés permiso para administrar precios y medios de pago.
      </p>
    )
  }

  const listas = datos.data?.listas ?? []
  const medios = datos.data?.medios ?? []

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-tinta">Precios y medios de pago</h1>
        <p className="text-sm text-piedra-500">
          Cómo cobra el local. Se puede cambiar cuando cambian las promociones, sin esperar una
          actualización del sistema.
        </p>
      </div>

      {aviso && (
        <p className="rounded-xl bg-verde-50 px-4 py-3 text-sm font-medium text-verde-800 ring-1 ring-verde-200">
          {aviso}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      {/* ── Cómo se arma un precio ── */}
      <div className="rounded-xl bg-marca-50 p-4 text-sm text-marca-900 ring-1 ring-marca-200">
        <p className="font-medium">Cómo se arma el precio que ve el cliente</p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="rounded bg-white px-2 py-0.5 ring-1 ring-marca-200">Precio del producto</span>
          <span>→</span>
          <span className="rounded bg-white px-2 py-0.5 ring-1 ring-marca-200">Ajuste de la lista</span>
          <span>→</span>
          <span className="rounded bg-white px-2 py-0.5 ring-1 ring-marca-200">Recargo por cuotas</span>
          <span>→</span>
          <span className="rounded bg-white px-2 py-0.5 ring-1 ring-marca-200">Descuento del cliente</span>
        </p>
        <p className="mt-2 text-xs">
          Cada <strong>medio de pago</strong> usa una <strong>lista</strong>. Por eso el efectivo y
          la tarjeta pueden tener precios distintos sin cargar el producto dos veces.
        </p>
      </div>

      {/* ── Listas ── */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-borde">
        <div className="flex items-center justify-between border-b border-borde px-5 py-3">
          <div>
            <h2 className="font-medium text-tinta">Listas de precios</h2>
            <p className="text-sm text-piedra-500">
              Un porcentaje sobre el precio del producto. La predeterminada se usa cuando el medio
              de pago no tiene una propia.
            </p>
          </div>
          <button
            onClick={() =>
              setEditandoLista({ nombre: '', ajuste_porcentaje: 0, es_predeterminada: false, orden: listas.length * 10 })
            }
            className="shrink-0 rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600"
          >
            Nueva lista
          </button>
        </div>

        <table className="w-full text-sm">
          <thead className="border-b border-borde bg-piedra-50 text-left text-xs tracking-wide text-piedra-500 uppercase">
            <tr>
              <th className="px-5 py-2 font-medium">Lista</th>
              <th className="py-2 text-right font-medium">Ajuste</th>
              <th className="py-2 text-right font-medium">Un producto de {moneda.format(PRECIO_EJEMPLO)}</th>
              <th className="w-32 px-5 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-piedra-100">
            {listas.map((l) => (
              <tr key={l.id}>
                <td className="px-5 py-2.5">
                  <span className="font-medium text-tinta">{l.nombre}</span>
                  {l.es_predeterminada && (
                    <span className="ml-2 rounded-full bg-marca-100 px-2 py-0.5 text-xs text-marca-800">
                      Predeterminada
                    </span>
                  )}
                </td>
                <td className="py-2.5 text-right tabular-nums text-piedra-600">
                  {l.ajuste_porcentaje > 0 ? '+' : ''}
                  {l.ajuste_porcentaje}%
                </td>
                <td className="py-2.5 text-right font-medium tabular-nums text-tinta">
                  {moneda.format(previsualizarPrecio(PRECIO_EJEMPLO, l, 0))}
                </td>
                <td className="px-5 py-2.5 text-right">
                  <button onClick={() => setEditandoLista(l)} className="text-xs text-marca-700 hover:underline">
                    Editar
                  </button>
                  {!l.es_predeterminada && (
                    <button
                      onClick={async () => {
                        const sigue = await confirmar({
                          titulo: `¿Dar de baja la lista "${l.nombre}"?`,
                          detalle: 'Deja de ofrecerse en la caja. Las ventas que la usaron no cambian.',
                          aceptar: 'Dar de baja',
                          peligro: true,
                        })
                        if (sigue) bajaLista.mutate(l.id)
                      }}
                      className="ml-3 text-xs text-piedra-400 hover:text-red-600"
                    >
                      Dar de baja
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/*
        ── La tienda online ──

        Con qué lista se le publican los precios a la tienda de Zubu. Puede
        ser la de contado o una creada para la web. Mientras la use la
        tienda, esa lista no se puede dar de baja: la base lo impide,
        porque la tienda quedaría publicando con una lista que no existe.
      */}
      {(() => {
        const elegida = listas.find((l) => l.id === listaTienda.data)
        return (
          <div className="rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-borde">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-medium text-tinta">Tienda online</h2>
                <p className="text-sm text-piedra-500">
                  Con qué lista se publican los precios en la tienda web.
                </p>
              </div>
              <select
                aria-label="Lista de la tienda online"
                value={listaTienda.data ?? ''}
                disabled={listaTienda.isPending || mutarListaTienda.isPending}
                onChange={async (e) => {
                  const nueva = listas.find((l) => l.id === e.target.value)
                  if (!nueva) return
                  const sigue = await confirmar({
                    titulo: `¿Publicar la tienda con la lista "${nueva.nombre}"?`,
                    detalle: `Cambian todos los precios de la tienda en su próxima consulta. Un producto de ${moneda.format(PRECIO_EJEMPLO)} se publicaría a ${moneda.format(previsualizarPrecio(PRECIO_EJEMPLO, nueva, 0))}.`,
                    aceptar: 'Cambiar la lista',
                  })
                  if (sigue) mutarListaTienda.mutate(nueva.id)
                }}
                className={campoDeFiltro}
              >
                {!listaTienda.data && <option value="">Sin lista: el precio de la ficha</option>}
                {listas
                  .filter((l) => l.activo)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nombre}
                    </option>
                  ))}
              </select>
            </div>
            {elegida && (
              <p className="mt-2 text-xs text-piedra-500">
                Un producto de {moneda.format(PRECIO_EJEMPLO)} se publica a{' '}
                <strong className="text-tinta">
                  {moneda.format(previsualizarPrecio(PRECIO_EJEMPLO, elegida, 0))}
                </strong>
                . Qué productos salen a la tienda se decide en Productos, con «Vender online».
              </p>
            )}
          </div>
        )
      })()}

      {/* ── Medios de pago ── */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-borde">
        <div className="flex items-center justify-between border-b border-borde px-5 py-3">
          <div>
            <h2 className="font-medium text-tinta">Medios de pago</h2>
            <p className="text-sm text-piedra-500">
              Lo que el cajero ve al cobrar. Cada uno usa una lista de precios y, si se paga en
              cuotas, suma el recargo de ese plan.
            </p>
            {/*
              Dicho con todas las letras porque es de donde salen los
              números que el cajero cobra, y en el local costó entenderlo:
              el recargo sube el precio de la venta, no se agrega como un
              renglón aparte al pie del ticket.
            */}
            <p className="mt-1 text-xs text-piedra-500">
              El recargo va <strong>adentro del precio</strong>: al elegir el plan en la caja, el
              total sube y la factura sale por ese importe. No aparece como un renglón aparte, que
              es como Gross lo cobra hoy.
            </p>
          </div>
          <button
            onClick={() =>
              setEditandoMedio({
                nombre: '',
                tipo: 'efectivo',
                lista_precio_id: listas.find((l) => l.es_predeterminada)?.id ?? null,
                admite_cuotas: false,
                cuotas_maximas: 1,
                afecta_caja: true,
                orden: medios.length * 10,
              })
            }
            className="shrink-0 rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600"
          >
            Nuevo medio de pago
          </button>
        </div>

        <div className="divide-y divide-piedra-100">
          {medios.map((m) => (
            <div key={m.id} className="px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium text-tinta">{m.nombre}</span>
                  <span className="ml-2 text-xs text-piedra-500">
                    {TIPOS_MEDIO_PAGO[m.tipo] ?? m.tipo} ·{' '}
                    {listas.find((l) => l.id === m.lista_precio_id)?.nombre ?? 'lista predeterminada'}
                    {!m.afecta_caja && ' · no entra al arqueo'}
                  </span>
                </div>
                <div>
                  <button onClick={() => setEditandoMedio(m)} className="text-xs text-marca-700 hover:underline">
                    Editar
                  </button>
                  <button
                    onClick={async () => {
                      const sigue = await confirmar({
                        titulo: `¿Dar de baja "${m.nombre}"?`,
                        detalle: 'Deja de ofrecerse en la caja. Los cobros ya hechos no cambian.',
                        aceptar: 'Dar de baja',
                        peligro: true,
                      })
                      if (sigue) bajaMedio.mutate(m.id)
                    }}
                    className="ml-3 text-xs text-piedra-400 hover:text-red-600"
                  >
                    Dar de baja
                  </button>
                </div>
              </div>

              {m.admite_cuotas && (
                <>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Array.from({ length: m.cuotas_maximas }, (_, i) => i + 1).map((n) => {
                      const cuota = m.medio_pago_cuota.find((c) => c.cuotas === n)
                      return (
                        <CampoCuota
                          key={n}
                          cuotas={n}
                          recargo={cuota?.recargo_porcentaje ?? 0}
                          guardando={mutarCuota.isPending}
                          onGuardar={(recargo) => mutarCuota.mutate({ medio: m.id, cuotas: n, recargo })}
                        />
                      )
                    })}
                  </div>
                  {/*
                    El ejemplo con plata en la mano. Un "15%" suelto se
                    discute; "$100.000 se cobran $115.000" se entiende de
                    una y se puede comparar con lo que dice el posnet.
                  */}
                  <p className="mt-1.5 text-xs text-piedra-500">
                    Una venta de {moneda.format(VENTA_EJEMPLO)} de contado se cobra{' '}
                    {Array.from({ length: m.cuotas_maximas }, (_, i) => i + 1)
                      .map((n) => {
                        const r = Number(
                          m.medio_pago_cuota.find((c) => c.cuotas === n)?.recargo_porcentaje ?? 0,
                        )
                        return `${moneda.format(Math.round(VENTA_EJEMPLO * (1 + r / 100)))} en ${n}`
                      })
                      .join(', ')}
                    .
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {editandoLista && (
        <ModalLista
          lista={editandoLista}
          guardando={mutarLista.isPending}
          onGuardar={(l) => mutarLista.mutate(l)}
          onCerrar={() => setEditandoLista(null)}
        />
      )}

      {editandoMedio && (
        <ModalMedio
          medio={editandoMedio}
          listas={listas}
          guardando={mutarMedio.isPending}
          onGuardar={(m) => mutarMedio.mutate(m)}
          onCerrar={() => setEditandoMedio(null)}
        />
      )}
    </div>
  )
}

const claseInput =
  'w-full rounded-lg border border-borde px-2.5 py-2 text-sm text-tinta outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20'

function Modal({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-tinta/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 font-semibold text-tinta">{titulo}</h2>
        {children}
      </div>
    </div>
  )
}

function ModalLista({
  lista,
  guardando,
  onGuardar,
  onCerrar,
}: {
  lista: Partial<ListaPrecio>
  guardando: boolean
  onGuardar: (l: Partial<ListaPrecio>) => void
  onCerrar: () => void
}) {
  const [datos, setDatos] = useState(lista)
  const set = (c: Partial<ListaPrecio>) => setDatos({ ...datos, ...c })

  return (
    <Modal titulo={lista.id ? `Editar ${lista.nombre}` : 'Nueva lista de precios'}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Nombre</span>
          <input
            autoFocus
            value={datos.nombre ?? ''}
            onChange={(e) => set({ nombre: e.target.value })}
            placeholder="Contado, Tarjeta, Mayorista…"
            className={claseInput}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">
            Ajuste sobre el precio del producto
          </span>
          <div className="relative">
            <input
              type="number"
              step="1"
              value={datos.ajuste_porcentaje ?? 0}
              onChange={(e) => set({ ajuste_porcentaje: Number(e.target.value) })}
              className={`${claseInput} pr-7 text-right tabular-nums`}
            />
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-piedra-400">
              %
            </span>
          </div>
          <span className="mt-1 block text-xs text-piedra-500">
            Positivo encarece, negativo abarata. Un producto de {moneda.format(PRECIO_EJEMPLO)}{' '}
            quedaría en{' '}
            <strong>
              {moneda.format(
                previsualizarPrecio(PRECIO_EJEMPLO, datos as ListaPrecio, 0),
              )}
            </strong>
            .
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm text-tinta">
          <input
            type="checkbox"
            checked={!!datos.es_predeterminada}
            onChange={(e) => set({ es_predeterminada: e.target.checked })}
            className="mt-0.5 size-4 rounded border-borde text-marca-700 focus:ring-marca-500"
          />
          <span>
            Es la lista predeterminada
            <span className="block text-xs text-piedra-500">
              La usan los medios de pago que no tienen una propia. Hay una sola: marcarla acá se la
              saca a la que la tenía.
            </span>
          </span>
        </label>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          onClick={() => onGuardar(datos)}
          disabled={!datos.nombre?.trim() || guardando}
          className="flex-1 rounded-lg bg-marca-700 px-4 py-2.5 font-medium text-white hover:bg-marca-600 disabled:opacity-40"
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          onClick={onCerrar}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-piedra-500 hover:bg-piedra-100"
        >
          Cancelar
        </button>
      </div>
    </Modal>
  )
}

function ModalMedio({
  medio,
  listas,
  guardando,
  onGuardar,
  onCerrar,
}: {
  medio: Partial<MedioPago>
  listas: ListaPrecio[]
  guardando: boolean
  onGuardar: (m: Partial<MedioPago>) => void
  onCerrar: () => void
}) {
  const [datos, setDatos] = useState(medio)
  const set = (c: Partial<MedioPago>) => setDatos({ ...datos, ...c })

  return (
    <Modal titulo={medio.id ? `Editar ${medio.nombre}` : 'Nuevo medio de pago'}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">
            Nombre <span className="font-normal text-piedra-400">(lo que ve el cajero)</span>
          </span>
          <input
            autoFocus
            value={datos.nombre ?? ''}
            onChange={(e) => set({ nombre: e.target.value })}
            placeholder="Efectivo, Visa crédito, Transferencia…"
            className={claseInput}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-piedra-600">Tipo</span>
            <select
              value={datos.tipo ?? 'efectivo'}
              onChange={(e) => set({ tipo: e.target.value })}
              className={claseInput}
            >
              {Object.entries(TIPOS_MEDIO_PAGO).map(([valor, etiqueta]) => (
                <option key={valor} value={valor}>
                  {etiqueta}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-piedra-600">Lista de precios</span>
            <select
              value={datos.lista_precio_id ?? ''}
              onChange={(e) => set({ lista_precio_id: e.target.value || null })}
              className={claseInput}
            >
              <option value="">La predeterminada</option>
              {listas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre} ({l.ajuste_porcentaje > 0 ? '+' : ''}
                  {l.ajuste_porcentaje}%)
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex items-start gap-2 text-sm text-tinta">
          <input
            type="checkbox"
            checked={!!datos.admite_cuotas}
            onChange={(e) =>
              set({ admite_cuotas: e.target.checked, cuotas_maximas: e.target.checked ? 3 : 1 })
            }
            className="mt-0.5 size-4 rounded border-borde text-marca-700 focus:ring-marca-500"
          />
          <span>Se puede pagar en cuotas</span>
        </label>

        {/*
          Desplegable y no un campo numérico: las cuotas son 1, 2, 3 —
          no 2,5 ni −1. Un campo con flechitas invita a números que no
          existen.
        */}
        {datos.admite_cuotas && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-piedra-600">
              Hasta cuántas cuotas
            </span>
            <select
              value={datos.cuotas_maximas ?? 3}
              onChange={(e) => set({ cuotas_maximas: Number(e.target.value) })}
              className={claseInput}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'cuota' : 'cuotas'}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-piedra-500">
              El recargo de cada cuota se carga después, en el listado. Si bajás el máximo, las
              cuotas que sobran se eliminan.
            </span>
          </label>
        )}

        <label className="flex items-start gap-2 text-sm text-tinta">
          <input
            type="checkbox"
            checked={datos.afecta_caja ?? true}
            onChange={(e) => set({ afecta_caja: e.target.checked })}
            className="mt-0.5 size-4 rounded border-borde text-marca-700 focus:ring-marca-500"
          />
          <span>
            Entra al arqueo de caja
            <span className="block text-xs text-piedra-500">
              Destildalo para lo que no es plata en el cajón: cuenta corriente, transferencias que
              van directo al banco.
            </span>
          </span>
        </label>
      </div>

      <div className="mt-5 flex gap-2">
        <button
          onClick={() => onGuardar(datos)}
          disabled={!datos.nombre?.trim() || guardando}
          className="flex-1 rounded-lg bg-marca-700 px-4 py-2.5 font-medium text-white hover:bg-marca-600 disabled:opacity-40"
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          onClick={onCerrar}
          className="rounded-lg px-4 py-2.5 text-sm font-medium text-piedra-500 hover:bg-piedra-100"
        >
          Cancelar
        </button>
      </div>
    </Modal>
  )
}

function CampoCuota({
  cuotas,
  recargo,
  guardando,
  onGuardar,
}: {
  cuotas: number
  recargo: number
  guardando: boolean
  onGuardar: (recargo: number) => void
}) {
  const [valor, setValor] = useState(String(recargo))

  return (
    <label className="flex items-center gap-1.5 rounded-lg bg-piedra-50 px-2.5 py-1.5 ring-1 ring-borde">
      <span className="text-xs whitespace-nowrap text-piedra-600">
        {cuotas} {cuotas === 1 ? 'cuota' : 'cuotas'}
      </span>
      <div className="relative">
        <input
          type="number"
          step="1"
          value={valor}
          disabled={guardando}
          onChange={(e) => setValor(e.target.value)}
          onBlur={() => {
            const n = Number(valor)
            if (Number.isFinite(n) && n !== recargo) onGuardar(n)
          }}
          className="w-20 rounded border border-borde bg-white py-1 pr-5 pl-2 text-right text-xs tabular-nums outline-none focus:border-marca-500"
        />
        <span className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-xs text-piedra-400">
          %
        </span>
      </div>
    </label>
  )
}
