import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { subirRemitoFirmado, urlDeFirma } from '@/lib/api/remitoFirmado'
import type { FirmaDeRemito } from '@/lib/api/remitoFirmado'
import { diaDeObera } from '@/lib/api/facturacion'

/*
  El remito firmado, al lado del remito: «Firmado» abre la foto, y si
  todavía no está, «Subir firmado» la carga. Lo usan Remitos y la cuenta
  corriente del cliente.
*/

const fecha = (dia: string) => new Date(`${dia}T12:00:00`).toLocaleDateString('es-AR')

export default function RemitoFirmado({
  remitoId,
  fechaRemito,
  firma,
  puedeSubir,
  onCambio,
}: {
  remitoId: string
  fechaRemito: string
  firma: FirmaDeRemito | null
  puedeSubir: boolean
  onCambio: () => void
}) {
  const [ventana, setVentana] = useState<'ver' | 'subir' | null>(null)

  return (
    <>
      {firma ? (
        <button onClick={() => setVentana('ver')} className="text-xs font-medium whitespace-nowrap text-verde-700 underline">
          Firmado
        </button>
      ) : (
        puedeSubir && (
          <button onClick={() => setVentana('subir')} className="text-xs whitespace-nowrap text-marca-700 underline">
            Subir firmado
          </button>
        )
      )}

      {ventana === 'ver' && firma && (
        <VerFirma
          firma={firma}
          puedeSubir={puedeSubir}
          onOtra={() => setVentana('subir')}
          onCerrar={() => setVentana(null)}
        />
      )}
      {ventana === 'subir' && (
        <SubirFirma
          remitoId={remitoId}
          fechaRemito={fechaRemito}
          onCerrar={() => setVentana(null)}
          onSubida={() => {
            setVentana(null)
            onCambio()
          }}
        />
      )}
    </>
  )
}

function VerFirma({
  firma,
  puedeSubir,
  onOtra,
  onCerrar,
}: {
  firma: FirmaDeRemito
  puedeSubir: boolean
  onOtra: () => void
  onCerrar: () => void
}) {
  const url = useQuery({
    queryKey: ['firma-url', firma.ruta],
    queryFn: () => urlDeFirma(firma.ruta),
    staleTime: 5 * 60_000,
  })

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-tinta/40 p-4" onClick={onCerrar}>
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-tinta">Remito firmado</h2>
        <p className="mt-1 text-sm text-piedra-600">
          {firma.firmo ? `Firmó ${firma.firmo}` : 'Firmado'} el {fecha(firma.firmado_el)}.
        </p>
        <p className="text-xs text-piedra-400">
          Foto subida
          {firma.subido_por ? ` por ${firma.subido_por}` : ''} el{' '}
          {new Date(firma.subido_en).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
          {firma.fotos > 1 && ` · hay ${firma.fotos} fotos, se ve la última`}.
        </p>

        <div className="mt-4 grid min-h-48 place-items-center rounded-lg bg-piedra-50 ring-1 ring-borde">
          {url.isPending ? (
            <p className="text-sm text-piedra-400">Abriendo la foto…</p>
          ) : url.isError ? (
            <p role="alert" className="px-4 text-sm text-red-700">
              {url.error.message}
            </p>
          ) : (
            <img src={url.data} alt="Remito firmado" className="max-h-[65vh] w-full object-contain" />
          )}
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {puedeSubir && (
            <button
              onClick={onOtra}
              className="rounded-lg px-4 py-2 text-sm font-medium text-marca-700 ring-1 ring-borde hover:bg-marca-50"
            >
              Subir otra foto
            </button>
          )}
          <button
            onClick={onCerrar}
            className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

function SubirFirma({
  remitoId,
  fechaRemito,
  onCerrar,
  onSubida,
}: {
  remitoId: string
  fechaRemito: string
  onCerrar: () => void
  onSubida: () => void
}) {
  const hoy = diaDeObera(new Date())
  const [archivo, setArchivo] = useState<File | null>(null)
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null)
  const [firmo, setFirmo] = useState('')
  const [firmadoEl, setFirmadoEl] = useState(hoy)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!archivo) return
    const u = URL.createObjectURL(archivo)
    setVistaPrevia(u)
    return () => URL.revokeObjectURL(u)
  }, [archivo])

  async function guardar() {
    if (!archivo) return
    setSubiendo(true)
    setError(null)
    try {
      await subirRemitoFirmado(remitoId, archivo, firmo, firmadoEl)
      onSubida()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir la foto.')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-tinta/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-bold text-tinta">Subir el remito firmado</h2>

        <label className="mt-4 block">
          <span className="text-sm font-medium text-piedra-700">Foto</span>
          {/*
            Sin «capture»: en el celular deja elegir entre sacar la foto o
            buscarla en la galería, por si ya la sacaron antes.
          */}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full min-w-0 text-sm text-piedra-600 file:mr-3 file:rounded-lg file:border-0 file:bg-marca-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-marca-700"
          />
        </label>
        {vistaPrevia && (
          <img
            src={vistaPrevia}
            alt="Vista previa del remito"
            className="mt-3 max-h-64 w-full rounded-lg bg-piedra-50 object-contain ring-1 ring-borde"
          />
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="text-sm font-medium text-piedra-700">Quién firmó</span>
            <input
              value={firmo}
              onChange={(e) => setFirmo(e.target.value)}
              placeholder="Si se sabe"
              className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm"
            />
          </label>
          <label className="block min-w-0">
            <span className="text-sm font-medium text-piedra-700">Cuándo firmaron</span>
            <input
              type="date"
              value={firmadoEl}
              min={fechaRemito}
              max={hoy}
              onChange={(e) => setFirmadoEl(e.target.value)}
              className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm"
            />
          </label>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            onClick={onCerrar}
            disabled={subiendo}
            className="rounded-lg px-4 py-2 text-sm font-medium text-piedra-600 ring-1 ring-borde hover:bg-piedra-50"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={!archivo || !firmadoEl || subiendo}
            className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600 disabled:opacity-40"
          >
            {subiendo ? 'Subiendo…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
