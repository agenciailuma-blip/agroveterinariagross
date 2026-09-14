import { useState } from 'react'
import { useSync } from '@/lib/local/SyncProvider'
import { confirmar } from '@/components/Dialogo'
import { enCastellano } from '@/lib/errores'
import { boton } from '@/estilos'

/*
  ─────────────────────────────────────────────────────────────
  Cuando la llave de la base local no aparece

  Sin la llave, esta PC no puede leer sus clientes ni guardar una venta,
  así que el aviso va arriba de todo y dice qué hacer, en orden:

  1. Lo más probable: se entró con otra cuenta de Windows. Volver a la de
     siempre lo resuelve sin tocar nada.
  2. Si eso no alcanza y no hay nada sin subir, se rehace la base desde el
     servidor. No se pierde nada.
  3. Si hay operaciones sin subir, el botón no aparece: esas ventas sólo
     existen en esta PC, y descartarlas lo decide soporte.

  Es raro que pase —la llave vive en Windows y sobrevive a reinstalar el
  programa—, pero cuando pasa el cajero tiene que entender la pantalla
  sin llamar a nadie para el caso común.
  ─────────────────────────────────────────────────────────────
*/
export default function AvisoBaseBloqueada() {
  const { bloqueada, sinSubir, enLinea, rehacer } = useSync()
  const [rehaciendo, setRehaciendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!bloqueada) return null

  async function alRehacer() {
    const ok = await confirmar({
      titulo: 'Rehacer la base de esta computadora',
      detalle:
        'Se borran los datos cifrados que ya no se pueden abrir y se vuelven a traer del servidor. No se pierde ninguna venta: todas están en el servidor.',
      aceptar: 'Rehacer',
    })
    if (!ok) return

    setRehaciendo(true)
    setError(null)
    try {
      await rehacer()
    } catch (e) {
      setError(enCastellano(e, 'No se pudo rehacer la base.'))
    } finally {
      setRehaciendo(false)
    }
  }

  return (
    <div role="alert" className="border-b border-red-200 bg-red-50 px-6 py-4 text-sm text-red-900">
      <p className="font-semibold">Esta computadora no puede abrir sus datos guardados</p>
      <p className="mt-1">{bloqueada.message}</p>

      <ol className="mt-2 list-decimal space-y-1 pl-5 text-red-800">
        <li>
          Cerrá el sistema, entrá a Windows con <strong>la cuenta de siempre</strong> de esta
          computadora y volvé a abrirlo.
        </li>
        {sinSubir === 0 ? (
          <li>
            Si con la cuenta de siempre sigue igual, se puede rehacer la base desde el servidor. No
            se pierde nada.
          </li>
        ) : (
          <li>
            Si sigue igual, <strong>no borres nada</strong>: hay {sinSubir}{' '}
            {sinSubir === 1 ? 'operación que todavía no subió' : 'operaciones que todavía no subieron'}{' '}
            y sólo {sinSubir === 1 ? 'existe' : 'existen'} en esta computadora. Llamá a soporte.
          </li>
        )}
      </ol>

      {sinSubir === 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={alRehacer}
            disabled={rehaciendo || !enLinea}
            className={boton.peligro}
          >
            {rehaciendo ? 'Rehaciendo…' : 'Rehacer la base de esta computadora'}
          </button>
          {!enLinea && (
            <span className="text-xs text-red-700">Hace falta internet para traer los datos de nuevo.</span>
          )}
        </div>
      )}

      {error && <p className="mt-2 font-medium">{error}</p>}
    </div>
  )
}
