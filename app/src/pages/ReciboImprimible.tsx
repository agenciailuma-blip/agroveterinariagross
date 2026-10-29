import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { LEYENDA_NO_FISCAL } from '@/lib/api/noFiscal'
import { enviarReciboPorMail, numeroRecibo, reciboCompleto, type ReciboCompleto } from '@/lib/api/recibos'
import { fechaCorta } from '@/lib/comprobante/presentacion'
import { importeEnLetras } from '@/lib/enLetras'
import { enCastellano } from '@/lib/errores'
import { boton, campo } from '@/estilos'
import { moneda } from '@/lib/tipos'

/*
  El recibo, para entregar: la hoja A4 que se imprime y la misma que va
  por mail en PDF. Se llega desde la cobranza en la ficha del cliente,
  desde la orden de recibo aceptada y desde el registro de recibos.
*/
export default function ReciboImprimible() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const recibo = useQuery({
    queryKey: ['recibo', id],
    queryFn: () => reciboCompleto(id!),
    enabled: !!id,
  })
  const r = recibo.data

  if (recibo.isPending) return <p className="p-8 text-sm text-piedra-500">Cargando…</p>
  if (recibo.isError || !r)
    return (
      <div className="p-8">
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {enCastellano(recibo.error, 'No se pudo cargar el recibo.')}
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

      <MandarPorMail r={r} />

      <style>{'@page { size: A4; margin: 12mm; }'}</style>
      <Hoja r={r} />
    </div>
  )
}

function MandarPorMail({ r }: { r: ReciboCompleto }) {
  const qc = useQueryClient()
  const [abierto, setAbierto] = useState(false)
  const [destinatario, setDestinatario] = useState('')

  useEffect(() => {
    if (abierto && !destinatario) setDestinatario(r.cliente_email ?? '')
  }, [abierto, destinatario, r.cliente_email])

  const mandar = useMutation({
    mutationFn: () => enviarReciboPorMail(r, destinatario),
    onSuccess: () => setAbierto(false),
    onSettled: () => qc.invalidateQueries({ queryKey: ['recibo', r.id] }),
  })

  return (
    <div className="mx-auto mb-4 max-w-[21cm] px-4 print:hidden">
      {!abierto ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            onClick={() => setAbierto(true)}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-marca-700 ring-1 ring-borde hover:bg-marca-50"
          >
            Mandar por mail
          </button>
          {r.mail_estado && r.mail_en && (
            <span className={`text-xs ${r.mail_estado === 'enviado' ? 'text-piedra-500' : 'text-red-700'}`}>
              {r.mail_estado === 'enviado' ? 'Enviado' : 'No salió'} a {r.mail_destinatario} el{' '}
              {new Date(r.mail_en).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
              {r.mail_estado === 'error' && r.mail_error && `: ${r.mail_error}`}
            </span>
          )}
        </div>
      ) : (
        <form
          className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-borde"
          onSubmit={(e) => {
            e.preventDefault()
            mandar.mutate()
          }}
        >
          <input
            type="email"
            autoFocus
            value={destinatario}
            onChange={(e) => setDestinatario(e.target.value)}
            placeholder="correo@cliente.com"
            className={`${campo} min-w-0 flex-1 basis-56`}
          />
          <button type="submit" disabled={!destinatario.trim() || mandar.isPending} className={boton.principal}>
            {mandar.isPending ? 'Mandando…' : 'Mandar'}
          </button>
          <button type="button" onClick={() => setAbierto(false)} className={boton.suave}>
            Cancelar
          </button>
          {mandar.isError && (
            <p role="alert" className="w-full text-sm text-red-700">
              {enCastellano(mandar.error)}
            </p>
          )}
        </form>
      )}
    </div>
  )
}

function Hoja({ r }: { r: ReciboCompleto }) {
  const saldo = Math.round(r.saldo_despues * 100) / 100
  return (
    <div className="mx-auto max-w-[21cm] bg-white p-8 text-[11px] text-black shadow-sm ring-1 ring-borde print:p-0 print:shadow-none print:ring-0">
      <p className="mb-4 border-2 border-black py-1.5 text-center text-sm font-bold tracking-wide">{LEYENDA_NO_FISCAL}</p>

      <div className="flex flex-wrap items-start justify-between gap-6 border-b border-black pb-4">
        <div className="min-w-0">
          {r.emisor.logo ? (
            <img src={r.emisor.logo} alt="" className="max-h-[24mm] max-w-[70mm] object-contain" />
          ) : (
            <p className="text-base font-bold">{r.emisor.nombre_fantasia || r.emisor.razon_social}</p>
          )}
          {r.emisor.razon_social && <p>{r.emisor.razon_social}</p>}
          <p>{[r.emisor.domicilio, r.emisor.localidad].filter(Boolean).join(' — ')}</p>
          {r.emisor.cuit && <p>CUIT {r.emisor.cuit}</p>}
        </div>
        <div className="ml-auto shrink-0 text-right">
          <p className="text-base font-bold uppercase">Recibo</p>
          <p className="text-sm font-bold tabular-nums">N° {numeroRecibo(r.serie, r.numero)}</p>
          <p>Fecha: {fechaCorta(r.fecha)}</p>
        </div>
      </div>

      <div className="space-y-1 border-b border-black py-3">
        <p>
          <span className="font-bold">Recibimos de: </span>
          {r.cliente_nombre}
        </p>
        {(r.cliente_documento || r.cliente_domicilio) && (
          <p>{[r.cliente_documento && `CUIT/DNI ${r.cliente_documento}`, r.cliente_domicilio].filter(Boolean).join(' · ')}</p>
        )}
        <p>
          <span className="font-bold">La suma de pesos: </span>
          {importeEnLetras(r.total)}
        </p>
        <p>
          <span className="font-bold">En concepto de: </span>
          {r.concepto || 'Pago a cuenta'}
        </p>
      </div>

      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-1 pr-2 font-bold">Forma de pago</th>
            <th className="py-1 pr-2 font-bold">Detalle</th>
            <th className="py-1 text-right font-bold">Importe</th>
          </tr>
        </thead>
        <tbody>
          {r.pagos.map((p, i) => (
            <tr key={i} className="border-b border-piedra-200 align-top">
              <td className="py-1 pr-2">{p.medio}</td>
              <td className="py-1 pr-2">
                {p.cheque &&
                  `${p.cheque.banco} N° ${p.cheque.numero}${p.cheque.fecha_pago ? ` · al ${fechaCorta(p.cheque.fecha_pago)}` : ''}`}
              </td>
              <td className="py-1 text-right tabular-nums">{moneda.format(p.importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex justify-end border-t border-black pt-2">
        <div className="flex w-64 justify-between text-sm font-bold">
          <span>TOTAL RECIBIDO</span>
          <span className="tabular-nums">{moneda.format(r.total)}</span>
        </div>
      </div>

      <p className="mt-4">
        {saldo > 0
          ? `Saldo de la cuenta después de este pago: ${moneda.format(saldo)}`
          : saldo < 0
            ? `La cuenta queda con ${moneda.format(-saldo)} a favor.`
            : 'La cuenta queda al día.'}
      </p>
      {r.orden_numero && (
        <p className="text-[10px]">
          Cobrado por {r.orden_vendedor ?? 'el vendedor'} · orden {r.orden_numero}
        </p>
      )}

      <div className="mt-12 flex justify-end">
        <p className="w-56 border-t border-black pt-1">Firma y aclaración</p>
      </div>

      <p className="mt-6 border-2 border-black py-1.5 text-center text-sm font-bold tracking-wide">{LEYENDA_NO_FISCAL}</p>
    </div>
  )
}
