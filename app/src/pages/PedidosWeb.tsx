import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { useTerminal } from '@/lib/terminal'
import { confirmar, pedirTexto } from '@/components/Dialogo'
import DevolucionParcial from '@/components/DevolucionParcial'
import { emitirRemitoDePedido } from '@/lib/api/noFiscal'
import { abrirComprobante, abrirNoFiscal } from '@/lib/escritorio'
import { enCastellano } from '@/lib/errores'
import { moneda, numero } from '@/lib/tipos'
import { boton, botonChico, tarjeta } from '@/estilos'
import {
  accionesPosibles,
  cancelar,
  esperaFactura,
  ETIQUETA_ESTADO,
  facturar,
  listarPedidos,
  marcar,
  pideRevision,
  reintegroHecho,
  reintegrosDe,
  textoEspera,
  type EstadoPedido,
  type PedidoWeb,
  type Vista,
} from '@/lib/api/pedidos'

/*
  ─────────────────────────────────────────────────────────────
  Pedidos web

  Lo que compraron en la tienda online y hay que preparar. El pedido
  entra solo, como una venta; acá se decide qué pasa después.

  ─── NADA SE FACTURA SOLO ───

  Decisión tomada: la factura la emite una persona, después de armar el
  paquete, así dice lo que realmente se entrega. Por eso lo primero que
  muestra cada pedido pagado es cuánto hace que espera factura: para
  ARCA corresponde al día del cobro, y un pedido que se pasó del día se
  ve en rojo.

  ─── LA PLATA DE LA WEB NO LA DEVUELVE EL SISTEMA ───

  La tiene la pasarela de la tienda. Cuando se cancela o se devuelve
  algo que se pagó en la web, queda un reintegro pendiente a la vista
  hasta que alguien anota que la tienda lo devolvió. Un pedido con plata
  por devolver sigue en la primera pestaña: el trabajo no terminó.
  ─────────────────────────────────────────────────────────────
*/

const VISTAS: { valor: Vista; etiqueta: string }[] = [
  { valor: 'por_preparar', etiqueta: 'Por preparar' },
  { valor: 'entregados', etiqueta: 'Entregados' },
  { valor: 'cancelados', etiqueta: 'Cancelados' },
]

