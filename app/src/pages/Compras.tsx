import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { confirmar } from '@/components/Dialogo'
import {
  alicuotasDeIva,
  anularCompra,
  ivaSugerido,
  listarCompras,
  numeroDeComprobante,
  registrarCompra,
  tiposParaCompra,
  totalDeLaCarga,
} from '@/lib/api/compras'
import type { AlicuotaCargada, TributoCargado } from '@/lib/api/compras'
import { listarProveedores } from '@/lib/api/proveedores'
import { enCastellano } from '@/lib/errores'
import { moneda } from '@/lib/tipos'
import { boton, campo } from '@/estilos'

/*
  Las facturas de compra.

  Se carga lo que dice el papel: quién la emitió, cuál es, cuándo, y el
  desglose por alícuota. Nada de líneas de producto — eso es recepción de
  mercadería y es de V1-B.

  La pantalla está armada para que se pueda cargar mirando la factura y
  sin levantar la vista: los campos van en el mismo orden en el que están
  impresos, y el total se arma solo abajo para compararlo con el del
  papel antes de guardar.
*/


const hoy = () => new Date().toISOString().slice(0, 10)

/*
  Los conceptos que puede traer una factura de compra además del IVA.

  Salen de la pantalla que usan hoy en OBTech, donde son columnas fijas:
  Percep. IVA, Ing. Brutos, Ret. Ganancias e Impuestos Internos. Acá van
  como lista y no como columnas porque no todas las facturas traen todo
  —la mayoría no trae ninguna— y una fila por concepto se lee mejor que
  seis columnas casi siempre vacías.

  Se eligen de una lista por la misma razón que el motivo del descuento
  en la caja: escrito a mano, "Perc. IIBB" y "Percepcion IIBB" son dos
  cosas distintas para cualquier cuenta que se quiera hacer después.
*/
const CONCEPTOS_DE_TRIBUTO = [
  'Percepción de IIBB',
  'Percepción de IVA',
  'Retención de Ganancias',
  'Impuestos internos',
  'Otro',
] as const

