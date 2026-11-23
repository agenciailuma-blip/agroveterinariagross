import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ALICUOTAS,
  NOMBRE_NOTA,
  buscarFacturasParaNota,
  emitirNotaManual,
  faltaEnNota,
  totalesDeNota,
  type FamiliaNota,
  type NotaEmitida,
  type RenglonNota,
} from '@/lib/api/notasManuales'
import { buscarClientes, type ClienteVenta } from '@/lib/api/ventas'
import { enCastellano } from '@/lib/errores'
import { imprimirOAbrirComprobante } from '@/lib/comprobante/imprimirDirecto'
import { useTerminal } from '@/lib/terminal'
import { avanzarConEnter } from '@/lib/teclado'
import { boton, campo } from '@/estilos'
import { moneda } from '@/lib/tipos'

/*
  La ventana de una nota de crédito o débito escrita a mano.

  Sin factura (libre): se elige el cliente. Asociada: se elige la
  factura, y de ella salen el cliente, la letra y el punto de venta.
  Abierta desde una factura, ya viene asociada a esa.
*/

export interface FacturaElegida {
  id: string
  /** «Factura A 00001-00000016». */
  etiqueta: string
  receptor: string
  total: number
}

interface RenglonEnPantalla {
  clave: string
  descripcion: string
  importe: string
  alicuota: string // id, o '' para exento
}

function renglonVacio(): RenglonEnPantalla {
  return { clave: crypto.randomUUID(), descripcion: '', importe: '', alicuota: '5' }
}

function paraCalcular(r: RenglonEnPantalla): RenglonNota {
  return {
    descripcion: r.descripcion,
    importe: Number(r.importe.replace(',', '.')) || 0,
    alicuota_iva_id: r.alicuota === '' ? null : Number(r.alicuota),
  }
}

