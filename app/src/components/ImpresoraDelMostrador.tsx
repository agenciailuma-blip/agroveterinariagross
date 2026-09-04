import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CLAVES_IMPRESORA, guardarTextos, obtenerTextos } from '@/lib/api/configuracion'
import { ticketDePrueba } from '@/lib/comprobante/escpos'
import { enEscritorio, imprimirEnLaHasar } from '@/lib/escritorio'

/*
  Dónde está la impresora del mostrador.

  El alcance la nombra: "Impresión en la Hasar P-HAS-181 por red". Está
  en la red del local escuchando en un puerto, y el programa instalado
  le manda el ticket ya armado.

  Desde el navegador esto no se puede: una página web no abre conexiones
  de red contra un aparato del local. Por eso la prueba sólo funciona
  desde el programa instalado, y la pantalla lo dice en vez de fallar
  con un error que no explica nada.
*/

const claseInput =
  'w-full rounded-lg border border-borde px-2.5 py-1.5 text-sm text-tinta outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20'

export default function ImpresoraDelMostrador() {
  const qc = useQueryClient()
  const [host, setHost] = useState('')
  const [puerto, setPuerto] = useState('9100')
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const datos = useQuery({
    queryKey: ['impresora'],
    queryFn: () => obtenerTextos(CLAVES_IMPRESORA),
  })

  useEffect(() => {
    if (!datos.data) return
    setHost(datos.data['comercio.impresora_host'] ?? '')
    setPuerto(datos.data['comercio.impresora_puerto'] || '9100')
  }, [datos.data])

  const guardar = useMutation({
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

  const probar = useMutation({
    mutationFn: async () => {
      const nombre = datos.data?.['comercio.nombre_fantasia'] || 'Agroveterinaria Gross'
      await imprimirEnLaHasar(ticketDePrueba(nombre), host.trim(), Number(puerto) || 9100)
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

  const configurada = host.trim().length > 0

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-borde">
      <h2 className="font-medium text-tinta">Impresora del mostrador</h2>
      <p className="mt-1 text-sm text-piedra-500">
        La impresora de tickets del local, conectada por red. Sin esto, el comprobante se imprime
        desde el navegador a cualquier impresora.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block min-w-56 flex-1">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Dirección en la red del local
          </span>
          <input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="192.168.1.50"
            className={claseInput}
          />
        </label>
        <label className="block w-28">
          <span className="mb-1 block text-xs font-medium text-slate-600">Puerto</span>
          <input
            value={puerto}
            onChange={(e) => setPuerto(e.target.value)}
            inputMode="numeric"
            className={claseInput}
          />
        </label>
      </div>
      <p className="mt-1.5 text-xs text-piedra-400">
        El puerto habitual es el 9100. La dirección la da el técnico que instaló la impresora, o
        figura en el ticket de configuración que imprime al encenderla.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => guardar.mutate()}
          disabled={guardar.isPending}
          className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600 disabled:opacity-40"
        >
          {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </button>

        <button
          onClick={() => probar.mutate()}
          disabled={!configurada || !enEscritorio || probar.isPending}
          title={
            !enEscritorio
              ? 'La impresión directa sólo funciona desde el programa instalado'
              : undefined
          }
          className="rounded-lg px-3 py-2 text-sm font-medium text-marca-700 ring-1 ring-borde hover:bg-marca-50 disabled:opacity-40"
        >
          {probar.isPending ? 'Imprimiendo…' : 'Imprimir una prueba'}
        </button>

        {aviso && (
          <span className="rounded-full bg-verde-100 px-3 py-1 text-xs font-medium text-verde-800 ring-1 ring-verde-200">
            {aviso}
          </span>
        )}
      </div>

      {!enEscritorio && (
        <p className="mt-3 rounded-lg bg-piedra-50 px-3 py-2 text-xs text-piedra-600">
          Estás en el navegador. La prueba de impresión sólo funciona desde el programa instalado en
          las computadoras del local — que es lo que permite hablarle a la impresora directamente.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}
    </div>
  )
}
