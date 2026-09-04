import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { useTerminal } from '@/lib/terminal'
import {
  emitirNoFiscal,
  listarNoFiscales,
  numeroNoFiscal,
  remitosSinCobrar,
  ventasParaRemitir,
} from '@/lib/api/noFiscal'
import type { VentaParaRemitir } from '@/lib/api/noFiscal'
import { abrirNoFiscal } from '@/lib/escritorio'
import { moneda } from '@/lib/tipos'

/*
  Los remitos del reparto.

  Gross reparte dos o tres veces por semana y va a salir todos los días.
  Eso convierte al remito en circuito diario, no en accesorio, y por eso
  tiene pantalla propia en vez de vivir escondido adentro de la caja.

  La pantalla contesta las tres preguntas que se hacen todos los días:
  qué sale hoy, qué salió, y —la que nadie mira si no está a la vista—
  qué se entregó y todavía no se cobró.
*/
export default function Remitos() {
  const { tienePermiso } = useAuth()
  const { terminal } = useTerminal()
  const qc = useQueryClient()
  const [nuevo, setNuevo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const puedeVer = tienePermiso('facturacion.no_fiscal_ver')
  const puedeEmitir = tienePermiso('facturacion.no_fiscal_emitir')

  const remitos = useQuery({
    queryKey: ['remitos'],
    queryFn: () => listarNoFiscales('remito'),
    enabled: puedeVer,
  })

  const sinCobrar = useQuery({
    queryKey: ['remitos-sin-cobrar'],
    queryFn: remitosSinCobrar,
    enabled: puedeVer,
  })

  if (!puedeVer) {
    return (
      <p className="rounded-xl bg-piedra-50 px-4 py-3 text-sm text-piedra-600 ring-1 ring-borde">
        No tenés permiso para ver los remitos.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-tinta">Remitos</h1>
          <p className="text-sm text-piedra-500">
            La mercadería que sale del local, con su comprobante de entrega.
          </p>
        </div>
        {puedeEmitir && (
          <button
            onClick={() => setNuevo(true)}
            className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600"
          >
            Nuevo remito
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      {/*
        Entregado y sin cobrar.

        Va arriba de todo y en ámbar porque es lo único de esta pantalla
        que pide una acción. Es mercadería que legítimamente no está en
        el local y plata que todavía no entró: si no se mira acá, no se
        mira en ningún lado.
      */}
      {(sinCobrar.data?.length ?? 0) > 0 && (
        <section className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <h2 className="text-sm font-bold text-amber-900">
            Entregado y sin cobrar ({sinCobrar.data!.length})
          </h2>
          <p className="mb-3 text-xs text-amber-800">
            Salió del local y la venta todavía no se cobró.
          </p>
          <ul className="space-y-1.5">
            {sinCobrar.data!.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm"
              >
                <span className="whitespace-nowrap font-medium text-tinta">
                  {numeroNoFiscal('remito', r.serie, r.numero)}
                </span>
                <span className="text-piedra-600">{r.receptor_nombre}</span>
                <span className="text-piedra-500">
                  {[r.entrega_domicilio, r.entrega_localidad].filter(Boolean).join(', ') || '—'}
                </span>
                <span className="tabular-nums text-piedra-600">{moneda.format(r.total)}</span>
                <span
                  className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                    r.dias >= 7 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {r.dias === 0 ? 'hoy' : `hace ${r.dias} ${r.dias === 1 ? 'día' : 'días'}`}
                </span>
                <button
                  onClick={() => abrirNoFiscal(r.id)}
                  className="text-xs text-marca-700 underline"
                >
                  Ver
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium text-piedra-600">Últimos remitos</h2>
        {remitos.isPending ? (
          <p className="text-sm text-piedra-500">Cargando…</p>
        ) : (remitos.data?.length ?? 0) === 0 ? (
          <div className="grid place-items-center rounded-xl border border-dashed border-borde bg-white/60 py-12">
            <p className="text-sm text-piedra-400">Todavía no se emitió ningún remito.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-borde">
            <table className="w-full text-sm">
              <thead className="border-b border-borde text-left text-xs text-piedra-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Número</th>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Destino</th>
                  <th className="px-3 py-2 font-medium">Transporte</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 font-medium">Venta</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {remitos.data!.map((r) => (
                  <tr key={r.id} className="border-b border-piedra-100 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 font-medium tabular-nums text-tinta">
                      {numeroNoFiscal('remito', r.serie, r.numero)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-piedra-600">
                      {new Date(`${r.fecha}T00:00:00`).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-3 py-2 text-piedra-700">{r.receptor_nombre}</td>
                    <td className="px-3 py-2 text-piedra-500">{r.entrega_localidad || '—'}</td>
                    <td className="px-3 py-2 text-piedra-500">{r.transportista || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-piedra-700">
                      {r.total > 0 ? moneda.format(r.total) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-piedra-500">
                      {r.venta_codigo ?? '—'}
                      {r.venta_estado && r.venta_estado !== 'cobrada' && (
                        <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">
                          {r.venta_estado === 'en_caja' ? 'sin cobrar' : r.venta_estado}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.estado === 'anulado' ? (
                        <span className="text-xs text-piedra-400">anulado</span>
                      ) : (
                        <button
                          onClick={() => abrirNoFiscal(r.id)}
                          className="text-xs text-marca-700 underline"
                        >
                          Imprimir
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {nuevo && (
        <ModalNuevoRemito
          terminalId={terminal?.id ?? null}
          onCerrar={() => setNuevo(false)}
          onEmitido={(id) => {
            setNuevo(false)
            setError(null)
            qc.invalidateQueries({ queryKey: ['remitos'] })
            qc.invalidateQueries({ queryKey: ['remitos-sin-cobrar'] })
            abrirNoFiscal(id)
          }}
          onError={setError}
        />
      )}
    </div>
  )
}

/*
  Armar el remito.

  Dos pasos: de qué venta sale, y a dónde va. El domicilio arranca del
  que tiene cargado el cliente y se puede cambiar, porque el reparto no
  siempre va a la dirección de facturación — es la razón por la que el
  remito guarda su propio domicilio y no reusa el del cliente.
*/
function ModalNuevoRemito({
  terminalId,
  onCerrar,
  onEmitido,
  onError,
}: {
  terminalId: string | null
  onCerrar: () => void
  onEmitido: (id: string) => void
  onError: (m: string) => void
}) {
  const [busqueda, setBusqueda] = useState('')
  const [elegida, setElegida] = useState<VentaParaRemitir | null>(null)
  const [domicilio, setDomicilio] = useState('')
  const [localidad, setLocalidad] = useState('')
  const [contacto, setContacto] = useState('')
  const [transportista, setTransportista] = useState('')
  const [observaciones, setObservaciones] = useState('')

  const ventas = useQuery({
    queryKey: ['ventas-para-remitir', busqueda],
    queryFn: () => ventasParaRemitir(busqueda),
  })

  function elegir(v: VentaParaRemitir) {
    setElegida(v)
    setDomicilio(v.cliente_domicilio ?? '')
    setLocalidad(v.cliente_localidad ?? '')
    setContacto(v.cliente_telefono ?? '')
  }

  const emitir = useMutation({
    mutationFn: () =>
      emitirNoFiscal(elegida!.id, 'remito', terminalId, {
        observaciones: observaciones.trim() || null,
        entrega: {
          domicilio: domicilio.trim() || null,
          localidad: localidad.trim() || null,
          contacto: contacto.trim() || null,
          transportista: transportista.trim() || null,
        },
      }),
    onSuccess: onEmitido,
    onError: (e) => onError(e instanceof Error ? e.message : 'No se pudo emitir el remito.'),
  })

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-tinta/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-bold text-tinta">Nuevo remito</h2>

        {!elegida ? (
          <>
            <p className="mt-1 text-sm text-piedra-500">
              ¿De qué venta sale la mercadería?
            </p>
            <input
              autoFocus
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por código de venta…"
              className="mt-3 w-full rounded-lg border border-borde px-3 py-2 text-sm"
            />
            <div className="mt-3 max-h-80 overflow-y-auto rounded-lg ring-1 ring-borde">
              {ventas.isPending ? (
                <p className="p-4 text-sm text-piedra-500">Buscando…</p>
              ) : (ventas.data?.length ?? 0) === 0 ? (
                <p className="p-4 text-sm text-piedra-500">
                  No hay ventas sin remito para mostrar.
                </p>
              ) : (
                <ul>
                  {ventas.data!.map((v) => (
                    <li key={v.id} className="border-b border-piedra-100 last:border-0">
                      <button
                        onClick={() => elegir(v)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-piedra-50"
                      >
                        <span className="font-medium tabular-nums text-tinta">{v.codigo}</span>
                        <span className="min-w-0 flex-1 truncate text-piedra-600">
                          {v.cliente_nombre}
                        </span>
                        {v.estado !== 'cobrada' && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">
                            sin cobrar
                          </span>
                        )}
                        <span className="tabular-nums text-piedra-600">
                          {moneda.format(v.total)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-piedra-50 px-3 py-2 text-sm ring-1 ring-borde">
              <div className="min-w-0">
                <p className="font-medium text-tinta">
                  {elegida.codigo} · {elegida.cliente_nombre}
                </p>
                <p className="text-xs text-piedra-500">
                  {moneda.format(elegida.total)}
                  {elegida.estado !== 'cobrada' && ' · todavía sin cobrar'}
                </p>
              </div>
              <button
                onClick={() => setElegida(null)}
                className="shrink-0 text-xs text-marca-700 underline"
              >
                Cambiar
              </button>
            </div>

            {/*
              Cuando la venta todavía no se cobró, el remito descarga el
              stock. Conviene que quien lo emite lo sepa: no es lo mismo
              documentar una entrega que sacar mercadería del inventario.
            */}
            {elegida.estado !== 'cobrada' && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
                Esta venta todavía no se cobró, así que este remito va a{' '}
                <strong>descontar el stock</strong>. Cuando se cobre, la caja reconcilia: si vuelve
                mercadería sin entregar, alcanza con corregir la venta.
              </p>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Domicilio de entrega" valor={domicilio} alCambiar={setDomicilio} />
              <Campo etiqueta="Localidad" valor={localidad} alCambiar={setLocalidad} />
              <Campo etiqueta="Contacto" valor={contacto} alCambiar={setContacto} />
              <Campo
                etiqueta="Transporte / quién lleva"
                valor={transportista}
                alCambiar={setTransportista}
              />
            </div>
            <Campo
              etiqueta="Observaciones"
              valor={observaciones}
              alCambiar={setObservaciones}
              className="mt-3"
            />
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCerrar}
            className="rounded-lg px-4 py-2 text-sm font-medium text-piedra-500 hover:bg-piedra-100"
          >
            Cancelar
          </button>
          <button
            onClick={() => emitir.mutate()}
            disabled={!elegida || emitir.isPending}
            className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600 disabled:opacity-40"
          >
            {emitir.isPending ? 'Emitiendo…' : 'Emitir e imprimir'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Campo({
  etiqueta,
  valor,
  alCambiar,
  className = '',
}: {
  etiqueta: string
  valor: string
  alCambiar: (v: string) => void
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-medium text-piedra-600">{etiqueta}</span>
      <input
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm"
      />
    </label>
  )
}
