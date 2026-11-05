import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { guardarValorConfiguracion, obtenerConfiguracion } from '@/lib/api/configuracion'

const PEDIR_CANTIDAD = 'ventas.pedir_cantidad_al_agregar'
const DECIMALES_EN_TODOS = 'ventas.decimales_en_todos'

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

  Los decimales en todos los productos, pedido de Lucas del 05/11: el
  vendedor escribe 0,5 en cualquier producto. Arranca apagado porque
  los que se venden por kilo o litro ya aceptan decimales por su
  unidad, y prendido una pipeta también acepta 0,5 sin avisar.
  ─────────────────────────────────────────────────────────────
*/
export default function RitmoDelMostrador() {
  const qc = useQueryClient()
  const [aviso, setAviso] = useState<string | null>(null)

  const config = useQuery({
    queryKey: ['configuracion', PEDIR_CANTIDAD, DECIMALES_EN_TODOS],
    queryFn: () => obtenerConfiguracion([PEDIR_CANTIDAD, DECIMALES_EN_TODOS]),
  })

  // Lo tildado mientras se guarda, para que la casilla no salte.
  const [tocado, setTocado] = useState<Record<string, boolean>>({})
  const valor = (clave: string, siFalta: number) =>
    tocado[clave] ?? (config.data?.find((f) => f.clave === clave)?.valor ?? siFalta) === 1

  const guardar = useMutation({
    mutationFn: ({ clave, prendido }: { clave: string; prendido: boolean }) =>
      guardarValorConfiguracion(clave, prendido ? 1 : 0),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['configuracion', PEDIR_CANTIDAD, DECIMALES_EN_TODOS] })
      setAviso('Guardado. Las terminales lo toman en la próxima sincronización.')
      setTimeout(() => setAviso(null), 4000)
    },
  })

  function cambiar(clave: string, prendido: boolean) {
    setTocado((t) => ({ ...t, [clave]: prendido }))
    guardar.mutate({ clave, prendido })
  }

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
          checked={valor(PEDIR_CANTIDAD, 1)}
          disabled={config.isLoading || guardar.isPending}
          onChange={(e) => cambiar(PEDIR_CANTIDAD, e.target.checked)}
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

      <label className="mt-4 flex items-start gap-3">
        <input
          type="checkbox"
          checked={valor(DECIMALES_EN_TODOS, 0)}
          disabled={config.isLoading || guardar.isPending}
          onChange={(e) => cambiar(DECIMALES_EN_TODOS, e.target.checked)}
          className="mt-0.5 size-4 rounded border-borde accent-marca-700"
        />
        <span className="text-sm">
          <span className="font-medium text-tinta">Decimales en todos los productos</span>
          <span className="mt-0.5 block text-xs text-piedra-500">
            Encendido: la cantidad acepta 0,5 o 0,374 en cualquier producto.
            <br />
            Apagado: sólo en los que se venden por kilo, litro o metro, según la unidad de su
            ficha.
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
