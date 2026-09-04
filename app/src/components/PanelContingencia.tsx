import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import {
  estadoContingencia,
  informarCaea,
  informarSinMovimiento,
  pedirCaea,
} from '@/lib/api/contingencia'
import type { FilaCaea } from '@/lib/api/contingencia'

/*
  El estado de la contingencia, arriba de la cola de comprobantes.

  Se muestra siempre —aunque no haya pasado nada— porque el CAEA sólo
  sirve si se pidió ANTES del corte. Un panel que aparece recién cuando
  ARCA se cae llegaría tarde por definición.
*/
export default function PanelContingencia({
  onAviso,
  onError,
}: {
  onAviso: (texto: string) => void
  onError: (texto: string) => void
}) {
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()
  const puede = tienePermiso('facturacion.contingencia')

  const estado = useQuery({
    queryKey: ['contingencia'],
    queryFn: estadoContingencia,
    enabled: tienePermiso('facturacion.ver'),
  })

  function refrescar() {
    qc.invalidateQueries({ queryKey: ['contingencia'] })
    qc.invalidateQueries({ queryKey: ['comprobantes'] })
  }

  const pedir = useMutation({
    mutationFn: (proxima: boolean) => pedirCaea(proxima),
    onSuccess: ({ caea }) => {
      onAviso(
        `ARCA otorgó el CAEA ${caea.codigo}, vigente del ` +
          `${fechaCorta(caea.fecha_desde)} al ${fechaCorta(caea.fecha_hasta)}.`,
      )
      refrescar()
    },
    onError: (e) => onError(e instanceof Error ? e.message : 'ARCA no otorgó el CAEA.'),
  })

  const informar = useMutation({
    mutationFn: (caeaId: string) => informarCaea(caeaId),
    onSuccess: ({ informados, fallidos, detalle }) => {
      if (fallidos > 0) {
        const primero = detalle.find((d) => !d.ok)
        onError(
          `Se informaron ${informados} y ${fallidos} quedaron sin informar. ` +
            `El primero que falló: ${primero?.comprobante} — ${primero?.motivo}`,
        )
      } else {
        onAviso(`ARCA recibió ${informados} ${informados === 1 ? 'comprobante' : 'comprobantes'}.`)
      }
      refrescar()
    },
    onError: (e) => onError(e instanceof Error ? e.message : 'No se pudo informar a ARCA.'),
  })

  const sinMovimiento = useMutation({
    mutationFn: (caeaId: string) => informarSinMovimiento(caeaId),
    onSuccess: ({ detalle }) => {
      const malos = detalle.filter((d) => !d.ok)
      if (malos.length) onError(`ARCA no aceptó el aviso: ${malos[0].motivo}`)
      else onAviso('Informado a ARCA que el CAEA no se usó.')
      refrescar()
    },
    onError: (e) => onError(e instanceof Error ? e.message : 'No se pudo informar a ARCA.'),
  })

  if (!estado.data) return null

  const { vigente, caeas, puntosCaea } = estado.data
  const trabajando = pedir.isPending || informar.isPending || sinMovimiento.isPending

  // Quincenas viejas que todavía le deben algo a ARCA.
  const adeudan = caeas.filter((c) => c.por_informar > 0 && c.id !== vigente?.id)

  return (
    <div className="space-y-3">
      {/*
        Sin un punto de venta del régimen CAEA, ARCA rechaza el pedido
        con el error 15003. Es un trámite en su portal, no algo que se
        resuelva desde acá — por eso el aviso dice qué hay que hacer y
        dónde, en vez de ofrecer un botón que va a fallar.
      */}
      {puntosCaea === 0 && (
        <div className="rounded-xl bg-amber-50 px-5 py-4 text-sm ring-1 ring-amber-200">
          <p className="font-medium text-amber-900">
            Falta habilitar un punto de venta para el régimen CAEA
          </p>
          <p className="mt-1 text-amber-800">
            ARCA no otorga el código mientras el CUIT no tenga al menos un punto de venta dado de
            alta bajo ese régimen (rechaza con el error 15003). Se hace en el portal de ARCA,
            en <span className="font-medium">Administración de puntos de venta y domicilios</span>,
            y después hay que marcarlo acá en Configuración.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-borde">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <p className="text-sm font-medium text-tinta">Contingencia de ARCA</p>
            {vigente ? (
              <p className="mt-0.5 text-xs text-piedra-500">
                CAEA <span className="font-mono text-piedra-700">{vigente.codigo}</span> · vigente
                hasta el {fechaCorta(vigente.fecha_hasta)}
                {vigente.ambiente === 'homologacion' && (
                  <span className="ml-1.5 rounded bg-piedra-100 px-1.5 py-0.5 text-[10px] text-piedra-500">
                    pruebas
                  </span>
                )}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-piedra-500">
                No hay código para hoy. Sin él, si ARCA se cae el comprobante espera en la cola.
              </p>
            )}
          </div>

          {puede && (
            <div className="flex gap-2">
              {!vigente && (
                <button
                  onClick={() => pedir.mutate(false)}
                  disabled={trabajando}
                  className="rounded-lg bg-marca-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-marca-600 disabled:opacity-40"
                >
                  {pedir.isPending ? 'Pidiendo…' : 'Pedir el de esta quincena'}
                </button>
              )}
              <button
                onClick={() => pedir.mutate(true)}
                disabled={trabajando}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-marca-700 ring-1 ring-borde hover:bg-marca-50 disabled:opacity-40"
              >
                Pedir el de la próxima
              </button>
            </div>
          )}
        </div>

        {vigente && (vigente.por_informar > 0 || vigente.informados > 0) && (
          <Pendiente c={vigente} puede={puede} trabajando={trabajando}
            onInformar={() => informar.mutate(vigente.id)}
            onSinMovimiento={() => sinMovimiento.mutate(vigente.id)} />
        )}

        {adeudan.map((c) => (
          <Pendiente key={c.id} c={c} puede={puede} trabajando={trabajando}
            onInformar={() => informar.mutate(c.id)}
            onSinMovimiento={() => sinMovimiento.mutate(c.id)} />
        ))}
      </div>
    </div>
  )
}

/*
  Lo que un CAEA todavía le debe a ARCA.

  El color sale de los días que quedan hasta la fecha tope, no de la
  cantidad de comprobantes: diez comprobantes con una semana por
  delante son menos urgentes que uno solo que vence mañana.
*/
function Pendiente({
  c,
  puede,
  trabajando,
  onInformar,
  onSinMovimiento,
}: {
  c: FilaCaea
  puede: boolean
  trabajando: boolean
  onInformar: () => void
  onSinMovimiento: () => void
}) {
  const tono =
    c.situacion === 'vencido'
      ? 'bg-red-50 text-red-800 border-red-200'
      : c.situacion === 'urgente'
        ? 'bg-orange-50 text-orange-900 border-orange-200'
        : 'bg-piedra-50 text-piedra-700 border-borde'

  const plazo =
    c.fecha_tope_informar === null
      ? 'sin fecha tope informada'
      : c.dias_para_informar === null
        ? ''
        : c.dias_para_informar < 0
          ? `venció hace ${-c.dias_para_informar} ${-c.dias_para_informar === 1 ? 'día' : 'días'}`
          : c.dias_para_informar === 0
            ? 'vence hoy'
            : `quedan ${c.dias_para_informar} ${c.dias_para_informar === 1 ? 'día' : 'días'}`

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-sm ${tono}`}>
      <div>
        {c.por_informar > 0 ? (
          <p className="font-medium">
            {c.por_informar} {c.por_informar === 1 ? 'comprobante emitido' : 'comprobantes emitidos'} con
            este CAEA sin informar a ARCA
          </p>
        ) : (
          <p className="font-medium">
            {c.informados} {c.informados === 1 ? 'comprobante informado' : 'comprobantes informados'}
          </p>
        )}
        <p className="text-xs opacity-80">
          Quincena {c.quincena} de {String(c.periodo).slice(4)}/{String(c.periodo).slice(0, 4)}
          {c.fecha_tope_informar && ` · tope ${fechaCorta(c.fecha_tope_informar)}`}
          {plazo && ` · ${plazo}`}
        </p>
      </div>

      {puede && (
        <div className="flex gap-2">
          {c.por_informar > 0 && (
            <button
              onClick={onInformar}
              disabled={trabajando}
              className="rounded-lg bg-marca-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-marca-600 disabled:opacity-40"
            >
              Informar a ARCA
            </button>
          )}
          {c.por_informar === 0 && c.informados === 0 && (
            <button
              onClick={onSinMovimiento}
              disabled={trabajando}
              className="rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ring-borde hover:bg-white disabled:opacity-40"
            >
              Informar sin movimiento
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function fechaCorta(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}
