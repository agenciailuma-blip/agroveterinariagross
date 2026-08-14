import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { Pendientes } from '@/components/Pendientes'
import { numero } from '@/lib/tipos'

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
}: {
  titulo: string
  valor: string
  detalle?: string
  tono?: 'neutro' | 'alerta' | 'ok'
}) {
  const tonos = {
    neutro: 'text-slate-900',
    alerta: 'text-amber-600',
    ok: 'text-marca-600',
  }
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm font-medium text-slate-500">{titulo}</p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${tonos[tono]}`}>{valor}</p>
      {detalle && <p className="mt-1 text-xs text-slate-400">{detalle}</p>}
    </div>
  )
}

export default function Inicio() {
  const { perfil } = useAuth()
  const { data, isPending } = useQuery({ queryKey: ['resumen'], queryFn: cargarResumen })

  const hora = new Date().getHours()
  const saludo = hora < 13 ? 'Buen día' : hora < 20 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {saludo}, {perfil?.nombre?.split(' ')[0]}
        </h1>
        <p className="text-sm text-slate-500">
          {new Date().toLocaleDateString('es-AR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>

      <Pendientes />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta
          titulo="Productos"
          valor={isPending ? '—' : numero.format(data!.productos)}
          detalle="en el catálogo"
        />
        <Tarjeta
          titulo="Alertas de stock"
          valor={isPending ? '—' : numero.format(data!.alertas)}
          detalle="bajo, crítico o sobrevendido"
          tono={data?.alertas ? 'alerta' : 'neutro'}
        />
        <Tarjeta
          titulo="Comprobantes pendientes"
          valor={isPending ? '—' : numero.format(data!.comprobantesPendientes)}
          detalle="esperando resolución de ARCA"
          tono={data?.comprobantesPendientes ? 'alerta' : 'neutro'}
        />
        <Tarjeta
          titulo="Terminales"
          valor={isPending ? '—' : numero.format(data!.frescura?.terminales_activas ?? 0)}
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
          <p className="text-sm font-medium text-amber-900">
            El stock puede no estar actualizado
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Hay {data.frescura.terminales_atrasadas} terminal
            {data.frescura.terminales_atrasadas === 1 ? '' : 'es'} sin sincronizar desde hace{' '}
            {numero.format(data.frescura.minutos_de_atraso)} minutos. Puede haber ventas que el
            servidor todavía no registró.
          </p>
        </div>
      )}

      <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-sm font-semibold text-slate-900">Estado del proyecto</h2>
        <p className="mt-1 text-sm text-slate-500">
          Base de datos y reglas de negocio completas. Faltan las pantallas de carga, el punto de
          venta y la conexión con ARCA.
        </p>
      </div>
    </div>
  )
}
