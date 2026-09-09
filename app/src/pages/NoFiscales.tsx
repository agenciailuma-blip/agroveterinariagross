import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { pedirTexto } from '@/components/Dialogo'
import {
  ETIQUETA_NO_FISCAL,
  aCsv,
  anularNoFiscal,
  descargarCsv,
  listarNoFiscales,
  mandarPresupuestoACaja,
  numeroNoFiscal,
} from '@/lib/api/noFiscal'
import type { FilaNoFiscal, TipoNoFiscal } from '@/lib/api/noFiscal'
import { abrirNoFiscal } from '@/lib/escritorio'
import { moneda } from '@/lib/tipos'

/*
  El archivo de los comprobantes que numera Gross.

  Es la otra mitad de Remitos: aquella pantalla contesta "qué sale hoy",
  ésta contesta "qué se emitió y dónde está". Por eso están separadas —
  una es una pantalla de trabajo y la otra es un archivo.

  "Registro, veo y exporto" es el criterio que planteó Lucas en el punto
  12 de sus sugerencias, y las tres partes están acá.
*/

type Filtro = TipoNoFiscal | 'todos'

const FILTROS: { valor: Filtro; etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'presupuesto', etiqueta: 'Presupuestos' },
  { valor: 'remito', etiqueta: 'Remitos' },
  { valor: 'comprobante_interno', etiqueta: 'Internos' },
]

