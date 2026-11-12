import { useEffect, useRef, useState } from 'react'
import { Pendientes } from '@/components/Pendientes'
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
    Con algo esperando, tocar el indicador abre la lista de qué es.
    Antes decía «3 sin subir» y desde ahí no había forma de ver cuáles
    eran (12/11): la lista estaba sólo en Inicio.
  */
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!sinSubir) setAbierto(false)
  }, [sinSubir])
  useEffect(() => {
    if (!abierto) return
    const cerrar = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [abierto])

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
      etiqueta: `${sinSubir} sin enviar`,
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
    sinSubir > 0 ? `${sinSubir} operaciones de esta computadora esperando llegar al servidor` : null,
    // El motivo completo, para poder leerlo sin ir a Configuración.
    cajaNoRecibe ? `La red del local: ${dice.detalle}` : null,
    cajaNoRecibe && dice.queHacer ? dice.queHacer : null,
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <div ref={caja} className="relative">
    <button
      onClick={() => (sinSubir > 0 ? setAbierto((a) => !a) : void sincronizar())}
      disabled={sinSubir === 0 && (!enLinea || sincronizando)}
      aria-expanded={sinSubir > 0 ? abierto : undefined}
      title={`${titulo}\n\n${sinSubir > 0 ? 'Tocá para ver cuáles son' : 'Tocá para sincronizar ahora'}`}
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
      {abierto && sinSubir > 0 && (
        <div className="absolute right-0 z-40 mt-2 w-[min(26rem,calc(100vw-2rem))]">
          <Pendientes />
        </div>
      )}
    </div>
  )
}
