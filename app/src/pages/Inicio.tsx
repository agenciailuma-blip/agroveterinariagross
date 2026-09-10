import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { Pendientes } from '@/components/Pendientes'
import { obtenerMetricasDeVenta, resumenDeVentas, tituloDeVentas } from '@/lib/api/metricas'
import { moneda, numero } from '@/lib/tipos'

interface Frescura {
  terminales_activas: number
  terminales_atrasadas: number
  minutos_de_atraso: number
  confiable: boolean
}

async function cargarResumen() {
  const [productos, alertas, comprobantes, frescura] = await Promise.all([
    supabase.from('vista_stock').select('producto_id', { count: 'exact', head: true }),
    supabase
      .from('vista_stock')
      .select('producto_id', { count: 'exact', head: true })
      .in('estado', ['bajo', 'critico', 'sobrevendido']),
    supabase
      .from('comprobante')
      .select('id', { count: 'exact', head: true })
      .in('estado', ['pendiente', 'rechazado', 'contingencia']),
    supabase.rpc('frescura_stock'),
  ])

  const f = (frescura.data as Frescura[] | null)?.[0] ?? null

  return {
    productos: productos.count ?? 0,
    alertas: alertas.count ?? 0,
    comprobantesPendientes: comprobantes.count ?? 0,
    frescura: f,
  }
}

function Tarjeta({
  titulo,
  valor,
  detalle,
  tono = 'neutro',
  tamaño = 'grande',
}: {
  titulo: string
  valor: string
  detalle?: string
  tono?: 'neutro' | 'alerta' | 'ok'
  /* Los importes se escriben mucho más largos que un conteo: con el
     tamaño de las otras tarjetas, "$1.213.599,99" no entra. */
  tamaño?: 'grande' | 'medio'
}) {
  const tonos = {
    neutro: 'text-tinta',
    alerta: 'text-amber-600',
    ok: 'text-marca-600',
  }
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-borde">
      <p className="text-sm font-medium text-piedra-500">{titulo}</p>
      <p
        className={`mt-2 font-semibold tabular-nums ${
          tamaño === 'grande' ? 'text-3xl' : 'text-2xl'
        } ${tonos[tono]}`}
      >
        {valor}
      </p>
      {detalle && <p className="mt-1 text-xs text-piedra-400">{detalle}</p>}
    </div>
  )
}

function Panel({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-borde">
      <h3 className="text-sm font-semibold text-tinta">{titulo}</h3>
      {children}
    </div>
  )
}

/*
  Cuánto se vendió.

  Es lo primero que se pregunta cualquiera que abre el sistema a la
  mañana, y hasta ahora había que ir a buscarlo a Facturación y sumar a
  ojo. Los tres períodos son los tres con los que se piensa en el
  mostrador: el día que está corriendo, la última semana y el mes que se
  le va a mostrar al contador.
*/
function Ventas() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['metricas-de-venta'],
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

  const tarjetas = data
    ? resumenDeVentas(data)
    : [
        { titulo: 'Hoy', importe: '—', detalle: '' },
        { titulo: 'Últimos 7 días', importe: '—', detalle: '' },
        { titulo: 'Este mes', importe: '—', detalle: '' },
      ]

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-sm font-semibold text-tinta">
          {data ? tituloDeVentas(data.alcance) : 'Ventas'}
        </h2>
        {data?.alcance === 'propio' && (
          <span className="text-xs text-piedra-400">
            Sólo las ventas en las que participaste
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {tarjetas.map((t) => (
          <Tarjeta
            key={t.titulo}
            titulo={t.titulo}
            valor={t.importe}
            detalle={isPending ? 'cargando…' : t.detalle}
            tamaño="medio"
          />
        ))}
      </div>

      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel titulo="Lo más vendido del mes">
            {data.mas_vendidos.length === 0 ? (
              <p className="mt-2 text-sm text-piedra-400">Todavía no se vendió nada este mes.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.mas_vendidos.map((p) => (
                  <li
                    key={`${p.codigo}·${p.descripcion}`}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="min-w-0 truncate text-sm text-piedra-700">{p.descripcion}</span>
                    <span className="shrink-0 text-xs tabular-nums text-piedra-500">
                      {numero.format(p.cantidad)} unid. · {moneda.format(p.importe)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/*
            Quién vendió sólo aparece para quien ve todas las ventas: al
            resto la base le devuelve la lista vacía, así que no hay nada
            que esconder desde acá.
          */}
          {data.por_vendedor.length > 0 && (
            <Panel titulo="Por vendedor, este mes">
              <ul className="mt-3 space-y-2">
                {data.por_vendedor.map((v) => (
                  <li key={v.nombre} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm text-piedra-700">{v.nombre}</span>
                    <span className="shrink-0 text-xs tabular-nums text-piedra-500">
                      {v.ventas === 1 ? '1 venta' : `${v.ventas} ventas`} ·{' '}
                      {moneda.format(v.total)}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}
    </section>
  )
}

export default function Inicio() {
  const { perfil } = useAuth()
  const { data } = useQuery({ queryKey: ['resumen'], queryFn: cargarResumen })

  const hora = new Date().getHours()
  const saludo = hora < 13 ? 'Buen día' : hora < 20 ? 'Buenas tardes' : 'Buenas noches'

  // Sin datos —mientras carga o si el servidor no contestó— las tarjetas
  // muestran una raya. Antes calculaban igual y escribían "NaN", que en
  // un tablero de números se lee como si algo estuviera roto.
  const contar = (n: number | undefined) => (n === undefined ? '—' : numero.format(n))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-tinta">
          {saludo}, {perfil?.nombre?.split(' ')[0]}
        </h1>
        <p className="text-sm text-piedra-500">
          {new Date().toLocaleDateString('es-AR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>

      <Pendientes />

      <Ventas />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta titulo="Productos" valor={contar(data?.productos)} detalle="en el catálogo" />
        <Tarjeta
          titulo="Alertas de stock"
          valor={contar(data?.alertas)}
          detalle="bajo, crítico o sobrevendido"
          tono={data?.alertas ? 'alerta' : 'neutro'}
        />
        <Tarjeta
          titulo="Comprobantes pendientes"
          valor={contar(data?.comprobantesPendientes)}
          detalle="esperando resolución de ARCA"
          tono={data?.comprobantesPendientes ? 'alerta' : 'neutro'}
        />
        <Tarjeta
          titulo="Terminales"
          valor={contar(data?.frescura?.terminales_activas)}
          detalle={
            data?.frescura?.terminales_atrasadas
              ? `${data.frescura.terminales_atrasadas} sin sincronizar`
              : 'todas al día'
          }
          tono={data?.frescura?.terminales_atrasadas ? 'alerta' : 'ok'}
        />
      </div>

      {/*
        Este aviso es central al diseño: cuando una terminal del mostrador
        lleva rato sin sincronizar, el stock del servidor ya no refleja lo
        que se vendió, y eso hay que decirlo antes de que alguien tome una
        decisión con un número viejo.
      */}
      {data?.frescura && !data.frescura.confiable && data.frescura.terminales_activas > 0 && (
        <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="text-sm font-medium text-amber-900">El stock puede no estar actualizado</p>
          <p className="mt-1 text-sm text-amber-800">
            Hay {data.frescura.terminales_atrasadas} terminal
            {data.frescura.terminales_atrasadas === 1 ? '' : 'es'} sin sincronizar desde hace{' '}
            {numero.format(data.frescura.minutos_de_atraso)} minutos. Puede haber ventas que el
            servidor todavía no registró.
          </p>
        </div>
      )}
    </div>
  )
}
