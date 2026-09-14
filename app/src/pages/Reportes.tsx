import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import {
  obtenerMetricasDeVenta,
  tituloDeVentas,
  ventasComparadas,
  type Comparacion,
} from '@/lib/api/metricas'
import {
  deudaDeClientes,
  diasDeAtraso,
  totalesDeDeuda,
  urgencia,
  type DeudaDeCliente,
} from '@/lib/api/deuda'
import { moneda, numero } from '@/lib/tipos'
import { tarjeta } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  Reportes

  Es el punto 9 del alcance —«métricas simples»— y la última pantalla de
  V1-A que faltaba.

  ─── QUÉ ESTÁ ACÁ Y QUÉ NO, QUE ES LA DECISIÓN DE LA PANTALLA ───

  Inicio es el vistazo al abrir el sistema: cuánto se vendió, qué está
  fallando. Reportes es donde se mira el negocio con tiempo, y por eso
  lo que trae es lo que Inicio no puede dar de un vistazo:

  · **Las ventas comparadas** contra el período anterior. El importe ya
    estaba en Inicio; lo que faltaba era contra qué leerlo.
  · **Quién debe y desde cuándo**, que no estaba en ninguna pantalla.
    La ficha del cliente muestra un cliente por vez y nunca el conjunto.

  Y lo que NO está es tan deliberado como lo que está. El listado de
  stock bajo ya es la pantalla de Stock, con sus filtros; el detalle de
  comprobantes ya es Facturación. Copiarlos acá no agregaría un dato y
  crearía dos lugares donde mirar lo mismo, que con el tiempo dejan de
  coincidir. Van como enlace.
  ─────────────────────────────────────────────────────────────
*/
export default function Reportes() {
  const { tienePermiso } = useAuth()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-tinta">Reportes</h1>
        <p className="text-sm text-piedra-500">
          Cómo viene el mes y quién tiene plata de Gross en la calle.
        </p>
      </div>

      <Ventas />

      {/*
        Sin permiso de cuenta corriente el bloque no se muestra. La base
        además devuelve la vista vacía, así que esto es para no dejar un
        panel en blanco sin explicar por qué.
      */}
      {tienePermiso('cuentacorriente.ver') && <Deuda />}

      <Enlaces />
    </div>
  )
}

/* ─── Las ventas, con contra qué compararlas ─── */

function Ventas() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['metricas-venta'],
    queryFn: obtenerMetricasDeVenta,
  })

  if (isError) {
    return (
      <p className="rounded-xl bg-piedra-50 px-4 py-3 text-sm text-piedra-500 ring-1 ring-borde">
        No se pudieron traer los números de venta: para esto hace falta conexión con el servidor.
        El mostrador sigue vendiendo y cobrando igual.
      </p>
    )
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-tinta">
        {data ? tituloDeVentas(data.alcance) : 'Ventas'}
      </h2>

      <div className="grid gap-4 sm:grid-cols-3">
        {isPending || !data
          ? ['Hoy', 'Últimos 7 días', 'Este mes'].map((t) => (
              <div key={t} className={`${tarjeta} p-5`}>
                <p className="text-xs font-medium tracking-wide text-piedra-400 uppercase">{t}</p>
                <p className="mt-1 text-2xl font-semibold text-piedra-300">—</p>
                <p className="mt-1 text-xs text-piedra-400">cargando…</p>
              </div>
            ))
          : ventasComparadas(data).map((t) => (
              <div key={t.titulo} className={`${tarjeta} p-5`}>
                <p className="text-xs font-medium tracking-wide text-piedra-400 uppercase">
                  {t.titulo}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-tinta">{t.importe}</p>
                <p className="mt-1 text-xs text-piedra-500">{t.detalle}</p>
                <Variacion c={t.comparacion} />
              </div>
            ))}
      </div>
    </section>
  )
}

/*
  El porcentaje debajo del importe.

  Sube y baja NO son verde y rojo por sí solos. En una veterinaria una
  baja del día puede ser un feriado y una suba puede ser una sola venta
  grande de agroquímicos; teñir el número de rojo lo convierte en una
  alarma que nadie pidió. El color marca la dirección, el juicio lo hace
  quien mira.
*/
function Variacion({ c }: { c: Comparacion }) {
  if (c.sentido === 'sin_base') {
    return <p className="mt-2 text-xs text-piedra-400">{c.texto}</p>
  }

  const flecha = c.sentido === 'sube' ? '↑' : c.sentido === 'baja' ? '↓' : '→'
  const color =
    c.sentido === 'sube'
      ? 'text-verde-700'
      : c.sentido === 'baja'
        ? 'text-amber-700'
        : 'text-piedra-500'

  return (
    <p className={`mt-2 text-xs font-medium ${color}`}>
      <span aria-hidden="true">{flecha} </span>
      {c.texto}
    </p>
  )
}

/* ─── La plata en la calle ─── */

