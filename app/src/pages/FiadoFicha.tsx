import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { useTerminal } from '@/lib/terminal'
import { cajaAbierta } from '@/lib/api/caja'
import { hoyEnObera, sumarDias } from '@/lib/api/cheques'
import { datosEmisor } from '@/lib/api/comprobante'
import {
  cobrarFiado,
  deudaDeLaFicha,
  fichaFiado,
  fijarCronograma,
  guardarFichaFiado,
  repartirEnFechas,
  whatsappFiado,
  type FichaFiado,
  type VentaFiada,
} from '@/lib/api/fiados'
import { cargarPrecios, mediosParaElegir } from '@/lib/api/precios'
import { leerImporte, numeroRecibo } from '@/lib/api/recibos'
import { fechaCorta } from '@/lib/comprobante/presentacion'
import { enCastellano } from '@/lib/errores'
import { avanzarConEnter } from '@/lib/teclado'
import { boton, botonChico, campo, tarjeta } from '@/estilos'
import { moneda, numero } from '@/lib/tipos'
import { BotonWhatsapp } from '@/pages/Fiados'

/*
  ─────────────────────────────────────────────────────────────
  La cuenta de un fiado

  Todo lo que se llevó fiado, lo que pagó y cuándo tiene que pagar lo
  que falta. Desde acá se cobra —sale el recibo y entra a la caja—, se
  cambian las fechas —queda la historia— y se le escribe por WhatsApp.
  ─────────────────────────────────────────────────────────────
*/
export default function FiadoFicha() {
  const { id } = useParams<{ id: string }>()
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()
  const puedeCobrar = tienePermiso('fiados.cobrar')
  const [cobrando, setCobrando] = useState(false)
  const [editando, setEditando] = useState(false)
  const [fechas, setFechas] = useState<VentaFiada | null>(null)
  const [recibo, setRecibo] = useState<{ id: string; serie: string; numero: number; total: number } | null>(null)

  const ficha = useQuery({ queryKey: ['fiado', id], queryFn: () => fichaFiado(id!), enabled: !!id && tienePermiso('fiados.ver') })
  const emisor = useQuery({ queryKey: ['emisor'], queryFn: datosEmisor, staleTime: 5 * 60_000 })

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['fiado', id] })
    qc.invalidateQueries({ queryKey: ['fiados'] })
    qc.invalidateQueries({ queryKey: ['fiados-estadisticas'] })
    qc.invalidateQueries({ queryKey: ['fiado-aviso'] })
  }

  if (!tienePermiso('fiados.ver')) {
    return (
      <p className="rounded-xl bg-piedra-50 px-4 py-3 text-sm text-piedra-600 ring-1 ring-borde">
        No tenés permiso para ver los fiados.
      </p>
    )
  }
  if (ficha.isPending) return <p className="text-sm text-piedra-500">Cargando…</p>
  if (ficha.isError) {
    return (
      <p role="alert" className="text-sm text-red-700">
        {enCastellano(ficha.error, 'No se pudo leer el fiado.')}
      </p>
    )
  }

  const f = ficha.data
  const debe = deudaDeLaFicha(f)
  const activos = f.fiados.filter((v) => !v.anulado_en)
  const vencido = activos.reduce((s, v) => s + v.vencido, 0)
  const proxima = activos
    .filter((v) => v.proxima_fecha)
    .sort((a, b) => a.proxima_fecha!.localeCompare(b.proxima_fecha!))[0]
  const negocio = emisor.data?.nombre_fantasia || emisor.data?.razon_social || ''
  const whatsapp = whatsappFiado(
    {
      persona_id: f.id,
      documento: f.documento,
      nombre: f.nombre,
      domicilio: f.domicilio,
      telefono: f.telefono,
      debe,
      vencido,
      proxima_fecha: proxima?.proxima_fecha ?? null,
      proximo_importe: proxima?.proximo_importe ?? null,
      primer_vencimiento: null,
      fiados: activos.length,
      ultimo: null,
    },
    negocio,
  )

  return (
    <div className="space-y-5">
      <Link to="/fiados" className="text-sm text-marca-700 hover:underline">
        ← Fiados
      </Link>

      <div className={`${tarjeta} space-y-3 p-4`}>
        {editando ? (
          <EditarFicha
            f={f}
            onListo={() => {
              setEditando(false)
              refrescar()
            }}
            onCancelar={() => setEditando(false)}
          />
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere] text-tinta">{f.nombre}</h1>
              <p className="text-sm text-piedra-500">
                DNI {f.documento}
                {f.telefono && ` · ${f.telefono}`}
              </p>
              {f.domicilio && <p className="text-sm [overflow-wrap:anywhere] text-piedra-500">{f.domicilio}</p>}
            </div>
            {puedeCobrar && (
              <button onClick={() => setEditando(true)} className={botonChico.suave}>
                Corregir datos
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-piedra-100 pt-3">
          <div>
            <p className="text-xs font-medium tracking-wide text-piedra-400 uppercase">Debe</p>
            <p className="text-2xl font-semibold tabular-nums text-tinta">{moneda.format(Math.max(debe, 0))}</p>
            {vencido > 0.009 ? (
              <p className="text-sm font-medium text-red-700">{moneda.format(vencido)} vencido</p>
            ) : proxima ? (
              <p className="text-sm text-piedra-500">
                Próximo pago: {moneda.format(proxima.proximo_importe ?? 0)} el {fechaCorta(proxima.proxima_fecha!)}
              </p>
            ) : (
              <p className="text-sm text-verde-700">No debe nada.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {debe > 0.009 && whatsapp && <BotonWhatsapp url={whatsapp} />}
            {debe > 0.009 && puedeCobrar && (
              <button
                onClick={() => {
                  setRecibo(null)
                  setCobrando(true)
                }}
                className={boton.principal}
              >
                Cobrar
              </button>
            )}
          </div>
        </div>

        {recibo && (
          <p className="rounded-lg bg-verde-50 px-3 py-2 text-sm text-verde-800 ring-1 ring-verde-200">
            Recibo {numeroRecibo(recibo.serie, recibo.numero)} por {moneda.format(recibo.total)}.{' '}
            <Link to={`/recibo/${recibo.id}`} className="font-medium underline">
              Ver e imprimir
            </Link>
          </p>
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-piedra-600">Lo que se llevó fiado</h2>
        {f.fiados.map((v) => (
          <Venta key={v.id} v={v} puedeCambiar={puedeCobrar} onCambiarFechas={() => setFechas(v)} />
        ))}
      </section>

      {f.pagos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-piedra-600">Pagos</h2>
          <ul className={`${tarjeta} divide-y divide-piedra-100`}>
            {f.pagos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  {fechaCorta(p.fecha)} · {p.medio}
                  {p.cobro && <span className="text-piedra-500"> · cobró {p.cobro}</span>}
                </span>
                <span className="flex items-center gap-3">
                  {p.recibo_id && (
                    <Link to={`/recibo/${p.recibo_id}`} className="text-xs text-marca-700 hover:underline">
                      Recibo {numeroRecibo(p.recibo_serie!, p.recibo_numero!)}
                    </Link>
                  )}
                  <span className="font-medium tabular-nums">{moneda.format(p.importe)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {cobrando && (
        <ModalCobrarFiado
          ficha={f}
          debe={debe}
          vencido={vencido}
          proximo={proxima?.proximo_importe ?? null}
          onListo={(r) => {
            setCobrando(false)
            setRecibo(r)
            refrescar()
          }}
          onCancelar={() => setCobrando(false)}
        />
      )}
      {fechas && (
        <ModalFechas
          v={fechas}
          onListo={() => {
            setFechas(null)
            refrescar()
          }}
          onCancelar={() => setFechas(null)}
        />
      )}
    </div>
  )
}

function Venta({ v, puedeCambiar, onCambiarFechas }: { v: VentaFiada; puedeCambiar: boolean; onCambiarFechas: () => void }) {
  const cambios = new Set(v.historia.map((h) => h.fijado_en)).size - 1
  return (
    <div className={`${tarjeta} space-y-3 p-4 ${v.anulado_en ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="text-sm font-medium text-tinta">
            Venta {v.venta_codigo} · {fechaCorta(v.fecha)}
          </p>
          <p className="text-xs text-piedra-500">
            {moneda.format(v.importe)} fiado
            {v.registrado_por && ` · lo cargó ${v.registrado_por}`}
          </p>
        </div>
        <div className="text-right">
          {v.anulado_en ? (
            <p className="text-sm font-medium text-piedra-500">Anulado</p>
          ) : v.saldo > 0.009 ? (
            <>
              <p className="text-sm font-medium tabular-nums text-tinta">Falta {moneda.format(v.saldo)}</p>
              {v.vencido > 0.009 && <p className="text-xs font-medium text-red-700">{moneda.format(v.vencido)} vencido</p>}
            </>
          ) : (
            <p className="text-sm font-medium text-verde-700">Pagado</p>
          )}
        </div>
      </div>
      {v.motivo_anulacion && <p className="text-xs text-piedra-500">{v.motivo_anulacion}</p>}

      <ul className="space-y-0.5 text-xs text-piedra-600">
        {v.renglones.map((r, i) => (
          <li key={i} className="flex justify-between gap-3">
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {numero.format(r.cantidad)} × {r.descripcion}
            </span>
            <span className="shrink-0 tabular-nums">{moneda.format(r.cantidad * r.precio_unitario)}</span>
          </li>
        ))}
      </ul>

      {!v.anulado_en && v.saldo > 0.009 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-piedra-50 px-3 py-2 ring-1 ring-borde">
          <div className="min-w-0 text-xs text-piedra-600">
            <span className="font-medium">{v.cronograma.length > 1 ? 'Fechas de pago: ' : 'Paga el '}</span>
            {v.cronograma.map((c, i) => (
              <span key={i} className={c.fecha === v.proxima_fecha ? 'font-medium text-tinta' : ''}>
                {i > 0 && ' · '}
                {fechaCorta(c.fecha)}
                {v.cronograma.length > 1 && ` ${moneda.format(c.importe)}`}
              </span>
            ))}
          </div>
          {puedeCambiar && (
            <button onClick={onCambiarFechas} className={botonChico.secundario}>
              Cambiar fechas
            </button>
          )}
        </div>
      )}

      {cambios > 0 && (
        <details className="text-xs text-piedra-600">
          <summary className="cursor-pointer text-piedra-500">
            {cambios === 1 ? 'Las fechas se cambiaron una vez' : `Las fechas se cambiaron ${cambios} veces`}
          </summary>
          <ul className="mt-2 space-y-1">
            {agruparHistoria(v).map((h) => (
              <li key={h.fijado_en} className={h.vigente ? '' : 'text-piedra-400'}>
                {new Date(h.fijado_en).toLocaleDateString('es-AR')}
                {h.fijado_por && `, ${h.fijado_por}`}: {h.fechas}
                {h.motivo && ` — ${h.motivo}`}
                {h.vigente && ' (vigente)'}
              </li>
            ))}
          </ul>
        </details>
      )}

      {v.pagos.length > 0 && (
        <ul className="space-y-0.5 border-t border-piedra-100 pt-2 text-xs text-piedra-600">
          {v.pagos.map((p, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-x-3">
              <span>
                Pagó el {fechaCorta(p.fecha)}
                {p.cobro && `, cobró ${p.cobro}`}
                {p.recibo_id && (
                  <>
                    {' · '}
                    <Link to={`/recibo/${p.recibo_id}`} className="text-marca-700 hover:underline">
                      recibo {numeroRecibo(p.recibo_serie!, p.recibo_numero!)}
                    </Link>
                  </>
                )}
              </span>
              <span className="tabular-nums">{moneda.format(p.importe)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Cada cronograma que tuvo, del más nuevo al más viejo. */
function agruparHistoria(v: VentaFiada) {
  const grupos = new Map<string, VentaFiada['historia']>()
  for (const h of v.historia) grupos.set(h.fijado_en, [...(grupos.get(h.fijado_en) ?? []), h])
  return [...grupos].map(([fijado_en, hs]) => ({
    fijado_en,
    fijado_por: hs[0].fijado_por,
    motivo: hs[0].motivo,
    vigente: hs[0].reemplazado_en === null,
    fechas: hs
      .slice()
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((h) => (hs.length > 1 ? `${fechaCorta(h.fecha)} ${moneda.format(h.importe)}` : fechaCorta(h.fecha)))
      .join(', '),
  }))
}

function EditarFicha({ f, onListo, onCancelar }: { f: FichaFiado; onListo: () => void; onCancelar: () => void }) {
  const [d, setD] = useState({ nombre: f.nombre, domicilio: f.domicilio ?? '', telefono: f.telefono ?? '' })
  const guardar = useMutation({ mutationFn: () => guardarFichaFiado(f.id, d), onSuccess: onListo })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        guardar.mutate()
      }}
      onKeyDown={avanzarConEnter}
      className="space-y-2"
    >
      <p className="text-sm text-piedra-500">DNI {f.documento}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block min-w-0">
          <span className="mb-1 block text-xs text-piedra-600">Nombre</span>
          <input value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} className={campo} />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs text-piedra-600">Domicilio</span>
          <input value={d.domicilio} onChange={(e) => setD({ ...d, domicilio: e.target.value })} className={campo} />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs text-piedra-600">Teléfono</span>
          <input
            value={d.telefono}
            onChange={(e) => setD({ ...d, telefono: e.target.value })}
            inputMode="tel"
            className={campo}
          />
        </label>
      </div>
      {guardar.isError && <p className="text-sm text-red-700">{enCastellano(guardar.error)}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={!d.nombre.trim() || guardar.isPending} className={boton.principal}>
          {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" onClick={onCancelar} className={boton.suave}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function ModalCobrarFiado({
  ficha,
  debe,
  vencido,
  proximo,
  onListo,
  onCancelar,
}: {
  ficha: FichaFiado
  debe: number
  vencido: number
  proximo: number | null
  onListo: (r: { id: string; serie: string; numero: number; total: number }) => void
  onCancelar: () => void
}) {
  const { terminal } = useTerminal()
  // Uno por cobro: si se corta la conexión y se aprieta de nuevo, es el mismo recibo.
  const [reciboId] = useState(() => crypto.randomUUID())
  const sugerido = vencido > 0.009 ? vencido : (proximo ?? debe)
  const [importe, setImporte] = useState(String(Math.round(sugerido * 100) / 100).replace('.', ','))
  const [medioPagoId, setMedioPagoId] = useState('')
  const [fiadoId, setFiadoId] = useState('')

  const precios = useQuery({ queryKey: ['precios'], queryFn: cargarPrecios })
  const medios = mediosParaElegir(precios.data?.medios ?? []).filter(
    (m) => !['fiado', 'cuenta_corriente', 'cheque'].includes(m.tipo),
  )
  const caja = useQuery({
    queryKey: ['caja', terminal?.id],
    queryFn: () => cajaAbierta(terminal!.id),
    enabled: !!terminal,
  })
  const cajaId = caja.data?.id ?? null

  const conSaldo = ficha.fiados.filter((v) => !v.anulado_en && v.saldo > 0.009)
  const tope = fiadoId ? (conSaldo.find((v) => v.id === fiadoId)?.saldo ?? 0) : debe
  const monto = leerImporte(importe)
  const medio = medios.find((m) => m.id === medioPagoId)
  const faltaCaja = !!medio?.afecta_caja && !cajaId
  const deMas = monto !== null && monto > tope + 0.009

  const cobrar = useMutation({
    mutationFn: () =>
      cobrarFiado({ id: reciboId, personaId: ficha.id, medioPagoId, importe: monto!, cajaId, fiadoId: fiadoId || null }),
    onSuccess: onListo,
  })

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-tinta/50 p-4" onClick={onCancelar}>
      <div
        className="mx-auto my-8 w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={avanzarConEnter}
      >
        <h2 className="font-semibold text-tinta">Cobrar</h2>
        <p className="mt-0.5 text-sm [overflow-wrap:anywhere] text-piedra-500">
          {ficha.nombre} · debe {moneda.format(debe)}
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-piedra-600">Importe</span>
            <input
              autoFocus
              value={importe}
              onChange={(e) => setImporte(e.target.value)}
              inputMode="decimal"
              className="w-full rounded-lg border border-borde px-3 py-2.5 text-right text-lg tabular-nums outline-none focus:border-marca-500"
            />
          </label>
          {monto !== null && !deMas && (
            <span className="block text-xs text-piedra-400">
              {tope - monto > 0.009 ? `Queda debiendo ${moneda.format(tope - monto)}` : 'Cancela lo que debe'}
            </span>
          )}
          {deMas && <p className="text-xs text-red-700">Debe {moneda.format(tope)}: no se le puede cobrar más.</p>}

          {conSaldo.length > 1 && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-piedra-600">¿A qué venta?</span>
              <select value={fiadoId} onChange={(e) => setFiadoId(e.target.value)} className={campo}>
                <option value="">A las más viejas primero</option>
                {conSaldo.map((v) => (
                  <option key={v.id} value={v.id}>
                    Venta {v.venta_codigo} del {fechaCorta(v.fecha)} · falta {moneda.format(v.saldo)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div>
            <span className="mb-1 block text-xs font-medium text-piedra-600">¿Con qué paga?</span>
            <div className="flex flex-wrap gap-1.5">
              {medios.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMedioPagoId(m.id)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition-colors ${
                    medioPagoId === m.id
                      ? 'bg-marca-700 text-white ring-marca-700'
                      : 'bg-white text-piedra-600 ring-borde hover:bg-piedra-50'
                  }`}
                >
                  {m.nombre}
                </button>
              ))}
            </div>
          </div>

          {medio?.afecta_caja && cajaId && (
            <p className="rounded-lg bg-verde-50 px-3 py-2 text-xs text-verde-800 ring-1 ring-verde-200">
              Entra a la caja abierta, así el arqueo del turno lo contempla.
            </p>
          )}
          {faltaCaja && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
              Cobrar en {medio!.nombre} necesita la caja abierta en esta computadora. Abrí la caja primero.
            </p>
          )}
          {cobrar.isError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
              {enCastellano(cobrar.error, 'No se pudo cobrar.')}
            </p>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={() => cobrar.mutate()}
            disabled={!medioPagoId || monto === null || deMas || faltaCaja || cobrar.isPending}
            className="flex-1 rounded-lg bg-verde-600 px-4 py-2.5 font-medium text-white hover:bg-verde-500 disabled:opacity-40"
          >
            {cobrar.isPending ? 'Registrando…' : 'Emitir el recibo'}
          </button>
          <button onClick={onCancelar} className="rounded-lg px-4 py-2.5 text-sm font-medium text-piedra-500 hover:bg-piedra-100">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

/*
  Las fechas nuevas cubren lo que falta pagar hoy: tienen que sumar eso.
  Las de antes no se borran, quedan como historia.
*/
function ModalFechas({ v, onListo, onCancelar }: { v: VentaFiada; onListo: () => void; onCancelar: () => void }) {
  const hoy = hoyEnObera()
  const inicial = v.proxima_fecha && v.proxima_fecha >= hoy ? v.proxima_fecha : sumarDias(hoy, 7)
  const [cuotas, setCuotas] = useState(() => [{ fecha: inicial, importe: textoDe(v.saldo) }])
  const [motivo, setMotivo] = useState('')

  const leidas = cuotas.map((c) => ({ fecha: c.fecha, importe: leerImporte(c.importe) }))
  const suma = Math.round(leidas.reduce((s, c) => s + (c.importe ?? 0), 0) * 100) / 100
  const diferencia = Math.round((v.saldo - suma) * 100) / 100
  const invalida = leidas.some((c) => c.importe === null || !c.fecha || c.fecha < hoy)

  const guardar = useMutation({
    mutationFn: () => fijarCronograma(v.id, leidas.map((c) => ({ fecha: c.fecha, importe: c.importe! })), motivo),
    onSuccess: onListo,
  })

  const repartir = (n: number) =>
    setCuotas(repartirEnFechas(v.saldo, n, inicial, 7).map((c) => ({ fecha: c.fecha, importe: textoDe(c.importe) })))

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-tinta/50 p-4" onClick={onCancelar}>
      <div
        className="mx-auto my-8 w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={avanzarConEnter}
      >
        <h2 className="font-semibold text-tinta">Fechas de pago</h2>
        <p className="mt-0.5 text-sm text-piedra-500">
          Venta {v.venta_codigo} · falta {moneda.format(v.saldo)}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-piedra-500">
          <span>Repartir en</span>
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => repartir(n)}
              className="rounded-full px-2 py-0.5 text-marca-700 ring-1 ring-borde hover:bg-marca-50"
            >
              {n === 1 ? 'un pago' : `${n} pagos`}
            </button>
          ))}
          <span>semanales</span>
        </div>

        <ul className="mt-3 space-y-2">
          {cuotas.map((c, i) => (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_6.5rem_1.5rem] items-center gap-2">
              <input
                type="date"
                value={c.fecha}
                min={hoy}
                onChange={(e) => setCuotas(cuotas.map((x, j) => (j === i ? { ...x, fecha: e.target.value } : x)))}
                aria-label={`Fecha ${i + 1}`}
                className={`${campo} min-w-0`}
              />
              <input
                value={c.importe}
                onChange={(e) => setCuotas(cuotas.map((x, j) => (j === i ? { ...x, importe: e.target.value } : x)))}
                inputMode="decimal"
                aria-label={`Importe ${i + 1}`}
                className={`${campo} min-w-0 text-right tabular-nums`}
              />
              {cuotas.length > 1 && (
                <button
                  type="button"
                  onClick={() => setCuotas(cuotas.filter((_, j) => j !== i))}
                  className="rounded p-1 text-piedra-300 hover:bg-red-50 hover:text-red-600"
                  aria-label="Quitar"
                >
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            setCuotas([
              ...cuotas,
              {
                fecha: sumarDias(cuotas[cuotas.length - 1]?.fecha || hoy, 7),
                importe: diferencia > 0 ? textoDe(diferencia) : '',
              },
            ])
          }
          className="mt-2 text-sm font-medium text-marca-700 hover:underline"
        >
          + Otra fecha
        </button>

        {Math.abs(diferencia) > 0.009 && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
            {diferencia > 0
              ? `Faltan ${moneda.format(diferencia)} para llegar a lo que debe.`
              : `Se pasa por ${moneda.format(-diferencia)} de lo que debe.`}
          </p>
        )}

        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-piedra-600">
            Motivo <span className="font-normal text-piedra-400">(opcional)</span>
          </span>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Pidió más tiempo"
            className={campo}
          />
        </label>

        {guardar.isError && <p className="mt-2 text-sm text-red-700">{enCastellano(guardar.error)}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={() => guardar.mutate()}
            disabled={invalida || Math.abs(diferencia) > 0.009 || guardar.isPending}
            className={`${boton.principal} flex-1`}
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar las fechas'}
          </button>
          <button onClick={onCancelar} className={boton.suave}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

const textoDe = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')
