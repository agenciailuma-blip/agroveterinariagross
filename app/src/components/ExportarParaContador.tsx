import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  aCsv,
  percepcionesACsv,
  percepcionesParaRentas,
  totales,
  totalesDePercepciones,
  ventasParaElContador,
} from '@/lib/api/libroIva'
import { descargarCsv } from '@/lib/api/noFiscal'
import { moneda, numero } from '@/lib/tipos'
import { boton, campo, tarjeta } from '@/estilos'

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

  /*
    Las percepciones van en su propio archivo.

    Gross es agente de percepción de IIBB en Misiones —régimen 14, no de
    retención— y lo que se presenta ante Rentas es el detalle de lo
    percibido: una fila por percepción, con su base y a quién se le
    hizo. En el de ventas la percepción es un total por comprobante,
    que es lo que un libro de IVA necesita y no lo que pide Rentas.
  */
  const percepciones = useQuery({
    queryKey: ['percepciones-rentas', desde, hasta],
    queryFn: () => percepcionesParaRentas(desde, hasta),
  })

  const p = percepciones.data ? totalesDePercepciones(percepciones.data) : null

  function bajar() {
    if (!filas.data?.length) return
    descargarCsv(`ventas-${anio}-${String(mes).padStart(2, '0')}.csv`, aCsv(filas.data))
  }

  function bajarPercepciones() {
    if (!percepciones.data?.length) return
    descargarCsv(
      `percepciones-iibb-${anio}-${String(mes).padStart(2, '0')}.csv`,
      percepcionesACsv(percepciones.data),
    )
  }

  // Desde 2026, que es cuando arranca el sistema. Ofrecer 1990 sería
  // ofrecer meses que no pueden tener nada.
  const anios = Array.from({ length: hoy.getFullYear() - 2025 }, (_, i) => 2026 + i)

  return (
    <div className={`${tarjeta} p-5`}>
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
            className={campo}
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
            className={campo}
          >
            {anios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <button onClick={bajar} disabled={!filas.data?.length} className={boton.principal}>
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

      {/*
        El segundo archivo del mes. Va en la misma pantalla y no en otra
        porque se hacen juntos, el mismo día y para la misma persona.
      */}
      <div className="mt-5 border-t border-borde pt-4">
        <h3 className="text-sm font-medium text-tinta">Percepciones de IIBB — Misiones</h3>
        <p className="mt-1 text-sm text-piedra-500">
          El detalle de lo percibido en el mes, que es lo que se declara ante Rentas. Gross es
          agente de <strong>percepción</strong>, no de retención: no emite comprobantes de
          retención.
        </p>

        {percepciones.isPending ? (
          <p className="mt-3 text-sm text-piedra-500">Buscando…</p>
        ) : !percepciones.data?.length ? (
          <p className="mt-3 rounded-lg bg-piedra-50 px-3 py-2.5 text-sm text-piedra-600 ring-1 ring-borde">
            No se percibió nada en {MESES[mes - 1]} de {anio}.
          </p>
        ) : (
          <>
            <div className="mt-3 rounded-lg bg-piedra-50 p-3 ring-1 ring-borde">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
                <Dato k="Percepciones" v={numero.format(p!.percepciones)} />
                <Dato k="Clientes" v={numero.format(p!.clientes)} />
                <Dato k="Base imponible" v={moneda.format(p!.base)} />
                <Dato k="Percibido" v={moneda.format(p!.percibido)} />
              </dl>
              <p className="mt-2 border-t border-borde pt-2 text-xs text-piedra-500">
                Una fila por percepción, con el CUIT del cliente, la base y la alícuota. Las notas
                de crédito devuelven la percepción y por eso restan.
              </p>
            </div>

            <button onClick={bajarPercepciones} className={`mt-3 ${boton.principal}`}>
              Bajar las percepciones
            </button>
          </>
        )}
      </div>
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
