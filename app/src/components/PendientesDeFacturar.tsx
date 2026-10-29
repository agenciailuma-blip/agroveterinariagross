import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTerminal } from '@/lib/terminal'
import {
  agruparLineas,
  agruparPorCliente,
  facturarRemitosInternos,
  lineasDeRemitos,
  remitosPorFacturar,
} from '@/lib/api/remitoInterno'
import type { RemitoPorFacturar } from '@/lib/api/remitoInterno'
import { emitirEnServidor, numeroNoFiscal } from '@/lib/api/noFiscal'
import { leerImporte } from '@/lib/api/recibos'
import { mandarSolaACuentaCorriente } from '@/lib/api/facturaPorMail'
import { abrirNoFiscal } from '@/lib/escritorio'
import { moneda, numero } from '@/lib/tipos'
import { botonChico, campo, tarjeta } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  Pendientes de facturar

  Los remitos internos: la mercadería ya salió y descontó stock, falta
  el precio. Se eligen uno o varios remitos del mismo cliente, se pone
  el precio de cada producto y sale una factura o un comprobante interno
  a cuenta corriente, con su vencimiento.

  Vienen marcados todos los del cliente, como en Por facturar. Se
  desmarca lo que no va.
  ─────────────────────────────────────────────────────────────
*/

const fecha = (dia: string) => new Date(`${dia}T12:00:00`).toLocaleDateString('es-AR')

