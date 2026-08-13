import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import {
  cargarPrecios,
  guardarCuota,
  guardarLista,
  previsualizarPrecio,
  TIPOS_MEDIO_PAGO,
} from '@/lib/api/precios'
import type { ListaPrecio, MedioPago } from '@/lib/api/precios'
import { moneda } from '@/lib/tipos'

/** Precio de referencia de la vista previa. Redondo a propósito, para leer el efecto de un vistazo. */
const BASE_EJEMPLO = 10000

export default function Precios() {
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()
  const [guardado, setGuardado] = useState<string | null>(null)

  const puedeEditar = tienePermiso('productos.editar_precio')
  const puedeConfigurar = tienePermiso('configuracion.gestionar')

  const { data, isPending, error } = useQuery({ queryKey: ['precios'], queryFn: cargarPrecios })

  function avisar() {
    setGuardado('Guardado')
    setTimeout(() => setGuardado(null), 1800)
  }

  const mutarLista = useMutation({
    mutationFn: ({ id, ajuste }: { id: string; ajuste: number }) =>
      guardarLista(id, { ajuste_porcentaje: ajuste }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['precios'] })
      avisar()
    },
  })

  const mutarCuota = useMutation({
    mutationFn: ({ medio, cuotas, recargo }: { medio: string; cuotas: number; recargo: number }) =>
      guardarCuota(medio, cuotas, recargo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['precios'] })
      avisar()
    },
  })

  if (isPending) return <p className="text-sm text-piedra-500">Cargando…</p>
  if (error)
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
        {error.message}
      </p>
    )

  const listaDe = (m: MedioPago) => data.listas.find((l) => l.id === m.lista_precio_id)

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-tinta">Precios</h1>
          <p className="text-sm text-piedra-500">
            Listas de precios y medios de pago. El precio de cada producto se calcula a partir de
            estas reglas.
          </p>
        </div>
        {guardado && (
          <span className="rounded-full bg-verde-100 px-3 py-1 text-xs font-medium text-verde-800 ring-1 ring-verde-200">
            {guardado}
          </span>
        )}
      </div>

      {/*
        Cómo se arma el precio final. Va arriba de todo porque el orden de
        las capas cambia el resultado, y quien toca un porcentaje acá tiene
        que saber sobre qué se aplica.
      */}
      <div className="rounded-xl bg-marca-50 p-4 ring-1 ring-marca-200">
        <p className="text-sm font-medium text-marca-900">Cómo se calcula el precio final</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-marca-800">
          <span className="rounded bg-white px-2 py-0.5 ring-1 ring-marca-200">Precio del producto</span>
          <span className="text-marca-400">→</span>
          <span className="rounded bg-white px-2 py-0.5 ring-1 ring-marca-200">Ajuste de la lista</span>
          <span className="text-marca-400">→</span>
          <span className="rounded bg-white px-2 py-0.5 ring-1 ring-marca-200">Recargo por cuotas</span>
          <span className="text-marca-400">→</span>
          <span className="rounded bg-white px-2 py-0.5 ring-1 ring-marca-200">Descuento del cliente</span>
        </div>
      </div>

      <section className="rounded-xl bg-white shadow-sm ring-1 ring-borde">
        <div className="border-b border-borde px-5 py-3">
          <h2 className="font-medium text-tinta">Listas de precios</h2>
          <p className="text-xs text-piedra-500">
            El ajuste se aplica sobre el precio cargado en el producto. Positivo recarga, negativo
            descuenta.
          </p>
        </div>
        <div className="divide-y divide-piedra-100">
          {data.listas.map((l) => (
            <FilaLista
              key={l.id}
              lista={l}
              editable={puedeEditar}
              guardando={mutarLista.isPending}
              onGuardar={(ajuste) => mutarLista.mutate({ id: l.id, ajuste })}
            />
          ))}
        </div>
      </section>

      <section className="rounded-xl bg-white shadow-sm ring-1 ring-borde">
        <div className="border-b border-borde px-5 py-3">
          <h2 className="font-medium text-tinta">Medios de pago</h2>
          <p className="text-xs text-piedra-500">
            Cada medio usa una lista. Los que admiten cuotas pueden tener un recargo distinto por
            cantidad de cuotas.
          </p>
        </div>
        <div className="divide-y divide-piedra-100">
          {data.medios.map((m) => {
            const lista = listaDe(m)
            return (
              <div key={m.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-tinta">{m.nombre}</p>
                    <p className="text-xs text-piedra-500">
                      {TIPOS_MEDIO_PAGO[m.tipo] ?? m.tipo} · lista{' '}
                      <span className="font-medium">{lista?.nombre ?? 'predeterminada'}</span>
                      {m.afecta_caja && ' · suma al arqueo de caja'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-piedra-400">Un producto de {moneda.format(BASE_EJEMPLO)}</p>
                    <p className="text-lg font-semibold tabular-nums text-tinta">
                      {moneda.format(previsualizarPrecio(BASE_EJEMPLO, lista, 0))}
                    </p>
                  </div>
                </div>

                {m.admite_cuotas && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-piedra-100 pt-3">
                    {Array.from({ length: m.cuotas_maximas }, (_, i) => i + 1).map((n) => {
                      const cuota = m.medio_pago_cuota.find((c) => c.cuotas === n)
                      return (
                        <CampoCuota
                          key={n}
                          cuotas={n}
                          recargo={cuota?.recargo_porcentaje ?? 0}
                          resultado={previsualizarPrecio(
                            BASE_EJEMPLO,
                            lista,
                            cuota?.recargo_porcentaje ?? 0,
                          )}
                          editable={puedeConfigurar}
                          onGuardar={(recargo) =>
                            mutarCuota.mutate({ medio: m.id, cuotas: n, recargo })
                          }
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {!puedeEditar && (
        <p className="text-xs text-piedra-500">
          No tenés permiso para modificar precios. Estás viendo la configuración en modo consulta.
        </p>
      )}
    </div>
  )
}

function FilaLista({
  lista,
  editable,
  guardando,
  onGuardar,
}: {
  lista: ListaPrecio
  editable: boolean
  guardando: boolean
  onGuardar: (ajuste: number) => void
}) {
  const [valor, setValor] = useState(String(lista.ajuste_porcentaje))
  const cambiado = Number(valor) !== Number(lista.ajuste_porcentaje)

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-48">
        <p className="font-medium text-tinta">
          {lista.nombre}
          {lista.es_predeterminada && (
            <span className="ml-2 rounded-full bg-piedra-100 px-2 py-0.5 text-xs font-normal text-piedra-600">
              predeterminada
            </span>
          )}
        </p>
        {lista.descripcion && <p className="text-xs text-piedra-500">{lista.descripcion}</p>}
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-xs text-piedra-400">{moneda.format(10000)} queda en</p>
          <p className="font-semibold tabular-nums text-tinta">
            {moneda.format(previsualizarPrecio(10000, { ...lista, ajuste_porcentaje: Number(valor) || 0 }, 0))}
          </p>
        </div>

        <div className="relative">
          <input
            type="number"
            step="0.5"
            value={valor}
            disabled={!editable}
            onChange={(e) => setValor(e.target.value)}
            className="w-24 rounded-lg border border-borde py-1.5 pr-7 pl-2.5 text-right tabular-nums outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20 disabled:bg-piedra-50"
          />
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-piedra-400">
            %
          </span>
        </div>

        <button
          onClick={() => onGuardar(Number(valor) || 0)}
          disabled={!editable || !cambiado || guardando}
          className="rounded-lg bg-marca-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-marca-600 disabled:opacity-40"
        >
          Guardar
        </button>
      </div>
    </div>
  )
}

function CampoCuota({
  cuotas,
  recargo,
  resultado,
  editable,
  onGuardar,
}: {
  cuotas: number
  recargo: number
  resultado: number
  editable: boolean
  onGuardar: (recargo: number) => void
}) {
  const [valor, setValor] = useState(String(recargo))
  const cambiado = Number(valor) !== Number(recargo)

  return (
    <div className="rounded-lg bg-piedra-50 px-3 py-2 ring-1 ring-borde">
      <p className="text-xs font-medium text-piedra-600">
        {cuotas} {cuotas === 1 ? 'cuota' : 'cuotas'}
      </p>
      <div className="mt-1 flex items-center gap-1.5">
        <input
          type="number"
          step="0.5"
          value={valor}
          disabled={!editable}
          onChange={(e) => setValor(e.target.value)}
          onBlur={() => cambiado && onGuardar(Number(valor) || 0)}
          className="w-16 rounded border border-borde px-1.5 py-1 text-right text-sm tabular-nums outline-none focus:border-marca-500 disabled:bg-white"
        />
        <span className="text-xs text-piedra-400">%</span>
        <span className="ml-1 text-sm font-medium tabular-nums text-tinta">
          {moneda.format(resultado)}
        </span>
      </div>
    </div>
  )
}