export default function NuevaNotaManual({
  familia,
  factura: facturaFija,
  onCerrar,
}: {
  familia: FamiliaNota
  factura?: FacturaElegida
  onCerrar: () => void
}) {
  const qc = useQueryClient()
  const navegar = useNavigate()
  const { terminal } = useTerminal()
  // Una por nota: si se corta la conexión y se aprieta de nuevo, es la misma nota.
  const [notaId] = useState(() => crypto.randomUUID())
  const [asociada, setAsociada] = useState(!!facturaFija)
  const [cliente, setCliente] = useState<ClienteVenta | null>(null)
  const [factura, setFactura] = useState<FacturaElegida | null>(facturaFija ?? null)
  const [buscar, setBuscar] = useState('')
  // Se busca un cuarto de segundo después de la última tecla, no letra por letra.
  const [buscarDiferido, setBuscarDiferido] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setBuscarDiferido(buscar), 250)
    return () => clearTimeout(t)
  }, [buscar])
  const [renglones, setRenglones] = useState<RenglonEnPantalla[]>([renglonVacio()])
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<NotaEmitida | null>(null)

  const nombre = NOMBRE_NOTA[familia]
  const eligiendo = asociada ? !factura : !cliente

  const clientes = useQuery({
    queryKey: ['nota-clientes', buscarDiferido],
    queryFn: () => buscarClientes(buscarDiferido),
    enabled: !asociada && !cliente,
  })
  const facturas = useQuery({
    queryKey: ['nota-facturas', buscarDiferido],
    queryFn: () => buscarFacturasParaNota(buscarDiferido),
    enabled: asociada && !factura,
  })

  const calculables = renglones.map(paraCalcular)
  const t = totalesDeNota(calculables)
  const falta = faltaEnNota({
    asociada,
    clienteId: cliente?.id ?? null,
    facturaId: factura?.id ?? null,
    renglones: calculables,
    motivo,
  })

  const emitir = useMutation({
    mutationFn: () =>
      emitirNotaManual({
        id: notaId,
        familia,
        clienteId: asociada ? null : (cliente?.id ?? null),
        facturaId: asociada ? (factura?.id ?? null) : null,
        renglones: calculables,
        motivo,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['buscar-comprobantes'] })
      qc.invalidateQueries({ queryKey: ['comprobantes'] })
      qc.invalidateQueries({ queryKey: ['movimientos-cc'] })
      /*
        Autorizada, sale sola por la impresora del mostrador, como la
        factura (pedido de Gross, 23/11). Sin impresora en esta PC, o si
        falla, se abre la nota para imprimirla a mano.
      */
      if (r.cae) void imprimirOAbrirComprobante(r.id, terminal)
      setResultado(r)
    },
    onError: (e) => setError(enCastellano(e, 'No se pudo emitir la nota.')),
  })

  function cambiarRenglon(clave: string, cambios: Partial<RenglonEnPantalla>) {
    setRenglones((rs) => rs.map((r) => (r.clave === clave ? { ...r, ...cambios } : r)))
  }

  if (resultado) {
    return (
      <Marco>
        {resultado.cae ? (
          <>
            <h2 className="font-semibold text-tinta">{nombre} emitida</h2>
            <p className="mt-3 rounded-lg bg-verde-50 px-3 py-2 text-sm text-verde-800 ring-1 ring-verde-200">
              Autorizada por ARCA. CAE {resultado.cae}
            </p>
          </>
        ) : (
          <>
            <h2 className="font-semibold text-tinta">{nombre} armada</h2>
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
              ARCA no la autorizó todavía: {resultado.problema} Se puede reintentar desde Comprobantes → Facturación.
            </p>
          </>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button onClick={onCerrar} className={boton.suave}>
            Cerrar
          </button>
          <button onClick={() => navegar(`/comprobante/${resultado.id}`)} className={boton.principal}>
            {resultado.cae ? 'Ver o reimprimir' : 'Ver la nota'}
          </button>
        </div>
      </Marco>
    )
  }

  return (
    <Marco>
      <div onKeyDown={avanzarConEnter}>
        <h2 className="font-semibold text-tinta">Nueva {nombre.toLowerCase()}</h2>

        {!facturaFija && (
          <div className="mt-3 flex gap-1 rounded-lg bg-piedra-100 p-1 text-sm">
            {[
              { valor: false, texto: 'Sin factura' },
              { valor: true, texto: 'Asociada a una factura' },
            ].map((o) => (
              <button
                key={o.texto}
                type="button"
                onClick={() => {
                  setAsociada(o.valor)
                  setBuscar('')
                }}
                className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${
                  asociada === o.valor ? 'bg-white text-tinta shadow-sm' : 'text-piedra-500 hover:text-tinta'
                }`}
              >
                {o.texto}
              </button>
            ))}
          </div>
        )}

        {/* ── A quién ── */}
        <div className="mt-4">
          {asociada && factura ? (
            <Elegido
              titulo={factura.etiqueta}
              detalle={`${factura.receptor} · ${moneda.format(factura.total)}`}
              onCambiar={facturaFija ? undefined : () => setFactura(null)}
            />
          ) : !asociada && cliente ? (
            <Elegido
              titulo={cliente.nombre}
              detalle={[
                cliente.numero_documento,
                cliente.cuenta_corriente
                  ? familia === 'nota_credito'
                    ? 'le resta a su cuenta corriente'
                    : 'le suma a su cuenta corriente'
                  : 'sin cuenta corriente',
              ]
                .filter(Boolean)
                .join(' · ')}
              onCambiar={() => setCliente(null)}
            />
          ) : (
            <>
              <input
                autoFocus
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder={asociada ? 'Número de factura o cliente' : 'Cliente: nombre, CUIT o código'}
                className={campo}
              />
              <ul className="mt-1 max-h-52 divide-y divide-piedra-100 overflow-y-auto rounded-lg ring-1 ring-borde">
                {asociada
                  ? (facturas.data ?? []).map((f) => (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setFactura({
                              id: f.id,
                              etiqueta: `${f.tipo} ${f.comprobante}`,
                              receptor: f.receptor_nombre,
                              total: f.total,
                            })
                          }
                          className="flex w-full flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-left text-sm hover:bg-marca-50"
                        >
                          <span className="min-w-0">
                            <span className="font-medium text-tinta">{f.tipo} {f.comprobante}</span>
                            <span className="block truncate text-xs text-piedra-500">
                              {f.receptor_nombre} · {f.fecha.split('-').reverse().join('/')}
                            </span>
                          </span>
                          <span className="tabular-nums text-piedra-700">{moneda.format(f.total)}</span>
                        </button>
                      </li>
                    ))
                  : (clientes.data ?? []).map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setCliente(c)}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-marca-50"
                        >
                          <span className="font-medium text-tinta">{c.nombre}</span>
                          {c.numero_documento && <span className="ml-2 text-xs text-piedra-500">{c.numero_documento}</span>}
                        </button>
                      </li>
                    ))}
                {(asociada ? facturas : clientes).isFetching && (
                  <li className="px-3 py-2 text-xs text-piedra-400">Buscando…</li>
                )}
                {!(asociada ? facturas : clientes).isFetching &&
                  ((asociada ? facturas.data : clientes.data) ?? []).length === 0 && (
                    <li className="px-3 py-2 text-xs text-piedra-400">
                      {asociada ? 'No hay facturas autorizadas con esa búsqueda.' : 'No hay clientes con esa búsqueda.'}
                    </li>
                  )}
              </ul>
            </>
          )}
        </div>

        {/* ── Renglones ── */}
        {!eligiendo && (
          <>
            <div className="mt-4 space-y-2">
              {renglones.map((r, i) => (
                <div key={r.clave} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg bg-piedra-50 p-2 sm:grid-cols-[1fr_8rem_6rem_auto] sm:bg-transparent sm:p-0">
                  <input
                    value={r.descripcion}
                    onChange={(e) => cambiarRenglon(r.clave, { descripcion: e.target.value })}
                    placeholder={i === 0 ? (familia === 'nota_credito' ? 'Ej.: Bonificación' : 'Ej.: Intereses por mora') : 'Descripción'}
                    aria-label="Descripción"
                    className={`${campo} col-span-2 sm:col-span-1`}
                    autoFocus={i === 0}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={r.importe}
                    onChange={(e) => cambiarRenglon(r.clave, { importe: e.target.value })}
                    placeholder="Importe"
                    aria-label="Importe con IVA"
                    className={`${campo} min-w-0 text-right tabular-nums`}
                  />
                  <select
                    value={r.alicuota}
                    onChange={(e) => cambiarRenglon(r.clave, { alicuota: e.target.value })}
                    aria-label="IVA"
                    className={`${campo} min-w-0`}
                  >
                    {ALICUOTAS.map((a) => (
                      <option key={a.etiqueta} value={a.id ?? ''}>
                        {a.etiqueta}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setRenglones((rs) => (rs.length > 1 ? rs.filter((x) => x.clave !== r.clave) : rs))}
                    disabled={renglones.length === 1}
                    className="col-span-2 rounded-lg px-2 py-1 text-xs text-piedra-500 hover:bg-piedra-100 disabled:opacity-30 sm:col-span-1"
                    aria-label="Quitar renglón"
                  >
                    Quitar
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setRenglones((rs) => [...rs, renglonVacio()])} className="text-sm font-medium text-marca-700 hover:underline">
                + Otro renglón
              </button>
            </div>
            <p className="mt-1 text-xs text-piedra-500">Importes con IVA incluido.</p>

            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-medium text-piedra-600">Motivo</span>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                className={campo}
              />
            </label>

            <dl className="mt-4 space-y-0.5 text-sm">
              {t.neto > 0 && <Fila etiqueta="Neto gravado" valor={t.neto} />}
              {t.iva > 0 && <Fila etiqueta="IVA" valor={t.iva} />}
              {t.exento > 0 && <Fila etiqueta="Exento" valor={t.exento} />}
              <div className="flex justify-between border-t border-borde pt-1 font-semibold text-tinta">
                <dt>Total</dt>
                <dd className="tabular-nums">{moneda.format(t.total)}</dd>
              </div>
            </dl>
          </>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {!eligiendo && falta && <p className="mr-auto text-xs text-piedra-500">{falta}</p>}
          <button type="button" onClick={onCerrar} className={boton.suave}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null)
              emitir.mutate()
            }}
            disabled={!!falta || emitir.isPending}
            className={boton.principal}
          >
            {emitir.isPending ? 'Emitiendo…' : `Emitir ${nombre.toLowerCase()}`}
          </button>
        </div>
      </div>
    </Marco>
  )
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-tinta/50 p-4">
      <div className="mx-auto my-8 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl sm:p-6">{children}</div>
    </div>
  )
}

function Elegido({ titulo, detalle, onCambiar }: { titulo: string; detalle: string; onCambiar?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-piedra-50 px-3 py-2 ring-1 ring-borde">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-tinta">{titulo}</p>
        <p className="truncate text-xs text-piedra-500">{detalle}</p>
      </div>
      {onCambiar && (
        <button type="button" onClick={onCambiar} className="text-xs font-medium text-marca-700 hover:underline">
          Cambiar
        </button>
      )}
    </div>
  )
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="flex justify-between text-piedra-600">
      <dt>{etiqueta}</dt>
      <dd className="tabular-nums">{moneda.format(valor)}</dd>
    </div>
  )
}
