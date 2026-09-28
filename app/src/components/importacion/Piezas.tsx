import { useState } from 'react'

/*
  Las piezas que comparten los importadores de planillas: productos,
  clientes y saldos de proveedores. Elegir el archivo, decir qué hay en
  cada columna y mostrar un número grande. Lo que cambia entre uno y
  otro —qué columnas se esperan— viene de afuera.
*/

export function ElegirArchivo({
  cargando,
  onElegir,
}: {
  cargando: boolean
  onElegir: (f: File) => void
}) {
  const [encima, setEncima] = useState(false)

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault()
        setEncima(true)
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        e.preventDefault()
        setEncima(false)
        const f = e.dataTransfer.files[0]
        if (f) onElegir(f)
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors ${
        encima ? 'border-marca-500 bg-marca-50' : 'border-borde bg-white hover:bg-piedra-50'
      }`}
    >
      <svg className="size-10 text-piedra-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-.41-8.98 4.5 4.5 0 0 1 8.08-3.02A4.5 4.5 0 0 1 20.9 12H21a3 3 0 0 1 0 6h-.75" />
      </svg>
      <p className="font-medium text-tinta">
        {cargando ? 'Leyendo el archivo…' : 'Arrastrá la planilla o hacé clic para elegirla'}
      </p>
      <p className="text-sm text-piedra-500">Excel (.xlsx) o CSV</p>
      <input
        type="file"
        accept=".xlsx,.xls,.csv,text/csv"
        disabled={cargando}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onElegir(f)
          e.target.value = ''
        }}
        className="hidden"
      />
    </label>
  )
}

/*
  Mapeo de columnas.

  El sistema propone, la persona confirma. Se muestra un ejemplo real de
  cada columna porque los encabezados mienten: una columna que dice
  "Precio" puede tener el costo, y con el dato a la vista se nota.
*/
export function Mapeo<C extends string>({
  campos,
  obligatorios,
  encabezados,
  crudas,
  mapeo,
  onCambio,
}: {
  campos: Record<C, string>
  obligatorios: C[]
  encabezados: string[]
  crudas: unknown[][]
  mapeo: Record<number, C | null>
  onCambio: (indice: number, campo: C | null) => void
}) {
  const ejemplo = (i: number) => {
    const valor = crudas.find((f) => f[i] !== null && f[i] !== undefined && String(f[i]).trim())?.[i]
    return valor === undefined ? '—' : String(valor)
  }

  const yaUsado = (campo: C, propio: number) =>
    Object.entries(mapeo).some(([i, c]) => c === campo && Number(i) !== propio)

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-borde">
      <div className="border-b border-borde px-5 py-3">
        <p className="font-medium text-tinta">¿Qué hay en cada columna?</p>
        <p className="text-sm text-piedra-500">
          Lo que el sistema reconoció ya viene elegido. Revisá que esté bien y completá lo que falte.
          Las columnas que dejes en “No importar” se ignoran.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-borde bg-piedra-50 text-left text-xs tracking-wide text-piedra-500 uppercase">
          <tr>
            <th className="px-5 py-2 font-medium">Columna del archivo</th>
            <th className="py-2 font-medium">Ejemplo</th>
            <th className="w-64 px-5 py-2 font-medium">Se importa como</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-piedra-100">
          {encabezados.map((encabezado, i) => (
            <tr key={i} className={mapeo[i] ? '' : 'opacity-60'}>
              <td className="px-5 py-2 font-medium text-tinta">{encabezado || `Columna ${i + 1}`}</td>
              <td className="max-w-48 truncate py-2 font-mono text-xs text-piedra-500">{ejemplo(i)}</td>
              <td className="px-5 py-2">
                <select
                  value={mapeo[i] ?? ''}
                  onChange={(e) => onCambio(i, (e.target.value || null) as C | null)}
                  className="w-full rounded-lg border border-borde px-2.5 py-1.5 text-sm outline-none focus:border-marca-500"
                >
                  <option value="">No importar</option>
                  {(Object.keys(campos) as C[]).map((c) => (
                    <option key={c} value={c} disabled={yaUsado(c, i)}>
                      {campos[c]}
                      {obligatorios.includes(c) ? ' *' : ''}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Dato({
  valor,
  etiqueta,
  tono,
}: {
  valor: string
  etiqueta: string
  tono: 'bien' | 'mal' | 'aviso'
}) {
  const color = { bien: 'text-verde-700', mal: 'text-red-700', aviso: 'text-amber-700' }[tono]
  return (
    <div>
      <p className={`text-2xl font-semibold tabular-nums ${color}`}>{valor}</p>
      <p className="text-xs text-piedra-500">{etiqueta}</p>
    </div>
  )
}
