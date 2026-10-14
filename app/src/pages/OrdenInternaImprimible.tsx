import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { datosEmisor } from '@/lib/api/comprobante'
import { numeroDeOrden, obtenerOrden, porProveedor } from '@/lib/api/ordenesInternas'
import type { OrdenCompleta } from '@/lib/api/ordenesInternas'
import { numero } from '@/lib/tipos'
import { boton } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  La orden de compra interna, en papel

  Como el dibujo de Lucas del 08/10 —«más o menos como una factura»—:
  arriba al centro «Orden de compra interna», al costado el número y la
  fecha; dos cuadros, quién emite y quién recibe; la tabla con código,
  descripción, proveedor y cantidad; la observación y el cliente; y al
  pie la firma de quien la emite.

  Los renglones van agrupados por proveedor: «tanto de éste, tanto del
  otro», que es como la lee Compras. Va en A4 y fuera del menú, como el
  resumen de cuenta.
  ─────────────────────────────────────────────────────────────
*/

const fechaCorta = (f: string) => new Date(`${f}T00:00:00`).toLocaleDateString('es-AR')

export default function OrdenInternaImprimible() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const orden = useQuery({ queryKey: ['orden-interna', id], queryFn: () => obtenerOrden(id!), enabled: !!id })
  const emisor = useQuery({ queryKey: ['emisor'], queryFn: datosEmisor })
  const o = orden.data

  // El título es el nombre que propone el navegador al guardar el PDF.
  useEffect(() => {
    if (!o) return
    const anterior = document.title
    document.title = `Orden de compra interna ${numeroDeOrden(o.numero)}`
    return () => {
      document.title = anterior
    }
  }, [o])

  return (
    <div className="min-h-full bg-piedra-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[21cm] flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/compras/ordenes'))}
          className="text-sm text-marca-700 hover:underline"
        >
          ← Volver
        </button>
        <button onClick={() => window.print()} disabled={!o} className={boton.principal}>
          Imprimir o guardar PDF
        </button>
      </div>

      <style>{'@page { size: A4; margin: 12mm; }'}</style>

      {orden.isPending ? (
        <Aviso texto="Armando la orden…" />
      ) : orden.isError || !o ? (
        <Aviso texto="No se encontró la orden, o hace falta conexión con el servidor." />
      ) : (
        <Hoja o={o} emisor={emisor.data ?? {}} />
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

function Hoja({ o, emisor }: { o: OrdenCompleta; emisor: Record<string, string> }) {
  const grupos = porProveedor(o.lineas)

  return (
    <div className="mx-auto max-w-[21cm] bg-white p-8 text-[12px] leading-snug text-tinta shadow-sm ring-1 ring-borde print:max-w-none print:p-0 print:shadow-none print:ring-0">
      {/* ── Encabezado: quién, qué es, número y fecha ── */}
      {/* En el celular se apila; en la hoja A4 va en tres columnas, como el dibujo. */}
      <div className="grid grid-cols-1 items-center gap-3 border-2 border-tinta p-4 text-center sm:grid-cols-[1fr_auto_1fr] sm:gap-4 sm:text-left">
        <div className="min-w-0 justify-self-center sm:justify-self-start">
          {emisor.logo ? (
            <img src={emisor.logo} alt="" className="max-h-12 max-w-[45mm] object-contain" />
          ) : (
            <p className="font-bold">{emisor.nombre_fantasia || emisor.razon_social}</p>
          )}
        </div>
        <p className="border-2 border-tinta px-4 py-2 text-center text-base font-bold tracking-wide uppercase">
          Orden de compra interna
        </p>
        <dl className="justify-self-center sm:justify-self-end sm:text-right">
          <div>
            <dt className="inline font-semibold">N° </dt>
            <dd className="inline font-mono text-base font-bold">{numeroDeOrden(o.numero)}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">Fecha: </dt>
            <dd className="inline">{fechaCorta(o.fecha)}</dd>
          </div>
        </dl>
      </div>

      {/* ── Emite y recibe ── */}
      <div className="grid grid-cols-2 border-x-2 border-b-2 border-tinta">
        <div className="border-r-2 border-tinta p-3">
          <p className="text-[10px] font-semibold tracking-wide text-piedra-600 uppercase">Emite</p>
          <p className="text-base font-semibold">{o.emite}</p>
        </div>
        <div className="p-3">
          <p className="text-[10px] font-semibold tracking-wide text-piedra-600 uppercase">Recibe</p>
          <p className="text-base font-semibold">{o.recibe}</p>
        </div>
      </div>

      {o.estado === 'anulada' && (
        <p className="mt-3 border-2 border-red-700 p-2 text-center font-bold text-red-700 uppercase">
          Anulada{o.motivo_anulacion ? `: ${o.motivo_anulacion}` : ''}
        </p>
      )}

      {/* ── Lo que hay que comprar ── */}
      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="border-y-2 border-tinta text-left">
            <th className="w-28 py-1.5 pr-2 font-semibold">Código</th>
            <th className="py-1.5 pr-2 font-semibold">Descripción</th>
            <th className="w-44 py-1.5 pr-2 font-semibold">Proveedor</th>
            <th className="w-20 py-1.5 text-right font-semibold">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) =>
            g.lineas.map((l, i) => (
              <tr
                key={`${g.proveedor ?? 'sin'}-${l.renglon}`}
                className={`border-b border-piedra-200 ${i === g.lineas.length - 1 ? 'border-b-tinta' : ''}`}
              >
                <td className="py-1.5 pr-2 font-mono text-[11px]">{l.codigo ?? '—'}</td>
                <td className="py-1.5 pr-2">{l.descripcion}</td>
                <td className="py-1.5 pr-2">{i === 0 ? (g.proveedor ?? 'Sin proveedor') : ''}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{numero.format(l.cantidad)}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>

      {/* ── Observación y cliente ── */}
      <div className="mt-4 space-y-1">
        <p>
          <span className="font-semibold">Observación: </span>
          {o.observacion || '—'}
        </p>
        {(o.cliente || o.contacto) && (
          <p>
            <span className="font-semibold">Para el cliente: </span>
            {[o.cliente, o.contacto].filter(Boolean).join(' · ')}
          </p>
        )}
        <p className="text-[10px] text-piedra-500">La cargó {o.creada_por ?? '—'} en el sistema.</p>
      </div>

      {/* ── Firma de quien la emite, como en el dibujo ── */}
      <div className="mt-16 w-64 text-center">
        <div className="border-t border-tinta pt-1">Firma y aclaración del responsable</div>
        <p className="text-[10px] text-piedra-500">{o.emite}</p>
      </div>
    </div>
  )
}
