import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  aCsv,
  comprasACsv,
  comprasParaElContador,
  percepcionesACsv,
  percepcionesParaRentas,
  totales,
  totalesDeCompras,
  totalesDePercepciones,
  ventasParaElContador,
} from '@/lib/api/libroIva'
import { descargarCsv } from '@/lib/api/noFiscal'
import { obtenerTextos } from '@/lib/api/configuracion'
import { moneda, numero } from '@/lib/tipos'
import { boton, campo, tarjeta } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  Las descargas para el contador: ventas, compras y percepciones

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

  /*
    Las compras del mes. El contador las baja de ARCA igual; con esto
    puede controlar lo cargado contra lo que tiene ARCA.
  */
  const compras = useQuery({
    queryKey: ['compras-contador', desde, hasta],
    queryFn: () => comprasParaElContador(desde, hasta),
  })

  const k = compras.data ? totalesDeCompras(compras.data) : null

  async function bajarCompras() {
    if (!compras.data?.length) return
    // El encabezado de su planilla: el comercio, el CUIT y el período.
    const datos = await obtenerTextos(['comercio.nombre_fantasia', 'comercio.razon_social', 'comercio.cuit'])
    const texto = (k: string) => datos[k] ?? ''
    descargarCsv(
      `compras-${anio}-${String(mes).padStart(2, '0')}.csv`,
      comprasACsv(compras.data, {
        nombre: texto('comercio.nombre_fantasia'),
        razonSocial: texto('comercio.razon_social'),
        cuit: texto('comercio.cuit'),
        desde,
        hasta,
      }),
    )
  }

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

  const periodo = `${MESES[mes - 1]} de ${anio}`

  return (
    <div className={`${tarjeta} p-5`}>
      <h2 className="font-medium text-tinta">Descargas para el contador</h2>
      <p className="mt-1 text-sm text-piedra-500">
        Los archivos del mes, para mandarle: ventas, compras y percepciones.
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
      </div>

      {/*
        Tres archivos del mismo mes, uno debajo del otro. Van en la misma
        tarjeta porque se hacen juntos, el mismo día y para la misma persona.
      */}
      <Seccion
        titulo="Ventas"
        bajada="Los comprobantes emitidos en el mes."
        cargando={filas.isPending}
        vacio={`No hay comprobantes autorizados en ${periodo}.`}
        hayDatos={!!filas.data?.length}
        boton="Bajar las ventas"
        onBajar={bajar}
      >
        {t && (
          <>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
              <Dato k="Comprobantes" v={numero.format(t.comprobantes)} />
              <Dato k="Neto gravado" v={moneda.format(t.neto)} />
              <Dato k="IVA" v={moneda.format(t.iva)} />
              <Dato k="Total" v={moneda.format(t.total)} />
            </dl>
            {t.percepciones !== 0 && (
              <p className="mt-2 text-xs text-piedra-500">
                Incluye {moneda.format(t.percepciones)} de percepciones de IIBB.
              </p>
            )}
            <p className="mt-2 border-t border-borde pt-2 text-xs text-piedra-500">
              Con las columnas de Mis Comprobantes Emitidos: una fila por comprobante y las notas
              de crédito en negativo, así sumar la columna da el mes.
            </p>
          </>
        )}
      </Seccion>

      <Seccion
        titulo="Compras"
        bajada="Las facturas de compra cargadas en el mes, para controlarlas contra las de ARCA."
        cargando={compras.isPending}
        vacio={`No hay facturas de compra cargadas en ${periodo}.`}
        hayDatos={!!compras.data?.length}
        boton="Bajar las compras"
        onBajar={bajarCompras}
      >
        {k && (
          <>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
              <Dato k="Comprobantes" v={numero.format(k.comprobantes)} />
              <Dato k="Neto gravado" v={moneda.format(k.neto)} />
              <Dato k="IVA crédito fiscal" v={moneda.format(k.iva)} />
              <Dato k="Total" v={moneda.format(k.total)} />
            </dl>
            {k.percepciones !== 0 && (
              <p className="mt-2 text-xs text-piedra-500">
                Incluye {moneda.format(k.percepciones)} de percepciones que le cobraron a Gross,
                separadas por concepto en el archivo.
              </p>
            )}
          </>
        )}
      </Seccion>

      <Seccion
        titulo="Percepciones de IIBB — Misiones"
        bajada="El detalle de lo percibido en el mes, para Rentas."
        cargando={percepciones.isPending}
        vacio={`No se percibió nada en ${periodo}.`}
        hayDatos={!!percepciones.data?.length}
        boton="Bajar las percepciones"
        onBajar={bajarPercepciones}
      >
        {p && (
          <>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
              <Dato k="Percepciones" v={numero.format(p.percepciones)} />
              <Dato k="Clientes" v={numero.format(p.clientes)} />
              <Dato k="Base imponible" v={moneda.format(p.base)} />
              <Dato k="Percibido" v={moneda.format(p.percibido)} />
            </dl>
            <p className="mt-2 border-t border-borde pt-2 text-xs text-piedra-500">
              Una fila por percepción, con el CUIT del cliente, la base y la alícuota. Las notas de
              crédito devuelven la percepción y por eso restan.
            </p>
          </>
        )}
      </Seccion>
    </div>
  )
}

/** Un archivo del mes: título, lo que va adentro y el botón para bajarlo. */
function Seccion({
  titulo,
  bajada,
  cargando,
  vacio,
  hayDatos,
  boton: textoBoton,
  onBajar,
  children,
}: {
  titulo: string
  bajada: string
  cargando: boolean
  vacio: string
  hayDatos: boolean
  boton: string
  onBajar: () => void
  children: ReactNode
}) {
  return (
    <div className="mt-5 border-t border-borde pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-tinta">{titulo}</h3>
          <p className="mt-1 text-sm text-piedra-500">{bajada}</p>
        </div>
        {hayDatos && (
          <button onClick={onBajar} className={boton.principal}>
            {textoBoton}
          </button>
        )}
      </div>

      {cargando ? (
        <p className="mt-3 text-sm text-piedra-500">Buscando…</p>
      ) : !hayDatos ? (
        <p className="mt-3 rounded-lg bg-piedra-50 px-3 py-2.5 text-sm text-piedra-600 ring-1 ring-borde">
          {vacio}
        </p>
      ) : (
        <div className="mt-3 rounded-lg bg-piedra-50 p-3 ring-1 ring-borde">{children}</div>
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
