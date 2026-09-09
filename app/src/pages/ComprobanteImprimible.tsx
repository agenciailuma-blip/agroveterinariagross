import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { obtenerComprobanteCompleto, registrarImpresion } from '@/lib/api/comprobante'
import type { ComprobanteCompleto } from '@/lib/api/comprobante'
import { urlQrComprobante } from '@/lib/arca/qr'
import TicketComprobante from '@/components/TicketComprobante'
import { ticketEscPos } from '@/lib/comprobante/escpos'
import { destinoDeImpresion } from '@/lib/comprobante/destino'
import { enEscritorio, imprimirTicket } from '@/lib/escritorio'
import { presentacionDe } from '@/lib/comprobante/presentacion'
import { useTerminal } from '@/lib/terminal'
import { moneda, numero } from '@/lib/tipos'

/*
  Dos formatos, como los tiene Gross hoy.

  El rollo de 80 mm es el del mostrador: sale por la Hasar y es lo que
  se le da al cliente que se lleva la mercadería. El A4 es para el
  cliente de cuenta corriente, al que la factura se le manda por mail.
  Son el mismo comprobante y los mismos números; cambia el papel.

  La elección se recuerda por terminal: la caja imprime tickets todo el
  día y la oficina imprime A4, y ninguna de las dos tiene por qué
  volver a elegir en cada comprobante.
*/
type Formato = 'ticket' | 'a4'
const CLAVE_FORMATO = 'gross.formato_comprobante'

function formatoGuardado(): Formato {
  try {
    return localStorage.getItem(CLAVE_FORMATO) === 'a4' ? 'a4' : 'ticket'
  } catch {
    // Navegador con el almacenamiento bloqueado: se usa el del mostrador.
    return 'ticket'
  }
}

