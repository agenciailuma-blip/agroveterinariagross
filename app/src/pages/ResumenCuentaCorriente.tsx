import { useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { datosEmisor } from '@/lib/api/comprobante'
import { ETIQUETA_MOVIMIENTO } from '@/lib/api/clientes'
import {
  fechaCorta,
  llegaHastaHoy,
  nombreDelArchivo,
  obtenerResumen,
  periodoDe,
  type Atajo,
  type ResumenCuentaCorriente,
} from '@/lib/api/resumenCuentaCorriente'
import { moneda } from '@/lib/tipos'
import { boton, campo } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  El resumen de cuenta corriente, en A4

  Lo que Lucas le manda al cliente a fin de mes. Arriba, fuera de la
  hoja, se elige el período; la hoja es lo que sale impreso o en el PDF.

  El período viaja en la dirección de la página y no en un estado
  interno: si se recarga, o se vuelve atrás desde el diálogo de
  impresión, la hoja sigue siendo la misma que se estaba mirando.
  ─────────────────────────────────────────────────────────────
*/
export default function ResumenCuentaCorriente() {
  const { clienteId } = useParams<{ clienteId: string }>()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()

  const porDefecto = periodoDe('este_mes', new Date())
  const desde = params.get('desde') ?? porDefecto.desde
  const hasta = params.get('hasta') ?? porDefecto.hasta
  const periodoValido = desde <= hasta

  function cambiar(nuevo: { desde?: string; hasta?: string }) {
    setParams({ desde: nuevo.desde ?? desde, hasta: nuevo.hasta ?? hasta }, { replace: true })
  }

  function usarAtajo(atajo: Atajo) {
    const p = periodoDe(atajo, new Date())
    setParams({ desde: p.desde, hasta: p.hasta }, { replace: true })
  }

  const resumen = useQuery({
    queryKey: ['resumen-cc', clienteId, desde, hasta],
    queryFn: () => obtenerResumen(clienteId!, desde, hasta),
    enabled: !!clienteId && periodoValido,
  })

  const emisor = useQuery({ queryKey: ['emisor'], queryFn: datosEmisor })

  const r = resumen.data

  // El título es el nombre que propone el navegador al guardar el PDF.
  useEffect(() => {
    if (!r) return
    const anterior = document.title
    document.title = nombreDelArchivo(r.cliente.nombre, { desde, hasta })
    return () => {
      document.title = anterior
    }
  }, [r, desde, hasta])

  return (
    <div className="min-h-full bg-piedra-100 py-6 print:bg-white print:py-0">
      {/* Barra de acciones: no sale impresa */}
      <div className="mx-auto mb-4 max-w-[21cm] space-y-3 px-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/*
            Vuelve a donde se estaba —la ficha del cliente o la tabla de
            deudores de Reportes— y no a una pantalla fija. Si la hoja se
            abrió directo, sin historial, va a Clientes.
          */}
          <button
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/clientes'))}
            className="text-sm text-marca-700 hover:underline"
          >
            ← Volver
          </button>
          <button
            onClick={() => window.print()}
            disabled={!r}
            className={boton.principal}
          >
            Imprimir o guardar PDF
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-borde">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-piedra-600">Desde</span>
            <input
              type="date"
              value={desde}
              onChange={(e) => e.target.value && cambiar({ desde: e.target.value })}
              className={campo}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-piedra-600">Hasta</span>
            <input
              type="date"
              value={hasta}
              onChange={(e) => e.target.value && cambiar({ hasta: e.target.value })}
              className={campo}
            />
          </label>
          <div className="flex flex-wrap gap-1">
            <button onClick={() => usarAtajo('este_mes')} className={boton.suave}>
              Este mes
            </button>
            <button onClick={() => usarAtajo('mes_pasado')} className={boton.suave}>
              Mes pasado
            </button>
            <button onClick={() => usarAtajo('desde_el_principio')} className={boton.suave}>
              Todo
            </button>
          </div>
        </div>

        <p className="text-xs text-piedra-500">
          Para mandarlo por mail: <strong>Imprimir o guardar PDF</strong> y, en el destino, elegir
          «Guardar como PDF». El archivo ya sale con el nombre del cliente y el período.
        </p>
      </div>

      <style>{'@page { size: A4; margin: 12mm; }'}</style>

      {!periodoValido ? (
        <Aviso texto="La fecha desde no puede ser posterior a la fecha hasta." />
      ) : resumen.isPending ? (
        <Aviso texto="Armando el resumen…" />
      ) : resumen.isError ? (
        <Aviso
          texto={`No se pudo armar el resumen: ${
            resumen.error instanceof Error ? resumen.error.message : 'hace falta conexión con el servidor.'
          }`}
        />
      ) : (
        r && <Hoja r={r} emisor={emisor.data ?? {}} />
      )}
    </div>
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <p className="mx-auto max-w-[21cm] rounded-xl bg-white px-4 py-3 text-sm text-piedra-600 ring-1 ring-borde">
      {texto}
    </p>
  )
}

