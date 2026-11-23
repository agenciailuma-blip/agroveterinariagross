import type { ReactNode } from 'react'
import type { Orden } from '@/lib/orden'

/*
  El encabezado de una columna que se puede ordenar.

  Es el mismo <th> de siempre con el texto adentro de un botón y la
  flechita al lado: ↑ ascendente, ↓ descendente, y una flechita doble
  tenue cuando la columna no ordena (para que se vea que se puede tocar).
  Se usa con `useOrden`.

  `className` es el del <th> (con sus `hidden md:table-cell`, alineación
  y relleno): así cada tabla conserva cómo se ve y cuándo se oculta.
*/
export default function EncabezadoOrdenable({
  columna,
  orden,
  children,
  className = 'px-3 py-2 font-medium',
  derecha = false,
}: {
  columna: string
  orden: { orden: Orden; alternar: (columna: string) => void }
  children: ReactNode
  className?: string
  /** Para las columnas de importes, alineadas a la derecha. */
  derecha?: boolean
}) {
  const activo = orden.orden?.columna === columna ? orden.orden.sentido : null
  const titulo =
    activo === 'asc'
      ? 'Ordenado de menor a mayor. Tocá para ordenar de mayor a menor.'
      : activo === 'desc'
        ? 'Ordenado de mayor a menor. Tocá para volver al orden original.'
        : 'Tocá para ordenar por esta columna.'
  return (
    <th className={className} aria-sort={activo === 'asc' ? 'ascending' : activo === 'desc' ? 'descending' : undefined}>
      <button
        type="button"
        onClick={() => orden.alternar(columna)}
        title={titulo}
        className={`inline-flex max-w-full items-center gap-1 rounded hover:text-tinta focus-visible:outline-2 focus-visible:outline-marca-500 ${
          derecha ? 'flex-row-reverse' : ''
        } ${activo ? 'text-tinta' : ''}`}
      >
        <span className="min-w-0">{children}</span>
        <span aria-hidden className={`shrink-0 text-[0.7rem] leading-none ${activo ? 'text-marca-700' : 'text-piedra-300'}`}>
          {activo === 'asc' ? '↑' : activo === 'desc' ? '↓' : '↕'}
        </span>
      </button>
    </th>
  )
}
