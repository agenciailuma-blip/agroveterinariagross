import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import TicketNoFiscal from '@/components/TicketNoFiscal'
import { LEYENDA_NO_FISCAL, numeroNoFiscal, obtenerNoFiscalCompleto } from '@/lib/api/noFiscal'
import type { NoFiscalCompleto } from '@/lib/api/noFiscal'
import { ticketNoFiscalEscPos } from '@/lib/comprobante/escposNoFiscal'
import { fechaCorta } from '@/lib/comprobante/presentacion'
import { enEscritorio, imprimirEnLaHasar } from '@/lib/escritorio'
import { moneda, numero } from '@/lib/tipos'

/*
  El presupuesto, el remito o el comprobante interno, para entregar.

  Los dos formatos son los mismos que los del comprobante fiscal —el
  rollo del mostrador y la hoja para mandar por mail— y la elección se
  recuerda por terminal, con la MISMA clave que usa el comprobante
  fiscal: la caja imprime tickets todo el día y la oficina imprime A4, y
  no tiene sentido que cada pantalla pregunte por separado.
*/
type Formato = 'ticket' | 'a4'
const CLAVE_FORMATO = 'gross.formato_comprobante'

function formatoGuardado(): Formato {
  try {
    return localStorage.getItem(CLAVE_FORMATO) === 'a4' ? 'a4' : 'ticket'
  } catch {
    return 'ticket'
  }
}

