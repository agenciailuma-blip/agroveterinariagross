import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { useTerminal } from '@/lib/terminal'
import { useSync } from '@/lib/local/SyncProvider'
import { comoTexto, correrDiagnostico } from '@/lib/api/diagnostico'
import type { Diagnostico, Estado } from '@/lib/api/diagnostico'
import { CLAVES_IMPRESORA, obtenerTextos } from '@/lib/api/configuracion'

/*
  El diagnóstico de esta terminal.

  Pensado para la instalación en las PC de Gross con alguien del otro
  lado del teléfono. Va primero en Configuración porque es lo primero
  que hay que mirar cuando algo no anda, no lo último.

  El botón que importa es "Copiar": alguien en el local lo aprieta, lo
  pega en un chat, y del otro lado se ve exactamente lo mismo que ve él.
  Eso convierte una llamada de una hora en una de diez minutos.
*/

const COLOR: Record<Estado, string> = {
  ok: 'bg-verde-500',
  aviso: 'bg-amber-400',
  falla: 'bg-red-500',
}

const ETIQUETA: Record<Estado, string> = {
  ok: 'Bien',
  aviso: 'Atención',
  falla: 'Falla',
}

export default function DiagnosticoTerminal() {
  const { perfil } = useAuth()
  const { terminal } = useTerminal()
  const { sinSubir, ultimaSync } = useSync()
  const [resultado, setResultado] = useState<Diagnostico | null>(null)
  const [copiado, setCopiado] = useState(false)

  const correr = useMutation({
    mutationFn: async () => {
      const config = await obtenerTextos(CLAVES_IMPRESORA)
      return correrDiagnostico({
        terminal: terminal
          ? {
              nombre: terminal.nombre,
              tipo: terminal.tipo,
              prefijo: terminal.prefijo,
              punto_venta_id: terminal.punto_venta_id,
            }
          : null,
        usuario: perfil?.nombre ?? null,
        sinSubir,
        ultimaSync,
        impresoraHost: config['comercio.impresora_host'] ?? null,
        impresoraPuerto: Number(config['comercio.impresora_puerto']) || 9100,
      })
    },
    onSuccess: (d) => {
      setResultado(d)
      setCopiado(false)
    },
  })

  async function copiar() {
    if (!resultado) return
    try {
      await navigator.clipboard.writeText(comoTexto(resultado))
      setCopiado(true)
    } catch {
      // Si el navegador no deja copiar, el texto igual está en pantalla
      // abajo para seleccionarlo a mano.
      setCopiado(false)
    }
  }

  const hayProblemas = resultado?.puntos.some((p) => p.estado !== 'ok') ?? false

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-borde">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium text-tinta">Diagnóstico de esta terminal</h2>
          <p className="text-sm text-piedra-500">
            Qué anda y qué no en esta computadora. Si algo falla, decí qué hacer.
          </p>
        </div>
        <button
          onClick={() => correr.mutate()}
          disabled={correr.isPending}
          className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600 disabled:opacity-40"
        >
          {correr.isPending ? 'Revisando…' : 'Revisar ahora'}
        </button>
      </div>

      {resultado && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3 border-b border-piedra-100 pb-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                hayProblemas ? 'bg-amber-100 text-amber-900' : 'bg-verde-100 text-verde-800'
              }`}
            >
              {hayProblemas ? 'Hay algo para mirar' : 'Todo en orden'}
            </span>
            <span className="text-xs text-piedra-500">
              Versión {resultado.version} · {resultado.momento}
            </span>
            <button
              onClick={copiar}
              className="ml-auto rounded-lg border border-borde px-3 py-1.5 text-sm font-medium text-tinta hover:bg-piedra-50"
            >
              {copiado ? '¡Copiado!' : 'Copiar para mandar'}
            </button>
          </div>

          <ul className="mt-3 space-y-2.5">
            {resultado.puntos.map((p) => (
              <li key={p.nombre} className="flex gap-3">
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${COLOR[p.estado]}`}
                  aria-label={ETIQUETA[p.estado]}
                />
                <div className="min-w-0">
                  <p className="text-sm text-tinta">
                    <span className="font-medium">{p.nombre}:</span> {p.detalle}
                  </p>
                  {p.estado !== 'ok' && p.queHacer && (
                    <p className="text-xs text-marca-700">→ {p.queHacer}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/*
            El mismo texto, a la vista.

            Si el navegador no deja copiar al portapapeles —pasa— tiene
            que quedar algo que se pueda seleccionar y pegar igual. Un
            botón de copiar que falla en silencio sería peor que no
            tenerlo.
          */}
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-piedra-500">
              Ver el texto para copiar a mano
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-piedra-50 p-3 text-[11px] leading-relaxed text-piedra-700">
              {comoTexto(resultado)}
            </pre>
          </details>
        </>
      )}

      {correr.isError && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          No se pudo completar el diagnóstico:{' '}
          {correr.error instanceof Error ? correr.error.message : 'error desconocido'}
        </p>
      )}
    </section>
  )
}
