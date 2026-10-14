import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { agruparCalendario, hoyEnObera, listarCalendario, sumarDias } from '@/lib/api/cheques'
import type { DiaCalendario, RenglonCalendario } from '@/lib/api/cheques'
import { enCastellano } from '@/lib/errores'
import { moneda } from '@/lib/tipos'
import { tarjeta } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  El calendario: qué se cobra y qué se paga

  El «calendario de recibos» que pidió Lucas en agosto. Del lado de lo
  que entra, los cheques de la cartera por su fecha de pago y lo que
  deben los clientes por su vencimiento. Del lado de lo que sale, las
  facturas de proveedores por su vencimiento y los cheques propios por el
  día en que se debitan.

  Sirve para una pregunta: ¿alcanza lo que entra esta semana para lo que
  sale? No es una promesa —un cliente puede no pagar el día que vence—,
  es lo que dicen los papeles.
  ─────────────────────────────────────────────────────────────
*/

const RANGOS = [7, 15, 30, 60] as const

const ETIQUETA_TIPO: Record<RenglonCalendario['tipo'], string> = {
  cheque: 'Cheque en cartera',
  cuenta_cliente: 'Cuenta corriente',
  proveedor: 'Proveedor',
  cheque_propio: 'Cheque propio',
}

const diaSemana = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'numeric' })

