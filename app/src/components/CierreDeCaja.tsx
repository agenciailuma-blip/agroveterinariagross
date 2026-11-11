import { useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { cerrarCaja } from '@/lib/api/caja'
import { useEscapeCierra } from '@/lib/atajos'
import { resumenDeCaja } from '@/lib/api/cierreCaja'
import type { PorMedio, ResumenCaja } from '@/lib/api/cierreCaja'
import { leerCantidad } from '@/lib/api/ventas'
import { abrirPlanillaCaja } from '@/lib/escritorio'
import { enCastellano } from '@/lib/errores'
import { boton } from '@/estilos'
import { moneda } from '@/lib/tipos'

/*
  ─────────────────────────────────────────────────────────────
  Cerrar la caja

  Primero se cuenta, a ciegas: antes de cerrar no se muestra cuánto
  efectivo espera el sistema, porque quien lo ve antes de contar tiende
  a "encontrar" ese número. Lo que sí se muestra es lo que hay que
  entregar aparte —los cheques— y cuántas ventas y movimientos tuvo.

  Después de cerrar, el detalle completo: de dónde sale el efectivo que
  tenía que haber, cada medio de pago de las ventas y de las cobranzas,
  y la planilla para imprimir, como en el sistema anterior.
  ─────────────────────────────────────────────────────────────
*/

export default function CierreDeCaja({
  cajaId,
  onCerrada,
  onCancelar,
}: {
  cajaId: string
  onCerrada: () => void
  onCancelar: () => void
}) {
  const [declarado, setDeclarado] = useState('')
  // La cierra el encargado: el local entra con un solo usuario y quién
  // cerró lo dice el PIN.
  const [pin, setPin] = useState('')
  const [cerrada, setCerrada] = useState(false)

  const resumen = useQuery({ queryKey: ['resumen-de-caja', cajaId], queryFn: () => resumenDeCaja(cajaId) })
  const r = resumen.data

  const cerrar = useMutation({
    mutationFn: () => cerrarCaja(cajaId, leerCantidad(declarado) ?? 0, pin),
    onSuccess: async () => {
      // Ya cerrada, el resumen trae lo que esperaba el sistema.
      await resumen.refetch()
      setCerrada(true)
    },
  })

  // Ya cerrada, Esc no la deja a medias: se sale con «Listo».
  const ventana = useRef<HTMLDivElement>(null)
  useEscapeCierra(ventana, onCancelar, !cerrada && !cerrar.isPending)

  const movimientos = r?.movimientos.filter((m) => !m.anulado_en).length ?? 0

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-tinta/50 p-4"
      role="dialog"
      aria-modal="true"
      ref={ventana}
    >
      <div className={`w-full rounded-xl bg-white p-5 shadow-xl sm:p-6 ${cerrada ? 'max-w-xl' : 'max-w-md'}`}>
        <h2 className="font-semibold text-tinta">{cerrada ? 'Caja cerrada' : 'Cerrar caja'}</h2>

        {cerrada && r ? (
          <div className="mt-4 space-y-4">
            <Efectivo r={r} />
            <Medios titulo="Ventas por medio de pago" medios={r.ventas.por_medio} />
            <PorCajero r={r} />
            {r.cobranzas.por_medio.length > 0 && <Medios titulo="Cobranzas por medio de pago" medios={r.cobranzas.por_medio} />}
            {r.devoluciones.length > 0 && (
              <dl className="text-sm text-piedra-600">
                <Fila
                  nombre={`Notas de crédito y devoluciones (${r.devoluciones.length})`}
                  valor={moneda.format(r.devoluciones.reduce((s, d) => s + d.importe, 0))}
                />
              </dl>
            )}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void abrirPlanillaCaja(cajaId)} className={boton.secundario}>
                Imprimir planilla
              </button>
              <button onClick={onCerrada} className={`${boton.principal} flex-1`}>
                Listo
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (declarado !== '' && pin !== '' && !cerrar.isPending) cerrar.mutate()
            }}
          >
            <dl className="mt-3 space-y-1 text-sm text-piedra-600">
              <Fila nombre="Monto inicial" valor={r ? moneda.format(r.caja.monto_inicial) : '—'} />
              <Fila nombre="Ventas cobradas" valor={r ? String(r.ventas.cantidad) : '—'} />
              <Fila nombre="Ingresos y egresos cargados" valor={r ? String(movimientos) : '—'} />
            </dl>

            {/*
              Los cheques no se cuentan con el efectivo —no son plata del
              cajón—, pero se entregan con el cierre. La lista es para
              mirar que el papel que se entrega es el mismo que entró.
            */}
            {(r?.cheques_recibidos.length ?? 0) > 0 && (
              <div className="mt-4 rounded-lg bg-piedra-50 px-3 py-2 ring-1 ring-borde">
                <p className="text-xs font-medium text-piedra-600">
                  Cheques del turno: entregalos con el cierre. No se cuentan con el efectivo.
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-piedra-600">
                  {r!.cheques_recibidos.map((c, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {c.nombre}
                        {c.cliente ? ` · ${c.cliente}` : ''}
                      </span>
                      <span className="shrink-0 tabular-nums">{moneda.format(c.importe)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-medium text-piedra-600">¿Cuánto efectivo hay en la caja?</span>
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                value={declarado}
                onChange={(e) => {
                  if (/^\d*[.,]?\d{0,2}$/.test(e.target.value)) setDeclarado(e.target.value)
                }}
                className="w-full rounded-lg border border-borde px-3 py-2.5 text-right text-lg tabular-nums outline-none focus:border-marca-500"
              />
              <span className="mt-1 block text-xs text-piedra-400">
                Contalo antes de mirar el número que espera el sistema. Si no, el arqueo no sirve para nada.
              </span>
            </label>

            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-medium text-piedra-600">PIN del encargado</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-lg border border-borde px-3 py-2.5 text-center text-lg tracking-widest outline-none focus:border-marca-500"
              />
            </label>

            {(cerrar.isError || resumen.isError) && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {enCastellano(cerrar.error ?? resumen.error, 'No se pudo cerrar.')}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button type="submit" disabled={declarado === '' || pin === '' || cerrar.isPending} className={`${boton.principal} flex-1 py-2.5`}>
                {cerrar.isPending ? 'Cerrando…' : 'Cerrar caja'}
              </button>
              <button type="button" onClick={onCancelar} className={boton.suave}>
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function Fila({ nombre, valor, fuerte = false }: { nombre: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${fuerte ? 'font-medium text-tinta' : ''}`}>
      <dt className="min-w-0">{nombre}</dt>
      <dd className="shrink-0 tabular-nums">{valor}</dd>
    </div>
  )
}

/** De dónde sale el efectivo que tenía que haber, y cuánto se contó. */
function Efectivo({ r }: { r: ResumenCaja }) {
  const e = r.efectivo
  const diferencia = r.caja.diferencia ?? 0
  return (
    <div>
      <p className="mb-1 text-xs font-medium tracking-wide text-piedra-400 uppercase">Efectivo</p>
      <dl className="space-y-1 text-sm text-piedra-600">
        <Fila nombre="Monto inicial" valor={moneda.format(e.inicial)} />
        <Fila nombre="+ Ventas en efectivo" valor={moneda.format(e.ventas)} />
        {e.cobranzas !== 0 && <Fila nombre="+ Cobranzas en efectivo" valor={moneda.format(e.cobranzas)} />}
        {e.ingresos !== 0 && <Fila nombre="+ Ingresos" valor={moneda.format(e.ingresos)} />}
        {e.egresos !== 0 && <Fila nombre="− Egresos" valor={moneda.format(Math.abs(e.egresos))} />}
        <div className="border-t border-borde pt-1">
          <Fila nombre="El sistema esperaba" valor={moneda.format(e.esperado ?? 0)} fuerte />
        </div>
        <Fila nombre="Contaste" valor={moneda.format(r.caja.monto_declarado ?? 0)} fuerte />
        <div
          className={`flex justify-between border-t border-borde pt-1 font-semibold ${
            Math.abs(diferencia) < 0.01 ? 'text-verde-700' : diferencia > 0 ? 'text-marca-700' : 'text-red-700'
          }`}
        >
          <dt>Diferencia</dt>
          <dd className="tabular-nums">{moneda.format(diferencia)}</dd>
        </div>
      </dl>
    </div>
  )
}

/** Una caja para todos los puestos: quién cobró cada cosa. */
function PorCajero({ r }: { r: ResumenCaja }) {
  const filas = r.ventas.por_cajero ?? []
  if (filas.length < 2 && !r.caja.cerro) return null
  return (
    <div>
      <p className="mb-1 text-xs font-medium tracking-wide text-piedra-400 uppercase">Quién cobró</p>
      <dl className="space-y-1 text-sm text-piedra-600">
        {filas.map((c) => (
          <div key={c.cajero} className="flex justify-between gap-3">
            <dt className="min-w-0 truncate">
              {c.cajero} ({c.cantidad})
            </dt>
            <dd className="shrink-0 text-right tabular-nums">
              {moneda.format(c.total)}
              {c.efectivo > 0 && <span className="block text-xs text-piedra-400">{moneda.format(c.efectivo)} en efectivo</span>}
            </dd>
          </div>
        ))}
        {r.caja.cerro && <p className="pt-1 text-xs text-piedra-500">La cerró {r.caja.cerro}.</p>}
      </dl>
    </div>
  )
}

function Medios({ titulo, medios }: { titulo: string; medios: PorMedio[] }) {
  const total = medios.reduce((s, m) => s + m.importe, 0)
  return (
    <div>
      <p className="mb-1 text-xs font-medium tracking-wide text-piedra-400 uppercase">{titulo}</p>
      {medios.length === 0 ? (
        <p className="text-sm text-piedra-500">Ninguna.</p>
      ) : (
        <dl className="space-y-1 text-sm text-piedra-600">
          {medios.map((m) => (
            <Fila key={m.medio} nombre={`${m.medio} (${m.cantidad})`} valor={moneda.format(m.importe)} />
          ))}
          <div className="border-t border-borde pt-1">
            <Fila nombre="Total" valor={moneda.format(total)} fuerte />
          </div>
        </dl>
      )}
    </div>
  )
}
