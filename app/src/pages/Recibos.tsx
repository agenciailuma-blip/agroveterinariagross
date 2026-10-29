import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { listarRecibos, numeroRecibo } from '@/lib/api/recibos'
import { fechaCorta } from '@/lib/comprobante/presentacion'
import { enCastellano } from '@/lib/errores'
import { campoDeFiltro, tarjeta } from '@/estilos'
import { moneda } from '@/lib/tipos'

/*
  El registro de recibos: «¿le hicimos el recibo a fulano?», «¿qué es
  el 0001-00000012?». Se busca por cliente o por número, en cualquiera
  de sus formas —«12», «00000012», «0001-00000012»—.
*/
export default function Recibos() {
  const { tienePermiso } = useAuth()
  const [buscar, setBuscar] = useState('')
  const puede =
    tienePermiso('cuentacorriente.ver') || tienePermiso('cuentacorriente.cobrar') || tienePermiso('fiados.ver')

  const recibos = useQuery({
    queryKey: ['recibos', buscar.trim()],
    queryFn: () => listarRecibos(buscar),
    enabled: puede,
  })

  if (!puede) {
    return (
      <p className="rounded-xl bg-piedra-50 px-4 py-3 text-sm text-piedra-600 ring-1 ring-borde">
        No tenés permiso para ver los recibos.
      </p>
    )
  }

  const filas = recibos.data ?? []
  const total = filas.reduce((s, r) => s + r.total, 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-tinta">Recibos</h1>
          <p className="text-sm text-piedra-500">Las cobranzas de cuenta corriente y los pagos de fiados, cada uno con su número.</p>
        </div>
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Cliente o número"
          className={`${campoDeFiltro} min-w-0 flex-1 basis-48 sm:max-w-xs`}
        />
      </div>

      {recibos.isPending ? (
        <p className="text-sm text-piedra-500">Cargando…</p>
      ) : recibos.isError ? (
        <p role="alert" className="text-sm text-red-700">
          {enCastellano(recibos.error, 'No se pudieron leer los recibos.')}
        </p>
      ) : filas.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-borde bg-white/60 px-4 py-12">
          <p className="text-center text-sm text-piedra-400">
            {buscar.trim() ? 'No hay recibos con esa búsqueda.' : 'Todavía no se emitió ningún recibo.'}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-piedra-500">
            {filas.length === 1 ? 'Un recibo' : `${filas.length} recibos`} · {moneda.format(total)}
            {filas.length >= 300 && ' · se muestran los últimos 300; buscá para encontrar uno anterior'}
          </p>
          <ul className={`${tarjeta} divide-y divide-piedra-100`}>
            {filas.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/recibo/${r.id}`}
                  className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-piedra-50"
                >
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="truncate text-sm font-medium text-tinta">{r.cliente_nombre}</p>
                    <p className="text-xs text-piedra-500">
                      <span className="font-mono">{numeroRecibo(r.serie, r.numero)}</span> · {fechaCorta(r.fecha)}
                      {r.medios && ` · ${r.medios}`}
                      {r.orden_numero && ` · orden ${r.orden_numero} del vendedor`}
                      {r.emitido_por_nombre && ` · ${r.emitido_por_nombre}`}
                    </p>
                  </div>
                  <div className="ml-auto shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-tinta">{moneda.format(r.total)}</p>
                    {r.mail_estado && (
                      <p className={`text-xs ${r.mail_estado === 'enviado' ? 'text-verde-700' : 'text-red-700'}`}>
                        {r.mail_estado === 'enviado' ? 'Mandado por mail' : 'El mail no salió'}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