const COLOR_ESTADO: Record<EstadoPedido, string> = {
  recibido: 'bg-marca-50 text-marca-700 ring-marca-200',
  preparado: 'bg-acento-100 text-acento-600 ring-acento-300',
  entregado: 'bg-verde-50 text-verde-700 ring-verde-200',
  cancelado: 'bg-piedra-100 text-piedra-600 ring-borde',
}

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function PedidosWeb() {
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()
  const [vista, setVista] = useState<Vista>('por_preparar')
  const [elegidoId, setElegidoId] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const puedeVer = tienePermiso('tienda.pedidos')

  const pedidos = useQuery({
    queryKey: ['pedidos-web', vista],
    queryFn: () => listarPedidos(vista),
    enabled: puedeVer,
    // Los pedidos entran solos, sin que nadie toque nada acá.
    refetchInterval: 60_000,
  })

  if (!puedeVer) {
    return (
      <p className="rounded-xl bg-piedra-50 px-4 py-3 text-sm text-piedra-600 ring-1 ring-borde">
        No tenés permiso para atender los pedidos de la tienda.
      </p>
    )
  }

  const filas = pedidos.data ?? []
  const elegido = filas.find((p) => p.id === elegidoId) ?? null

  function refrescar() {
    qc.invalidateQueries({ queryKey: ['pedidos-web'] })
    qc.invalidateQueries({ queryKey: ['pedidos-pendientes'] })
    qc.invalidateQueries({ queryKey: ['reintegros'] })
  }

  function avisar(m: string) {
    setError(null)
    setAviso(m)
  }

  function fallar(m: string) {
    setAviso(null)
    setError(m)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-tinta">Pedidos web</h1>
          <p className="text-sm text-piedra-500">
            Lo que compraron en la tienda online: prepararlo, facturarlo y entregarlo.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-piedra-100 p-1">
          {VISTAS.map((v) => (
            <button
              key={v.valor}
              onClick={() => {
                setVista(v.valor)
                setElegidoId(null)
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                vista === v.valor ? 'bg-white text-tinta shadow-sm' : 'text-piedra-500 hover:text-tinta'
              }`}
            >
              {v.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {aviso && (
        <p className="rounded-xl bg-verde-50 px-4 py-3 text-sm font-medium text-verde-800 ring-1 ring-verde-200">
          {aviso}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      <div className="flex gap-5">
        {/*
          En pantallas angostas la ficha reemplaza a la lista, como en
          Clientes: al lado no entra.
        */}
        <section className={elegido ? 'hidden min-w-0 flex-1 lg:block' : 'min-w-0 flex-1'}>
          {pedidos.isPending ? (
            <p className="text-sm text-piedra-500">Cargando…</p>
          ) : pedidos.isError ? (
            <p role="alert" className="text-sm text-red-700">
              {enCastellano(pedidos.error, 'No se pudieron leer los pedidos.')}
            </p>
          ) : filas.length === 0 ? (
            <div className="grid place-items-center rounded-xl border border-dashed border-borde bg-white/60 py-12">
              <p className="text-sm text-piedra-400">
                {vista === 'por_preparar' ? 'No hay pedidos para preparar.' : 'No hay pedidos acá.'}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {filas.map((p) => (
                <FilaPedido
                  key={p.id}
                  p={p}
                  activo={p.id === elegidoId}
                  onElegir={() => setElegidoId(p.id === elegidoId ? null : p.id)}
                />
              ))}
            </ul>
          )}
        </section>

        {elegido && (
          <FichaPedido
            key={elegido.id}
            p={elegido}
            onCerrar={() => setElegidoId(null)}
            onAviso={(m) => {
              avisar(m)
              refrescar()
            }}
            onError={(m) => {
              fallar(m)
              refrescar()
            }}
          />
        )}
      </div>
    </div>
  )
}

function Estado({ estado }: { estado: EstadoPedido }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${COLOR_ESTADO[estado]}`}>
      {ETIQUETA_ESTADO[estado]}
    </span>
  )
}

function Espera({ p }: { p: PedidoWeb }) {
  const espera = esperaFactura(p)
  const texto = textoEspera(espera)
  if (!texto) return null
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
        espera.tipo === 'vencida' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'
      }`}
    >
      {texto}
    </span>
  )
}

function FilaPedido({ p, activo, onElegir }: { p: PedidoWeb; activo: boolean; onElegir: () => void }) {
  return (
    <li>
      <button
        onClick={onElegir}
        className={`${tarjeta} flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 text-left transition-colors hover:bg-marca-50/40 ${
          activo ? 'ring-2 ring-marca-500' : ''
        }`}
      >
        <span className="font-mono text-xs text-piedra-500">{p.numero}</span>
        {/* En el teléfono, el nombre va en su renglón: al lado del número no entra. */}
        <span className="order-first w-full min-w-0 truncate font-medium text-tinta sm:order-none sm:w-auto sm:flex-1">
          {p.cliente_nombre ?? '—'}
        </span>
        <span className="text-xs text-piedra-500">
          {p.entrega === 'envio' ? `Envío${p.localidad ? ` · ${p.localidad}` : ''}` : 'Retira en el local'}
        </span>
        <span className="text-xs text-piedra-500">{p.pagado_en_la_web ? 'Pagó en la web' : 'Paga en el local'}</span>
        <span className="font-medium tabular-nums text-tinta">{moneda.format(p.total)}</span>
        <Estado estado={p.estado} />
        <span className="flex w-full flex-wrap gap-1.5 empty:hidden">
          <Espera p={p} />
          {pideRevision(p) && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Revisar</span>
          )}
          {p.a_reintegrar > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
              A devolver por la tienda: {moneda.format(p.a_reintegrar)}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-piedra-500">{etiqueta}</dt>
      <dd className="text-sm text-tinta">{children}</dd>
    </div>
  )
}

function FichaPedido({
  p,
  onCerrar,
  onAviso,
  onError,
}: {
  p: PedidoWeb
  onCerrar: () => void
  onAviso: (m: string) => void
  onError: (m: string) => void
}) {
  const { tienePermiso } = useAuth()
  const { terminal } = useTerminal()
  const [devolviendo, setDevolviendo] = useState(false)
  const acciones = accionesPosibles(p)

  const puedeFacturar = tienePermiso('facturacion.emitir')
  const puedeCancelar = tienePermiso('ventas.anular')
  const puedeRemitir = tienePermiso('facturacion.no_fiscal_emitir')

  const reintegros = useQuery({
    queryKey: ['reintegros', p.id],
    queryFn: () => reintegrosDe(p.id),
  })

  // Una sola acción por vez: dos clics seguidos en «Facturar» no
  // tienen que llegar a la base como dos pedidos de factura.
  const accion = useMutation({
    mutationFn: async (hacer: () => Promise<string | null>) => hacer(),
    onSuccess: (m) => {
      if (m) onAviso(m)
    },
    onError: (e) => onError(enCastellano(e)),
  })
  const ocupado = accion.isPending

  async function alPreparar() {
    accion.mutate(async () => {
      await marcar(p.id, 'preparado')
      return `Pedido ${p.numero}: preparado.`
    })
  }

  async function alFacturar() {
    let loRevise = false
    if (pideRevision(p)) {
      loRevise = await confirmar({
        titulo: 'Este pedido está marcado para revisar',
        detalle: `${p.revisar}. Queda anotado que lo revisaste vos.`,
        aceptar: 'Lo revisé, facturar',
      })
      if (!loRevise) return
    }
    accion.mutate(async () => {
      const r = await facturar(p.id, loRevise)
      if (r.problema) {
        // La factura ya existe con su número: lo que falta es el CAE.
        onError(
          `La factura quedó armada pero ARCA no la autorizó: ${r.problema}. Se reintenta desde acá o desde Facturación.`,
        )
        return null
      }
      abrirComprobante(r.comprobanteId)
      return `Pedido ${p.numero}: facturado. La factura quedó abierta para imprimir o guardar en PDF.`
    })
  }

  async function alRemitir() {
    const destino = [p.domicilio, p.localidad].filter(Boolean).join(', ') || 'sin domicilio cargado'
    const ok = await confirmar({
      titulo: `Remito del pedido ${p.numero}`,
      detalle: `Para ${p.cliente_nombre ?? 'el comprador'}, a ${destino}.`,
      aceptar: 'Emitir el remito',
    })
    if (!ok) return
    accion.mutate(async () => {
      const r = await emitirRemitoDePedido(p.venta_id, terminal?.id ?? null, {
        serie: terminal?.prefijo ?? null,
        observaciones: `Pedido web ${p.numero}`,
        entrega: { domicilio: p.domicilio, localidad: p.localidad, contacto: p.contacto },
      })
      abrirNoFiscal(r.id)
      return `Pedido ${p.numero}: remito emitido.`
    })
  }

  async function alEntregar() {
    const ok = await confirmar({
      titulo: `¿Se entregó el pedido ${p.numero}?`,
      detalle: p.entrega === 'envio' ? 'Salió con el envío.' : 'El cliente lo retiró en el local.',
      aceptar: 'Sí, entregado',
    })
    if (!ok) return
    accion.mutate(async () => {
      await marcar(p.id, 'entregado')
      return `Pedido ${p.numero}: entregado.`
    })
  }

  async function alCancelar() {
    const consecuencias = [
      p.comprobante_id ? 'Sale una nota de crédito por la factura.' : 'La venta se anula y el stock vuelve.',
      p.pagado_en_la_web
        ? `Queda anotado un reintegro de ${moneda.format(p.total)}: la tienda se lo tiene que devolver al comprador.`
        : null,
    ]
      .filter(Boolean)
      .join(' ')
    const motivo = await pedirTexto({
      titulo: `Cancelar el pedido ${p.numero}`,
      detalle: consecuencias,
      etiqueta: 'Motivo',
      ejemplo: 'El cliente se arrepintió',
      minimo: 3,
      aceptar: 'Cancelar el pedido',
      peligro: true,
    })
    if (!motivo) return
    accion.mutate(async () => {
      const r = await cancelar(p.id, motivo)
      if (r.problema) {
        onError(
          `El pedido quedó cancelado, pero ARCA no autorizó la nota de crédito: ${r.problema}. Se reintenta desde Facturación.`,
        )
        return null
      }
      return `Pedido ${p.numero}: cancelado.`
    })
  }

  async function alReintegrar(id: string, importe: number) {
    const referencia = await pedirTexto({
      titulo: `¿La tienda ya devolvió ${moneda.format(importe)}?`,
      detalle: 'Anotá la referencia del reintegro en la pasarela de pago, para poder encontrarlo si el cliente dice que no le llegó.',
      etiqueta: 'Referencia del reintegro',
      minimo: 3,
      aceptar: 'Anotar como devuelto',
    })
    if (!referencia) return
    accion.mutate(async () => {
      await reintegroHecho(id, referencia)
      return `Pedido ${p.numero}: reintegro anotado.`
    })
  }

  return (
    <aside className={`${tarjeta} w-full shrink-0 space-y-4 self-start p-5 lg:w-[30rem]`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-piedra-500">
            Pedido <span className="font-mono">{p.numero}</span> · venta {p.venta_codigo}
          </p>
          <h2 className="text-lg font-semibold text-tinta">{p.cliente_nombre ?? '—'}</h2>
          <p className="text-xs text-piedra-500">Recibido el {fechaHora(p.recibido_en)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Estado estado={p.estado} />
          <button onClick={onCerrar} className={botonChico.suave} aria-label="Cerrar el pedido">
            Cerrar
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 empty:hidden">
        <Espera p={p} />
      </div>

      {p.revisar && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ring-1 ${
            p.revisado_en ? 'bg-piedra-50 text-piedra-600 ring-borde' : 'bg-amber-50 text-amber-900 ring-amber-200'
          }`}
        >
          <p className="font-medium">{p.revisado_en ? 'Revisado' : 'Hay que revisarlo antes de facturar'}</p>
          <p className="text-xs">{p.revisar}</p>
        </div>
      )}

      {p.estado === 'cancelado' && (
        <p className="rounded-lg bg-piedra-50 px-3 py-2 text-sm text-piedra-600 ring-1 ring-borde">
          Cancelado{p.cancelado_en ? ` el ${fechaHora(p.cancelado_en)}` : ''}
          {p.motivo_cancelacion ? `: ${p.motivo_cancelacion}` : ''}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3">
        <Dato etiqueta="Documento">{p.cliente_documento ?? '—'}</Dato>
        <Dato etiqueta="Mail">{p.email ?? '—'}</Dato>
        <Dato etiqueta="Entrega">
          {p.entrega === 'envio'
            ? [p.domicilio, p.localidad].filter(Boolean).join(', ') || 'Envío, sin domicilio'
            : 'Retira en el local'}
        </Dato>
        <Dato etiqueta="Contacto">{p.contacto ?? '—'}</Dato>
        <Dato etiqueta="Pago">
          {p.pagado_en_la_web ? (
            <>Pagó en la web{p.referencia_pago ? ` · ${p.referencia_pago}` : ''}</>
          ) : p.venta_estado === 'cobrada' ? (
            'Cobrado en la caja'
          ) : (
            'Paga en el local: se cobra y se factura en la caja'
          )}
        </Dato>
        <Dato etiqueta="Factura">
          {p.comprobante ? (
            <button onClick={() => abrirComprobante(p.comprobante_id!)} className="text-marca-700 underline">
              {p.comprobante}
            </button>
          ) : (
            '—'
          )}
          {p.comprobante_estado && p.comprobante_estado !== 'autorizado' && p.comprobante_estado !== 'informado' && (
            <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">
              {p.comprobante_estado === 'pendiente'
                ? 'esperando el CAE'
                : p.comprobante_estado === 'rechazado'
                  ? 'rechazada por ARCA'
                  : p.comprobante_estado}
            </span>
          )}
        </Dato>
      </dl>

      <table className="w-full text-sm">
        <thead className="border-b border-borde text-left text-xs text-piedra-500">
          <tr>
            <th className="py-1.5 font-medium">Producto</th>
            <th className="py-1.5 text-right font-medium">Cant.</th>
            <th className="py-1.5 text-right font-medium">Importe</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-piedra-100">
          {p.lineas.map((l, i) => (
            <tr key={i}>
              <td className="py-1.5 text-tinta">
                {l.descripcion}
                <span className="block font-mono text-xs text-piedra-400">{l.codigo}</span>
              </td>
              <td className="py-1.5 text-right tabular-nums">{numero.format(l.cantidad)}</td>
              <td className="py-1.5 text-right tabular-nums">{moneda.format(l.importe)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-borde font-medium">
            <td className="py-1.5" colSpan={2}>
              Total
            </td>
            <td className="py-1.5 text-right tabular-nums">{moneda.format(p.total)}</td>
          </tr>
          {p.devuelto > 0 && (
            <tr className="text-xs text-piedra-500">
              <td className="py-1" colSpan={2}>
                Devuelto
              </td>
              <td className="py-1 text-right tabular-nums">−{moneda.format(p.devuelto)}</td>
            </tr>
          )}
        </tfoot>
      </table>

      {p.observaciones && (
        <p className="rounded-lg bg-piedra-50 px-3 py-2 text-sm text-piedra-700">{p.observaciones}</p>
      )}

      {(reintegros.data?.length ?? 0) > 0 && (
        <section>
          <h3 className="mb-1.5 text-xs font-medium text-piedra-500">Plata para devolverle al comprador</h3>
          <ul className="space-y-1.5">
            {reintegros.data!.map((r) => (
              <li
                key={r.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ring-1 ${
                  r.hecho_en ? 'bg-piedra-50 ring-borde' : 'bg-red-50 ring-red-200'
                }`}
              >
                <span>
                  <span className="font-medium tabular-nums">{moneda.format(r.importe)}</span>
                  <span className="text-xs text-piedra-500">
                    {' '}
                    · {r.motivo === 'cancelacion' ? 'por la cancelación' : 'por una devolución'}
                  </span>
                </span>
                {r.hecho_en ? (
                  <span className="text-xs text-piedra-500">
                    Devuelto el {fechaHora(r.hecho_en)} · {r.referencia}
                  </span>
                ) : (
                  <button
                    onClick={() => alReintegrar(r.id, r.importe)}
                    disabled={ocupado}
                    className={botonChico.secundario}
                  >
                    La tienda ya lo devolvió
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.remito_id && (
        <p className="text-sm text-piedra-600">
          Remito emitido ·{' '}
          <button onClick={() => abrirNoFiscal(p.remito_id!)} className="text-marca-700 underline">
            Ver
          </button>
        </p>
      )}

      <div className="flex flex-wrap gap-2 border-t border-borde pt-4">
        {acciones.preparar && (
          <button onClick={alPreparar} disabled={ocupado} className={boton.secundario}>
            Marcar preparado
          </button>
        )}
        {acciones.facturar && puedeFacturar && (
          <button onClick={alFacturar} disabled={ocupado} className={boton.principal}>
            {p.comprobante_id ? 'Reintentar el CAE' : 'Facturar'}
          </button>
        )}
        {acciones.remito && puedeRemitir && (
          <button onClick={alRemitir} disabled={ocupado} className={boton.secundario}>
            Remito
          </button>
        )}
        {acciones.entregar && (
          <button onClick={alEntregar} disabled={ocupado} className={boton.secundario}>
            Entregado
          </button>
        )}
        {acciones.devolver && (
          <button onClick={() => setDevolviendo(true)} disabled={ocupado} className={boton.secundario}>
            Registrar devolución
          </button>
        )}
        {acciones.cancelar && puedeCancelar && (
          <button onClick={alCancelar} disabled={ocupado} className={`${boton.suave} ml-auto`}>
            Cancelar pedido
          </button>
        )}
      </div>

      {/*
        Por qué no se puede entregar todavía, dicho en vez de esconder el
        botón sin explicación.
      */}
      {(p.estado === 'recibido' || p.estado === 'preparado') && !acciones.entregar && (
        <p className="text-xs text-piedra-500">
          {p.pagado_en_la_web
            ? 'Para entregarlo falta la factura: el cliente ya pagó y no sale sin ella.'
            : 'Para entregarlo falta cobrarlo en la caja.'}
        </p>
      )}

      {devolviendo && (
        <DevolucionParcial
          ventaId={p.venta_id}
          comprobante={p.comprobante ?? p.venta_codigo}
          cliente={p.cliente_nombre ?? ''}
          onCerrar={() => setDevolviendo(false)}
          onListo={(mensaje, problema) => {
            setDevolviendo(false)
            if (problema) onError(mensaje)
            else
              onAviso(
                p.pagado_en_la_web
                  ? `${mensaje.trim().replace(/\.?$/, '.')} Quedó anotado lo que la tienda le tiene que devolver al comprador.`
                  : mensaje,
              )
          }}
        />
      )}
    </aside>
  )
}