function Hoja({ r, emisor }: { r: ResumenCuentaCorriente; emisor: Record<string, string> }) {
  const c = r.cliente
  const conVencido = llegaHastaHoy(r) && r.vencido_hoy > 0

  return (
    <div className="mx-auto max-w-[21cm] bg-white p-8 text-[11px] leading-snug text-tinta shadow-sm ring-1 ring-borde print:max-w-none print:p-0 print:shadow-none print:ring-0">
      {/* ── Encabezado ── */}
      <div className="grid grid-cols-2 border-2 border-tinta">
        <div className="border-r-2 border-tinta p-4">
          {emisor.logo ? (
            <img src={emisor.logo} alt="" className="mb-2 max-h-16 max-w-[55mm] object-contain" />
          ) : (
            <p className="text-lg font-bold">{emisor.nombre_fantasia || emisor.razon_social}</p>
          )}
          <dl className="mt-3 space-y-0.5">
            <Dato k="Razón social" v={emisor.razon_social} />
            <Dato k="Domicilio" v={[emisor.domicilio, emisor.localidad].filter(Boolean).join(' — ')} />
            <Dato k="CUIT" v={emisor.cuit} />
            {emisor.telefono && <Dato k="Teléfono" v={emisor.telefono} />}
          </dl>
        </div>
        <div className="p-4">
          <p className="text-lg font-bold">Resumen de cuenta corriente</p>
          <dl className="mt-3 space-y-0.5">
            <Dato k="Período" v={`${fechaCorta(r.desde)} al ${fechaCorta(r.hasta)}`} />
            <Dato k="Emitido el" v={fechaCorta(r.hoy)} />
          </dl>
        </div>
      </div>

      {/* ── Cliente ── */}
      <div className="mt-2 border-2 border-tinta p-3">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-0.5">
          <Dato k="Cliente" v={c.nombre} />
          <Dato
            k={c.documento_sigla || 'Documento'}
            v={c.documento || '—'}
          />
          <Dato k="Condición frente al IVA" v={c.condicion_iva || '—'} />
          <Dato k="Domicilio" v={[c.domicilio, c.localidad].filter(Boolean).join(', ') || '—'} />
        </dl>
      </div>

      {/* ── Movimientos ── */}
      <table className="mt-2 w-full border-2 border-tinta">
        <thead>
          <tr className="border-b-2 border-tinta text-left">
            <th className="px-2 py-1 font-semibold">Fecha</th>
            <th className="px-2 py-1 font-semibold">Comprobante / concepto</th>
            <th className="px-2 py-1 font-semibold">Vence</th>
            <th className="px-2 py-1 text-right font-semibold">Debe</th>
            <th className="px-2 py-1 text-right font-semibold">Haber</th>
            <th className="px-2 py-1 text-right font-semibold">Saldo</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-piedra-300 italic">
            <td className="px-2 py-1">{fechaCorta(r.desde)}</td>
            <td className="px-2 py-1" colSpan={4}>
              Saldo anterior
            </td>
            <td className="px-2 py-1 text-right tabular-nums">{moneda.format(r.saldo_anterior)}</td>
          </tr>

          {r.movimientos.length === 0 ? (
            <tr>
              <td className="px-2 py-3 text-center text-piedra-500" colSpan={6}>
                Sin movimientos en el período.
              </td>
            </tr>
          ) : (
            r.movimientos.map((m) => (
              <tr key={m.orden} className="break-inside-avoid align-top">
                <td className="px-2 py-0.5 tabular-nums">{fechaCorta(m.fecha)}</td>
                <td className="px-2 py-0.5">
                  {m.concepto || ETIQUETA_MOVIMIENTO[m.tipo] || m.tipo}
                  {m.concepto && ETIQUETA_MOVIMIENTO[m.tipo] && (
                    <span className="text-piedra-500"> · {ETIQUETA_MOVIMIENTO[m.tipo]}</span>
                  )}
                </td>
                <td className="px-2 py-0.5 tabular-nums">
                  {m.vencimiento ? fechaCorta(m.vencimiento) : ''}
                </td>
                <td className="px-2 py-0.5 text-right tabular-nums">
                  {m.debe > 0 ? moneda.format(m.debe) : ''}
                </td>
                <td className="px-2 py-0.5 text-right tabular-nums">
                  {m.haber > 0 ? moneda.format(m.haber) : ''}
                </td>
                <td className="px-2 py-0.5 text-right tabular-nums">{moneda.format(m.saldo)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-tinta font-semibold">
            <td className="px-2 py-1" colSpan={3}>
              Totales del período
            </td>
            <td className="px-2 py-1 text-right tabular-nums">{moneda.format(r.total_debe)}</td>
            <td className="px-2 py-1 text-right tabular-nums">{moneda.format(r.total_haber)}</td>
            <td className="px-2 py-1" />
          </tr>
        </tfoot>
      </table>

      {/* ── Saldo ── */}
      <div className="mt-2 flex justify-end">
        <div className="min-w-[8cm] border-2 border-tinta p-3">
          <div className="flex justify-between gap-6 text-sm font-bold">
            <span>{r.saldo_final < 0 ? 'Saldo a favor del cliente' : 'Saldo al ' + fechaCorta(r.hasta)}</span>
            <span className="tabular-nums">{moneda.format(Math.abs(r.saldo_final))}</span>
          </div>
          {/*
            Lo vencido sólo en un resumen que llega hasta hoy: es una foto
            del día de hoy, y en un resumen de un mes pasado mezclaría el
            saldo de entonces con lo que vence ahora.
          */}
          {conVencido && (
            <p className="mt-1 text-[11px]">
              De este saldo, <strong>{moneda.format(r.vencido_hoy)}</strong> está vencido
              {r.vencimiento_mas_antiguo && <> desde el {fechaCorta(r.vencimiento_mas_antiguo)}</>}.
            </p>
          )}
        </div>
      </div>

      <p className="mt-4 text-[10px] text-piedra-500">
        Los pagos se aplican a las facturas más antiguas. Este resumen no es un comprobante fiscal:
        las facturas y notas de crédito que figuran tienen su propio comprobante emitido ante ARCA.
      </p>
    </div>
  )
}

function Dato({ k, v }: { k: string; v: string | undefined }) {
  return (
    <div className="flex gap-1">
      <dt className="shrink-0 font-semibold">{k}:</dt>
      <dd className="min-w-0">{v || '—'}</dd>
    </div>
  )
}
