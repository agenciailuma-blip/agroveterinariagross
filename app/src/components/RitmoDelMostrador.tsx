import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { guardarValorConfiguracion, obtenerConfiguracion } from '@/lib/api/configuracion'

const CLAVE = 'ventas.pedir_cantidad_al_agregar'

/*
  ─────────────────────────────────────────────────────────────
  El ritmo del mostrador

  Sugerencia 18 de Lucas: pedir la cantidad al agregar un producto.

  Está acá y no fijo en el código porque cambia el ritmo de la venta
  entera y no sabemos cuál le sirve al mostrador de Gross. Cinco
  bolsas de alimento agradecen la pregunta; doce collares distintos
  la sufren.

  La forma honesta de decidirlo es que lo prueben una semana y lo
  apaguen si molesta — no que nos llamen para que lo cambiemos. Es
  además la única de las sugerencias donde el propio documento decía
  "conviene probarlo con un vendedor antes de dejarlo fijo".
  ─────────────────────────────────────────────────────────────
*/
export default function RitmoDelMostrador() {
  const qc = useQueryClient()
  const [aviso, setAviso] = useState<string | null>(null)

  const config = useQuery({
    queryKey: ['configuracion', CLAVE],
    queryFn: () => obtenerConfiguracion([CLAVE]),
  })

  const [pedir, setPedir] = useState(true)
  useEffect(() => {
    if (!config.data) return
    setPedir((config.data.find((f) => f.clave === CLAVE)?.valor ?? 1) === 1)
  }, [config.data])

  const guardar = useMutation({
    mutationFn: (valor: boolean) => guardarValorConfiguracion(CLAVE, valor ? 1 : 0),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['configuracion', CLAVE] })
      setAviso('Guardado. Las terminales lo toman en la próxima sincronización.')
      setTimeout(() => setAviso(null), 4000)
    },
  })

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-borde">
      <h2 className="font-medium text-tinta">Ritmo del mostrador</h2>
      <p className="mt-1 text-sm text-piedra-500">
        Cómo se cargan los productos en una venta. Probalo unos días y dejalo como le sirva al
        mostrador.
      </p>

      <label className="mt-4 flex items-start gap-3">
        <input
          type="checkbox"
          checked={pedir}
          disabled={config.isLoading || guardar.isPending}
          onChange={(e) => {
            setPedir(e.target.checked)
            guardar.mutate(e.target.checked)
          }}
          className="mt-0.5 size-4 rounded border-borde accent-marca-700"
        />
        <span className="text-sm">
          <span className="font-medium text-tinta">Preguntar cuántos al agregar un producto</span>
          <span className="mt-0.5 block text-xs text-piedra-500">
            Encendido: cada producto abre una pregunta de cantidad. Conviene si se venden varias
            unidades de lo mismo.
            <br />
            Apagado: entra de a uno, como hasta ahora, y la cantidad se corrige en la lista.
            Conviene si se pasan muchos productos distintos.
          </span>
        </span>
      </label>

      {aviso && (
        <p className="mt-3 rounded-lg bg-verde-50 px-3 py-2 text-xs text-verde-800 ring-1 ring-verde-200">
          {aviso}
        </p>
      )}
      {guardar.isError && (
        <p className="mt-3 text-xs text-red-600">No se pudo guardar. Probá de nuevo.</p>
      )}
    </div>
  )
}