export default function PendientesDeFacturar({
  puedeFactura,
  puedeInterno,
  onAviso,
  onError,
}: {
  puedeFactura: boolean
  puedeInterno: boolean
  onAviso: (texto: string) => void
  onError: (texto: string) => void
}) {
  const pendientes = useQuery({ queryKey: ['remitos-por-facturar'], queryFn: () => remitosPorFacturar() })
  const [fuera, setFuera] = useState<Set<string>>(new Set())
  const [poniendoPrecios, setPoniendoPrecios] = useState<{ cliente: string; remitos: RemitoPorFacturar[] } | null>(null)

  const clientes = agruparPorCliente(pendientes.data ?? [])
  if (!clientes.length) return null

  const alternar = (id: string) =>
    setFuera((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <div className={`${tarjeta} overflow-hidden`}>
      <div className="border-b border-borde bg-piedra-50 px-5 py-3">
        <p className="font-medium text-tinta">Pendientes de facturar</p>
        <p className="text-xs text-piedra-500">
          Remitos internos: la mercadería ya salió, falta el precio. Se facturan de a uno o varios
          juntos en un solo comprobante.
        </p>
      </div>

      <div className="divide-y divide-borde">
        {clientes.map((c) => {
          const elegidos = c.remitos.filter((r) => !fuera.has(r.id))
          return (
            <div key={c.cliente_id} className="px-5 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-tinta">{c.cliente}</p>
                <p className="text-xs text-piedra-500">
                  {c.remitos.length} {c.remitos.length === 1 ? 'remito' : 'remitos'}
                </p>
              </div>

              <ul className="mt-2 space-y-1 text-sm">
                {c.remitos.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <input
                      type="checkbox"
                      checked={!fuera.has(r.id)}
                      onChange={() => alternar(r.id)}
                      aria-label={`Incluir el remito ${r.serie}-${r.numero}`}
                    />
                    <span className="font-mono text-xs text-piedra-400">
                      {numeroNoFiscal('remito', r.serie, r.numero)}
                    </span>
                    <span className="text-xs text-piedra-500">{fecha(r.fecha)}</span>
                    <span className={`text-xs ${r.dias > 7 ? 'text-amber-700' : 'text-piedra-400'}`}>
                      {r.dias === 0 ? 'hoy' : r.dias === 1 ? 'hace 1 día' : `hace ${r.dias} días`}
                    </span>
                    <span className="ml-auto text-xs text-tinta tabular-nums">
                      {numero.format(r.unidades)} u.
                    </span>
                  </li>
                ))}
              </ul>

              {(puedeFactura || puedeInterno) && (
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={() => setPoniendoPrecios({ cliente: c.cliente, remitos: elegidos })}
                    disabled={!elegidos.length}
                    className={botonChico.principal}
                  >
                    {elegidos.length > 1 ? `Poner precios a ${elegidos.length} remitos` : 'Poner precios'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {poniendoPrecios && (
        <PonerPrecios
          cliente={poniendoPrecios.cliente}
          remitos={poniendoPrecios.remitos}
          puedeFactura={puedeFactura}
          puedeInterno={puedeInterno}
          onCerrar={() => setPoniendoPrecios(null)}
          onListo={(texto, error) => {
            setPoniendoPrecios(null)
            if (error) onError(error)
            else onAviso(texto)
          }}
          onAviso={onAviso}
        />
      )}
    </div>
  )
}

function PonerPrecios({
  cliente,
  remitos,
  puedeFactura,
  puedeInterno,
  onCerrar,
  onListo,
  onAviso,
}: {
  cliente: string
  remitos: RemitoPorFacturar[]
  puedeFactura: boolean
  puedeInterno: boolean
  onCerrar: () => void
  onListo: (texto: string, error?: string) => void
  onAviso: (texto: string) => void
}) {
  const qc = useQueryClient()
  const { terminal } = useTerminal()
  const ids = remitos.map((r) => r.id)
  const lineas = useQuery({ queryKey: ['lineas-de-remitos', ids], queryFn: () => lineasDeRemitos(ids) })
  const productos = agruparLineas(lineas.data ?? [])

  // Lo escrito, por producto. Lo que no se tocó vale el precio sugerido.
  const [escritos, setEscritos] = useState<Record<string, string>>({})
  const [documentacion, setDocumentacion] = useState<'fiscal' | 'no_fiscal'>(puedeFactura ? 'fiscal' : 'no_fiscal')
  const [error, setError] = useState<string | null>(null)

  const texto = (id: string, sugerido: number) => escritos[id] ?? (sugerido > 0 ? String(sugerido).replace('.', ',') : '')
  const precios = Object.fromEntries(productos.map((p) => [p.producto_id, leerImporte(texto(p.producto_id, p.sugerido))]))
  const faltan = productos.filter((p) => precios[p.producto_id] == null)
  const total = productos.reduce((s, p) => s + p.cantidad * (precios[p.producto_id] ?? 0), 0)
  const numeros = remitos.map((r) => numeroNoFiscal('remito', r.serie, r.numero)).join(', ')

  const facturar = useMutation({
    mutationFn: async () => {
      const r = await facturarRemitosInternos(ids, precios as Record<string, number>, documentacion)
      if (documentacion === 'no_fiscal') {
        const interno = await emitirEnServidor(r.ventaId, 'comprobante_interno', terminal?.id ?? null, {
          serie: terminal?.prefijo ?? null,
          observaciones: `Remito interno ${numeros}`,
        })
        abrirNoFiscal(interno.id)
        return { texto: `${cliente}: a la cuenta corriente, con comprobante interno.`, problema: null, comprobanteId: null }
      }
      if (r.problema) return { texto: '', problema: r.problema, comprobanteId: null }
      return { texto: `Factura autorizada por ARCA. CAE ${r.cae}`, problema: null, comprobanteId: r.comprobanteId }
    },
    onSuccess: ({ texto, problema, comprobanteId }) => {
      qc.invalidateQueries({ queryKey: ['remitos-por-facturar'] })
      qc.invalidateQueries({ queryKey: ['comprobantes'] })
      qc.invalidateQueries({ queryKey: ['movimientos-cc'] })
      if (problema) {
        onListo('', `La factura quedó armada, pero ARCA no la autorizó todavía: ${problema} Se puede reintentar desde la lista de abajo.`)
        return
      }
      onListo(texto)
      if (comprobanteId) {
        void mandarSolaACuentaCorriente(comprobanteId).then((mail) => {
          if (mail) onAviso(`${texto} ${mail}`)
        })
      }
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo facturar.'),
  })

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-tinta/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-bold text-tinta">Precios para {cliente}</h2>
        <p className="mt-1 text-xs break-words text-piedra-500">{numeros}</p>

        {lineas.isPending ? (
          <p className="mt-4 text-sm text-piedra-400">Cargando los productos…</p>
        ) : lineas.isError ? (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {lineas.error.message}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-borde">
            {productos.map((p) => {
              const precio = precios[p.producto_id]
              return (
                <li key={p.producto_id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-2">
                  <div className="min-w-0">
                    <p className="text-sm break-words text-tinta">{p.descripcion}</p>
                    <p className="text-xs text-piedra-400">
                      {p.codigo} · {numero.format(p.cantidad)} u.
                      {p.sugerido > 0 && ` · lista ${moneda.format(p.sugerido)}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <input
                      value={texto(p.producto_id, p.sugerido)}
                      onChange={(e) => setEscritos((s) => ({ ...s, [p.producto_id]: e.target.value }))}
                      inputMode="decimal"
                      aria-label={`Precio de ${p.descripcion}`}
                      className={`${campo} w-28 text-right tabular-nums ${precio == null ? 'border-red-300' : ''}`}
                    />
                    <p className="mt-0.5 text-xs text-piedra-500 tabular-nums">
                      {precio != null ? moneda.format(p.cantidad * precio) : 'falta'}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-3 flex items-baseline justify-between border-t border-borde pt-3">
          <span className="font-medium text-tinta">Total</span>
          <span className="text-xl font-semibold text-tinta tabular-nums">{moneda.format(total)}</span>
        </div>
        <p className="text-[11px] text-piedra-400">
          Precios con IVA. Si al cliente le corresponde percepción de IIBB, se suma al facturar.
        </p>

        {puedeFactura && puedeInterno && (
          <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Con qué sale">
            {(['fiscal', 'no_fiscal'] as const).map((d) => (
              <button
                key={d}
                role="radio"
                aria-checked={documentacion === d}
                onClick={() => setDocumentacion(d)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ${
                  documentacion === d ? 'bg-marca-700 text-white ring-marca-700' : 'text-piedra-600 ring-borde hover:bg-piedra-50'
                }`}
              >
                {d === 'fiscal' ? 'Factura' : 'Comprobante interno'}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            onClick={onCerrar}
            disabled={facturar.isPending}
            className="rounded-lg px-4 py-2 text-sm font-medium text-piedra-600 ring-1 ring-borde hover:bg-piedra-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              setError(null)
              facturar.mutate()
            }}
            disabled={!productos.length || faltan.length > 0 || facturar.isPending}
            className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600 disabled:opacity-40"
          >
            {facturar.isPending
              ? 'Facturando…'
              : documentacion === 'fiscal'
                ? `Facturar ${moneda.format(total)}`
                : `Comprobante interno ${moneda.format(total)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
