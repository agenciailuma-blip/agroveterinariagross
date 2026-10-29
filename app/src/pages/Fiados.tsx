import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { datosEmisor } from '@/lib/api/comprobante'
import { estadisticasFiados, listarFiados, whatsappFiado, type FilaFiado } from '@/lib/api/fiados'
import { fechaCorta } from '@/lib/comprobante/presentacion'
import { hoyEnObera } from '@/lib/api/cheques'
import { enCastellano } from '@/lib/errores'
import { abrirWhatsapp } from '@/lib/escritorio'
import { campoDeFiltro, tarjeta } from '@/estilos'
import { moneda } from '@/lib/tipos'

/*
  ─────────────────────────────────────────────────────────────
  Fiados

  Fase 03, punto 7. La cuenta de cada persona que se llevó algo fiado:
  otro registro, que no llena el listado de cuentas corrientes con gente
  que vino una vez. Se busca por DNI o por nombre.

  Ordenada por lo que hay que hacer: arriba lo vencido —lo más viejo
  primero—, después la próxima fecha. Desde cada fila, el aviso por
  WhatsApp con el mensaje armado: lo manda quien está en el local.
  ─────────────────────────────────────────────────────────────
*/
export default function Fiados() {
  const { tienePermiso } = useAuth()
  const [buscar, setBuscar] = useState('')
  const [todos, setTodos] = useState(false)
  const puede = tienePermiso('fiados.ver')

  const fiados = useQuery({
    queryKey: ['fiados', buscar.trim(), todos],
    queryFn: () => listarFiados(buscar, todos),
    enabled: puede,
  })
  const estadisticas = useQuery({ queryKey: ['fiados-estadisticas'], queryFn: estadisticasFiados, enabled: puede })
  const emisor = useQuery({ queryKey: ['emisor'], queryFn: datosEmisor, staleTime: 5 * 60_000 })
  const negocio = emisor.data?.nombre_fantasia || emisor.data?.razon_social || ''

  if (!puede) {
    return (
      <p className="rounded-xl bg-piedra-50 px-4 py-3 text-sm text-piedra-600 ring-1 ring-borde">
        No tenés permiso para ver los fiados.
      </p>
    )
  }

  const filas = fiados.data ?? []
  const e = estadisticas.data

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-tinta">Fiados</h1>
          <p className="text-sm text-piedra-500">Lo que se llevaron fiado por la caja, persona por persona.</p>
        </div>
        <input
          value={buscar}
          onChange={(ev) => setBuscar(ev.target.value)}
          placeholder="DNI o nombre"
          inputMode="search"
          className={`${campoDeFiltro} min-w-0 flex-1 basis-48 sm:max-w-xs`}
        />
      </div>

      {e && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Dato titulo="Deben" valor={moneda.format(e.debe)} detalle={personas(e.personas_que_deben)} />
          <Dato
            titulo="Vencido"
            valor={moneda.format(e.vencido)}
            detalle={personas(e.personas_con_vencido)}
            alerta={e.vencido > 0.009}
          />
          <Dato titulo="Cobrado este mes" valor={moneda.format(e.cobrado_mes)} detalle={`Fiado este mes: ${moneda.format(e.fiado_mes)}`} />
          <Dato
            titulo="Desde el principio"
            valor={moneda.format(e.fiado_total)}
            detalle={`${e.fiados === 1 ? 'Un fiado' : `${e.fiados} fiados`} · promedio ${moneda.format(e.promedio)} · cobrado ${moneda.format(e.cobrado_total)}`}
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-piedra-600">
        <input type="checkbox" checked={todos} onChange={(ev) => setTodos(ev.target.checked)} />
        Ver también a los que ya pagaron todo
      </label>

      {fiados.isPending ? (
        <p className="text-sm text-piedra-500">Cargando…</p>
      ) : fiados.isError ? (
        <p role="alert" className="text-sm text-red-700">
          {enCastellano(fiados.error, 'No se pudieron leer los fiados.')}
        </p>
      ) : filas.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-borde bg-white/60 px-4 py-12">
          <p className="text-center text-sm text-piedra-400">
            {buscar.trim()
              ? 'Nadie con ese DNI o nombre.'
              : 'Nadie debe nada. Un fiado se carga en la caja, con el medio de pago «Fiado».'}
          </p>
        </div>
      ) : (
        <ul className={`${tarjeta} divide-y divide-piedra-100`}>
          {filas.map((f) => (
            <Fila key={f.persona_id} f={f} negocio={negocio} />
          ))}
        </ul>
      )}
    </div>
  )
}

const personas = (n: number) => (n === 0 ? 'Nadie' : n === 1 ? 'Una persona' : `${n} personas`)

function Dato({ titulo, valor, detalle, alerta }: { titulo: string; valor: string; detalle: string; alerta?: boolean }) {
  return (
    <div className={`${tarjeta} min-w-0 p-4`}>
      <p className="text-xs font-medium tracking-wide text-piedra-400 uppercase">{titulo}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${alerta ? 'text-red-700' : 'text-tinta'}`}>{valor}</p>
      <p className="mt-0.5 text-xs text-piedra-500">{detalle}</p>
    </div>
  )
}

function Fila({ f, negocio }: { f: FilaFiado; negocio: string }) {
  const whatsapp = whatsappFiado(f, negocio)
  const hoy = hoyEnObera()
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-piedra-50">
      <Link to={`/fiados/${f.persona_id}`} className="min-w-0 flex-1 basis-56">
        <p className="truncate text-sm font-medium text-tinta">{f.nombre}</p>
        <p className="text-xs text-piedra-500">
          DNI {f.documento}
          {f.telefono && ` · ${f.telefono}`}
        </p>
      </Link>
      <Link to={`/fiados/${f.persona_id}`} className="shrink-0 text-right">
        <p className="text-sm font-medium tabular-nums text-tinta">{moneda.format(f.debe)}</p>
        {f.vencido > 0.009 ? (
          <p className="text-xs font-medium text-red-700">
            {moneda.format(f.vencido)} vencido{f.primer_vencimiento && ` desde el ${fechaCorta(f.primer_vencimiento)}`}
          </p>
        ) : f.proxima_fecha ? (
          <p className="text-xs text-piedra-500">
            {f.proxima_fecha === hoy ? 'Vence hoy' : `Próximo pago el ${fechaCorta(f.proxima_fecha)}`}
          </p>
        ) : (
          <p className="text-xs text-verde-700">Pagó todo</p>
        )}
      </Link>
      {f.debe > 0.009 &&
        (whatsapp ? (
          <BotonWhatsapp url={whatsapp} />
        ) : (
          <span className="shrink-0 px-2.5 py-1.5 text-xs text-piedra-400" title="Falta el teléfono o no es un celular">
            Sin WhatsApp
          </span>
        ))}
    </li>
  )
}

export function BotonWhatsapp({ url }: { url: string }) {
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="shrink-0">
      <button
        onClick={() => {
          setError(null)
          abrirWhatsapp(url).catch((e) => setError(enCastellano(e, 'No se pudo abrir WhatsApp.')))
        }}
        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-verde-700 ring-1 ring-borde hover:bg-verde-50"
      >
        WhatsApp
      </button>
      {error && <span className="block text-xs text-red-700">{error}</span>}
    </span>
  )
}
