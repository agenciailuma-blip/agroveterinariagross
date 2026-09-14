import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CLAVES_EMISOR, guardarTextos, obtenerTextos } from '@/lib/api/configuracion'

/*
  Datos del emisor.

  Son los que van impresos en el encabezado de toda factura. Están acá y
  no en el código porque cambian sin avisar —una mudanza, un alta de
  IIBB, un teléfono nuevo— y ninguno de esos cambios justifica una
  versión nueva del sistema.
*/

const claseInput =
  'w-full rounded-lg border border-borde px-2.5 py-1.5 text-sm text-tinta outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20'

const ETIQUETA: Record<string, string> = {
  'comercio.razon_social': 'Razón social',
  'comercio.nombre_fantasia': 'Nombre de fantasía',
  'comercio.domicilio': 'Domicilio comercial',
  'comercio.localidad': 'Localidad',
  'comercio.telefono': 'Teléfono',
  'comercio.ingresos_brutos': 'Ingresos Brutos',
  'comercio.inicio_actividades': 'Inicio de actividades',
}

/** Ancho máximo del logo guardado. Alcanza para A4 y no infla la fila. */
const LOGO_ANCHO_MAX = 600
const LOGO_PESO_MAX = 300_000

export default function DatosDelEmisor() {
  const qc = useQueryClient()
  const [campos, setCampos] = useState<Record<string, string>>({})
  const [logo, setLogo] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const datos = useQuery({ queryKey: ['emisor'], queryFn: () => obtenerTextos(CLAVES_EMISOR) })

  useEffect(() => {
    if (!datos.data) return
    const copia = { ...datos.data }
    setLogo(copia['comercio.logo'] ?? '')
    delete copia['comercio.logo']
    setCampos(copia)
  }, [datos.data])

  const guardar = useMutation({
    mutationFn: () => guardarTextos({ ...campos, 'comercio.logo': logo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emisor'] })
      qc.invalidateQueries({ queryKey: ['comprobante'] })
      setError(null)
      setAviso('Guardado')
      setTimeout(() => setAviso(null), 3000)
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo guardar.'),
  })

  /*
    El logo se achica en el navegador antes de guardarlo. Sin esto, la
    foto de 4 MB que alguien arrastra sin pensarlo se guarda entera y
    después viaja en cada comprobante que se abre.
  */
  function tomarLogo(archivo: File) {
    setError(null)
    const lector = new FileReader()
    lector.onload = () => {
      const img = new Image()
      img.onload = () => {
        const escala = Math.min(1, LOGO_ANCHO_MAX / img.width)
        const lienzo = document.createElement('canvas')
        lienzo.width = Math.round(img.width * escala)
        lienzo.height = Math.round(img.height * escala)
        const ctx = lienzo.getContext('2d')
        if (!ctx) {
          setError('El navegador no pudo procesar la imagen.')
          return
        }

        // Los PNG y SVG suelen tener fondo transparente y hay que
        // conservarlo; el resto se aplana sobre blanco y va en JPEG,
        // que para un logo pesa mucho menos.
        const conAlfa = /png|svg/i.test(archivo.type)
        if (!conAlfa) {
          ctx.fillStyle = '#fff'
          ctx.fillRect(0, 0, lienzo.width, lienzo.height)
        }
        ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height)

        const uri = conAlfa ? lienzo.toDataURL('image/png') : lienzo.toDataURL('image/jpeg', 0.85)

        if (uri.length > LOGO_PESO_MAX) {
          setError('El logo quedó demasiado pesado. Probá con una imagen más simple o más chica.')
          return
        }
        setLogo(uri)
      }
      img.onerror = () => setError('No se pudo leer esa imagen.')
      img.src = String(lector.result)
    }
    lector.onerror = () => setError('No se pudo leer el archivo.')
    lector.readAsDataURL(archivo)
  }

  const faltan = ['comercio.ingresos_brutos', 'comercio.inicio_actividades'].filter(
    (k) => !campos[k]?.trim(),
  )

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-borde">
      <h2 className="font-medium text-tinta">Datos del emisor</h2>
      <p className="mt-1 text-sm text-piedra-500">
        Lo que va impreso en el encabezado de toda factura, tanto en el ticket como en la hoja A4.
      </p>

      {faltan.length > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          Faltan datos obligatorios del encabezado. Sin ellos el comprobante sale incompleto.
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        {Object.keys(ETIQUETA).map((clave) => (
          <label key={clave} className="block">
            <span className="mb-1 block text-xs font-medium text-piedra-600">{ETIQUETA[clave]}</span>
            <input
              value={campos[clave] ?? ''}
              onChange={(e) => setCampos({ ...campos, [clave]: e.target.value })}
              className={claseInput}
            />
          </label>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-4 border-t border-borde pt-4 sm:flex-row sm:items-start">
        <div className="grid h-20 w-40 shrink-0 place-items-center rounded-lg bg-piedra-50 ring-1 ring-borde">
          {logo ? (
            <img src={logo} alt="Logo del comercio" className="max-h-16 max-w-36 object-contain" />
          ) : (
            <span className="text-xs text-piedra-400">Sin logo</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-piedra-600">Logo</span>
          <p className="mt-0.5 text-xs text-piedra-400">
            Se imprime arriba del comprobante. Se achica solo; lo ideal es un PNG con fondo
            transparente.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) tomarLogo(f)
              }}
              className="max-w-full text-xs text-piedra-600 file:mr-2 file:rounded-lg file:border-0 file:bg-piedra-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-tinta"
            />
            {logo && (
              <button
                onClick={() => setLogo('')}
                className="rounded-lg px-2.5 py-1 text-xs text-piedra-500 ring-1 ring-borde hover:bg-red-50 hover:text-red-700"
              >
                Quitar
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => guardar.mutate()}
          disabled={guardar.isPending || datos.isLoading}
          className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600 disabled:opacity-40"
        >
          {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </button>
        {aviso && (
          <span className="rounded-full bg-verde-100 px-3 py-1 text-xs font-medium text-verde-800 ring-1 ring-verde-200">
            {aviso}
          </span>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  )
}
