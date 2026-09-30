import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { pedirTexto } from '@/components/Dialogo'
import {
  aCuenta,
  anularPago,
  conSaldoAcumulado,
  definirSaldoInicial,
  esCheque,
  imputacionSugerida,
  listarSaldos,
  MEDIOS,
  movimientosDe,
  pendientesDe,
  registrarPago,
} from '@/lib/api/cuentaProveedores'
import type { Imputacion, Medio, Pendiente, SaldoProveedor } from '@/lib/api/cuentaProveedores'
import { carteraParaEndosar, chequeVacio, faltaEnCheque } from '@/lib/api/cheques'
import type { Cheque, DatosCheque } from '@/lib/api/cheques'
import CamposCheque from '@/components/CamposCheque'
import { datosParaTransferir } from '@/lib/api/proveedores'
import { bancoDelCbu, cbuLegible, esCvu } from '@/lib/cbu'
import { enCastellano } from '@/lib/errores'
import { moneda } from '@/lib/tipos'
import { boton, campo, tarjeta } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  Las cuentas de los proveedores

  Lo que en OBTech eran tres entradas del menú Compras —consolidación de
  saldos, resumen de cuenta y órdenes de pago— en una sola pantalla:
  arriba cuánto se le debe a cada uno, y al elegir un proveedor, qué
  falta pagar, su resumen y el botón para pagarle.

  Existe antes del 26/10 porque es lo único del menú Compras que no
  tiene reemplazo a mano: nadie lleva de memoria lo que le debe a
  quince laboratorios.
  ─────────────────────────────────────────────────────────────
*/

