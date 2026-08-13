import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { crearReferencia } from '@/lib/api/catalogo'
import type { Referencia, TablaReferencia } from '@/lib/api/catalogo'

const claseInput =
  'w-full rounded-lg border border-borde px-2.5 py-1.5 text-sm text-tinta outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20'

interface PropsBase {
  tabla: TablaReferencia
  opciones: Referencia[]
  /** Se llama al crear una opción nueva, para refrescar el catálogo de referencias. */
  onCreada: (nueva: Referencia) => void
}

function useAlta({ tabla, onCreada }: Pick<PropsBase, 'tabla' | 'onCreada'>) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function confirmar(alCrear: (r: Referencia) => void) {
    if (!texto.trim()) return
    setGuardando(true)
    setError(null)
    try {
      const nueva = await crearReferencia(tabla, texto)
      onCreada(nueva)
      alCrear(nueva)
      setTexto('')
      setAbierto(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear.')
    } finally {
      setGuardando(false)
    }
  }

  function abrir() {
    setAbierto(true)
    setError(null)
    setTimeout(() => input.current?.focus(), 0)
  }

  return { abierto, setAbierto, texto, setTexto, error, guardando, input, confirmar, abrir }
}

/** Desplegable con opción de crear el valor ahí mismo. */
export function SelectConAlta({
  etiqueta,
  valor,
  onCambio,
  tabla,
  opciones,
  onCreada,
}: PropsBase & {
  etiqueta: string
  valor: string | null
  onCambio: (id: string | null) => void
}) {
  const alta = useAlta({ tabla, onCreada })

  function alTeclear(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      alta.confirmar((r) => onCambio(r.id))
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      alta.setAbierto(false)
    }
  }

  return (
    <div className="col-span-2">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium text-piedra-600">{etiqueta}</span>
        {!alta.abierto && (
          <button
            type="button"
            onClick={alta.abrir}
            className="text-xs font-medium text-marca-700 hover:text-marca-600 hover:underline"
          >
            + Nueva
          </button>
        )}
      </div>

      {alta.abierto ? (
        <div className="flex gap-1.5">
          <input
            ref={alta.input}
            value={alta.texto}
            onChange={(e) => alta.setTexto(e.target.value)}
            onKeyDown={alTeclear}
            placeholder="Nombre y Enter"
            className={claseInput}
          />
          <button
            type="button"
            onClick={() => alta.setAbierto(false)}
            className="shrink-0 rounded-lg px-2 text-piedra-400 hover:bg-piedra-100 hover:text-piedra-600"
            aria-label="Cancelar"
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <select
          value={valor ?? ''}
          onChange={(e) => onCambio(e.target.value || null)}
          className={claseInput}
        >
          <option value="">—</option>
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </select>
      )}

      {alta.error && <p className="mt-1 text-xs text-red-600">{alta.error}</p>}
    </div>
  )
}

/** Selección múltiple con chips, también con alta al vuelo. */
export function ChipsConAlta({
  etiqueta,
  seleccion,
  onCambio,
  tabla,
  opciones,
  onCreada,
}: PropsBase & {
  etiqueta: string
  seleccion: string[]
  onCambio: (ids: string[]) => void
}) {
  const alta = useAlta({ tabla, onCreada })

  function alternar(id: string) {
    onCambio(seleccion.includes(id) ? seleccion.filter((x) => x !== id) : [...seleccion, id])
  }

  function alTeclear(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      alta.confirmar((r) => onCambio([...seleccion, r.id]))
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      alta.setAbierto(false)
    }
  }

  return (
    <div className="col-span-2">
      <span className="mb-1.5 block text-xs font-medium text-piedra-600">{etiqueta}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {opciones.map((o) => {
          const activo = seleccion.includes(o.id)
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => alternar(o.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${
                activo
                  ? 'bg-marca-700 text-white ring-marca-700'
                  : 'bg-white text-piedra-600 ring-borde hover:bg-piedra-50'
              }`}
            >
              {o.nombre}
            </button>
          )
        })}

        {alta.abierto ? (
          <input
            ref={alta.input}
            value={alta.texto}
            onChange={(e) => alta.setTexto(e.target.value)}
            onKeyDown={alTeclear}
            onBlur={() => !alta.texto && alta.setAbierto(false)}
            placeholder="Nombre y Enter"
            className="w-36 rounded-full border border-borde px-3 py-1 text-xs outline-none focus:border-marca-500"
          />
        ) : (
          <button
            type="button"
            onClick={alta.abrir}
            className="rounded-full border border-dashed border-piedra-300 px-3 py-1 text-xs font-medium text-marca-700 hover:border-marca-400 hover:bg-marca-50"
          >
            + Nueva
          </button>
        )}
      </div>
      {alta.error && <p className="mt-1 text-xs text-red-600">{alta.error}</p>}
    </div>
  )
}
