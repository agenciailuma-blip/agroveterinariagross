import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { aCsv, totales, ventasParaElContador } from '@/lib/api/libroIva'
import { descargarCsv } from '@/lib/api/noFiscal'
import { moneda, numero } from '@/lib/tipos'

/*
  ─────────────────────────────────────────────────────────────
  El Excel de ventas para el contador

  **No armamos el Libro de IVA.** Lo arma él, y las facturas de compra
  las baja de ARCA. Lo único que Gross tiene que darle son sus ventas
  en un archivo que abra en Excel.

  Por eso esta pantalla es deliberadamente chica: elegir un mes,
  mirar que los números cierren, y bajar el archivo. No hay reporte,
  ni gráfico, ni configuración.

  **Los totales en pantalla son la verificación.** Antes de mandarle
  nada al contador conviene ver que el neto y el IVA del mes son los
  que uno espera. Un archivo que sale con un mes vacío por haber
  elegido mal las fechas se descubre allá, no acá.
  ─────────────────────────────────────────────────────────────
*/

/** El primero y el último día de un mes, en el formato que espera la base. */
function mesCompleto(anio: number, mes: number) {
  const dos = (n: number) => String(n).padStart(2, '0')
  const ultimo = new Date(anio, mes, 0).getDate()
  return { desde: `${anio}-${dos(mes)}-01`, hasta: `${anio}-${dos(mes)}-${dos(ultimo)}` }
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export default function ExportarParaContador() {
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth() + 1)

  const { desde, hasta } = mesCompleto(anio, mes)

  const filas = useQuery({
    queryKey: ['ventas-contador', desde, hasta],
    queryFn: () => ventasParaElContador(desde, hasta),
  })

  const t = filas.data ? totales(filas.data) : null

  function bajar() {
    if (!filas.data?.length) return
    descargarCsv(`ventas-${anio}-${String(mes).padStart(2, '0')}.csv`, aCsv(filas.data))
  }

  // Desde 2026, que es cuando arranca el sistema. Ofrecer 1990 sería
  // ofrecer meses que no pueden tener nada.
  const anios = Array.from({ length: hoy.getFullYear() - 2025 }, (_, i) => 2026 + i)

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-borde">
      <h2 className="font-medium text-tinta">Ventas para el contador</h2>
      <p className="mt-1 text-sm text-piedra-500">
        El archivo del mes, para mandarle. Las facturas de compra las baja él de ARCA.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Mes</span>
          <select
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
            className={clase}
          >
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Año</span>
          <select
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
            className={clase}
          >
            {anios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={bajar}
          disabled={!filas.data?.length}
          className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600 disabled:opacity-40"
        >
          Bajar el Excel
        </button>
      </div>

      {filas.isPending ? (
        <p className="mt-4 text-sm text-piedra-500">Buscando…</p>
      ) : !filas.data?.length ? (
        <p className="mt-4 rounded-lg bg-piedra-50 px-3 py-2.5 text-sm text-piedra-600 ring-1 ring-borde">
          No hay comprobantes autorizados en {MESES[mes - 1]} de {anio}.
        </p>
      ) : (
        <div className="mt-4 rounded-lg bg-piedra-50 p-3 ring-1 ring-borde">
          <p className="text-xs font-medium tracking-wide text-piedra-400 uppercase">
            Lo que va en el archivo
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
            <Dato k="Comprobantes" v={numero.format(t!.comprobantes)} />
            <Dato k="Neto gravado" v={moneda.format(t!.neto)} />
            <Dato k="IVA" v={moneda.format(t!.iva)} />
            <Dato k="Total" v={moneda.format(t!.total)} />
          </dl>
          {t!.percepciones !== 0 && (
            <p className="mt-2 text-xs text-piedra-500">
              Incluye {moneda.format(t!.percepciones)} de percepciones de IIBB.
            </p>
          )}
          <p className="mt-2 border-t border-borde pt-2 text-xs text-piedra-500">
            Una fila por alícuota: una factura con 21% y 10,5% ocupa dos renglones. Las notas de
            crédito van en negativo, así sumar la columna da el neto del mes.
          </p>
        </div>
      )}
    </div>
  )
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-piedra-500">{k}</dt>
      <dd className="font-medium tabular-nums text-tinta">{v}</dd>
    </div>
  )
}

const clase =
  'rounded-lg border border-borde bg-white px-3 py-2 text-sm text-tinta outline-none focus:border-marca-500'
