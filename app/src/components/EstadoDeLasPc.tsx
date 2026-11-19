import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { useSync } from '@/lib/local/SyncProvider'
import { useTerminal } from '@/lib/terminal'
import { enEscritorio, listarImpresoras } from '@/lib/escritorio'
import {
  armarEstadoPc,
  compararVersiones,
  cuando,
  informarEstadoPc,
  leerPc,
  listarEstadoDeLasPc,
} from '@/lib/api/estadoPc'
import type { Nivel, PcDelLocal } from '@/lib/api/estadoPc'
import { botonChico, tarjeta } from '@/estilos'

const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : '0.0.0'
const CADA = 5 * 60 * 1000

/*
  Esta PC informa su estado: al abrir, cada cinco minutos y al volver
  internet. No dibuja nada. Los datos se leen de una referencia para no
  reiniciar el reloj cada vez que cambia lo que hay sin enviar.
*/
export function InformeDeEstaPc() {
  const { terminal } = useTerminal()
  const { perfil } = useAuth()
  const sync = useSync()
  const datos = useRef({ terminal, perfil, sync })
  datos.current = { terminal, perfil, sync }

  useEffect(() => {
    if (!terminal) return
    let vigente = true
    const informar = async () => {
      if (!navigator.onLine) return
      const { terminal: t, perfil: p, sync: s } = datos.current
      if (!t) return
      const instaladas = enEscritorio ? await listarImpresoras().catch(() => null) : null
      if (!vigente) return
      const estado = armarEstadoPc({
        enEscritorio,
        impresora: t.impresora_windows,
        impresorasInstaladas: instaladas,
        sinSubir: s.sinSubir,
        error: s.error,
        ultimaSync: s.ultimaSync,
        esPuntoDeEncuentro: t.es_punto_de_encuentro,
        escuchando: s.escuchando,
        entrega: s.entrega,
        usuario: p?.nombre ?? null,
        agente: navigator.userAgent,
      })
      // Si falla, el próximo intento es en cinco minutos: no hay nada
      // que mostrarle a quien está vendiendo.
      await informarEstadoPc(t.id, VERSION, estado).catch(() => undefined)
    }
    // Un rato después de abrir, así ya sincronizó y escucha.
    const primero = setTimeout(informar, 20_000)
    const cada = setInterval(informar, CADA)
    window.addEventListener('online', informar)
    return () => {
      vigente = false
      clearTimeout(primero)
      clearInterval(cada)
      window.removeEventListener('online', informar)
    }
  }, [terminal?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

const PUNTO: Record<Nivel, string> = {
  ok: 'bg-verde-500',
  aviso: 'bg-amber-400',
  falla: 'bg-red-500',
  apagada: 'bg-piedra-300',
}

const ETIQUETA: Record<Nivel, string> = {
  ok: 'Bien',
  aviso: 'Atención',
  falla: 'Falla',
  apagada: 'Apagada',
}

function masNuevaDe(pcs: PcDelLocal[]): string {
  return pcs.reduce(
    (max, pc) => (pc.version_app && compararVersiones(pc.version_app, max) > 0 ? pc.version_app : max),
    VERSION,
  )
}

/*
  Configuración → Local → Estado de las PC.

  Lo que cada PC dijo la última vez, para no tener que preguntar en el
  local ni entrar por AnyDesk. Se refresca solo cada minuto.
*/
export default function EstadoDeLasPc() {
  const pcs = useQuery({
    queryKey: ['estado-de-las-pc'],
    queryFn: listarEstadoDeLasPc,
    refetchInterval: 60_000,
  })
  const ahora = new Date()
  const lista = pcs.data ?? []
  const masNueva = masNuevaDe(lista)
  const sinInformar = lista.filter((pc) => !pc.estado_pc).length

  return (
    <section className={`${tarjeta} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium text-tinta">Estado de las PC</h2>
          <p className="mt-1 text-sm text-piedra-500">
            Lo que informó cada computadora la última vez. Informan solas al abrir el sistema y cada cinco
            minutos.
          </p>
        </div>
        <button onClick={() => pcs.refetch()} disabled={pcs.isFetching} className={botonChico.suave}>
          {pcs.isFetching ? 'Mirando…' : 'Actualizar'}
        </button>
      </div>

      {pcs.isError && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          No se pudo leer el estado: {pcs.error instanceof Error ? pcs.error.message : 'error desconocido'}
        </p>
      )}

      {lista.length > 0 && sinInformar === 0 && (
        <p className="mt-3 text-xs text-piedra-500">Versión más nueva entre las PC: {masNueva}.</p>
      )}

      <ul className="mt-4 divide-y divide-piedra-100">
        {lista.map((pc) => {
          const l = leerPc(pc, masNueva, ahora)
          const e = pc.estado_pc
          return (
            <li key={pc.id} className="py-3">
              <div className="flex gap-3">
                <span
                  className={`mt-1.5 size-2.5 shrink-0 rounded-full ${PUNTO[l.nivel]}`}
                  aria-label={ETIQUETA[l.nivel]}
                  title={ETIQUETA[l.nivel]}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-tinta">
                    <span className="font-medium">{pc.nombre}</span>
                    {pc.version_app && <span className="ml-2 text-xs text-piedra-500">{pc.version_app}</span>}
                  </p>
                  <p className="text-sm text-piedra-700">{l.resumen}</p>
                  {l.detalles.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-piedra-600">
                      {l.detalles.map((d) => (
                        <li key={d}>· {d}</li>
                      ))}
                    </ul>
                  )}
                  {e && pc.estado_informado_en && (
                    <p className="mt-1 break-words text-xs text-piedra-400">
                      {[
                        e.programa === 'navegador' ? 'Navegador' : 'Programa',
                        e.sistema,
                        e.impresora ? `Impresora: ${e.impresora}` : null,
                        e.usuario ? `Usuario: ${e.usuario}` : null,
                        `informó ${cuando(pc.estado_informado_en, ahora)}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
