import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { confirmar, pedirTexto } from '@/components/Dialogo'
import { hoyEnObera } from '@/lib/api/cheques'
import { arruinarHoja, avisoDeTandas, borrarTanda, guardarTanda, listarTandas, numeroDeHoja } from '@/lib/api/remitoR'
import { enCastellano } from '@/lib/errores'
import { fechaCorta } from '@/lib/comprobante/presentacion'
import { numero } from '@/lib/tipos'
import { boton, botonChico, campo } from '@/estilos'

/*
  Las hojas del remito R que entregó la imprenta: su CAI, su vencimiento
  y sus números. El sistema las va usando en orden.
*/
const VACIA = { punto_venta: '', cai: '', vencimiento: '', desde: '', hasta: '' }

export default function TandasRemitoR() {
  const qc = useQueryClient()
  const tandas = useQuery({ queryKey: ['remito-r-tandas'], queryFn: listarTandas })
  const [nueva, setNueva] = useState(VACIA)
  const [error, setError] = useState<string | null>(null)

  const refrescar = () => qc.invalidateQueries({ queryKey: ['remito-r-tandas'] })
  const alFallar = (e: unknown) => setError(enCastellano(e, 'No se pudo guardar.'))

  const guardar = useMutation({
    mutationFn: () =>
      guardarTanda({
        punto_venta: Number(nueva.punto_venta),
        cai: nueva.cai.trim(),
        vencimiento: nueva.vencimiento,
        desde: Number(nueva.desde),
        hasta: Number(nueva.hasta),
      }),
    onSuccess: () => {
      setError(null)
      setNueva(VACIA)
      refrescar()
    },
    onError: alFallar,
  })
  const borrar = useMutation({ mutationFn: borrarTanda, onSuccess: refrescar, onError: alFallar })
  const saltar = useMutation({
    mutationFn: (motivo: string) => arruinarHoja(null, motivo),
    onSuccess: () => {
      setError(null)
      refrescar()
    },
    onError: alFallar,
  })

  const filas = tandas.data ?? []
  const aviso = avisoDeTandas(filas, hoyEnObera())
  const vigente = filas.find((t) => t.vigente)
  const completa = Object.values(nueva).every((v) => v.trim() !== '')

  async function alSaltar() {
    if (!vigente) return
    const motivo = await pedirTexto({
      titulo: `Hoja ${numeroDeHoja(vigente.punto_venta, vigente.proxima)}`,
      etiqueta: 'Qué le pasó',
      minimo: 3,
      aceptar: 'Se arruinó',
      peligro: true,
    })
    if (motivo) saltar.mutate(motivo)
  }

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-borde">
      <h2 className="font-medium text-tinta">Hojas del remito R</h2>
      <p className="mt-1 text-sm text-piedra-500">Cada tanda que entrega la imprenta, con sus números.</p>

      {aviso && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">{aviso}</p>
      )}

      {filas.length > 0 && (
        <ul className="mt-4 divide-y divide-piedra-100 border-y border-borde">
          {filas.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium tabular-nums [overflow-wrap:anywhere] text-tinta">
                  {numeroDeHoja(t.punto_venta, t.desde)} a {numeroDeHoja(t.punto_venta, t.hasta)}
                  {!t.vigente && <span className="ml-2 text-xs font-normal text-piedra-400">terminada</span>}
                </p>
                <p className="text-xs text-piedra-500">
                  CAI {t.cai} · vence {fechaCorta(t.vencimiento)}
                </p>
                <p className="text-xs text-piedra-500">
                  {t.vigente && <>Próxima {numeroDeHoja(t.punto_venta, t.proxima)} · quedan {numero.format(t.quedan)} · </>}
                  {numero.format(t.usadas)} usadas · {numero.format(t.arruinadas)} arruinadas
                </p>
              </div>
              {t.usadas + t.arruinadas === 0 && (
                <button
                  disabled={borrar.isPending}
                  className={botonChico.suave}
                  onClick={async () => {
                    const ok = await confirmar({
                      titulo: 'Borrar la tanda',
                      detalle: 'Es para corregir un error de carga.',
                      aceptar: 'Borrar',
                      peligro: true,
                    })
                    if (ok) borrar.mutate(t.id)
                  }}
                >
                  Borrar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {vigente && (
        <button onClick={alSaltar} disabled={saltar.isPending} className={`${botonChico.suave} mt-3`}>
          La próxima hoja se arruinó sin usarla
        </button>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-borde pt-4 sm:grid-cols-3">
        <Campo etiqueta="Punto de venta" valor={nueva.punto_venta} tipo="number" onCambio={(v) => setNueva({ ...nueva, punto_venta: v })} />
        <Campo etiqueta="CAI" valor={nueva.cai} onCambio={(v) => setNueva({ ...nueva, cai: v })} />
        <Campo etiqueta="Vencimiento" valor={nueva.vencimiento} tipo="date" onCambio={(v) => setNueva({ ...nueva, vencimiento: v })} />
        <Campo etiqueta="Desde el número" valor={nueva.desde} tipo="number" onCambio={(v) => setNueva({ ...nueva, desde: v })} />
        <Campo etiqueta="Hasta el número" valor={nueva.hasta} tipo="number" onCambio={(v) => setNueva({ ...nueva, hasta: v })} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button onClick={() => guardar.mutate()} disabled={!completa || guardar.isPending} className={boton.principal}>
          Cargar la tanda
        </button>
        {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  )
}

function Campo({
  etiqueta,
  valor,
  tipo = 'text',
  onCambio,
}: {
  etiqueta: string
  valor: string
  tipo?: string
  onCambio: (v: string) => void
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-piedra-600">{etiqueta}</span>
      <input type={tipo} value={valor} onChange={(e) => onCambio(e.target.value)} className={`${campo} w-full min-w-0`} />
    </label>
  )
}
