import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useSync } from '@/lib/local/SyncProvider'
import { claveDelLocal, contarEntrega, direccionDelPuntoDeEncuentro } from '@/lib/local/red'
import { enEscritorio, hablarConLaCaja } from '@/lib/escritorio'
import { enCastellano } from '@/lib/errores'
import { useTerminal } from '@/lib/terminal'
import { boton, tarjeta } from '@/estilos'
import { useState } from 'react'

/*
  La red del local.

  Es lo que hace que, con internet cortado, la venta que arma un
  vendedor llegue igual a la caja. Una terminal escucha —conviene que
  sea la de la caja, que es donde la venta se cobra— y las demás le
  hablan.

  La pantalla existe para dos momentos concretos: el día de la
  instalación, para marcar cuál escucha, y el día que algo no llega,
  para ver de un vistazo si el camino está abierto.
*/
export default function RedDelLocal() {
  const qc = useQueryClient()
  const { terminal, disponibles, elegir } = useTerminal()
  const { escuchando, entrega, entregaEn } = useSync()
  const dice = contarEntrega(entrega, entregaEn)
  const [probando, setProbando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const datos = useQuery({
    queryKey: ['red-del-local'],
    queryFn: async () => ({
      direccion: await direccionDelPuntoDeEncuentro(),
      clave: await claveDelLocal(),
    }),
  })

  const marcar = useMutation({
    mutationFn: async () => {
      if (!terminal) throw new Error('Esta máquina todavía no sabe qué terminal es.')
      const { error } = await supabase.rpc('marcar_punto_de_encuentro', {
        p_terminal_id: terminal.id,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      // La terminal guardada acá tiene que enterarse en el momento: de
      // ella depende que esta máquina se ponga a escuchar.
      if (terminal) elegir({ ...terminal, es_punto_de_encuentro: true })
      qc.invalidateQueries({ queryKey: ['red-del-local'] })
      setError(null)
    },
    onError: (e) => setError(enCastellano(e, 'No se pudo guardar.')),
  })

  const probar = useMutation({
    mutationFn: async () => {
      const direccion = datos.data?.direccion
      const clave = datos.data?.clave
      if (!direccion) throw new Error('Todavía ninguna terminal se puso a escuchar.')
      const r = await hablarConLaCaja(
        direccion,
        JSON.stringify({ clave, tipo: 'salud', terminal: terminal?.nombre ?? '', operaciones: [] }),
      )
      if (!r.ok) throw new Error(r.detalle)
      return r.detalle
    },
    onSuccess: (d) => {
      setError(null)
      setProbando(d)
      setTimeout(() => setProbando(null), 5000)
    },
    onError: (e) => {
      setProbando(null)
      setError(enCastellano(e, 'No se pudo hablar con el punto de encuentro.'))
    },
  })

  const quienEscucha = disponibles.find((t) => t.es_punto_de_encuentro)
  const soyYo = !!terminal?.es_punto_de_encuentro

  return (
    <div className={`${tarjeta} p-5`}>
      <h2 className="font-medium text-tinta">La red del local</h2>
      <p className="mt-1 text-sm text-piedra-500">
        Cuando se corta internet, las computadoras se hablan entre ellas para que la venta que
        arma un vendedor llegue igual a la caja. Una escucha y las demás le hablan.
      </p>

      {!enEscritorio ? (
        <p className="mt-4 rounded-lg bg-piedra-50 px-3 py-2 text-xs text-piedra-600">
          Estás en el navegador. Esto sólo funciona desde el programa instalado: una página web no
          puede escuchar a otra computadora ni hablarle.
        </p>
      ) : (
        <>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-piedra-500">Quién escucha</dt>
              <dd className="font-medium text-tinta">
                {quienEscucha ? quienEscucha.nombre : 'Todavía nadie'}
                {soyYo && <span className="ml-2 text-xs text-marca-700">— es esta computadora</span>}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-piedra-500">Se la encuentra como</dt>
              <dd className="font-mono text-xs text-piedra-600">
                {datos.data?.direccion || '—'}
              </dd>
            </div>
            {soyYo && (
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-piedra-500">Escuchando ahora</dt>
                <dd className={escuchando ? 'font-medium text-verde-700' : 'text-amber-700'}>
                  {escuchando ? 'Sí' : 'No — mirá el aviso de Windows'}
                </dd>
              </div>
            )}

            {/*
              Lo que le pasó de verdad a esta terminal con la caja.

              Es el renglón que faltaba el 17/09, cuando la venta no
              llegó y no había nada que mirar: la pantalla mostraba el
              camino configurado, pero no si funcionaba.
            */}
            {!soyYo && enEscritorio && (
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-piedra-500">Última entrega a la caja</dt>
                <dd
                  className={
                    dice.estado === 'falla'
                      ? 'text-right font-medium text-red-700'
                      : dice.estado === 'aviso'
                        ? 'text-right text-amber-700'
                        : 'text-right text-verde-700'
                  }
                >
                  {dice.detalle}
                </dd>
              </div>
            )}
          </dl>

          {!soyYo && enEscritorio && dice.queHacer && dice.estado !== 'ok' && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
              {dice.queHacer}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {!soyYo && (
              <button
                onClick={() => marcar.mutate()}
                disabled={marcar.isPending || !terminal}
                className={boton.secundario}
              >
                {marcar.isPending ? 'Guardando…' : 'Que escuche esta computadora'}
              </button>
            )}

            {!soyYo && !!datos.data?.direccion && (
              <button
                onClick={() => probar.mutate()}
                disabled={probar.isPending}
                className={boton.principal}
              >
                {probar.isPending ? 'Probando…' : 'Probar la conexión'}
              </button>
            )}

            {probando && (
              <span className="rounded-full bg-verde-100 px-3 py-1 text-xs font-medium text-verde-800 ring-1 ring-verde-200">
                {probando}
              </span>
            )}
          </div>

          {soyYo && (
            <p className="mt-3 rounded-lg bg-piedra-50 px-3 py-2 text-xs text-piedra-600">
              La primera vez, Windows pregunta si permite que el programa se comunique en redes
              privadas. Hay que decir que sí — si se dijo que no, esta computadora no va a poder
              escuchar y las demás no van a poder mandarle nada.
            </p>
          )}
        </>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200"
        >
          {error}
        </p>
      )}
    </div>
  )
}
