import { useSync } from '@/lib/local/SyncProvider'
import { contarEntrega } from '@/lib/local/red'

/*
  Este indicador no es decorativo.

  El sistema sigue vendiendo sin conexión, así que quien está en el
  mostrador tiene que poder saber de un vistazo tres cosas distintas:
  si hay internet, si la copia local está lista, y sobre todo si lo que
  acaba de hacer ya llegó al servidor o está esperando.

  Sin eso, el modo sin conexión es indistinguible de un sistema roto.
*/
export function IndicadorConexion() {
  const { enLinea, listo, sincronizando, sinSubir, ultimaSync, sincronizar, entrega, entregaEn } =
    useSync()

  /*
    Sin internet, lo único que salva a la venta es que llegue a la caja
    por la red del local. Si ese camino tampoco anda, el vendedor tiene
    que enterarse MIENTRAS vende, no cuando el cajero no encuentra la
    venta y el cliente ya está esperando en la caja.

    El 17/09 esto falló en el local y el indicador decía, tranquilo,
    "Sin conexión · 3 en espera", que era cierto y no alcanzaba.
  */
  const dice = contarEntrega(entrega ?? null, entregaEn ?? null)
  const cajaNoRecibe = dice.estado === 'falla'

  const estado = !enLinea
    ? cajaNoRecibe
      ? 'sin_caja'
      : 'sin_conexion'
    : sinSubir > 0
      ? 'pendiente'
      : sincronizando
        ? 'sincronizando'
        : 'al_dia'

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
    /*
      Rojo y no ámbar, a propósito: ámbar es "esto sigue andando de otra
      manera", y acá la venta no le está llegando a nadie más que a esta
      computadora.
    */
    sin_caja: {
      etiqueta: 'Sin conexión · la caja no recibe',
      punto: 'bg-red-500',
      texto: 'text-red-800',
      fondo: 'bg-red-50 ring-red-200',
      pulso: false,
    },
  }[estado]

  const titulo = [
    ultimaSync
      ? `Última sincronización: ${ultimaSync.toLocaleTimeString('es-AR')}`
      : 'Todavía no se sincronizó',
    listo ? 'Copia local lista: se puede trabajar sin conexión' : 'Sin copia local todavía',
    sinSubir > 0 ? `${sinSubir} operaciones esperando subir` : null,
    // El motivo completo, para poder leerlo sin ir a Configuración.
    cajaNoRecibe ? `La red del local: ${dice.detalle}` : null,
    cajaNoRecibe && dice.queHacer ? dice.queHacer : null,
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
