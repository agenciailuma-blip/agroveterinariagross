import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { campoDeFiltro } from '@/estilos'
import { cuantosFiltros, FILTROS_VACIOS, hayFiltros } from '@/lib/filtros'
import type { Filtros } from '@/lib/filtros'

/*
  La búsqueda avanzada, una sola para todo el sistema.

  Cada pantalla dice qué campos quiere: fechas, cliente o proveedor,
  número o código, estado. En la computadora arranca abierto; en el
  teléfono arranca plegado en un botón «Búsqueda avanzada» que dice
  cuántos filtros hay puestos, así no se come la pantalla.

  Lo que se escribe se avisa enseguida. Si la pantalla filtra en la
  base, conviene pasar el valor por `useDiferido` para no consultar con
  cada letra.
*/
export interface OpcionDeEstado {
  valor: string
  etiqueta: string
}

export interface CamposDelPanel {
  /** Desde y hasta. */
  fechas?: boolean
  /** La etiqueta del campo de nombre: «Cliente», «Proveedor», «Cliente o proveedor». */
  persona?: string
  /** La etiqueta del campo de número: «Número», «Código», «Número o código». */
  numero?: string
  /** El ejemplo dentro del campo de número. */
  ejemploNumero?: string
  /** Los estados posibles. Sin esto no hay desplegable de estado. */
  estados?: OpcionDeEstado[]
}

function esPantallaGrande(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  } catch {
    return true
  }
}

export default function PanelDeFiltros({
  valor,
  onCambio,
  campos,
  extra,
}: {
  valor: Filtros
  onCambio: (f: Filtros) => void
  campos: CamposDelPanel
  /** Algún control propio de la pantalla, al final de la fila. */
  extra?: ReactNode
}) {
  const [abierto, setAbierto] = useState(esPantallaGrande)
  // Si viene con filtros puestos (por ejemplo, de la dirección), se ve.
  useEffect(() => {
    if (hayFiltros(valor)) setAbierto(true)
    // Sólo al entrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const poner = (c: Partial<Filtros>) => onCambio({ ...valor, ...c })
  const cuantos = cuantosFiltros(valor)

  return (
    <div className="rounded-xl bg-white ring-1 ring-borde">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-piedra-700"
      >
        <span>
          Búsqueda avanzada
          {cuantos > 0 && (
            <span className="ml-2 rounded-full bg-marca-100 px-2 py-0.5 text-xs text-marca-800">
              {cuantos} {cuantos === 1 ? 'filtro' : 'filtros'}
            </span>
          )}
        </span>
        <span aria-hidden className="text-xs text-piedra-400">
          {abierto ? '▲' : '▼'}
        </span>
      </button>

      {abierto && (
        <div className="flex flex-wrap items-end gap-3 border-t border-borde px-3 pb-3 pt-2">
          {campos.fechas && (
            <>
              <Campo etiqueta="Desde">
                <input
                  type="date"
                  value={valor.desde}
                  max={valor.hasta || undefined}
                  onChange={(e) => poner({ desde: e.target.value })}
                  className={`${campoDeFiltro} w-full`}
                />
              </Campo>
              <Campo etiqueta="Hasta">
                <input
                  type="date"
                  value={valor.hasta}
                  min={valor.desde || undefined}
                  onChange={(e) => poner({ hasta: e.target.value })}
                  className={`${campoDeFiltro} w-full`}
                />
              </Campo>
            </>
          )}
          {campos.persona && (
            <Campo etiqueta={campos.persona} ancho>
              <input
                type="search"
                value={valor.persona}
                onChange={(e) => poner({ persona: e.target.value })}
                placeholder="Parte del nombre"
                className={`${campoDeFiltro} w-full`}
              />
            </Campo>
          )}
          {campos.numero && (
            <Campo etiqueta={campos.numero}>
              <input
                type="search"
                value={valor.numero}
                onChange={(e) => poner({ numero: e.target.value })}
                placeholder={campos.ejemploNumero ?? '26 o 1-26'}
                className={`${campoDeFiltro} w-full`}
              />
            </Campo>
          )}
          {campos.estados && campos.estados.length > 0 && (
            <Campo etiqueta="Estado">
              <select
                value={valor.estado}
                onChange={(e) => poner({ estado: e.target.value })}
                className={`${campoDeFiltro} w-full`}
              >
                <option value="">Todos</option>
                {campos.estados.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          {extra}
          {hayFiltros(valor) && (
            <button
              type="button"
              onClick={() => onCambio(FILTROS_VACIOS)}
              className="pb-2 text-sm text-marca-700 underline"
            >
              Limpiar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// En el teléfono cada campo ocupa media fila (o la fila entera el nombre); en la computadora, lo suyo.
function Campo({ etiqueta, ancho, children }: { etiqueta: string; ancho?: boolean; children: ReactNode }) {
  return (
    <label className={`block min-w-0 ${ancho ? 'basis-full sm:basis-56 sm:flex-1' : 'basis-[calc(50%-0.375rem)] sm:basis-40'}`}>
      <span className="mb-1 block text-xs font-medium text-piedra-600">{etiqueta}</span>
      {children}
    </label>
  )
}
