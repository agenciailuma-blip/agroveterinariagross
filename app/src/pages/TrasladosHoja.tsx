import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { hoyEnObera } from '@/lib/api/cheques'
import { datosEmisor } from '@/lib/api/comprobante'
import { MOTIVOS, listarTraslados, type Traslado } from '@/lib/api/traslados'
import { enCastellano } from '@/lib/errores'
import { moneda } from '@/lib/tipos'
import { boton, campoDeFiltro } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  La hoja del que maneja

  «Lo que hay que buscar hoy»: las órdenes de un día, por hora, con la
  dirección, el dueño y su teléfono, el animal y lo que hay que tener en
  cuenta. Abajo de cada una, renglones para anotar los kilómetros, el
  costo y el tiempo, que después se pasan al finalizar.

  Va en A4 y fuera del menú, como la orden interna. Las canceladas no
  aparecen.
  ─────────────────────────────────────────────────────────────
*/
export default function TrasladosHoja() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const fecha = params.get('fecha') || hoyEnObera()

  const traslados = useQuery({ queryKey: ['traslados', 'todas', ''], queryFn: () => listarTraslados('todas', '') })
  const emisor = useQuery({ queryKey: ['emisor'], queryFn: datosEmisor })
  const delDia = (traslados.data ?? [])
    .filter((t) => t.fecha === fecha && t.estado !== 'cancelada')
    .sort((a, b) => (a.hora ?? '99:99').localeCompare(b.hora ?? '99:99') || a.numero - b.numero)

  const titulo = `Traslados del ${new Date(`${fecha}T00:00:00`).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  })}`

  // El título es el nombre que propone el navegador al guardar el PDF.
  useEffect(() => {
    const anterior = document.title
    document.title = titulo
    return () => {
      document.title = anterior
    }
  }, [titulo])

  const negocio = emisor.data?.nombre_fantasia || emisor.data?.razon_social

  return (
    <div className="min-h-full bg-piedra-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[21cm] flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/traslados'))}
          className="text-sm text-marca-700 hover:underline"
        >
          ← Volver
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={fecha}
            onChange={(e) => e.target.value && setParams({ fecha: e.target.value }, { replace: true })}
            className={campoDeFiltro}
          />
          <button onClick={() => window.print()} disabled={!traslados.data} className={boton.principal}>
            Imprimir
          </button>
        </div>
      </div>

      <style>{'@page { size: A4; margin: 12mm; }'}</style>

      {traslados.isPending ? (
        <Aviso texto="Armando la hoja…" />
      ) : traslados.isError ? (
        <Aviso texto={enCastellano(traslados.error, 'No se pudieron leer los traslados.')} />
      ) : (
        <div className="mx-4 bg-white p-6 text-[12px] leading-snug text-tinta shadow-sm ring-1 ring-borde sm:mx-auto sm:max-w-[21cm] sm:p-8 print:mx-0 print:max-w-none print:p-0 print:shadow-none print:ring-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-tinta pb-2">
            <h1 className="text-base font-bold first-letter:uppercase">{titulo}</h1>
            {negocio && <p className="font-semibold">{negocio}</p>}
          </div>

          {delDia.length === 0 ? (
            <p className="mt-6 text-center text-piedra-500">No hay traslados para ese día.</p>
          ) : (
            <ol className="mt-2">
              {delDia.map((t) => (
                <Parada key={t.id} t={t} />
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <p className="mx-4 rounded-xl bg-white px-4 py-3 text-sm text-piedra-600 ring-1 ring-borde sm:mx-auto sm:max-w-[21cm]">
      {texto}
    </p>
  )
}

function Parada({ t }: { t: Traslado }) {
  return (
    <li className="break-inside-avoid border-b border-piedra-300 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-sm font-bold">
          {t.hora ? `${t.hora} h` : 'Sin hora'} · {MOTIVOS[t.motivo]}
        </p>
        <p className="text-piedra-600">
          Orden {t.numero}
          {t.monto > 0 && ` · ${moneda.format(t.monto)}`}
        </p>
      </div>
      <p className="mt-1 text-sm [overflow-wrap:anywhere]">
        <span className="font-semibold">
          {t.direccion}
          {t.localidad ? `, ${t.localidad}` : ''}
        </span>
      </p>
      <p className="[overflow-wrap:anywhere]">
        {t.dueno_nombre}
        {t.dueno_telefono && ` · Tel. ${t.dueno_telefono}`}
      </p>
      {t.descripcion && <p className="[overflow-wrap:anywhere]">Animal: {t.descripcion}</p>}
      {t.observaciones && <p className="[overflow-wrap:anywhere] italic">{t.observaciones}</p>}
      <p className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-piedra-600">
        <span>Km: ________</span>
        <span>Costo: ____________</span>
        <span>Salida: ______ Vuelta: ______</span>
      </p>
    </li>
  )
}