const hoy = () => {
  // El día de Oberá, no el UTC: a las diez de la noche ya sería mañana.
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const fechaCorta = (f: string | null) =>
  f ? new Date(`${f}T00:00:00`).toLocaleDateString('es-AR') : '—'

const numeroDe = (t: string) => {
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export default function CuentaProveedores() {
  const { tienePermiso } = useAuth()
  const [params, setParams] = useSearchParams()
  const elegido = params.get('p')

  const saldos = useQuery({ queryKey: ['saldos-proveedores'], queryFn: listarSaldos })
  const proveedor = saldos.data?.find((s) => s.proveedor_id === elegido) ?? null

  const conMovimiento = (saldos.data ?? []).filter((s) => s.saldo !== 0 || s.ultimo_pago)
  const sinMovimiento = (saldos.data ?? []).filter((s) => s.saldo === 0 && !s.ultimo_pago)
  const total = conMovimiento.reduce((t, s) => t + s.saldo, 0)
  const vencido = conMovimiento.reduce((t, s) => t + s.vencido, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-tinta">Cuentas de proveedores</h1>
          <p className="text-sm text-piedra-500">
            Cuánto se le debe a cada proveedor. Cada factura de compra suma y cada pago resta.
          </p>
        </div>
        {/* Lo que se le debe a cada uno el día que se deja OBTech, de una vez. */}
        {!proveedor && tienePermiso('proveedores.gestionar') && tienePermiso('proveedores.pagar') && (
          <Link to="/proveedores/cuentas/importar" className={boton.secundario}>
            Importar saldos
          </Link>
        )}
      </div>

      {proveedor ? (
        <Detalle proveedor={proveedor} onVolver={() => setParams({})} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className={`${tarjeta} p-4`}>
              <p className="text-xs text-piedra-500">Se les debe en total</p>
              <p className="text-2xl font-semibold tabular-nums text-tinta">{moneda.format(total)}</p>
            </div>
            <div className={`${tarjeta} p-4`}>
              <p className="text-xs text-piedra-500">De eso, vencido</p>
              <p className={`text-2xl font-semibold tabular-nums ${vencido > 0 ? 'text-red-700' : 'text-tinta'}`}>
                {moneda.format(vencido)}
              </p>
            </div>
          </div>

          {/*
            Sin desplazamiento hacia el costado: en el celular quedan el
            proveedor y el saldo, y lo vencido y las fechas van debajo del
            nombre.
          */}
          <div className={`${tarjeta} overflow-hidden`}>
            <table className="w-full text-sm">
              <thead className="border-b border-piedra-100 text-left text-xs text-piedra-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Proveedor</th>
                  <th className="px-4 py-2.5 text-right font-medium">Saldo</th>
                  <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Vencido</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">Próximo vencimiento</th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Último pago</th>
                </tr>
              </thead>
              <tbody>
                {saldos.isPending && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-piedra-400">Cargando…</td>
                  </tr>
                )}
                {[...conMovimiento, ...sinMovimiento].map((s) => (
                  <tr
                    key={s.proveedor_id}
                    onClick={() => setParams({ p: s.proveedor_id })}
                    className="cursor-pointer border-b border-piedra-50 last:border-0 hover:bg-marca-50/50"
                  >
                    <td className="px-4 py-2.5 align-top text-tinta">
                      {s.nombre}
                      {s.vencido > 0 && (
                        <p className="text-xs tabular-nums text-red-700 sm:hidden">{moneda.format(s.vencido)} vencido</p>
                      )}
                      {s.proximo_vencimiento && (
                        <p className="text-xs tabular-nums text-piedra-500 md:hidden">
                          Vence {fechaCorta(s.proximo_vencimiento)}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right align-top font-medium tabular-nums text-tinta">
                      {s.saldo === 0 ? <span className="text-piedra-300">—</span> : moneda.format(s.saldo)}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-2.5 text-right align-top tabular-nums sm:table-cell">
                      {s.vencido > 0 ? <span className="text-red-700">{moneda.format(s.vencido)}</span> : ''}
                    </td>
                    <td className="hidden px-4 py-2.5 align-top tabular-nums text-piedra-600 md:table-cell">
                      {s.proximo_vencimiento ? fechaCorta(s.proximo_vencimiento) : ''}
                    </td>
                    <td className="hidden px-4 py-2.5 align-top tabular-nums text-piedra-600 lg:table-cell">
                      {s.ultimo_pago ? fechaCorta(s.ultimo_pago) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {saldos.isError && (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
              {enCastellano(saldos.error, 'No se pudieron traer los saldos.')}
            </p>
          )}
        </>
      )}
    </div>
  )
}

function Detalle({ proveedor, onVolver }: { proveedor: SaldoProveedor; onVolver: () => void }) {
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()
  const puedePagar = tienePermiso('proveedores.pagar')
  const [abierto, setAbierto] = useState<'pago' | 'saldo' | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const id = proveedor.proveedor_id
  const pendientes = useQuery({ queryKey: ['pendientes-proveedor', id], queryFn: () => pendientesDe(id) })
  const movimientos = useQuery({ queryKey: ['movimientos-proveedor', id], queryFn: () => movimientosDe(id) })

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['saldos-proveedores'] })
    qc.invalidateQueries({ queryKey: ['pendientes-proveedor', id] })
    qc.invalidateQueries({ queryKey: ['movimientos-proveedor', id] })
    // Un pago con cheques mueve la cartera.
    qc.invalidateQueries({ queryKey: ['cartera-para-endosar'] })
    qc.invalidateQueries({ queryKey: ['cheques'] })
  }

  const anular = useMutation({
    mutationFn: ({ pago, motivo }: { pago: string; motivo: string }) => anularPago(pago, motivo),
    onSuccess: () => {
      setAviso('Pago anulado. Lo que cancelaba vuelve a figurar pendiente.')
      refrescar()
    },
    onError: (e) => setAviso(enCastellano(e, 'No se pudo anular el pago.')),
  })

  async function pedirAnulacion(pago: string, etiqueta: string) {
    const motivo = await pedirTexto({
      titulo: `¿Anular el ${etiqueta}?`,
      detalle:
        'Queda registrado como anulado, con el motivo. Las facturas que pagaba vuelven a figurar pendientes, ' +
        'los cheques de la cartera vuelven a la cartera y los propios quedan anulados. ' +
        'Un cheque que volvió rechazado no se anula acá: se marca como rechazado en Tesorería → Cheques.',
      etiqueta: 'Motivo',
      ejemplo: 'Se cargó dos veces',
      minimo: 5,
      aceptar: 'Anular el pago',
      peligro: true,
    })
    if (motivo) anular.mutate({ pago, motivo })
  }

  const resumen = useMemo(() => conSaldoAcumulado(movimientos.data ?? []), [movimientos.data])
  const tieneSaldoInicial = (movimientos.data ?? []).some((m) => m.tipo === 'saldo_inicial')

  return (
    <div className="space-y-5">
      <button onClick={onVolver} className="text-sm text-marca-700 hover:underline">
        ← Todos los proveedores
      </button>

      <div className={`${tarjeta} flex flex-wrap items-end justify-between gap-4 p-5`}>
        <div>
          <h2 className="text-lg font-medium text-tinta">{proveedor.nombre}</h2>
          {proveedor.numero_documento && (
            <p className="font-mono text-xs text-piedra-500">CUIT {proveedor.numero_documento}</p>
          )}
          <p className="mt-3 text-xs text-piedra-500">
            {proveedor.saldo >= 0 ? 'Se le debe' : 'Saldo a favor de Gross'}
          </p>
          <p className="text-3xl font-semibold tabular-nums text-tinta">
            {moneda.format(Math.abs(proveedor.saldo))}
          </p>
          <p className="mt-1 space-x-2 text-xs text-piedra-500">
            {proveedor.vencido > 0 && (
              <span className="text-red-700">{moneda.format(proveedor.vencido)} vencido</span>
            )}
            {proveedor.a_cuenta > 0 && <span>{moneda.format(proveedor.a_cuenta)} pagado a cuenta, sin imputar</span>}
          </p>
        </div>

        {puedePagar && !abierto && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setAbierto('saldo')} className={boton.secundario}>
              {tieneSaldoInicial ? 'Corregir el saldo inicial' : 'Cargar el saldo inicial'}
            </button>
            <button onClick={() => setAbierto('pago')} className={boton.principal}>
              Registrar un pago
            </button>
          </div>
        )}
      </div>

      {aviso && (
        <p className="rounded-lg bg-piedra-50 px-3 py-2 text-sm text-piedra-700 ring-1 ring-borde">{aviso}</p>
      )}

      {abierto === 'pago' && pendientes.data && (
        <FormularioDePago
          proveedorId={id}
          pendientes={pendientes.data}
          onListo={() => {
            setAbierto(null)
            setAviso('Pago registrado.')
            refrescar()
          }}
          onCancelar={() => setAbierto(null)}
        />
      )}

      {abierto === 'saldo' && (
        <FormularioSaldoInicial
          proveedorId={id}
          onListo={() => {
            setAbierto(null)
            setAviso('Saldo inicial guardado.')
            refrescar()
          }}
          onCancelar={() => setAbierto(null)}
        />
      )}

      {/* ── Qué falta pagar ── */}
      <div className={`${tarjeta} overflow-hidden`}>
        <h3 className="px-4 pt-4 text-sm font-medium text-tinta">Lo que falta pagar</h3>
        <table className="mt-2 w-full text-sm">
          <thead className="border-b border-piedra-100 text-left text-xs text-piedra-500">
            <tr>
              <th className="px-4 py-2 font-medium">Comprobante</th>
              <th className="hidden px-4 py-2 font-medium md:table-cell">Fecha</th>
              <th className="hidden px-4 py-2 font-medium sm:table-cell">Vence</th>
              <th className="hidden px-4 py-2 text-right font-medium md:table-cell">Total</th>
              <th className="px-4 py-2 text-right font-medium">Pendiente</th>
            </tr>
          </thead>
          <tbody>
            {pendientes.data?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-piedra-400">
                  No hay nada pendiente.
                </td>
              </tr>
            )}
            {pendientes.data?.map((p) => (
              <tr key={p.id} className="border-b border-piedra-50 last:border-0">
                <td className="px-4 py-2 align-top text-tinta">
                  {p.descripcion}
                  <p className="text-xs tabular-nums text-piedra-500 md:hidden">
                    {fechaCorta(p.fecha)} · total {moneda.format(p.total)}
                  </p>
                  {p.vencimiento && (
                    <p className={`text-xs tabular-nums sm:hidden ${p.vencida ? 'font-medium text-red-700' : 'text-piedra-500'}`}>
                      Vence {fechaCorta(p.vencimiento)}
                      {p.vencida && ' · vencida'}
                    </p>
                  )}
                </td>
                <td className="hidden px-4 py-2 align-top tabular-nums text-piedra-600 md:table-cell">{fechaCorta(p.fecha)}</td>
                <td className={`hidden px-4 py-2 align-top tabular-nums sm:table-cell ${p.vencida ? 'font-medium text-red-700' : 'text-piedra-600'}`}>
                  {p.vencimiento ? fechaCorta(p.vencimiento) : ''}
                  {p.vencida && ' · vencida'}
                </td>
                <td className="hidden px-4 py-2 text-right align-top tabular-nums text-piedra-600 md:table-cell">{moneda.format(p.total)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right align-top font-medium tabular-nums text-tinta">
                  {moneda.format(p.pendiente)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── El resumen de cuenta ── */}
      {/*
        En el celular, la fecha y el debe o el haber van debajo del
        concepto; quedan el concepto, el saldo y el botón.
      */}
      <div className={`${tarjeta} overflow-hidden`}>
        <h3 className="px-4 pt-4 text-sm font-medium text-tinta">Resumen de cuenta</h3>
        <table className="mt-2 w-full text-sm">
          <thead className="border-b border-piedra-100 text-left text-xs text-piedra-500">
            <tr>
              <th className="hidden px-4 py-2 font-medium sm:table-cell">Fecha</th>
              <th className="px-4 py-2 font-medium">Concepto</th>
              <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">Debe</th>
              <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">Haber</th>
              <th className="px-4 py-2 text-right font-medium">Saldo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {resumen.length === 0 && !movimientos.isPending && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-piedra-400">
                  Todavía no hay movimientos.
                </td>
              </tr>
            )}
            {resumen.map((m) => (
              <tr key={`${m.tipo}-${m.id}`} className="border-b border-piedra-50 last:border-0">
                <td className="hidden whitespace-nowrap px-4 py-2 align-top tabular-nums text-piedra-600 sm:table-cell">{fechaCorta(m.fecha)}</td>
                <td className="px-4 py-2 align-top">
                  <span className="text-tinta">{m.descripcion}</span>
                  {m.detalle && <span className="block text-xs text-piedra-500">{m.detalle}</span>}
                  <span className="block text-xs tabular-nums text-piedra-500 sm:hidden">
                    {fechaCorta(m.fecha)}
                    {m.debe ? ` · debe ${moneda.format(m.debe)}` : ''}
                    {m.haber ? ` · haber ${moneda.format(m.haber)}` : ''}
                  </span>
                </td>
                <td className="hidden px-4 py-2 text-right align-top tabular-nums text-piedra-600 sm:table-cell">
                  {m.debe ? moneda.format(m.debe) : ''}
                </td>
                <td className="hidden px-4 py-2 text-right align-top tabular-nums text-piedra-600 sm:table-cell">
                  {m.haber ? moneda.format(m.haber) : ''}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right align-top font-medium tabular-nums text-tinta">{moneda.format(m.saldo)}</td>
                <td className="px-2 py-2 text-right">
                  {m.tipo === 'pago' && puedePagar && (
                    <button
                      onClick={() => pedirAnulacion(m.id, `pago del ${fechaCorta(m.fecha)}`)}
                      className="whitespace-nowrap rounded-lg px-2 py-1 text-xs text-piedra-400 hover:bg-red-50 hover:text-red-700"
                    >
                      Anular
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface MedioEnPantalla {
  medio: Medio
  importe: string
  referencia: string
  /** El de la cartera que se endosa. */
  cheque_id: string
  /** El propio: banco, número, fecha de pago, e-cheq. */
  cheque: DatosCheque
}

const medioVacio = (): MedioEnPantalla => ({
  medio: 'transferencia',
  importe: '',
  referencia: '',
  cheque_id: '',
  cheque: { ...chequeVacio(), fecha_pago: '' },
})

const etiquetaDeCartera = (c: Cheque) =>
  `${c.electronico ? 'E-cheq' : 'Cheque'} ${c.banco} N° ${c.numero} · ${moneda.format(c.importe)} · ` +
  `${c.diferido ? 'cobra el ' : 'al día '}${fechaCorta(c.fecha_pago)}${c.librador ? ` · ${c.librador}` : ''}`

/*
  El pago. Se escribe con qué se paga; las facturas vienen marcadas solas,
  de la más vieja a la más nueva, y se pueden cambiar. Mientras nadie las
  toque, siguen al importe; en cuanto alguien corrige una, mandan las de
  la persona.
*/
function FormularioDePago({
  proveedorId,
  pendientes,
  onListo,
  onCancelar,
}: {
  proveedorId: string
  pendientes: Pendiente[]
  onListo: () => void
  onCancelar: () => void
}) {
  const [fecha, setFecha] = useState(hoy)
  const [medios, setMedios] = useState<MedioEnPantalla[]>([medioVacio()])
  const [imputado, setImputado] = useState<Record<string, string>>({})
  const [aMano, setAMano] = useState(false)
  const [observaciones, setObservaciones] = useState('')
  const [error, setError] = useState<string | null>(null)

  const importe = Math.round(medios.reduce((t, m) => t + numeroDe(m.importe), 0) * 100) / 100

  useEffect(() => {
    if (aMano) return
    const sugerida = imputacionSugerida(pendientes, importe)
    setImputado(Object.fromEntries(sugerida.map((i) => [i.id, String(Math.abs(i.importe))])))
  }, [importe, pendientes, aMano])

  const imputaciones: Imputacion[] = pendientes
    .filter((p) => numeroDe(imputado[p.id] ?? '') > 0)
    .map((p) => ({
      origen: p.origen,
      id: p.id,
      // Se escribe en positivo; el signo lo pone el comprobante.
      importe: Math.sign(p.pendiente) * numeroDe(imputado[p.id]),
    }))
  const sobra = aCuenta(importe, imputaciones)

  /*
    La cartera, para endosar. Ordenada por fecha de pago: lo que se hace
    correr primero es lo que se cobra antes.
  */
  const cartera = useQuery({ queryKey: ['cartera-para-endosar'], queryFn: carteraParaEndosar })

  const guardar = useMutation({
    mutationFn: () =>
      registrarPago({
        proveedor_id: proveedorId,
        fecha,
        medios: medios
          .filter((m) => numeroDe(m.importe) > 0)
          .map((m) =>
            m.medio === 'cheque_tercero'
              ? { medio: m.medio, importe: numeroDe(m.importe), cheque_id: m.cheque_id }
              : m.medio === 'cheque_propio'
                ? {
                    medio: m.medio,
                    importe: numeroDe(m.importe),
                    banco: m.cheque.banco.trim(),
                    numero: m.cheque.numero.trim(),
                    fecha_cobro: m.cheque.fecha_pago || undefined,
                    electronico: m.cheque.electronico,
                  }
                : { medio: m.medio, importe: numeroDe(m.importe), referencia: m.referencia },
          ),
        imputaciones,
        observaciones,
      }),
    onSuccess: onListo,
    onError: (e) => setError(enCastellano(e, 'No se pudo registrar el pago.')),
  })

  const chequeIncompleto = medios.some(
    (m) =>
      (m.medio === 'cheque_tercero' && !m.cheque_id) ||
      (m.medio === 'cheque_propio' && numeroDe(m.importe) > 0 && faltaEnCheque(m.cheque, 'propio') !== null),
  )
  const excedido = pendientes.some((p) => numeroDe(imputado[p.id] ?? '') > Math.abs(p.pendiente) + 0.001)
  const falta = (importe <= 0 && imputaciones.length === 0) || sobra < 0 || chequeIncompleto || excedido

  const cambiarMedio = (i: number, c: Partial<MedioEnPantalla>) =>
    setMedios((ms) => ms.map((m, j) => (i === j ? { ...m, ...c } : m)))

  return (
    <div className={`${tarjeta} p-5`}>
      <h3 className="font-medium text-tinta">Registrar un pago</h3>

      <label className="mt-3 block w-44">
        <span className="mb-1 block text-xs font-medium text-piedra-600">Fecha del pago</span>
        <input type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} className={campo} />
      </label>

      {/* ── Con qué ── */}
      <h4 className="mt-4 text-sm font-medium text-tinta">Con qué se paga</h4>
      <div className="mt-2 space-y-2">
        {medios.map((m, i) => {
          // Un cheque de la cartera no puede ir en dos renglones.
          const usados = new Set(medios.filter((_, j) => j !== i).map((x) => x.cheque_id).filter(Boolean))
          const disponibles = (cartera.data ?? []).filter((c) => !usados.has(c.id))
          return (
            <div
              key={i}
              className={esCheque(m.medio) ? 'space-y-2 rounded-lg bg-piedra-50 p-3 ring-1 ring-borde' : ''}
            >
              <div className="flex flex-wrap items-end gap-2">
                <label className="block w-full min-w-0 sm:w-52">
                  <span className="mb-1 block text-xs text-piedra-600">Medio</span>
                  <select
                    value={m.medio}
                    onChange={(e) => cambiarMedio(i, { medio: e.target.value as Medio, cheque_id: '' })}
                    className={campo}
                  >
                    {MEDIOS.map((x) => (
                      <option key={x.valor} value={x.valor}>
                        {x.etiqueta}
                      </option>
                    ))}
                  </select>
                </label>

                {m.medio === 'cheque_tercero' ? (
                  /*
                    Se elige de la cartera, no se tipea: tipear de nuevo un
                    cheque que ya está es cómo termina contado dos veces. Y
                    se endosa entero: el importe es el del cheque.
                  */
                  <label className="block min-w-0 flex-1 basis-60">
                    <span className="mb-1 block text-xs text-piedra-600">Cheque</span>
                    <select
                      value={m.cheque_id}
                      onChange={(e) => {
                        const c = disponibles.find((x) => x.id === e.target.value)
                        cambiarMedio(i, { cheque_id: e.target.value, importe: c ? String(c.importe) : '' })
                      }}
                      className={campo}
                    >
                      <option value="">
                        {cartera.isPending
                          ? 'Cargando la cartera…'
                          : disponibles.length
                            ? 'Elegí uno de la cartera…'
                            : 'No hay cheques en la cartera'}
                      </option>
                      {disponibles.map((c) => (
                        <option key={c.id} value={c.id}>
                          {etiquetaDeCartera(c)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="block w-36">
                    <span className="mb-1 block text-xs text-piedra-600">Importe</span>
                    <input value={m.importe} onChange={(e) => cambiarMedio(i, { importe: e.target.value })} inputMode="decimal" className={campo} />
                  </label>
                )}

                {!esCheque(m.medio) && (
                  <label className="block min-w-40 flex-1">
                    <span className="mb-1 block text-xs text-piedra-600">
                      Referencia <span className="text-piedra-400">(opcional)</span>
                    </span>
                    <input
                      value={m.referencia}
                      onChange={(e) => cambiarMedio(i, { referencia: e.target.value })}
                      placeholder={m.medio === 'transferencia' ? 'N° de operación' : ''}
                      className={campo}
                    />
                  </label>
                )}
                {medios.length > 1 && (
                  <button
                    onClick={() => setMedios((ms) => ms.filter((_, j) => j !== i))}
                    className="rounded-lg px-2.5 py-2 text-sm text-piedra-400 hover:bg-red-50 hover:text-red-700"
                  >
                    Quitar
                  </button>
                )}
              </div>

              {m.medio === 'cheque_tercero' && m.cheque_id && (
                <p className="text-xs text-piedra-500">
                  Se endosa entero: {moneda.format(numeroDe(m.importe))}. Sale de la cartera y queda a nombre de
                  este proveedor.
                </p>
              )}
              {m.medio === 'cheque_propio' && (
                <CamposCheque
                  valor={m.cheque}
                  onChange={(d) => cambiarMedio(i, { cheque: d })}
                  origen="propio"
                  conLibrador={false}
                />
              )}
            </div>
          )
        })}
      </div>
      <button onClick={() => setMedios((ms) => [...ms, medioVacio()])} className="mt-2 text-sm text-marca-700 hover:underline">
        + Otro medio
      </button>

      {medios.some((m) => m.medio === 'transferencia') && <DatosParaTransferir proveedorId={proveedorId} />}

      {/* ── A qué ── */}
      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium text-tinta">Qué se paga</h4>
        {aMano && (
          <button onClick={() => setAMano(false)} className="text-xs text-marca-700 hover:underline">
            Volver a marcar las más viejas
          </button>
        )}
      </div>
      <p className="text-xs text-piedra-400">
        Vienen marcadas de la más vieja a la más nueva, descontando primero las notas de crédito. Se puede cambiar.
      </p>

      {pendientes.length === 0 ? (
        <p className="mt-2 text-sm text-piedra-500">No hay comprobantes pendientes: el pago queda a cuenta.</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <tbody>
            {pendientes.map((p) => (
              <tr key={p.id} className="border-b border-piedra-50 last:border-0">
                <td className="py-1.5 pr-3">
                  <span className="text-tinta">{p.descripcion}</span>
                  <span className="ml-2 text-xs text-piedra-400">
                    {p.vencimiento ? `vence ${fechaCorta(p.vencimiento)}` : fechaCorta(p.fecha)}
                  </span>
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-piedra-500">
                  {p.pendiente < 0 ? 'a favor ' : 'debe '}
                  {moneda.format(Math.abs(p.pendiente))}
                </td>
                <td className="w-36 py-1.5">
                  <input
                    value={imputado[p.id] ?? ''}
                    onChange={(e) => {
                      setAMano(true)
                      setImputado((x) => ({ ...x, [p.id]: e.target.value }))
                    }}
                    inputMode="decimal"
                    aria-label={`Cuánto se imputa a ${p.descripcion}`}
                    className={campo}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-medium text-piedra-600">
          Observaciones <span className="font-normal text-piedra-400">(opcional)</span>
        </span>
        <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className={campo} />
      </label>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-piedra-100 pt-4">
        <div className="text-sm">
          <p className="text-xs text-piedra-500">Sale</p>
          <p className="text-2xl font-semibold tabular-nums text-tinta">{moneda.format(importe)}</p>
          {sobra > 0 && <p className="text-xs text-piedra-500">{moneda.format(sobra)} queda a cuenta</p>}
          {sobra < 0 && (
            <p className="text-xs text-red-700">
              Lo marcado pasa lo que sale por {moneda.format(-sobra)}.
            </p>
          )}
          {excedido && <p className="text-xs text-red-700">A un comprobante se le imputa más de lo que tiene pendiente.</p>}
          {chequeIncompleto && (
            <p className="text-xs text-red-700">Falta elegir el cheque de la cartera, o completar el banco, el número o la fecha del propio.</p>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={onCancelar} className={boton.suave}>
            Cancelar
          </button>
          <button
            onClick={() => {
              setError(null)
              guardar.mutate()
            }}
            disabled={falta || guardar.isPending}
            className={boton.principal}
          >
            {guardar.isPending ? 'Guardando…' : 'Registrar el pago'}
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

/*
  Adónde transferirle, listo para copiar y pegar en el home banking. Es
  para no pedirle al proveedor el CBU cada vez, y para no tipearlo: un
  número cambiado es plata que va a otra persona.
*/
function DatosParaTransferir({ proveedorId }: { proveedorId: string }) {
  const datos = useQuery({ queryKey: ['datos-para-transferir', proveedorId], queryFn: () => datosParaTransferir(proveedorId) })
  const [copiado, setCopiado] = useState<string | null>(null)

  async function copiar(que: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(que)
      setTimeout(() => setCopiado((c) => (c === que ? null : c)), 2000)
    } catch {
      setCopiado(null)
    }
  }

  if (datos.isPending) return null
  const d = datos.data
  if (!d?.cbu && !d?.alias) {
    return (
      <p className="mt-3 rounded-lg bg-piedra-50 px-3 py-2 text-xs text-piedra-600 ring-1 ring-borde">
        Este proveedor no tiene cargados el CBU ni el alias. Se cargan en su ficha, en la pestaña Proveedores, y
        desde ahí aparecen acá listos para copiar.
      </p>
    )
  }

  // Lo que se copia es el número pelado; lo que se lee, en grupos.
  const renglones = [
    d.cbu && { etiqueta: esCvu(d.cbu) ? 'CVU' : 'CBU', valor: d.cbu, legible: cbuLegible(d.cbu), detalle: bancoDelCbu(d.cbu) },
    d.alias && { etiqueta: 'Alias', valor: d.alias, legible: d.alias, detalle: null },
    d.numero_documento && { etiqueta: 'CUIT', valor: d.numero_documento, legible: d.numero_documento, detalle: null },
  ].filter((r): r is { etiqueta: string; valor: string; legible: string; detalle: string | null } => !!r)

  return (
    <div className="mt-3 rounded-lg bg-marca-50/60 px-3 py-2 ring-1 ring-marca-200">
      <p className="text-xs font-medium text-marca-900">Para transferirle</p>
      <ul className="mt-1 space-y-1">
        {renglones.map(({ etiqueta, valor, legible, detalle }) => (
          <li key={etiqueta} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="w-12 shrink-0 text-xs text-piedra-500">{etiqueta}</span>
            <span className="min-w-0 font-mono break-all text-tinta">{legible}</span>
            {detalle && <span className="text-xs text-piedra-500">{detalle}</span>}
            <button
              type="button"
              onClick={() => copiar(etiqueta, valor)}
              className="ml-auto rounded-md px-2 py-0.5 text-xs font-medium text-marca-700 ring-1 ring-marca-200 hover:bg-white"
            >
              {copiado === etiqueta ? 'Copiado' : 'Copiar'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/*
  Lo que se le debía el día que se dejó OBTech. Se carga una vez por
  proveedor, mirando el saldo que muestra OBTech ese día.
*/
function FormularioSaldoInicial({
  proveedorId,
  onListo,
  onCancelar,
}: {
  proveedorId: string
  onListo: () => void
  onCancelar: () => void
}) {
  const [fecha, setFecha] = useState(hoy)
  const [importe, setImporte] = useState('')
  const [aFavor, setAFavor] = useState(false)
  const [detalle, setDetalle] = useState('Saldo según OBTech')
  const [error, setError] = useState<string | null>(null)

  const guardar = useMutation({
    mutationFn: () =>
      definirSaldoInicial({
        proveedor_id: proveedorId,
        fecha,
        importe: (aFavor ? -1 : 1) * numeroDe(importe),
        detalle,
      }),
    onSuccess: onListo,
    onError: (e) => setError(enCastellano(e, 'No se pudo guardar el saldo.')),
  })

  return (
    <div className={`${tarjeta} p-5`}>
      <h3 className="font-medium text-tinta">Saldo inicial</h3>
      <p className="mt-1 text-sm text-piedra-500">
        Lo que se le debía a este proveedor el día que se dejó OBTech. Las facturas de antes de esa fecha no
        se cargan: ya están adentro de este número. Se le pueden imputar pagos como a una factura.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block w-44">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Al día</span>
          <input type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value)} className={campo} />
        </label>
        <label className="block w-44">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Importe</span>
          <input value={importe} onChange={(e) => setImporte(e.target.value)} inputMode="decimal" className={campo} />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-piedra-600">
          <input type="checkbox" checked={aFavor} onChange={(e) => setAFavor(e.target.checked)} />
          Es a favor de Gross
        </label>
        <label className="block min-w-48 flex-1">
          <span className="mb-1 block text-xs font-medium text-piedra-600">Detalle</span>
          <input value={detalle} onChange={(e) => setDetalle(e.target.value)} className={campo} />
        </label>
      </div>
      <p className="mt-2 text-xs text-piedra-400">Con importe cero se quita el saldo que hubiera.</p>

      <div className="mt-4 flex justify-end gap-3">
        <button onClick={onCancelar} className={boton.suave}>
          Cancelar
        </button>
        <button
          onClick={() => {
            setError(null)
            guardar.mutate()
          }}
          disabled={!fecha || importe.trim() === '' || guardar.isPending}
          className={boton.principal}
        >
          {guardar.isPending ? 'Guardando…' : 'Guardar el saldo'}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}
    </div>
  )
}
