import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CLAVES_IMPRESORA,
  guardarImpresoraDeLaTerminal,
  guardarTextos,
  obtenerTextos,
} from '@/lib/api/configuracion'
import { destinoDeImpresion } from '@/lib/comprobante/destino'
import { ticketDePrueba } from '@/lib/comprobante/escpos'
import { enEscritorio, imprimirTicket, listarImpresoras } from '@/lib/escritorio'
import { useTerminal } from '@/lib/terminal'
import { boton, campo } from '@/estilos'

/*
  Qué impresora usa el mostrador de ESTA computadora.

  Se elige de la lista que informa Windows, no se escribe. Es la decisión
  que salió del relevamiento del 07/09 y no es un detalle de comodidad:
  la misma POS80 se llama «POS80 Printer» en la caja, donde está por USB,
  y «POS80 Printer(2)» en los mostradores, que la ven compartida desde
  ahí. Un nombre escrito a mano no avisa nada cuando está mal — falla
  recién el día que hay que entregarle un comprobante a un cliente.

  Por eso también se guarda en la terminal y no en la configuración del
  comercio: el nombre es de la máquina. Y por eso la lista sólo existe
  adentro del programa instalado: ninguna página web puede preguntarle al
  sistema qué impresoras tiene.
*/


export default function ImpresoraDelMostrador() {
  const qc = useQueryClient()
  const { terminal, elegir } = useTerminal()
  const [elegida, setElegida] = useState('')
  const [host, setHost] = useState('')
  const [puerto, setPuerto] = useState('9100')
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const datos = useQuery({
    queryKey: ['impresora'],
    queryFn: () => obtenerTextos(CLAVES_IMPRESORA),
  })

  const impresoras = useQuery({
    queryKey: ['impresoras-de-windows'],
    queryFn: listarImpresoras,
    enabled: enEscritorio,
  })

  useEffect(() => {
    if (!datos.data) return
    setHost(datos.data['comercio.impresora_host'] ?? '')
    setPuerto(datos.data['comercio.impresora_puerto'] || '9100')
  }, [datos.data])

  // La elegida sale de la terminal, que es donde vive. Se refresca cuando
  // la terminal cambia: en una PC recién instalada se elige la terminal
  // primero y esta pantalla tiene que enterarse sin recargar nada.
  useEffect(() => {
    setElegida(terminal?.impresora_windows ?? '')
  }, [terminal])

  const guardar = useMutation({
    mutationFn: async () => {
      if (!terminal) throw new Error('Esta máquina todavía no sabe qué terminal es.')
      await guardarImpresoraDeLaTerminal(terminal.id, elegida)
    },
    onSuccess: () => {
      /*
        Se publica la terminal ya corregida sin esperar al servidor: las
        pantallas de comprobante leen la impresora de acá, y si tuvieran
        que esperar a la próxima recarga el primer ticket saldría por
        donde salía antes.
      */
      if (terminal) elegir({ ...terminal, impresora_windows: elegida.trim() || null })
      qc.invalidateQueries({ queryKey: ['comprobante'] })
      setError(null)
      setAviso('Guardado')
      setTimeout(() => setAviso(null), 3000)
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo guardar.'),
  })

  const guardarRed = useMutation({
    mutationFn: () =>
      guardarTextos({
        'comercio.impresora_host': host.trim(),
        'comercio.impresora_puerto': puerto.trim() || '9100',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['impresora'] })
      qc.invalidateQueries({ queryKey: ['comprobante'] })
      setError(null)
      setAviso('Guardado')
      setTimeout(() => setAviso(null), 3000)
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo guardar.'),
  })

  /*
    La prueba usa la MISMA regla que la caja para decidir por dónde sale.
    Si acá se eligiera a mano, una prueba podría salir bien por un camino
    y el ticket de verdad irse por el otro.
  */
  const destino = destinoDeImpresion(
    { impresora_windows: elegida },
    { impresora_host: host, impresora_puerto: puerto },
  )

  const probar = useMutation({
    mutationFn: async () => {
      if (!destino) throw new Error('Primero elegí una impresora.')
      const nombre = datos.data?.['comercio.nombre_fantasia'] || 'Agroveterinaria Gross'
      await imprimirTicket(ticketDePrueba(nombre), destino)
    },
    onSuccess: () => {
      setError(null)
      setAviso('Salió el ticket de prueba')
      setTimeout(() => setAviso(null), 5000)
    },
    onError: (e) => {
      setAviso(null)
      setError(e instanceof Error ? e.message : 'No se pudo imprimir.')
    },
  })

  const lista = impresoras.data ?? []
  // Una impresora guardada que Windows ya no tiene es el caso que hay que
  // mostrar, no esconder: pasa cuando la desinstalan, la renombran o se
  // cae el equipo que la comparte. Igual queda en el desplegable para que
  // la persona vea qué está configurado.
  const guardadaPerdida = !!elegida && enEscritorio && !impresoras.isPending && !lista.includes(elegida)

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-borde">
      <h2 className="font-medium text-tinta">Impresora del mostrador</h2>
      <p className="mt-1 text-sm text-piedra-500">
        La impresora de tickets de <strong>esta</strong> computadora. Sin esto, el comprobante se
        imprime desde el diálogo de Windows, eligiendo la impresora cada vez.
      </p>

      {!enEscritorio ? (
        <p className="mt-4 rounded-lg bg-piedra-50 px-3 py-2 text-xs text-piedra-600">
          Estás en el navegador. La lista de impresoras y la impresión directa sólo funcionan desde
          el programa instalado en las computadoras del local — que es lo que permite hablarle a la
          impresora sin pasar por un diálogo.
        </p>
      ) : !terminal ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          Esta máquina todavía no sabe qué terminal es, y la impresora se guarda por terminal.
          Entrá a Ventas, elegí la terminal de esta PC, y volvé.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="block min-w-64 flex-1">
              <span className="mb-1 block text-xs font-medium text-piedra-600">
                Impresora de {terminal.nombre}
              </span>
              <select
                value={elegida}
                onChange={(e) => setElegida(e.target.value)}
                className={campo}
              >
                <option value="">— Ninguna: imprimir desde el diálogo de Windows —</option>
                {lista.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                {guardadaPerdida && (
                  <option value={elegida}>{elegida} — no está instalada en esta PC</option>
                )}
              </select>
            </label>

            <button
              onClick={() => impresoras.refetch()}
              disabled={impresoras.isFetching}
              className={boton.secundario}
            >
              {impresoras.isFetching ? 'Buscando…' : 'Actualizar la lista'}
            </button>
          </div>

          <p className="mt-1.5 text-xs text-piedra-400">
            Son las impresoras que tiene instaladas esta computadora. En la caja del local es{' '}
            <span className="font-mono">POS80 Printer</span>; en los mostradores, la misma
            compartida, aparece con un <span className="font-mono">(2)</span> y el nombre del equipo.
          </p>

          {impresoras.isError && (
            <p className="mt-2 text-xs text-red-700">
              No se pudo leer la lista de impresoras de Windows:{' '}
              {impresoras.error instanceof Error ? impresoras.error.message : 'error desconocido'}
            </p>
          )}

          {guardadaPerdida && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
              «{elegida}» está guardada pero Windows no la tiene instalada en esta PC. Si la
              impresora está prendida, apretá «Actualizar la lista»; si la comparte otra
              computadora, fijate que esa esté encendida.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => guardar.mutate()}
              disabled={guardar.isPending}
              className={boton.principal}
            >
              {guardar.isPending ? 'Guardando…' : 'Guardar'}
            </button>

            <button
              onClick={() => probar.mutate()}
              disabled={!destino || probar.isPending}
              className={boton.secundario}
            >
              {probar.isPending ? 'Imprimiendo…' : 'Imprimir una prueba'}
            </button>

            {aviso && (
              <span className="rounded-full bg-verde-100 px-3 py-1 text-xs font-medium text-verde-800 ring-1 ring-verde-200">
                {aviso}
              </span>
            )}
          </div>
        </>
      )}

      {/*
        La impresora de red, guardada aparte y escondida a propósito.

        No sirve en ninguna de las dos cajas de Gross —el relevamiento del
        07/09 mostró que la POS80 está por USB— pero es el único camino
        posible si algún día ponen una impresora que escuche en la red, y
        sacarla no gana nada.
      */}
      <details className="mt-5 border-t border-piedra-100 pt-4">
        <summary className="cursor-pointer text-xs text-piedra-500">
          Impresora de red (Gross no usa este camino)
        </summary>

        <p className="mt-2 text-xs text-piedra-500">
          Para una impresora que escuche en una dirección de la red del local, en vez de estar
          conectada a una computadora. Es una sola para todo el comercio, y se usa únicamente en las
          máquinas que no tengan una impresora de Windows elegida arriba.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block min-w-56 flex-1">
            <span className="mb-1 block text-xs font-medium text-piedra-600">
              Dirección en la red del local
            </span>
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="192.168.1.50"
              className={campo}
            />
          </label>
          <label className="block w-28">
            <span className="mb-1 block text-xs font-medium text-piedra-600">Puerto</span>
            <input
              value={puerto}
              onChange={(e) => setPuerto(e.target.value)}
              inputMode="numeric"
              className={campo}
            />
          </label>
          <button
            onClick={() => guardarRed.mutate()}
            disabled={guardarRed.isPending}
            className={boton.secundario}
          >
            {guardarRed.isPending ? 'Guardando…' : 'Guardar la de red'}
          </button>
        </div>
      </details>

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
