import { useState } from 'react'
import { boton } from '@/estilos'
import { enCastellano } from '@/lib/errores'

/*
  «Descargar planilla»: lo que hay hoy, en Excel, con las mismas columnas
  que lee «Importar planilla». Sirve para mirar y de plantilla para
  cambiar de a muchos.
*/
export default function BotonBajarPlanilla({ bajar, className }: { bajar: () => Promise<unknown>; className?: string }) {
  const [bajando, setBajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <button
        type="button"
        disabled={bajando}
        className={className ?? boton.secundario}
        title={error ?? 'En Excel, con las mismas columnas que lee «Importar planilla»'}
        onClick={async () => {
          setBajando(true)
          setError(null)
          try {
            await bajar()
          } catch (e) {
            setError(enCastellano(e))
          } finally {
            setBajando(false)
          }
        }}
      >
        {bajando ? 'Preparando…' : 'Descargar planilla'}
      </button>
      {error && (
        <p role="alert" className="basis-full text-sm text-red-700">
          No se pudo armar la planilla: {error}
        </p>
      )}
    </>
  )
}
