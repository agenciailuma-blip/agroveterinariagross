import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { useTerminal } from '@/lib/terminal'
import { listarNoFiscales, numeroNoFiscal, remitosSinCobrar } from '@/lib/api/noFiscal'
import NuevoRemito from '@/components/NuevoRemito'
import { abrirNoFiscal } from '@/lib/escritorio'

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
                  <th className="px-3 py-2 font-medium">Stock</th>
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
                    {/*
                      Un remito que descontó y uno que no se ven idénticos
                      en el papel, y son cosas muy distintas para quien
                      mira el inventario. Acá se distinguen.

                      El total en pesos salió de esta tabla: el remito no
                      lleva precios (Lucas, 07/09) y tenerlo en el listado
                      invitaba a leerlo como si el papel lo dijera.
                    */}
                    <td className="px-3 py-2">
                      {r.descuenta_stock ? (
                        <span className="text-xs text-piedra-500">descontado</span>
                      ) : (
                        <span className="rounded-full bg-piedra-100 px-2 py-0.5 text-xs font-medium text-piedra-600 ring-1 ring-borde">
                          sin descontar
                        </span>
                      )}
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
        <NuevoRemito
          terminalId={terminal?.id ?? null}
          terminalPrefijo={terminal?.prefijo ?? null}
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