export default function Compras() {
  const { tienePermiso } = useAuth()
  const [cargando, setCargando] = useState(false)
  const qc = useQueryClient()

  const compras = useQuery({ queryKey: ['compras'], queryFn: () => listarCompras() })

  const baja = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) => anularCompra(id, motivo),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compras'] }),
  })

  async function darDeBaja(id: string, etiqueta: string) {
    const ok = await confirmar({
      titulo: `¿Dar de baja ${etiqueta}?`,
      detalle: 'Deja de contar, pero no desaparece: queda registrada como dada de baja.',
      aceptar: 'Dar de baja',
      peligro: true,
    })
    if (ok) baja.mutate({ id, motivo: 'Dada de baja desde la pantalla de Compras' })
  }

  const total = (compras.data ?? []).reduce((t, c) => t + Number(c.total), 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-tinta">Compras</h1>
          <p className="text-sm text-piedra-500">
            Las facturas que emiten los proveedores. Se carga la factura, no la mercadería: el
            ingreso al stock se hace por Stock.
          </p>
        </div>

        {tienePermiso('compras.registrar') && !cargando && (
          <button
            onClick={() => setCargando(true)}
            className={boton.principal}
          >
            Cargar factura
          </button>
        )}
      </div>

      {cargando && (
        <FormularioDeCompra
          onListo={() => {
            setCargando(false)
            qc.invalidateQueries({ queryKey: ['compras'] })
          }}
          onCancelar={() => setCargando(false)}
        />
      )}

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-borde">
        <table className="w-full text-sm">
          <thead className="border-b border-piedra-100 text-left text-xs text-piedra-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Fecha</th>
              <th className="px-4 py-2.5 font-medium">Proveedor</th>
              <th className="px-4 py-2.5 font-medium">Comprobante</th>
              <th className="px-4 py-2.5 text-right font-medium">Neto</th>
              <th className="px-4 py-2.5 text-right font-medium">IVA</th>
              <th className="px-4 py-2.5 text-right font-medium">Percepciones</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {compras.isPending && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-piedra-400">
                  Cargando…
                </td>
              </tr>
            )}

            {compras.data?.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-piedra-400">
                  Todavía no hay facturas de compra cargadas.
                </td>
              </tr>
            )}

            {compras.data?.map((c) => (
              <tr key={c.id} className="border-b border-piedra-50 last:border-0">
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-piedra-600">
                  {new Date(`${c.fecha}T00:00:00`).toLocaleDateString('es-AR')}
                </td>
                <td className="px-4 py-2.5 text-tinta">{c.proveedor?.nombre ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  <span className="text-piedra-600">{c.tipo?.descripcion ?? '—'}</span>{' '}
                  <span className="font-mono text-xs tabular-nums text-piedra-500">
                    {numeroDeComprobante(c.punto_venta, c.numero)}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-piedra-600">
                  {moneda.format(Number(c.neto_gravado) + Number(c.neto_no_gravado) + Number(c.exento))}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-piedra-600">
                  {moneda.format(Number(c.iva_total))}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-piedra-600">
                  {Number(c.tributos_total) ? moneda.format(Number(c.tributos_total)) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums text-tinta">
                  {/* Una nota de crédito resta, y en una lista de gastos
                      eso tiene que verse de un vistazo. */}
                  {c.tipo?.signo === -1 ? '−' : ''}
                  {moneda.format(Number(c.total))}
                </td>
                <td className="px-2 py-2.5 text-right">
                  {tienePermiso('compras.registrar') && (
                    <button
                      onClick={() =>
                        darDeBaja(
                          c.id,
                          `${c.tipo?.descripcion ?? 'La factura'} ${numeroDeComprobante(c.punto_venta, c.numero)}`,
                        )
                      }
                      className="rounded-lg px-2 py-1 text-xs text-piedra-400 hover:bg-red-50 hover:text-red-700"
                    >
                      Dar de baja
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>

          {!!compras.data?.length && (
            <tfoot className="border-t border-piedra-100 bg-piedra-50/60">
              <tr>
                <td colSpan={6} className="px-4 py-2.5 text-xs text-piedra-500">
                  {compras.data.length} factura{compras.data.length === 1 ? '' : 's'} en pantalla
                </td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums text-tinta">
                  {moneda.format(total)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {compras.isError && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          No se pudieron traer las compras:{' '}
          {compras.error instanceof Error ? compras.error.message : 'error desconocido'}
        </p>
      )}
    </div>
  )
}

function FormularioDeCompra({
  onListo,
  onCancelar,
}: {
  onListo: () => void
  onCancelar: () => void
}) {
  const proveedores = useQuery({ queryKey: ['proveedores'], queryFn: () => listarProveedores() })
  const tipos = useQuery({ queryKey: ['tipos-de-compra'], queryFn: tiposParaCompra })
  const alicuotas = useQuery({ queryKey: ['alicuotas-iva'], queryFn: alicuotasDeIva })

  const [proveedorId, setProveedorId] = useState('')
  // La Factura A es la que trae Gross casi siempre: es responsable
  // inscripto y sus proveedores grandes también.
  const [tipoId, setTipoId] = useState(1)
  const [puntoVenta, setPuntoVenta] = useState('')
  const [numero, setNumero] = useState('')
  const [fecha, setFecha] = useState(hoy)
  const [lineas, setLineas] = useState<AlicuotaCargada[]>([
    { alicuota_iva_id: 5, base_imponible: 0, importe: 0 },
  ])
  const [noGravado, setNoGravado] = useState('')
  const [exento, setExento] = useState('')
  const [tributos, setTributos] = useState<TributoCargado[]>([])
  const [observaciones, setObservaciones] = useState('')
  const [error, setError] = useState<string | null>(null)

  const numeroDe = (t: string) => {
    const n = Number(t.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }

  const total = useMemo(
    () =>
      totalDeLaCarga({
        alicuotas: lineas,
        tributos,
        neto_no_gravado: numeroDe(noGravado),
        exento: numeroDe(exento),
      }),
    [lineas, tributos, noGravado, exento],
  )

  const guardar = useMutation({
    mutationFn: () =>
      registrarCompra({
        proveedor_id: proveedorId,
        tipo_comprobante_id: tipoId,
        punto_venta: numeroDe(puntoVenta),
        numero: numeroDe(numero),
        fecha,
        neto_no_gravado: numeroDe(noGravado),
        exento: numeroDe(exento),
        observaciones,
        // Una línea en cero es una que se agregó y no se usó: no tiene
        // por qué viajar ni quedar guardada.
        alicuotas: lineas.filter((l) => l.base_imponible > 0 || l.importe > 0),
        tributos: tributos.filter((t) => t.importe > 0),
      }),
    onSuccess: onListo,
    onError: (e) => setError(enCastellano(e, 'No se pudo guardar la factura.')),
  })

  const falta =
    !proveedorId || numeroDe(puntoVenta) <= 0 || numeroDe(numero) <= 0 || !fecha || total <= 0

  function cambiarLinea(i: number, cambio: Partial<AlicuotaCargada>) {
    setLineas((ls) => ls.map((l, j) => (i === j ? { ...l, ...cambio } : l)))
  }

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-borde">
      <h2 className="font-medium text-tinta">Cargar una factura de compra</h2>
      <p className="mt-1 text-sm text-piedra-500">
        Copiá lo que dice el papel. El total se arma solo abajo: si no coincide con el de la
        factura, algo quedó mal cargado.
      </p>

      {/* ── Quién y cuál ── */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block lg:col-span-2">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Proveedor</span>
          <select
            value={proveedorId}
            onChange={(e) => setProveedorId(e.target.value)}
            className={campo}
          >
            <option value="">— Elegí el proveedor —</option>
            {proveedores.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Comprobante</span>
          <select
            value={tipoId}
            onChange={(e) => setTipoId(Number(e.target.value))}
            className={campo}
          >
            {tipos.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.descripcion}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Punto de venta</span>
          <input
            value={puntoVenta}
            onChange={(e) => setPuntoVenta(e.target.value)}
            inputMode="numeric"
            placeholder="3"
            className={campo}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Número</span>
          <input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            inputMode="numeric"
            placeholder="45678"
            className={campo}
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Fecha</span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={campo}
          />
        </label>
        <label className="block lg:col-span-4">
          <span className="mb-1 block text-xs font-medium text-piedra-600">
            Observaciones <span className="font-normal text-piedra-400">(opcional)</span>
          </span>
          <input
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            className={campo}
          />
        </label>
      </div>

      {/* ── El desglose ── */}
      <h3 className="mt-5 text-sm font-medium text-tinta">Desglose por alícuota</h3>
      <p className="text-xs text-piedra-400">
        El IVA se sugiere solo al escribir el neto, pero se puede corregir: manda el papel.
      </p>

      <div className="mt-2 space-y-2">
        {lineas.map((l, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <label className="block w-28">
              <span className="mb-1 block text-xs text-piedra-600">Alícuota</span>
              <select
                value={l.alicuota_iva_id}
                onChange={(e) => {
                  const id = Number(e.target.value)
                  const p = alicuotas.data?.find((a) => a.id === id)?.porcentaje ?? 0
                  cambiarLinea(i, {
                    alicuota_iva_id: id,
                    importe: ivaSugerido(l.base_imponible, p),
                  })
                }}
                className={campo}
              >
                {alicuotas.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.descripcion}
                  </option>
                ))}
              </select>
            </label>

            <label className="block min-w-32 flex-1">
              <span className="mb-1 block text-xs text-piedra-600">Neto</span>
              <input
                value={l.base_imponible || ''}
                onChange={(e) => {
                  const neto = numeroDe(e.target.value)
                  const p = alicuotas.data?.find((a) => a.id === l.alicuota_iva_id)?.porcentaje ?? 0
                  cambiarLinea(i, { base_imponible: neto, importe: ivaSugerido(neto, p) })
                }}
                inputMode="decimal"
                className={campo}
              />
            </label>

            <label className="block min-w-32 flex-1">
              <span className="mb-1 block text-xs text-piedra-600">IVA</span>
              <input
                value={l.importe || ''}
                onChange={(e) => cambiarLinea(i, { importe: numeroDe(e.target.value) })}
                inputMode="decimal"
                className={campo}
              />
            </label>

            {lineas.length > 1 && (
              <button
                onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}
                className="rounded-lg px-2.5 py-2 text-sm text-piedra-400 hover:bg-red-50 hover:text-red-700"
              >
                Quitar
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={() =>
          setLineas((ls) => [...ls, { alicuota_iva_id: 5, base_imponible: 0, importe: 0 }])
        }
        className="mt-2 text-sm text-marca-700 hover:underline"
      >
        + Otra alícuota
      </button>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">
            No gravado <span className="font-normal text-piedra-400">(opcional)</span>
          </span>
          <input
            value={noGravado}
            onChange={(e) => setNoGravado(e.target.value)}
            inputMode="decimal"
            className={campo}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">
            Exento <span className="font-normal text-piedra-400">(opcional)</span>
          </span>
          <input
            value={exento}
            onChange={(e) => setExento(e.target.value)}
            inputMode="decimal"
            className={campo}
          />
        </label>
      </div>

      {/* ── Percepciones ──
          Del lado de las ventas la percepción es plata que Gross le cobra
          al cliente. Acá se la cobraron a él, y es crédito suyo: por eso
          se carga aparte y no metida en el total. */}
      <h3 className="mt-5 text-sm font-medium text-tinta">Percepciones</h3>
      {tributos.length === 0 && (
        <p className="text-xs text-piedra-400">
          Sólo si la factura trae. Es lo que le retuvieron a Gross, y es crédito suyo.
        </p>
      )}

      <div className="mt-2 space-y-2">
        {tributos.map((t, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <label className="block min-w-48 flex-1">
              <span className="mb-1 block text-xs text-piedra-600">Concepto</span>
              {/* "Otro" deja escribirlo, porque siempre aparece uno que
                  no estaba en la lista — pero hay que elegirlo a
                  propósito, no por costumbre. */}
              {CONCEPTOS_DE_TRIBUTO.includes(t.descripcion as (typeof CONCEPTOS_DE_TRIBUTO)[number]) ? (
                <select
                  value={t.descripcion}
                  onChange={(e) =>
                    setTributos((ts) =>
                      ts.map((x, j) =>
                        i === j
                          ? { ...x, descripcion: e.target.value === 'Otro' ? '' : e.target.value }
                          : x,
                      ),
                    )
                  }
                  className={campo}
                >
                  {CONCEPTOS_DE_TRIBUTO.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={t.descripcion}
                  onChange={(e) =>
                    setTributos((ts) =>
                      ts.map((x, j) => (i === j ? { ...x, descripcion: e.target.value } : x)),
                    )
                  }
                  placeholder="¿Qué concepto es?"
                  autoFocus
                  className={campo}
                />
              )}
            </label>
            <label className="block min-w-32">
              <span className="mb-1 block text-xs text-piedra-600">Importe</span>
              <input
                value={t.importe || ''}
                onChange={(e) =>
                  setTributos((ts) =>
                    ts.map((x, j) => (i === j ? { ...x, importe: numeroDe(e.target.value) } : x)),
                  )
                }
                inputMode="decimal"
                className={campo}
              />
            </label>
            <button
              onClick={() => setTributos((ts) => ts.filter((_, j) => j !== i))}
              className="rounded-lg px-2.5 py-2 text-sm text-piedra-400 hover:bg-red-50 hover:text-red-700"
            >
              Quitar
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={() =>
          setTributos((ts) => [
            ...ts,
            { descripcion: CONCEPTOS_DE_TRIBUTO[0], base_imponible: 0, alicuota: null, importe: 0 },
          ])
        }
        className="mt-2 text-sm text-marca-700 hover:underline"
      >
        + Percepción
      </button>

      {/* ── El total, para comparar con el papel ── */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-piedra-100 pt-4">
        <div>
          <p className="text-xs text-piedra-500">Total de la factura</p>
          <p className="text-2xl font-semibold tabular-nums text-tinta">{moneda.format(total)}</p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={onCancelar} className="px-3 py-2 text-sm text-piedra-500 hover:text-tinta">
            Cancelar
          </button>
          <button
            onClick={() => {
              setError(null)
              guardar.mutate()
            }}
            disabled={falta || guardar.isPending}
            title={falta ? 'Faltan el proveedor, el número o los importes' : undefined}
            className={boton.principal}
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar la factura'}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}
    </div>
  )
}
