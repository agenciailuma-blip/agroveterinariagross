import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { datosEmisor } from '@/lib/api/comprobante'
import { agruparMovimientos, comoSeDevolvio, cuentaParaElCierre, resumenDeCaja } from '@/lib/api/cierreCaja'
import type { PorMedio, ResumenCaja } from '@/lib/api/cierreCaja'
import { enCastellano } from '@/lib/errores'
import { boton } from '@/estilos'
import { moneda } from '@/lib/tipos'

/*
  ─────────────────────────────────────────────────────────────
  La planilla de caja, para imprimir

  La hoja A4 del sistema anterior, pedida en la reunión del 05/11: el
  arqueo del efectivo, cada medio de pago de las ventas y de las
  cobranzas, los ingresos y egresos con su subtotal por tipo, las
  notas de crédito y devoluciones del turno, los cheques que se
  entregan, y lugar para las firmas.

  Se puede imprimir con la caja abierta —para mirar cómo viene el
  turno—, pero entonces no dice cuánto efectivo espera el sistema: el
  arqueo se hace a ciegas.

  La de una caja cerrada sale del resumen guardado al cerrarla: impresa
  otro día dice lo mismo. Lo que se anuló después va aparte, al final.
  ─────────────────────────────────────────────────────────────
*/

const DOCUMENTACION: Record<string, string> = {
  fiscal: 'Con factura',
  no_fiscal: 'Comprobante no fiscal',
  a_facturar: 'A facturar',
}

const fechaHora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

export default function PlanillaCajaImprimible() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const resumen = useQuery({ queryKey: ['resumen-de-caja', id], queryFn: () => resumenDeCaja(id!), enabled: !!id })
  const emisor = useQuery({ queryKey: ['emisor'], queryFn: datosEmisor })

  if (resumen.isPending) return <p className="p-8 text-sm text-piedra-500">Cargando…</p>
  if (resumen.isError)
    return (
      <div className="p-8">
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {enCastellano(resumen.error, 'No se pudo cargar la planilla.')}
        </p>
        <button onClick={() => navigate(-1)} className="mt-3 text-sm text-marca-700 underline">
          Volver
        </button>
      </div>
    )

  return (
    <div className="min-h-full bg-piedra-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[21cm] flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <button onClick={() => navigate(-1)} className="text-sm text-marca-700 hover:underline">
          ← Volver
        </button>
        <button onClick={() => window.print()} className={boton.principal}>
          Imprimir
        </button>
      </div>
      <style>{'@page { size: A4; margin: 12mm; }'}</style>
      <Hoja r={resumen.data} comercio={emisor.data?.nombre_fantasia || emisor.data?.razon_social || ''} />
    </div>
  )
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-5 mb-1 border-b border-black pb-0.5 text-[12px] font-bold uppercase">{children}</h2>
}