export default function NoFiscales() {
  const { tienePermiso } = useAuth()
  const qc = useQueryClient()
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const puedeVer = tienePermiso('facturacion.no_fiscal_ver')
  const puedeAnular = tienePermiso('facturacion.no_fiscal_anular')

  const filas = useQuery({
    queryKey: ['no-fiscales', filtro],
    queryFn: () => listarNoFiscales(filtro),
    enabled: puedeVer,
  })

  /*
    El presupuesto no se "convierte en factura" acá.

    Se manda a la cola de la caja, y la factura sale al cobrarlo por el
    camino de siempre. Tener un segundo camino a la facturación sería
    tener dos lugares donde se decide lo mismo, y el día que se separen
    nadie va a saber cuál tiene razón.
  */
  const aCaja = useMutation({
    mutationFn: (ventaId: string) => mandarPresupuestoACaja(ventaId),
    onSuccess: () => {
      setError(null)
      setAviso('El presupuesto pasó a la cola de la caja. Se factura al cobrarlo.')
      qc.invalidateQueries({ queryKey: ['no-fiscales'] })
      qc.invalidateQueries({ queryKey: ['cola-caja'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo mandar a la caja.'),
  })

  const anular = useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) => anularNoFiscal(id, motivo),
    onSuccess: () => {
      setError(null)
      setAviso('Comprobante anulado.')
      qc.invalidateQueries({ queryKey: ['no-fiscales'] })
      qc.invalidateQueries({ queryKey: ['remitos'] })
      qc.invalidateQueries({ queryKey: ['remitos-sin-cobrar'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo anular.'),
  })

  function exportar() {
    if (!filas.data?.length) return
    const hoy = new Date().toISOString().slice(0, 10)
    descargarCsv(`comprobantes-no-fiscales-${hoy}.csv`, aCsv(filas.data))
  }

  if (!puedeVer) {
    return (
      <p className="rounded-xl bg-piedra-50 px-4 py-3 text-sm text-piedra-600 ring-1 ring-borde">
        No tenés permiso para ver estos comprobantes.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-tinta">Comprobantes no fiscales</h1>
          <p className="text-sm text-piedra-500">
            Presupuestos, remitos y comprobantes internos. Los que numera Gross, no ARCA.
          </p>
        </div>
        <button
          onClick={exportar}
          disabled={!filas.data?.length}
          className="rounded-lg border border-borde px-4 py-2 text-sm font-medium text-tinta hover:bg-piedra-50 disabled:opacity-40"
        >
          Exportar a Excel
        </button>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg bg-piedra-100 p-1">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            onClick={() => setFiltro(f.valor)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              filtro === f.valor ? 'bg-white text-tinta shadow-sm' : 'text-piedra-500 hover:text-tinta'
            }`}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}
      {aviso && (
        <p className="rounded-xl bg-verde-50 px-4 py-3 text-sm text-verde-800 ring-1 ring-verde-200">
          {aviso}
        </p>
      )}

      {filas.isPending ? (
        <p className="text-sm text-piedra-500">Cargando…</p>
      ) : (filas.data?.length ?? 0) === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-borde bg-white/60 py-12">
          <p className="text-sm text-piedra-400">No hay comprobantes de este tipo.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-borde">
          <table className="w-full text-sm">
            <thead className="border-b border-borde text-left text-xs text-piedra-500">
              <tr>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Número</th>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filas.data!.map((f) => (
                <Fila
                  key={f.id}
                  f={f}
                  puedeAnular={puedeAnular}
                  trabajando={aCaja.isPending || anular.isPending}
                  onACaja={() => f.venta_id && aCaja.mutate(f.venta_id)}
                  onAnular={async () => {
                    const motivo = await pedirTexto({
                      titulo: `¿Anular ${numeroNoFiscal(f.tipo_clave, f.serie, f.numero)}?`,
                      detalle: 'Queda registrado con tu nombre. El número no se reutiliza.',
                      etiqueta: '¿Por qué se anula?',
                      minimo: 3,
                      aceptar: 'Anular',
                      peligro: true,
                    })
                    if (motivo) anular.mutate({ id: f.id, motivo })
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Fila({
  f,
  puedeAnular,
  trabajando,
  onACaja,
  onAnular,
}: {
  f: FilaNoFiscal
  puedeAnular: boolean
  trabajando: boolean
  onACaja: () => void
  onAnular: () => void
}) {
  const vencido =
    f.tipo_clave === 'presupuesto' &&
    f.estado === 'emitido' &&
    !!f.valido_hasta &&
    f.valido_hasta < new Date().toISOString().slice(0, 10)

  // Un presupuesto se puede mandar a cobrar sólo mientras su venta siga
  // siendo un borrador. Si ya está en la caja o cobrada, no hay nada que
  // mandar.
  const puedeIrACaja =
    f.tipo_clave === 'presupuesto' && f.estado === 'emitido' && f.venta_estado === 'borrador'

  return (
    <tr className="border-b border-piedra-100 last:border-0">
      <td className="whitespace-nowrap px-3 py-2 text-piedra-600">
        {ETIQUETA_NO_FISCAL[f.tipo_clave]}
      </td>
      <td className="whitespace-nowrap px-3 py-2 font-medium tabular-nums text-tinta">
        {numeroNoFiscal(f.tipo_clave, f.serie, f.numero)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-piedra-600">
        {new Date(`${f.fecha}T00:00:00`).toLocaleDateString('es-AR')}
      </td>
      <td className="px-3 py-2 text-piedra-700">{f.receptor_nombre}</td>
      <td className="px-3 py-2 text-right tabular-nums text-piedra-700">
        {f.total > 0 ? moneda.format(f.total) : '—'}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-xs">
        {f.estado === 'anulado' ? (
          <span className="rounded bg-piedra-100 px-1.5 py-0.5 text-piedra-600">anulado</span>
        ) : f.estado === 'convertido' ? (
          <span className="rounded bg-verde-100 px-1.5 py-0.5 text-verde-800">facturado</span>
        ) : vencido ? (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">vencido</span>
        ) : f.valido_hasta ? (
          <span className="text-piedra-500">
            vale hasta {new Date(`${f.valido_hasta}T00:00:00`).toLocaleDateString('es-AR')}
          </span>
        ) : (
          <span className="text-piedra-500">emitido</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <div className="flex justify-end gap-2">
          {puedeIrACaja && (
            <button
              onClick={onACaja}
              disabled={trabajando}
              className="text-xs font-medium text-marca-700 underline disabled:opacity-40"
            >
              Mandar a cobrar
            </button>
          )}
          {f.estado !== 'anulado' && (
            <button onClick={() => abrirNoFiscal(f.id)} className="text-xs text-marca-700 underline">
              Ver
            </button>
          )}
          {puedeAnular && f.estado === 'emitido' && (
            <button
              onClick={onAnular}
              disabled={trabajando}
              className="text-xs text-piedra-400 underline hover:text-red-600 disabled:opacity-40"
            >
              Anular
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