export default function NoFiscalImprimible() {
  const { id } = useParams<{ id: string }>()
  const [formato, setFormato] = useState<Formato>(formatoGuardado)
  const [errorImpresora, setErrorImpresora] = useState<string | null>(null)

  function elegirFormato(f: Formato) {
    setFormato(f)
    try {
      localStorage.setItem(CLAVE_FORMATO, f)
    } catch {
      // Que no se pueda recordar la preferencia no impide imprimir.
    }
  }

  const doc = useQuery({
    queryKey: ['no-fiscal', id],
    queryFn: () => obtenerNoFiscalCompleto(id!),
    enabled: !!id,
  })
  const d = doc.data

  const imprimirDirecto = useMutation({
    mutationFn: async () => {
      await imprimirEnLaHasar(
        ticketNoFiscalEscPos(d!),
        d!.emisor.impresora_host ?? '',
        Number(d!.emisor.impresora_puerto) || 9100,
      )
    },
    onSuccess: () => setErrorImpresora(null),
    onError: (e) =>
      setErrorImpresora(e instanceof Error ? e.message : 'No se pudo imprimir el ticket.'),
  })

  if (doc.isPending) return <p className="p-8 text-sm text-piedra-500">Cargando…</p>
  if (doc.isError || !d)
    return (
      <div className="p-8">
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          No se pudo cargar el comprobante.
        </p>
        <Link to="/caja" className="mt-3 inline-block text-sm text-marca-700 underline">
          Volver a la Caja
        </Link>
      </div>
    )

  return (
    <div className="min-h-full bg-piedra-100 py-6 print:bg-white print:py-0">
      {/* Barra de acciones: no sale impresa */}
      <div className="mx-auto mb-4 flex max-w-[21cm] items-center justify-between gap-3 px-4 print:hidden">
        <Link to="/caja" className="text-sm text-marca-700 hover:underline">
          ← Volver a la Caja
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 rounded-lg bg-piedra-100 p-1">
            <button
              onClick={() => elegirFormato('ticket')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                formato === 'ticket'
                  ? 'bg-white text-tinta shadow-sm'
                  : 'text-piedra-500 hover:text-tinta'
              }`}
            >
              Ticket 80 mm
            </button>
            <button
              onClick={() => elegirFormato('a4')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                formato === 'a4' ? 'bg-white text-tinta shadow-sm' : 'text-piedra-500 hover:text-tinta'
              }`}
            >
              Hoja A4
            </button>
          </div>
          {enEscritorio && !!d.emisor.impresora_host?.trim() && (
            <button
              onClick={() => imprimirDirecto.mutate()}
              disabled={imprimirDirecto.isPending}
              className="rounded-lg bg-verde-600 px-4 py-2 text-sm font-medium text-white hover:bg-verde-500 disabled:opacity-40"
            >
              {imprimirDirecto.isPending ? 'Imprimiendo…' : 'Imprimir en el mostrador'}
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600"
          >
            Imprimir
          </button>
        </div>
      </div>

      {errorImpresora && (
        <div className="mx-auto mb-4 max-w-[21cm] px-4 print:hidden">
          <p
            role="alert"
            className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200"
          >
            {errorImpresora} Se puede imprimir igual desde el navegador con el botón Imprimir.
          </p>
        </div>
      )}

      {d.estado === 'anulado' && (
        <div className="mx-auto mb-4 max-w-[21cm] px-4 print:hidden">
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            Este comprobante está anulado. Se puede reimprimir para el archivo, pero sale con la
            marca de anulado.
          </p>
        </div>
      )}

      {/*
        El tamaño del papel se declara acá y no en el CSS global, igual
        que en el comprobante fiscal: es lo único que hace que el
        navegador no meta un ticket de 80 mm en el medio de una A4.
      */}
      <style>
        {formato === 'ticket'
          ? '@page { size: 80mm auto; margin: 3mm 4mm; }'
          : '@page { size: A4; margin: 12mm; }'}
      </style>

      {formato === 'ticket' ? (
        <div className="mx-auto bg-white shadow-sm ring-1 ring-borde print:shadow-none print:ring-0">
          <TicketNoFiscal c={d} />
        </div>
      ) : (
        <Hoja c={d} />
      )}
    </div>
  )
}

/*
  La hoja A4 — la que se manda por mail al cliente de cuenta corriente.

  Mismos datos y mismos números que el rollo; cambia el papel. Y las
  mismas ausencias: sin recuadro de letra, sin CAE, sin QR y sin
  discriminar IVA.
*/
function Hoja({ c }: { c: NoFiscalCompleto }) {
  const esRemito = c.tipo_clave === 'remito'
  /*
    En el remito no van precios. Lucas, 07/09.

    El remito acompaña a la factura, o la factura sale después si es
    cuenta corriente: el precio va en la factura. Un remito con precios
    es un papel con los números del cliente viajando en la camioneta,
    sin ser el documento que los tiene que llevar.

    Se siguen guardando en la base —son lo que permite valorizar lo que
    salió sin cobrarse—; lo que no se hace es imprimirlos.
  */
  const conImportes = !esRemito && c.total > 0
  const unidades = c.lineas.reduce((s, l) => s + Number(l.cantidad), 0)

  return (
    <div className="mx-auto max-w-[21cm] bg-white p-8 text-[11px] text-black shadow-sm ring-1 ring-borde print:p-0 print:shadow-none print:ring-0">
      <p className="mb-4 border-2 border-black py-1.5 text-center text-sm font-bold tracking-wide">
        {LEYENDA_NO_FISCAL}
      </p>

      <div className="flex items-start justify-between gap-6 border-b border-black pb-4">
        {/* Sólo el logo: los datos fiscales del emisor son de la factura. */}
        <div className="min-w-0">
          {c.emisor.logo && (
            <img src={c.emisor.logo} alt="" className="max-h-[24mm] max-w-[70mm] object-contain" />
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-bold uppercase">{c.tipo_descripcion}</p>
          <p className="text-sm font-bold tabular-nums">
            {numeroNoFiscal(c.tipo_clave, c.serie, c.numero)}
          </p>
          <p>Fecha: {fechaCorta(c.fecha)}</p>
          {c.tipo_clave === 'presupuesto' && c.valido_hasta && (
            <p className="font-bold">Válido hasta: {fechaCorta(c.valido_hasta)}</p>
          )}
          {c.estado === 'anulado' && (
            <p className="mt-1 border border-black px-2 py-0.5 font-bold">ANULADO</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 border-b border-black py-3">
        <div>
          <p className="font-bold">Cliente</p>
          <p>{c.receptor_nombre}</p>
          <p>{c.receptor_domicilio || 'n/n'}</p>
          {c.receptor_documento && (
            <p>
              {c.receptor_documento_sigla || 'CUIT/DNI'}: {c.receptor_documento}
            </p>
          )}
        </div>
        {esRemito && (
          <div>
            <p className="font-bold">Entrega</p>
            <p>{c.entrega_domicilio || 'n/n'}</p>
            {c.entrega_localidad && <p>{c.entrega_localidad}</p>}
            {c.entrega_contacto && <p>Contacto: {c.entrega_contacto}</p>}
            {c.transportista && <p>Transporte: {c.transportista}</p>}
          </div>
        )}
      </div>

      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-1 pr-2 font-bold">Código</th>
            <th className="py-1 pr-2 font-bold">Descripción</th>
            <th className="py-1 pr-2 text-right font-bold">Cant.</th>
            {conImportes && (
              <>
                <th className="py-1 pr-2 text-right font-bold">P. unitario</th>
                <th className="py-1 text-right font-bold">Importe</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {c.lineas.map((l) => (
            <tr key={l.orden} className="border-b border-piedra-200 align-top">
              <td className="py-1 pr-2 tabular-nums">{l.codigo_producto}</td>
              <td className="py-1 pr-2">{l.descripcion}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{numero.format(l.cantidad)}</td>
              {conImportes && (
                <>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {moneda.format(l.precio_unitario)}
                  </td>
                  <td className="py-1 text-right tabular-nums">{moneda.format(l.importe)}</td>
                </>
              )}
            </tr>
          ))}
          {c.lineas.length === 0 && (
            <tr>
              <td colSpan={conImportes ? 5 : 3} className="py-3 text-center">
                Sin detalle de líneas.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {conImportes && (
        <div className="mt-3 flex justify-end border-t border-black pt-2">
          <div className="flex w-64 justify-between text-sm font-bold">
            <span>TOTAL</span>
            <span className="tabular-nums">{moneda.format(c.total)}</span>
          </div>
        </div>
      )}

      {/*
        El remito cierra con bultos. Sin total en pesos hace falta algún
        número con el que verificar la entrega, y ese número es cuántas
        unidades salieron — que además es lo que se cuenta al recibir.
      */}
      {esRemito && c.lineas.length > 0 && (
        <div className="mt-3 flex justify-end border-t border-black pt-2">
          <div className="flex w-64 justify-between text-sm font-bold">
            <span>TOTAL DE UNIDADES</span>
            <span className="tabular-nums">{numero.format(unidades)}</span>
          </div>
        </div>
      )}

      {c.observaciones && (
        <div className="mt-4 border-t border-piedra-200 pt-2">
          <p className="font-bold">Observaciones</p>
          <p className="whitespace-pre-wrap">{c.observaciones}</p>
        </div>
      )}

      {esRemito && (
        <div className="mt-10 grid grid-cols-2 gap-10">
          <div>
            <p className="border-t border-black pt-1">Firma y aclaración — recibí conforme</p>
          </div>
          <div>
            <p className="border-t border-black pt-1">Fecha de recepción</p>
          </div>
        </div>
      )}

      <p className="mt-6 border-2 border-black py-1.5 text-center text-sm font-bold tracking-wide">
        {LEYENDA_NO_FISCAL}
      </p>
      {c.venta_codigo && (
        <p className="mt-2 text-center text-[10px]">Operación {c.venta_codigo}</p>
      )}
    </div>
  )
}