function Renglon({ nombre, valor, fuerte = false }: { nombre: React.ReactNode; valor: string; fuerte?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-0.5 ${fuerte ? 'font-bold' : ''}`}>
      <span className="min-w-0">{nombre}</span>
      <span className="shrink-0 tabular-nums">{valor}</span>
    </div>
  )
}

function TablaDeMedios({ medios }: { medios: PorMedio[] }) {
  const total = medios.reduce((s, m) => s + m.importe, 0)
  if (medios.length === 0) return <p className="text-piedra-600">Ninguna.</p>
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="text-left">
          <th className="py-0.5 pr-2 font-bold">Medio de pago</th>
          <th className="py-0.5 pr-2 text-right font-bold">Cant.</th>
          <th className="py-0.5 text-right font-bold">Importe</th>
        </tr>
      </thead>
      <tbody>
        {medios.map((m) => (
          <tr key={m.medio} className="border-t border-piedra-200">
            <td className="py-0.5 pr-2">{m.medio}</td>
            <td className="py-0.5 pr-2 text-right tabular-nums">{m.cantidad}</td>
            <td className="py-0.5 text-right tabular-nums">{moneda.format(m.importe)}</td>
          </tr>
        ))}
        <tr className="border-t border-black font-bold">
          <td className="py-0.5 pr-2">Total</td>
          <td />
          <td className="py-0.5 text-right tabular-nums">{moneda.format(total)}</td>
        </tr>
      </tbody>
    </table>
  )
}

function Hoja({ r, comercio }: { r: ResumenCaja; comercio: string }) {
  const e = r.efectivo
  const abierta = r.caja.estado === 'abierta'
  const grupos = agruparMovimientos(r.movimientos)
  const totalCheques = r.cheques_recibidos.reduce((s, c) => s + c.importe, 0)

  return (
    <div className="mx-auto max-w-[21cm] bg-white p-8 text-[11px] text-black shadow-sm ring-1 ring-borde print:p-0 print:shadow-none print:ring-0">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-black pb-3">
        <div className="min-w-0">
          {comercio && <p className="text-base font-bold">{comercio}</p>}
          <p className="text-sm font-bold uppercase">Planilla de caja</p>
          <p>
            {r.caja.terminal ?? 'Caja'}
            {r.caja.cajero && ` · ${r.caja.cajero}`}
          </p>
        </div>
        <div className="ml-auto shrink-0 text-right">
          <p>Apertura: {fechaHora(r.caja.abierta_en)}</p>
          <p>Cierre: {abierta ? 'abierta' : fechaHora(r.caja.cerrada_en)}</p>
        </div>
      </div>

      {abierta && (
        <p className="mt-3 border-2 border-black py-1 text-center font-bold">
          CAJA ABIERTA — el efectivo esperado se ve al cerrarla
        </p>
      )}

      <Titulo>Efectivo</Titulo>
      <Renglon nombre="Monto inicial" valor={moneda.format(e.inicial)} />
      <Renglon nombre="+ Ventas en efectivo" valor={moneda.format(e.ventas)} />
      <Renglon nombre="+ Cobranzas en efectivo" valor={moneda.format(e.cobranzas)} />
      <Renglon nombre="+ Ingresos" valor={moneda.format(e.ingresos)} />
      <Renglon nombre="− Egresos" valor={moneda.format(Math.abs(e.egresos))} />
      {!abierta && (
        <div className="mt-1 border-t border-black pt-1">
          <Renglon nombre="Efectivo esperado" valor={moneda.format(e.esperado ?? 0)} fuerte />
          <Renglon nombre="Efectivo contado" valor={moneda.format(r.caja.monto_declarado ?? 0)} fuerte />
          <Renglon nombre="Diferencia" valor={moneda.format(r.caja.diferencia ?? 0)} fuerte />
        </div>
      )}

      <Titulo>
        Ventas · {r.ventas.cantidad} cobradas por {moneda.format(r.ventas.total)}
        {r.ventas.anuladas > 0 && ` · ${r.ventas.anuladas} anuladas`}
      </Titulo>
      <TablaDeMedios medios={r.ventas.por_medio} />
      {r.ventas.por_documentacion.length > 0 && (
        <div className="mt-2">
          {r.ventas.por_documentacion.map((d) => (
            <Renglon
              key={d.documentacion}
              nombre={`${DOCUMENTACION[d.documentacion] ?? d.documentacion} (${d.cantidad})`}
              valor={moneda.format(d.total)}
            />
          ))}
        </div>
      )}

      <Titulo>Cobranzas de cuenta corriente y fiados</Titulo>
      <TablaDeMedios medios={r.cobranzas.por_medio} />
      {r.cobranzas.detalle.length > 0 && (
        <table className="mt-2 w-full border-collapse">
          <thead>
            <tr className="text-left">
              <th className="py-0.5 pr-2 font-bold">Hora</th>
              <th className="py-0.5 pr-2 font-bold">Recibo</th>
              <th className="py-0.5 pr-2 font-bold">Cliente</th>
              <th className="py-0.5 pr-2 font-bold">Medio</th>
              <th className="py-0.5 text-right font-bold">Importe</th>
            </tr>
          </thead>
          <tbody>
            {r.cobranzas.detalle.map((d) => (
              <tr key={d.numero} className={`border-t border-piedra-200 align-top ${d.anulado ? 'line-through' : ''}`}>
                <td className="py-0.5 pr-2 tabular-nums">{hora(d.emitido_en)}</td>
                <td className="py-0.5 pr-2 tabular-nums">{d.numero}</td>
                <td className="py-0.5 pr-2 [overflow-wrap:anywhere]">
                  {d.cliente}
                  {d.anulado && ' (anulado)'}
                </td>
                <td className="py-0.5 pr-2">{d.medios}</td>
                <td className="py-0.5 text-right tabular-nums">{moneda.format(d.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Titulo>Notas de crédito y devoluciones</Titulo>
      {r.devoluciones.length === 0 ? (
        <p className="text-piedra-600">Ninguna.</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left">
              <th className="py-0.5 pr-2 font-bold">Hora</th>
              <th className="py-0.5 pr-2 font-bold">Comprobante</th>
              <th className="py-0.5 pr-2 font-bold">Cliente y venta</th>
              <th className="py-0.5 text-right font-bold">Importe</th>
            </tr>
          </thead>
          <tbody>
            {r.devoluciones.map((d, i) => (
              <tr key={i} className="border-t border-piedra-200 align-top">
                <td className="py-0.5 pr-2 tabular-nums">{hora(d.ocurrido_en)}</td>
                <td className="py-0.5 pr-2 [overflow-wrap:anywhere]">{comoSeDevolvio(d)}</td>
                <td className="py-0.5 pr-2 [overflow-wrap:anywhere]">
                  {[d.cliente, d.venta].filter(Boolean).join(' · ')}
                  {d.motivo && <span className="block text-[10px] text-piedra-600">{d.motivo}</span>}
                </td>
                <td className="py-0.5 text-right tabular-nums">{moneda.format(d.importe)}</td>
              </tr>
            ))}
            <tr className="border-t border-black font-bold">
              <td />
              <td className="py-0.5 pr-2" colSpan={2}>
                Total
              </td>
              <td className="py-0.5 text-right tabular-nums">
                {moneda.format(r.devoluciones.reduce((s, d) => s + d.importe, 0))}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <Titulo>Ingresos y egresos</Titulo>
      {grupos.length === 0 ? (
        <p className="text-piedra-600">Ninguno.</p>
      ) : (
        grupos.map((g) => (
          <div key={g.categoria} className="mb-2 break-inside-avoid">
            <p className="font-bold">{g.titulo}</p>
            <table className="w-full border-collapse">
              <tbody>
                {g.movimientos.map((m) => {
                  const cuenta = cuentaParaElCierre(m)
                  const nota = m.anulado_en
                    ? `anulado: ${m.motivo_anulacion}`
                    : m.excluir_del_cierre
                      ? 'no va en el cierre'
                      : m.forma === 'cheques'
                        ? m.cheques.map((c) => c.nombre).join(', ')
                        : null
                  return (
                    <tr key={m.id} className="border-t border-piedra-200 align-top">
                      <td className="w-12 py-0.5 pr-2 tabular-nums">{hora(m.creado_en)}</td>
                      <td className="py-0.5 pr-2 [overflow-wrap:anywhere]">
                        <span className={m.anulado_en ? 'line-through' : ''}>{m.concepto}</span>
                        {m.usuario && <span className="text-piedra-600"> · {m.usuario}</span>}
                        {nota && <span className="block text-[10px] text-piedra-600">{nota}</span>}
                      </td>
                      <td className={`py-0.5 text-right tabular-nums ${cuenta ? '' : 'text-piedra-500'}`}>
                        {cuenta ? '' : '('}
                        {moneda.format(m.importe)}
                        {cuenta ? '' : ')'}
                      </td>
                    </tr>
                  )
                })}
                <tr className="border-t border-black font-bold">
                  <td />
                  <td className="py-0.5 pr-2">Subtotal en efectivo</td>
                  <td className="py-0.5 text-right tabular-nums">{moneda.format(g.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))
      )}

      {r.cheques_recibidos.length > 0 && (
        <>
          <Titulo>Cheques recibidos · se entregan con el cierre</Titulo>
          <table className="w-full border-collapse">
            <tbody>
              {r.cheques_recibidos.map((c, i) => (
                <tr key={i} className="border-t border-piedra-200 align-top">
                  <td className="py-0.5 pr-2 [overflow-wrap:anywhere]">
                    {c.nombre}
                    {c.cliente && ` · ${c.cliente}`}
                  </td>
                  <td className="py-0.5 pr-2 tabular-nums">
                    {new Date(`${c.fecha_pago}T12:00:00`).toLocaleDateString('es-AR')}
                  </td>
                  <td className="py-0.5 text-right tabular-nums">{moneda.format(c.importe)}</td>
                </tr>
              ))}
              <tr className="border-t border-black font-bold">
                <td className="py-0.5 pr-2">Total en cheques</td>
                <td />
                <td className="py-0.5 text-right tabular-nums">{moneda.format(totalCheques)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {(r.despues_del_cierre?.length ?? 0) > 0 && (
        <>
          <Titulo>Anulado después del cierre</Titulo>
          <p className="mb-1 text-piedra-600">Los números de arriba son los del cierre: esto no los cambia.</p>
          <table className="w-full border-collapse">
            <tbody>
              {r.despues_del_cierre!.map((c, i) => (
                <tr key={i} className="border-t border-piedra-200 align-top">
                  <td className="py-0.5 pr-2 tabular-nums">{fechaHora(c.ocurrido_en)}</td>
                  <td className="py-0.5 pr-2 [overflow-wrap:anywhere]">
                    {c.tipo === 'venta_anulada' ? 'Venta' : 'Recibo'} {c.numero}
                    {c.cliente && ` · ${c.cliente}`}
                    {c.motivo && <span className="block text-[10px] text-piedra-600">{c.motivo}</span>}
                    {c.efectivo > 0 && (
                      <span className="block text-[10px] text-piedra-600">En efectivo: {moneda.format(c.efectivo)}</span>
                    )}
                  </td>
                  <td className="py-0.5 text-right tabular-nums">{moneda.format(c.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="mt-14 flex flex-wrap justify-between gap-8">
        <p className="w-56 border-t border-black pt-1">Firma del cajero</p>
        <p className="w-56 border-t border-black pt-1">Firma de quien recibe</p>
      </div>
      <p className="mt-6 text-right text-[9px] text-piedra-600">Impreso el {fechaHora(new Date().toISOString())}</p>
    </div>
  )
}
