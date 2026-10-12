import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { datosEmisor } from '@/lib/api/comprobante'
import { bultosDe, numeroDePedido, obtenerPedido } from '@/lib/api/pedidosProveedor'
import type { PedidoCompleto } from '@/lib/api/pedidosProveedor'
import { numero } from '@/lib/tipos'
import { boton } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  El pedido a proveedor, en papel

  Lo que se le manda al proveedor: quién pide, a quién, y qué y cuánto.
  Sin precios: son los de Gross, y el proveedor tiene los suyos. Con los
  bultos, si se saben, porque así cuenta él. Va en A4 y fuera del menú,
  como la orden interna.
  ─────────────────────────────────────────────────────────────
*/

const fechaCorta = (f: string) => new Date(`${f}T00:00:00`).toLocaleDateString('es-AR')

export default function PedidoProveedorImprimible() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const pedido = useQuery({ queryKey: ['pedido-proveedor', id], queryFn: () => obtenerPedido(id!), enabled: !!id })
  const emisor = useQuery({ queryKey: ['emisor'], queryFn: datosEmisor })
  const p = pedido.data

  // El título es el nombre que propone el navegador al guardar el PDF.
  useEffect(() => {
    if (!p) return
    const anterior = document.title
    document.title = `Pedido ${numeroDePedido(p.numero)} - ${p.proveedor}`
    return () => {
      document.title = anterior
    }
  }, [p])

  return (
    <div className="min-h-full bg-piedra-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[21cm] flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/compras/pedidos'))}
          className="text-sm text-marca-700 hover:underline"
        >
          ← Volver
        </button>
        <button onClick={() => window.print()} disabled={!p} className={boton.principal}>
          Imprimir o guardar PDF
        </button>
      </div>

      <style>{'@page { size: A4; margin: 12mm; }'}</style>

      {pedido.isPending ? (
        <Aviso texto="Armando el pedido…" />
      ) : pedido.isError || !p ? (
        <Aviso texto="No se encontró el pedido, o hace falta conexión con el servidor." />
      ) : (
        <Hoja p={p} emisor={emisor.data ?? {}} />
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

function Hoja({ p, emisor }: { p: PedidoCompleto; emisor: Record<string, string> }) {
  const conBultos = p.lineas.some((l) => l.unidades_por_bulto)

  return (
    <div className="mx-auto max-w-[21cm] bg-white p-8 text-[12px] leading-snug text-tinta shadow-sm ring-1 ring-borde print:max-w-none print:p-0 print:shadow-none print:ring-0">
      {/* En el celular se apila; en la hoja A4 va en tres columnas, como la orden interna. */}
      <div className="grid grid-cols-1 items-center gap-3 border-2 border-tinta p-4 text-center sm:grid-cols-[1fr_auto_1fr] sm:gap-4 sm:text-left">
        <div className="min-w-0 justify-self-center sm:justify-self-start">
          {emisor.logo ? (
            <img src={emisor.logo} alt="" className="max-h-12 max-w-[45mm] object-contain" />
          ) : (
            <p className="font-bold">{emisor.nombre_fantasia || emisor.razon_social}</p>
          )}
        </div>
        <p className="border-2 border-tinta px-4 py-2 text-center text-base font-bold tracking-wide uppercase">
          Nota de pedido
        </p>
        <dl className="justify-self-center sm:justify-self-end sm:text-right">
          <div>
            <dt className="inline font-semibold">N° </dt>
            <dd className="inline font-mono text-base font-bold">{numeroDePedido(p.numero)}</dd>
          </div>
          <div>
            <dt className="inline font-semibold">Fecha: </dt>
            <dd className="inline">{fechaCorta(p.fecha)}</dd>
          </div>
        </dl>
      </div>

      {/* ── Quién pide y a quién ── */}
      <div className="grid grid-cols-1 border-x-2 border-b-2 border-tinta sm:grid-cols-2">
        <div className="border-b-2 border-tinta p-3 sm:border-r-2 sm:border-b-0">
          <p className="text-[10px] font-semibold tracking-wide text-piedra-600 uppercase">Pide</p>
          <p className="text-base font-semibold">{emisor.nombre_fantasia || emisor.razon_social}</p>
          {emisor.razon_social && emisor.nombre_fantasia && <p>{emisor.razon_social}</p>}
          {emisor.cuit && <p>CUIT {emisor.cuit}</p>}
          {emisor.domicilio && <p>{emisor.domicilio}</p>}
          {emisor.telefono && <p>Tel. {emisor.telefono}</p>}
        </div>
        <div className="p-3">
          <p className="text-[10px] font-semibold tracking-wide text-piedra-600 uppercase">Proveedor</p>
          <p className="text-base font-semibold">{p.proveedor}</p>
          {p.proveedor_cuit && <p>CUIT {p.proveedor_cuit}</p>}
          {(p.proveedor_contacto || p.proveedor_telefono) && (
            <p>{[p.proveedor_contacto, p.proveedor_telefono].filter(Boolean).join(' · ')}</p>
          )}
          {p.proveedor_email && <p>{p.proveedor_email}</p>}
        </div>
      </div>

      {p.estado === 'anulado' && (
        <p className="mt-3 border-2 border-red-700 p-2 text-center font-bold text-red-700 uppercase">
          Anulado{p.motivo_anulacion ? `: ${p.motivo_anulacion}` : ''}
        </p>
      )}

      {/* ── Lo que se pide ── */}
      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="border-y-2 border-tinta text-left">
            <th className="w-24 py-1.5 pr-2 font-semibold">Código</th>
            <th className="py-1.5 pr-2 font-semibold">Descripción</th>
            <th className="w-20 py-1.5 pr-2 text-right font-semibold">Cantidad</th>
            {conBultos && <th className="w-16 py-1.5 text-right font-semibold">Bultos</th>}
          </tr>
        </thead>
        <tbody>
          {p.lineas.map((l) => {
            const bultos = bultosDe(l.cantidad, l.unidades_por_bulto)
            return (
              <tr key={l.renglon} className="border-b border-piedra-200">
                <td className="py-1.5 pr-2 font-mono text-[11px]">{l.codigo ?? '—'}</td>
                <td className="py-1.5 pr-2">{l.descripcion}</td>
                <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">{numero.format(l.cantidad)}</td>
                {conBultos && (
                  <td className="py-1.5 text-right tabular-nums">{bultos != null ? numero.format(bultos) : '—'}</td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="mt-4 space-y-1">
        <p>
          <span className="font-semibold">Observación: </span>
          {p.observacion || '—'}
        </p>
        <p className="text-[10px] text-piedra-500">Lo cargó {p.creado_por ?? '—'} en el sistema.</p>
      </div>

      <div className="mt-16 w-64 text-center">
        <div className="border-t border-tinta pt-1">Firma y aclaración</div>
        <p className="text-[10px] text-piedra-500">{emisor.nombre_fantasia || emisor.razon_social}</p>
      </div>
    </div>
  )
}