/*
  El comprobante que se le entrega al cliente.

  Se imprime desde el navegador, no desde la Hasar: la impresión fiscal
  por ESC/POS necesita Tauri, que todavía no está. Mientras tanto esto
  ya es un comprobante válido —lleva el CAE y el QR de la RG 4892— y se
  puede imprimir en cualquier impresora o guardar como PDF.
*/
export default function ComprobanteImprimible() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  // La impresora del mostrador es de la máquina, así que viaja con la
  // terminal. Se lee de lo guardado localmente: acá no hace falta pedirle
  // nada al servidor, que es lo que permite imprimir sin internet.
  const { terminal } = useTerminal()
  const [qr, setQr] = useState<string | null>(null)
  // La dirección del QR, aparte de la imagen: la impresora dibuja el
  // suyo a partir del texto, no de la imagen.
  const [urlQr, setUrlQr] = useState<string | null>(null)
  const [errorImpresora, setErrorImpresora] = useState<string | null>(null)
  const [formato, setFormato] = useState<Formato>(formatoGuardado)

  function elegirFormato(f: Formato) {
    setFormato(f)
    try {
      localStorage.setItem(CLAVE_FORMATO, f)
    } catch {
      // Que no se pueda recordar la preferencia no impide imprimir.
    }
  }

  const comprobante = useQuery({
    queryKey: ['comprobante', id],
    queryFn: () => obtenerComprobanteCompleto(id!),
    enabled: !!id,
  })

  const c = comprobante.data

  useEffect(() => {
    if (!c?.cae) return
    const url = urlQrComprobante({
      fecha: c.fecha,
      cuitEmisor: c.emisor.cuit ?? '',
      puntoVenta: c.punto_venta,
      tipoComprobante: c.tipo_comprobante_id,
      numero: c.numero,
      importeTotal: c.total,
      moneda: c.moneda,
      cotizacion: c.cotizacion,
      tipoDocumentoReceptor: c.receptor_tipo_documento_id,
      documentoReceptor: c.receptor_documento,
      tipoAutorizacion: c.modalidad === 'caea' ? 'A' : 'E',
      codigoAutorizacion: c.cae,
    })
    // Nivel de corrección M: el QR sigue leyéndose con la tinta corrida
    // de una impresora de mostrador o si el papel se dobla.
    setUrlQr(url)
    QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 240 })
      .then(setQr)
      .catch(() => setQr(null))
  }, [c])

  const marcarImpreso = useMutation({
    mutationFn: () => registrarImpresion(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comprobante', id] })
      qc.invalidateQueries({ queryKey: ['comprobantes'] })
    },
  })

  /*
    Imprimir directo en la impresora del mostrador.

    Es el camino del local: sin diálogo del navegador, sin elegir
    impresora, sin que nadie apriete nada más. El cajero cobra y el
    ticket sale.
  */
  const imprimirDirecto = useMutation({
    mutationFn: async () => {
      if (!c) return
      const destino = destinoDeImpresion(terminal, c.emisor)
      if (!destino) throw new Error('Esta computadora todavía no tiene impresora del mostrador.')
      await imprimirTicket(ticketEscPos(c, urlQr), destino)
    },
    onSuccess: () => {
      setErrorImpresora(null)
      marcarImpreso.mutate()
    },
    onError: (e) =>
      setErrorImpresora(e instanceof Error ? e.message : 'No se pudo imprimir el ticket.'),
  })

  function imprimir() {
    window.print()
    // Se registra aunque el usuario cancele el diálogo del navegador: no
    // hay forma confiable de saberlo, y un contador de más es mucho menos
    // grave que un comprobante que figura sin imprimir habiendo salido.
    marcarImpreso.mutate()
  }

  if (comprobante.isPending) return <p className="p-8 text-sm text-piedra-500">Cargando…</p>
  if (comprobante.isError || !c)
    return (
      <div className="p-8">
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          No se pudo cargar el comprobante.
        </p>
        <Link to="/facturacion" className="mt-3 inline-block text-sm text-marca-700 underline">
          Volver a Facturación
        </Link>
      </div>
    )

  const faltanDatos = !c.emisor.ingresos_brutos || !c.emisor.inicio_actividades

  // Por dónde saldría el ticket en esta máquina. Sin impresora
  // configurada el botón no aparece y queda el diálogo de impresión, que
  // es el camino que nunca puede faltar.
  const destino = destinoDeImpresion(terminal, c.emisor)

  return (
    <div className="min-h-full bg-piedra-100 py-6 print:bg-white print:py-0">
      {/* Barra de acciones: no sale impresa */}
      <div className="mx-auto mb-4 flex max-w-[21cm] items-center justify-between gap-3 px-4 print:hidden">
        <Link to="/facturacion" className="text-sm text-marca-700 hover:underline">
          ← Volver a Facturación
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 rounded-lg bg-piedra-100 p-1">
            <button
              onClick={() => elegirFormato('ticket')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                formato === 'ticket' ? 'bg-white text-tinta shadow-sm' : 'text-piedra-500 hover:text-tinta'
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
          {c.impresiones > 0 && (
            <span className="text-xs text-piedra-500">
              Impreso {c.impresiones} {c.impresiones === 1 ? 'vez' : 'veces'}
            </span>
          )}
          {enEscritorio && !!destino && (
            <button
              onClick={() => imprimirDirecto.mutate()}
              disabled={!c.cae || imprimirDirecto.isPending}
              className="rounded-lg bg-verde-600 px-4 py-2 text-sm font-medium text-white hover:bg-verde-500 disabled:opacity-40"
            >
              {imprimirDirecto.isPending ? 'Imprimiendo…' : 'Imprimir en el mostrador'}
            </button>
          )}
          <button
            onClick={imprimir}
            disabled={!c.cae}
            className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600 disabled:opacity-40"
          >
            Imprimir
          </button>
        </div>
      </div>

      {errorImpresora && (
        <div className="mx-auto mb-4 max-w-[21cm] px-4 print:hidden">
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            {errorImpresora} Se puede imprimir igual desde el navegador con el botón Imprimir.
          </p>
        </div>
      )}

      {faltanDatos && (
        <div className="mx-auto mb-4 max-w-[21cm] px-4 print:hidden">
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            Faltan datos obligatorios del encabezado (Ingresos Brutos y/o inicio de actividades).
            Cargalos en Configuración antes de entregar comprobantes reales.
          </p>
        </div>
      )}

      {!c.cae && (
        <div className="mx-auto mb-4 max-w-[21cm] px-4 print:hidden">
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            Este comprobante todavía no tiene CAE. Sin autorización de ARCA no se puede entregar.
          </p>
        </div>
      )}

      {/*
        El tamaño del papel se declara acá y no en el CSS global: es lo
        único que hace que el navegador no meta un ticket de 80 mm en el
        medio de una hoja A4 con tres cuartas partes en blanco.
      */}
      <style>
        {formato === 'ticket'
          ? '@page { size: 80mm auto; margin: 3mm 4mm; }'
          : '@page { size: A4; margin: 12mm; }'}
      </style>

      {formato === 'ticket' ? (
        <div className="mx-auto bg-white shadow-sm ring-1 ring-borde print:shadow-none print:ring-0">
          <TicketComprobante c={c} qr={qr} />
        </div>
      ) : (
        <Hoja c={c} qr={qr} />
      )}
    </div>
  )
}

