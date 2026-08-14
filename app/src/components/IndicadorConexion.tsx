import { useSync } from '@/lib/local/SyncProvider'

/*
  Este indicador no es decorativo.

  El sistema sigue vendiendo sin conexión, así que quien está en el
  mostrador tiene que poder saber de un vistazo tres cosas distintas:
  si hay internet, si la copia local está lista, y sobre todo si lo que
  acaba de hacer ya llegó al servidor o está esperando.

  Sin eso, el modo sin conexión es indistinguible de un sistema roto.
*/
export function IndicadorConexion() {
  const { enLinea, listo, sincronizando, sinSubir, ultimaSync, sincronizar } = useSync()

  const estado = !enLinea ? 'sin_conexion' : sinSubir > 0 ? 'pendiente' : sincronizando ? 'sincronizando' : 'al_dia'

  const config = {
    al_dia: {
      etiqueta: 'Al día',
      punto: 'bg-verde-500',
      texto: 'text-verde-700',
      fondo: 'bg-verde-50 ring-verde-200',
      pulso: true,
    },
    sincronizando: {
      etiqueta: 'Sincronizando…',
      punto: 'bg-marca-500',
      texto: 'text-marca-700',
      fondo: 'bg-marca-50 ring-marca-200',
      pulso: true,
    },
    pendiente: {
      etiqueta: `${sinSubir} sin subir`,
      punto: 'bg-marca-500',
      texto: 'text-marca-800',
      fondo: 'bg-marca-50 ring-marca-200',
      pulso: false,
    },
    sin_conexion: {
      etiqueta: sinSubir > 0 ? `Sin conexión · ${sinSubir} en espera` : 'Sin conexión',
      punto: 'bg-amber-500',
      texto: 'text-amber-800',
      fondo: 'bg-amber-50 ring-amber-200',
      pulso: false,
    },
  }[estado]

  const titulo = [
    ultimaSync
      ? `Última sincronización: ${ultimaSync.toLocaleTimeString('es-AR')}`
      : 'Todavía no se sincronizó',
    listo ? 'Copia local lista: se puede trabajar sin conexión' : 'Sin copia local todavía',
    sinSubir > 0 ? `${sinSubir} operaciones esperando subir` : null,
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <button
      onClick={() => void sincronizar()}
      disabled={!enLinea || sincronizando}
      title={`${titulo}\n\nTocá para sincronizar ahora`}
      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors disabled:cursor-default ${config.fondo} ${config.texto}`}
    >
      <span className="relative flex size-2">
        {config.pulso && sincronizando && (
          <span className={`absolute inline-flex size-full animate-ping rounded-full ${config.punto} opacity-75`} />
        )}
        <span className={`relative inline-flex size-2 rounded-full ${config.punto}`} />
      </span>
      {config.etiqueta}
      {!listo && enLinea && <span className="text-piedra-400">· preparando</span>}
    </button>
  )
}
