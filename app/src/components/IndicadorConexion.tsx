import { useConexion } from '@/lib/useConexion'

/*
  Este indicador no es decorativo.

  El sistema está pensado para seguir vendiendo sin conexión, así que
  quien está en el mostrador tiene que poder saber de un vistazo si lo
  que hace ya llegó al servidor o está esperando. Sin esto, el modo
  offline es indistinguible de un sistema roto.
*/
export function IndicadorConexion() {
  const { estado, ultimoContacto } = useConexion()

  const config = {
    // Verde para conectado: es color de marca y además es el que
    // todo el mundo lee como "está bien" sin tener que pensarlo.
    en_linea: {
      etiqueta: 'En línea',
      punto: 'bg-verde-500',
      texto: 'text-verde-700',
      fondo: 'bg-verde-50 ring-verde-200',
    },
    sin_conexion: {
      etiqueta: 'Sin conexión',
      punto: 'bg-amber-500',
      texto: 'text-amber-800',
      fondo: 'bg-amber-50 ring-amber-200',
    },
    verificando: {
      etiqueta: 'Verificando…',
      punto: 'bg-slate-400',
      texto: 'text-slate-600',
      fondo: 'bg-slate-50 ring-slate-200',
    },
  }[estado]

  return (
    <div
      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${config.fondo} ${config.texto}`}
      title={
        ultimoContacto
          ? `Último contacto con el servidor: ${ultimoContacto.toLocaleTimeString('es-AR')}`
          : 'Todavía no hubo contacto con el servidor'
      }
    >
      <span className="relative flex size-2">
        {estado === 'en_linea' && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-verde-400 opacity-75" />
        )}
        <span className={`relative inline-flex size-2 rounded-full ${config.punto}`} />
      </span>
      {config.etiqueta}
    </div>
  )
}