function Hoja({ c, qr }: { c: ComprobanteCompleto; qr: string | null }) {
  const { esA, porcentajeDe, sinIva, codigo, identificado } = presentacionDe(c)

  return (
    <div className="mx-auto max-w-[21cm] bg-white p-8 text-[11px] leading-snug text-tinta shadow-sm ring-1 ring-borde print:max-w-none print:p-0 print:shadow-none print:ring-0">
      {/* ── Encabezado con la letra al medio, como toda factura argentina ── */}
      <div className="relative grid grid-cols-2 border-2 border-tinta">
        <div className="border-r-2 border-tinta p-4 pr-10">
          {c.emisor.logo ? (
            <img src={c.emisor.logo} alt="" className="mb-2 max-h-16 max-w-[55mm] object-contain" />
          ) : (
            <p className="text-lg font-bold">{c.emisor.nombre_fantasia || c.emisor.razon_social}</p>
          )}
          <dl className="mt-3 space-y-0.5">
            <Dato k="Razón social" v={c.emisor.razon_social} />
            <Dato k="Domicilio comercial" v={[c.emisor.domicilio, c.emisor.localidad].filter(Boolean).join(' — ')} />
            <Dato k="Condición frente al IVA" v="IVA Responsable Inscripto" />
            {c.emisor.telefono && <Dato k="Teléfono" v={c.emisor.telefono} />}
          </dl>
        </div>

        <div className="p-4 pl-10">
          <p className="text-lg font-bold">{c.tipo_descripcion}</p>
          <dl className="mt-3 space-y-0.5">
            <Dato
              k="Punto de Venta"
              v={`${String(c.punto_venta).padStart(5, '0')}    Comp. Nro: ${String(c.numero).padStart(8, '0')}`}
            />
            <Dato k="Fecha de emisión" v={new Date(`${c.fecha}T00:00:00`).toLocaleDateString('es-AR')} />
            <Dato k="CUIT" v={c.emisor.cuit} />
            <Dato k="Ingresos Brutos" v={c.emisor.ingresos_brutos || '—'} />
            <Dato k="Inicio de actividades" v={c.emisor.inicio_actividades || '—'} />
          </dl>
        </div>

        {/* La letra, en su recuadro, montada sobre la división */}
        <div className="absolute left-1/2 top-0 -translate-x-1/2 border-2 border-tinta bg-white px-4 pb-1 pt-0.5 text-center">
          <p className="text-3xl font-bold leading-none">{esA ? 'A' : c.clase}</p>
          <p className="text-[9px] leading-tight">COD. {codigo}</p>
        </div>
      </div>

      {/* ── Receptor ── */}
      <div className="mt-2 border-2 border-tinta p-3">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-0.5">
          <Dato
            k={identificado ? c.receptor_documento_sigla : 'Documento'}
            v={identificado ? c.receptor_documento! : 'Consumidor final sin identificar'}
          />
          <Dato k="Apellido y Nombre / Razón social" v={c.receptor_nombre} />
          <Dato k="Condición frente al IVA" v={c.receptor_condicion} />
          <Dato k="Domicilio" v={c.receptor_domicilio || '—'} />
        </dl>
      </div>

      {/* ── Detalle ── */}
      <table className="mt-2 w-full border-2 border-tinta">
        <thead>
          <tr className="border-b-2 border-tinta text-left">
            <th className="px-2 py-1 font-semibold">Código</th>
            <th className="px-2 py-1 font-semibold">Producto / Servicio</th>
            <th className="px-2 py-1 text-right font-semibold">Cantidad</th>
            <th className="px-2 py-1 text-right font-semibold">
              Precio Unit.{esA && <span className="font-normal"> (sin IVA)</span>}
            </th>
            {esA && <th className="px-2 py-1 text-right font-semibold">% IVA</th>}
            <th className="px-2 py-1 text-right font-semibold">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {c.lineas.map((l) => (
            <tr key={l.orden} className="align-top">
              <td className="px-2 py-0.5 font-mono">{l.codigo_producto}</td>
              <td className="px-2 py-0.5">{l.descripcion}</td>
              <td className="px-2 py-0.5 text-right tabular-nums">{numero.format(l.cantidad)}</td>
              <td className="px-2 py-0.5 text-right tabular-nums">
                {moneda.format(sinIva(l.precio_unitario, l.alicuota_iva_id))}
              </td>
              {esA && (
                <td className="px-2 py-0.5 text-right tabular-nums">
                  {porcentajeDe(l.alicuota_iva_id)}%
                </td>
              )}
              <td className="px-2 py-0.5 text-right tabular-nums">
                {moneda.format(sinIva(l.importe, l.alicuota_iva_id))}
              </td>
            </tr>
          ))}
          {c.lineas.length === 0 && (
            <tr>
              <td colSpan={esA ? 6 : 5} className="px-2 py-3 text-center text-piedra-400">
                Sin detalle de líneas.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* ── Totales ──
          En la Factura A se discrimina el IVA. En la B no se discrimina,
          pero el Régimen de Transparencia Fiscal (Ley 27.743) obliga a
          informar el IVA contenido y a poner la leyenda. */}
      <div className="mt-2 flex justify-end">
        <div className="w-80 border-2 border-tinta p-3">
          <dl className="space-y-0.5">
            {esA ? (
              <>
                <Total k="Subtotal" v={c.neto_gravado + c.exento + c.neto_no_gravado} />
                {c.exento > 0 && <Total k="Importe exento" v={c.exento} />}
                {c.alicuotas.map((a) => (
                  <Total key={a.alicuota_iva_id} k={`IVA ${a.porcentaje}%`} v={a.importe} />
                ))}
              </>
            ) : (
              <Total k="Subtotal" v={c.total - c.tributos_total} />
            )}

            {c.tributos.map((t, i) => (
              <Total key={i} k={`${t.descripcion} ${t.alicuota}%`} v={t.importe} />
            ))}

            <div className="mt-1 flex justify-between border-t-2 border-tinta pt-1 text-sm font-bold">
              <dt>Importe Total</dt>
              <dd className="tabular-nums">{moneda.format(c.total)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {!esA && (
        <div className="mt-2 border-2 border-tinta p-2">
          <div className="flex justify-between font-semibold">
            <span>Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)</span>
            <span className="tabular-nums">IVA Contenido: {moneda.format(c.iva_total)}</span>
          </div>
        </div>
      )}

      {/* ── Pie: QR y CAE ── */}
      <div className="mt-3 flex items-center gap-4 border-t-2 border-tinta pt-3">
        {qr ? (
          <img src={qr} alt="Código QR del comprobante" className="size-28 shrink-0" />
        ) : (
          <div className="grid size-28 shrink-0 place-items-center border border-dashed border-piedra-300 text-center text-[9px] text-piedra-400">
            Sin QR
          </div>
        )}
        <div className="flex-1">
          <p className="font-bold">ARCA — Comprobante Autorizado</p>
          <p className="text-[9px] text-piedra-500">
            Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación.
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold">
            {c.modalidad === 'caea' ? 'CAEA' : 'CAE'} N°:{' '}
            <span className="font-mono tabular-nums">{c.cae ?? '—'}</span>
          </p>
          <p className="font-semibold">
            Fecha de Vto.:{' '}
            {c.cae_vencimiento
              ? new Date(`${c.cae_vencimiento}T00:00:00`).toLocaleDateString('es-AR')
              : '—'}
          </p>
        </div>
      </div>
    </div>
  )
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-1">
      <dt className="shrink-0 font-semibold">{k}:</dt>
      <dd className="min-w-0">{v}</dd>
    </div>
  )
}

function Total({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex justify-between">
      <dt>{k}</dt>
      <dd className="tabular-nums">{moneda.format(v)}</dd>
    </div>
  )
}