function tituloDelDia(clave: string, hoy: string) {
  if (clave === 'atrasado') return 'Atrasado, o para cobrar ya'
  if (clave === hoy) return 'Hoy'
  if (clave === sumarDias(hoy, 1)) return 'Mañana'
  const t = diaSemana.format(new Date(`${clave}T12:00:00`))
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export default function Calendario() {
  const [rango, setRango] = useState<(typeof RANGOS)[number]>(15)
  const hoy = hoyEnObera()
  const hasta = sumarDias(hoy, rango - 1)

  const renglones = useQuery({ queryKey: ['calendario'], queryFn: listarCalendario })
  const { dias, sinFecha } = useMemo(
    () => agruparCalendario(renglones.data ?? [], hoy, hasta),
    [renglones.data, hoy, hasta],
  )

  const atrasado = dias.find((d) => d.clave === 'atrasado')
  const proximos = dias.filter((d) => d.clave !== 'atrasado')
  const entra = proximos.reduce((s, d) => s + d.totalEntra, 0)
  const sale = proximos.reduce((s, d) => s + d.totalSale, 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-tinta">Calendario</h1>
          <p className="text-sm text-piedra-500">
            Qué se cobra y qué se paga, día por día: cheques, cuentas de clientes y facturas de proveedores.
          </p>
        </div>
        <div className="flex gap-1.5">
          {RANGOS.map((r) => (
            <button
              key={r}
              onClick={() => setRango(r)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${
                rango === r ? 'bg-marca-700 text-white ring-marca-700' : 'bg-white text-piedra-600 ring-borde hover:bg-piedra-50'
              }`}
            >
              {r} días
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className={`${tarjeta} p-4`}>
          <p className="text-xs text-piedra-500">Entra en los próximos {rango} días</p>
          <p className="text-2xl font-semibold tabular-nums text-verde-700">{moneda.format(entra)}</p>
        </div>
        <div className={`${tarjeta} p-4`}>
          <p className="text-xs text-piedra-500">Sale en los próximos {rango} días</p>
          <p className="text-2xl font-semibold tabular-nums text-tinta">{moneda.format(sale)}</p>
        </div>
        <div className={`${tarjeta} p-4`}>
          <p className="text-xs text-piedra-500">Diferencia</p>
          <p className={`text-2xl font-semibold tabular-nums ${entra - sale < 0 ? 'text-red-700' : 'text-tinta'}`}>
            {moneda.format(entra - sale)}
          </p>
          {atrasado && (
            <p className="text-xs text-piedra-500">
              Sin contar lo atrasado: {moneda.format(atrasado.totalEntra)} por cobrar y {moneda.format(atrasado.totalSale)} por pagar
            </p>
          )}
        </div>
      </div>

      {renglones.isPending && <p className="text-sm text-piedra-500">Cargando…</p>}
      {renglones.isError && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {enCastellano(renglones.error, 'No se pudo armar el calendario.')}
        </p>
      )}
      {!renglones.isPending && dias.length === 0 && (
        <p className={`${tarjeta} px-4 py-8 text-center text-sm text-piedra-400`}>
          No hay nada por cobrar ni por pagar en los próximos {rango} días.
        </p>
      )}

      <div className="space-y-3">
        {dias.map((d) => (
          <Dia key={d.clave} d={d} titulo={tituloDelDia(d.clave, hoy)} />
        ))}
      </div>

      {/*
        Lo que no tiene fecha no entra en ningún día, pero se debe igual.
        Si no se mostrara, una factura cargada sin vencimiento no
        aparecería nunca en el calendario.
      */}
      {sinFecha.length > 0 && (
        <div className={`${tarjeta} p-4`}>
          <p className="text-sm font-medium text-tinta">
            Facturas de proveedores sin vencimiento ·{' '}
            <span className="tabular-nums">{moneda.format(sinFecha.reduce((s, r) => s + r.importe, 0))}</span>
          </p>
          <p className="text-xs text-piedra-500">
            Se cargaron sin fecha de vencimiento, así que no caen en ningún día. Se pagan cuando se acuerde con cada
            proveedor.
          </p>
          <ul className="mt-2 divide-y divide-piedra-100 text-sm">
            {sinFecha.map((r, i) => (
              <Renglon key={i} r={r} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Dia({ d, titulo }: { d: DiaCalendario; titulo: string }) {
  const atrasado = d.clave === 'atrasado'
  return (
    <section className={`${tarjeta} overflow-hidden ${atrasado ? 'ring-amber-200' : ''}`}>
      <div
        className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b px-4 py-2.5 ${
          atrasado ? 'border-amber-200 bg-amber-50' : 'border-piedra-100'
        }`}
      >
        <h2 className={`text-sm font-medium ${atrasado ? 'text-amber-900' : 'text-tinta'}`}>{titulo}</h2>
        <p className="text-xs tabular-nums text-piedra-500">
          {d.totalEntra > 0 && <span className="text-verde-700">entra {moneda.format(d.totalEntra)}</span>}
          {d.totalEntra > 0 && d.totalSale > 0 && ' · '}
          {d.totalSale > 0 && <span className="text-tinta">sale {moneda.format(d.totalSale)}</span>}
        </p>
      </div>
      {/* En pantallas anchas, lo que entra y lo que sale uno al lado del otro. */}
      <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-piedra-100">
        <Columna titulo="Entra" renglones={d.entra} />
        <Columna titulo="Sale" renglones={d.sale} />
      </div>
    </section>
  )
}

function Columna({ titulo, renglones }: { titulo: string; renglones: RenglonCalendario[] }) {
  if (renglones.length === 0) return <div className="hidden md:block" />
  return (
    <div className="px-4 py-2">
      <p className="text-[11px] font-medium tracking-wide text-piedra-400 uppercase">{titulo}</p>
      <ul className="divide-y divide-piedra-50 text-sm">
        {renglones.map((r, i) => (
          <Renglon key={i} r={r} />
        ))}
      </ul>
    </div>
  )
}

function Renglon({ r }: { r: RenglonCalendario }) {
  const destino =
    r.tipo === 'cheque'
      ? `/cheques?id=${r.referencia}`
      : r.tipo === 'cheque_propio'
        ? `/cheques?ver=propios&id=${r.referencia}`
        : r.tipo === 'proveedor'
          ? `/proveedores/cuentas?p=${r.referencia}`
          : null

  const contenido = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-tinta">{r.quien}</span>
        <span className="block truncate text-xs text-piedra-500">
          {ETIQUETA_TIPO[r.tipo]}
          {r.descripcion !== ETIQUETA_TIPO[r.tipo] && ` · ${r.descripcion}`}
        </span>
      </span>
      <span className="shrink-0 whitespace-nowrap tabular-nums text-tinta">{moneda.format(r.importe)}</span>
    </>
  )

  return (
    <li>
      {destino ? (
        <Link to={destino} className="flex items-start gap-3 py-1.5 hover:bg-piedra-50">
          {contenido}
        </Link>
      ) : (
        <div className="flex items-start gap-3 py-1.5">{contenido}</div>
      )}
    </li>
  )
}
