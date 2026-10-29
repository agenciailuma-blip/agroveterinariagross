import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { guardarValorConfiguracion, obtenerConfiguracion } from '@/lib/api/configuracion'

const CLAVE = 'ventas.conceptos_asociados'

/*
  ─────────────────────────────────────────────────────────────
  Los conceptos de los productos asociados

  Fase 03, punto 3. Los nombres bajo los que el mostrador puede juntar
  productos en la factura (F11). Cambiar o sacar uno no toca lo que ya
  se facturó: cada renglón guarda el nombre que tenía.
  ─────────────────────────────────────────────────────────────
*/
export default function ConceptosAsociados() {
  const qc = useQueryClient()
  const [conceptos, setConceptos] = useState<string[]>([])
  const [nuevo, setNuevo] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)

  const config = useQuery({
    queryKey: ['configuracion', CLAVE],
    queryFn: () => obtenerConfiguracion([CLAVE]),
  })

  useEffect(() => {
    if (!config.data) return
    const v = config.data.find((f) => f.clave === CLAVE)?.valor
    setConceptos(Array.isArray(v) ? v.map(String) : [])
  }, [config.data])

  const limpios = [...new Set(conceptos.map((c) => c.trim()).filter(Boolean))]

  const guardar = useMutation({
    mutationFn: () => guardarValorConfiguracion(CLAVE, limpios),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['configuracion', CLAVE] })
      setAviso('Guardado. Las terminales lo toman en la próxima sincronización.')
      setTimeout(() => setAviso(null), 4000)
    },
  })

  const agregar = () => {
    if (!nuevo.trim()) return
    setConceptos((c) => [...c, nuevo.trim()])
    setNuevo('')
  }

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-borde">
      <h2 className="font-medium text-tinta">Productos asociados</h2>
      <p className="mt-1 text-sm text-piedra-500">
        Los conceptos bajo los que el mostrador puede juntar productos en la factura (F11). Lo que ya
        se facturó no cambia.
      </p>

      {config.isLoading ? (
        <p className="mt-4 text-sm text-piedra-500">Cargando…</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {conceptos.map((c, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                value={c}
                maxLength={60}
                onChange={(e) => setConceptos((cs) => cs.map((x, j) => (j === i ? e.target.value : x)))}
                aria-label={`Concepto ${i + 1}`}
                className="min-w-0 flex-1 rounded-lg border border-borde px-2.5 py-1.5 text-sm text-tinta outline-none focus:border-marca-500"
              />
              <button
                onClick={() => setConceptos((cs) => cs.filter((_, j) => j !== i))}
                className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm text-piedra-500 hover:bg-red-50 hover:text-red-600"
              >
                Sacar
              </button>
            </li>
          ))}
          <li className="flex items-center gap-2">
            <input
              value={nuevo}
              maxLength={60}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && agregar()}
              placeholder="Otro concepto"
              className="min-w-0 flex-1 rounded-lg border border-dashed border-borde px-2.5 py-1.5 text-sm text-tinta outline-none focus:border-marca-500"
            />
            <button
              onClick={agregar}
              disabled={!nuevo.trim()}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium text-marca-700 ring-1 ring-borde hover:bg-marca-50 disabled:opacity-40"
            >
              Agregar
            </button>
          </li>
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => guardar.mutate()}
          disabled={guardar.isPending || config.isLoading}
          className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600 disabled:opacity-40"
        >
          {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </button>
        {aviso && <p className="text-xs text-verde-800">{aviso}</p>}
        {guardar.isError && <p className="text-xs text-red-700">{guardar.error.message}</p>}
      </div>
    </div>
  )
}
