import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { listarCierres } from '@/lib/api/cierreCaja'
import { hoyEnObera, sumarDias } from '@/lib/api/cheques'
import { abrirPlanillaCaja } from '@/lib/escritorio'
import { enCastellano } from '@/lib/errores'
import { campoDeFiltro, tarjeta } from '@/estilos'
import { moneda } from '@/lib/tipos'

/*
  Los cierres anteriores, para volver a mirar o reimprimir la planilla
  de un turno: «¿cuánto dio la caja el sábado?», «¿quién cerró con
  diferencia?». Arranca en los últimos treinta días.
*/
export default function CierresDeCaja() {
  const { tienePermiso } = useAuth()
  const puede = tienePermiso('caja.cerrar') || tienePermiso('caja.movimientos')
  const [desde, setDesde] = useState(() => sumarDias(hoyEnObera(), -30))
  const [hasta, setHasta] = useState(hoyEnObera)

  const cierres = useQuery({
    queryKey: ['cierres-de-caja', desde, hasta],
    queryFn: () => listarCierres(desde, hasta),
    enabled: puede && !!desde && !!hasta,
  })

  if (!puede) {
    return (
      <p className="rounded-xl bg-piedra-50 px-4 py-3 text-sm text-piedra-600 ring-1 ring-borde">
        No tenés permiso para ver los cierres de caja.
      </p>
    )
  }

  const filas = cierres.data ?? []
  const conDiferencia = filas.filter((c) => c.diferencia != null && Math.abs(c.diferencia) >= 0.01)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link to="/caja" className="text-sm text-marca-700 hover:underline">
            ← Caja
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-tinta">Cierres de caja</h1>
          <p className="text-sm text-piedra-500">Cada turno con su arqueo. Tocá uno para ver o reimprimir la planilla.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-piedra-500">
            Desde
            <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className={`${campoDeFiltro} block`} />
          </label>
          <label className="text-xs text-piedra-500">
            Hasta
            <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className={`${campoDeFiltro} block`} />
          </label>
        </div>
      </div>

      {cierres.isPending ? (
        <p className="text-sm text-piedra-500">Cargando…</p>
      ) : cierres.isError ? (
        <p role="alert" className="text-sm text-red-700">
          {enCastellano(cierres.error, 'No se pudieron leer los cierres.')}
        </p>
      ) : filas.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-borde bg-white/60 px-4 py-12">
          <p className="text-center text-sm text-piedra-400">No hay cajas en esas fechas.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-piedra-500">
            {filas.length === 1 ? 'Una caja' : `${filas.length} cajas`}
            {conDiferencia.length > 0 &&
              ` · ${conDiferencia.length === 1 ? 'una cerró' : `${conDiferencia.length} cerraron`} con diferencia`}
          </p>
          <ul className={`${tarjeta} divide-y divide-piedra-100`}>
            {filas.map((c) => {
              const dif = c.diferencia ?? 0
              return (
                <li key={c.id}>
                  <button
                    onClick={() => void abrirPlanillaCaja(c.id)}
                    className="flex w-full flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-piedra-50"
                  >
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="text-sm font-medium text-tinta">
                        {new Date(c.abierta_en).toLocaleDateString('es-AR', {
                          weekday: 'short',
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                        <span className="font-normal text-piedra-500">
                          {' '}
                          · {c.terminal?.nombre ?? 'Caja'}
                          {c.cajero?.nombre && ` · ${c.cajero.nombre}`}
                        </span>
                      </p>
                      <p className="text-xs text-piedra-500">
                        {new Date(c.abierta_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        {' a '}
                        {c.cerrada_en
                          ? new Date(c.cerrada_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                          : 'sigue abierta'}
                        {c.monto_declarado != null && ` · contado ${moneda.format(c.monto_declarado)}`}
                      </p>
                    </div>
                    <div className="ml-auto shrink-0 text-right">
                      {c.estado === 'abierta' ? (
                        <p className="text-xs font-medium text-marca-700">Abierta</p>
                      ) : (
                        <>
                          <p className="text-sm font-semibold tabular-nums text-tinta">
                            {moneda.format(c.monto_esperado ?? 0)}
                          </p>
                          <p
                            className={`text-xs tabular-nums ${
                              Math.abs(dif) < 0.01 ? 'text-verde-700' : dif > 0 ? 'text-marca-700' : 'text-red-700'
                            }`}
                          >
                            {Math.abs(dif) < 0.01 ? 'Sin diferencia' : `Diferencia ${moneda.format(dif)}`}
                          </p>
                        </>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