function Deuda() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['deuda-clientes'],
    queryFn: deudaDeClientes,
  })

  if (isError) {
    return (
      <p className="rounded-xl bg-piedra-50 px-4 py-3 text-sm text-piedra-500 ring-1 ring-borde">
        No se pudo traer la cuenta corriente: hace falta conexión con el servidor.
      </p>
    )
  }

  if (isPending) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-tinta">Cuenta corriente</h2>
        <p className="text-sm text-piedra-400">Buscando…</p>
      </section>
    )
  }

  const t = totalesDeDeuda(data)

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-sm font-semibold text-tinta">Cuenta corriente</h2>
        <span className="text-xs text-piedra-400">Los pagos ya están descontados</span>
      </div>

      {data.length === 0 ? (
        <p className={`${tarjeta} px-4 py-3 text-sm text-piedra-600`}>
          Nadie debe nada en cuenta corriente.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Dato titulo="En la calle" valor={moneda.format(t.total)} detalle={
              t.clientes === 1 ? '1 cliente' : `${numero.format(t.clientes)} clientes`
            } />
            <Dato titulo="Vencido" valor={moneda.format(t.vencido)}
              detalle="fuera de término"
              tono={t.vencido > 0 ? 'alerta' : 'neutro'} />
            <Dato titulo="Por vencer" valor={moneda.format(t.porVencer)} detalle="todavía en fecha" />
            <Dato titulo="Pasaron su límite" valor={numero.format(t.excedidos)}
              detalle={t.excedidos === 1 ? 'cliente' : 'clientes'}
              tono={t.excedidos > 0 ? 'alerta' : 'neutro'} />
          </div>

          <div className={`${tarjeta} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-borde text-left text-xs text-piedra-500">
                    <th className="px-4 py-2.5 font-medium">Cliente</th>
                    <th className="px-4 py-2.5 text-right font-medium">Debe</th>
                    <th className="px-4 py-2.5 text-right font-medium">Vencido</th>
                    <th className="px-4 py-2.5 text-right font-medium">Atraso</th>
                    <th className="px-4 py-2.5 font-medium">Teléfono</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {data.map((f) => (
                    <Fila key={f.cliente_id} f={f} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function Fila({ f }: { f: DeudaDeCliente }) {
  const vencido = f.vencido_30 + f.vencido_60 + f.vencido_mas_60
  const atraso = diasDeAtraso(f.vencimiento_mas_antiguo)
  const u = urgencia(f)
  const excedido = f.limite_credito > 0 && f.saldo > f.limite_credito

  return (
    <tr className="border-b border-borde last:border-0">
      <td className="px-4 py-2.5">
        <Link to="/clientes" className="text-tinta hover:text-marca-700 hover:underline">
          {f.nombre}
        </Link>
        {excedido && (
          <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
            pasó su límite
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-tinta">{moneda.format(f.saldo)}</td>
      <td
        className={`px-4 py-2.5 text-right tabular-nums ${
          u === 'grave' ? 'font-medium text-red-700' : u === 'vencido' ? 'text-amber-700' : 'text-piedra-400'
        }`}
      >
        {vencido > 0 ? moneda.format(vencido) : '—'}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-piedra-600">
        {atraso === null ? '—' : atraso === 1 ? '1 día' : `${numero.format(atraso)} días`}
      </td>
      <td className="px-4 py-2.5 text-piedra-500">{f.telefono || '—'}</td>
      {/*
        El resumen, a un clic de la fila. Es el uso que describió Lucas:
        a fin de mes mira quién no pagó y le manda el resumen, así que el
        camino corto sale de esta tabla y no de buscar al cliente.
      */}
      <td className="px-4 py-2.5 text-right">
        <Link
          to={`/cuenta-corriente/${f.cliente_id}`}
          className="text-xs font-medium text-marca-700 hover:underline"
        >
          Resumen
        </Link>
      </td>
    </tr>
  )
}

function Dato({
  titulo,
  valor,
  detalle,
  tono = 'neutro',
}: {
  titulo: string
  valor: string
  detalle: string
  tono?: 'neutro' | 'alerta'
}) {
  return (
    <div className={`${tarjeta} p-5`}>
      <p className="text-xs font-medium tracking-wide text-piedra-400 uppercase">{titulo}</p>
      <p
        className={`mt-1 text-xl font-semibold tabular-nums ${
          tono === 'alerta' ? 'text-amber-600' : 'text-tinta'
        }`}
      >
        {valor}
      </p>
      <p className="mt-1 text-xs text-piedra-500">{detalle}</p>
    </div>
  )
}

/*
  Lo que ya tiene su pantalla.

  Está acá porque alguien que entra a "Reportes" viene buscando esto
  también, y el camino más corto es decirle dónde está en vez de
  copiarle una tabla que va a envejecer distinto que la original.
*/
function Enlaces() {
  const { tienePermiso } = useAuth()

  const destinos = [
    {
      a: '/stock',
      permiso: 'stock.ver',
      titulo: 'Stock bajo y crítico',
      detalle: 'El listado completo, con sus filtros, está en Stock.',
    },
    {
      a: '/facturacion',
      permiso: 'facturacion.ver',
      titulo: 'Estado de la facturación',
      detalle: 'Pendientes, rechazados y contingencia, en Facturación.',
    },
  ].filter((d) => tienePermiso(d.permiso))

  if (destinos.length === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-tinta">Lo demás, en su pantalla</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {destinos.map((d) => (
          <Link
            key={d.a}
            to={d.a}
            className={`${tarjeta} block p-4 transition-colors hover:bg-marca-50`}
          >
            <p className="text-sm font-medium text-tinta">{d.titulo}</p>
            <p className="mt-0.5 text-xs text-piedra-500">{d.detalle}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
