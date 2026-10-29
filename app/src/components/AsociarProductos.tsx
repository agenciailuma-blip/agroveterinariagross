import { useEffect, useState } from 'react'
import type { LineaVenta } from '@/lib/api/ventas'
import { moneda, numero } from '@/lib/tipos'
import { useAtajo } from '@/lib/atajos'
import { TeclaAtajo } from '@/components/Atajos'

/*
  ─────────────────────────────────────────────────────────────
  Asociar productos

  Fase 03, punto 3. Se marcan los renglones y se elige el concepto: la
  factura los muestra juntos bajo ese nombre, por el total, y el stock y
  la caja siguen con los productos reales. Se abre con F11, como propuso
  Lucas.

  Vienen marcados los que todavía no tienen concepto, que es lo que se
  quiere casi siempre: «todo esto va como repuestos».
  ─────────────────────────────────────────────────────────────
*/
export default function AsociarProductos({
  lineas,
  conceptos,
  onAsociar,
  onCerrar,
}: {
  lineas: LineaVenta[]
  conceptos: string[]
  onAsociar: (ids: string[], concepto: string | null) => void
  onCerrar: () => void
}) {
  const [marcadas, setMarcadas] = useState<Set<string>>(
    () => new Set(lineas.filter((l) => !l.concepto).map((l) => l.id)),
  )
  const [concepto, setConcepto] = useState(conceptos[0] ?? '')

  const asociar = () => {
    if (!marcadas.size || !concepto) return
    onAsociar([...marcadas], concepto)
  }
  // Mientras está abierta, F9 asocia y no manda la venta a caja.
  useAtajo('F9', asociar)
  useAtajo('F11', onCerrar)
  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', alTeclado)
    return () => window.removeEventListener('keydown', alTeclado)
  }, [onCerrar])

  const alternar = (id: string) =>
    setMarcadas((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const total = lineas.filter((l) => marcadas.has(l.id)).reduce((s, l) => s + l.cantidad * l.precio_unitario, 0)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-tinta/40 p-4" onClick={onCerrar}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-tinta">Asociar productos</h2>

        <ul className="mt-3 divide-y divide-borde">
          {lineas.map((l) => (
            <li key={l.id}>
              <label className="flex items-start gap-3 py-2">
                <input
                  type="checkbox"
                  checked={marcadas.has(l.id)}
                  onChange={() => alternar(l.id)}
                  className="mt-1 size-4 shrink-0 accent-marca-700"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm [overflow-wrap:anywhere] text-tinta">{l.descripcion}</span>
                  <span className="block text-xs text-piedra-400">
                    {numero.format(l.cantidad)} × {moneda.format(l.precio_unitario)}
                    {l.concepto && <span className="text-marca-700"> · va como {l.concepto}</span>}
                  </span>
                </span>
                <span className="shrink-0 text-sm text-tinta tabular-nums">
                  {moneda.format(l.cantidad * l.precio_unitario)}
                </span>
              </label>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-sm font-medium text-piedra-700">Se factura como</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Concepto">
          {conceptos.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={concepto === c}
              onClick={() => setConcepto(c)}
              className={`rounded-lg px-2.5 py-1.5 text-sm font-medium ring-1 ${
                concepto === c ? 'bg-marca-700 text-white ring-marca-700' : 'text-piedra-600 ring-borde hover:bg-piedra-50'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {lineas.some((l) => marcadas.has(l.id) && l.concepto) && (
            <button
              onClick={() => onAsociar([...marcadas], null)}
              className="mr-auto text-sm text-piedra-500 hover:text-red-600 hover:underline"
            >
              Sacarlos del concepto
            </button>
          )}
          <button
            onClick={onCerrar}
            className="rounded-lg px-4 py-2 text-sm font-medium text-piedra-600 ring-1 ring-borde hover:bg-piedra-50"
          >
            Cancelar
          </button>
          <button
            onClick={asociar}
            disabled={!marcadas.size || !concepto}
            className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600 disabled:opacity-40"
          >
            {concepto ? `${concepto} · ${moneda.format(total)}` : 'Asociar'}
            <TeclaAtajo tecla="F9" clara />
          </button>
        </div>
      </div>
    </div>
  )
}
