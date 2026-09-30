import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listarDepositos } from '@/lib/api/depositos'
import { contarPedidosPendientes } from '@/lib/api/pedidos'
import AvisoDeActualizacion from '@/components/AvisoDeActualizacion'
import AvisoBaseBloqueada from '@/components/AvisoBaseBloqueada'
import { useAuth } from '@/auth/AuthProvider'
import { IndicadorConexion } from '@/components/IndicadorConexion'
import {
  SECCIONES,
  destinoDe,
  pestanasVisibles,
  recordarPestana,
  seccionDe,
  ultimaPestana,
} from '@/lib/menu'
import type { Contexto, Pestana } from '@/lib/menu'

/*
  Lo que decide qué se ve en el menú: los permisos de quien entró y si
  hay más de un depósito. La consulta de depósitos es la misma que usan
  Stock y Configuración, así que no suma un viaje.
*/
function useContextoMenu(): Contexto {
  const { tienePermiso } = useAuth()
  const depositos = useQuery({
    queryKey: ['depositos'],
    queryFn: listarDepositos,
    enabled: tienePermiso('stock.ver'),
  })
  return {
    tienePermiso,
    variosDepositos: (depositos.data ?? []).filter((d) => d.activo).length > 1,
  }
}

function useContadores(): Record<NonNullable<Pestana['contador']>, number> {
  const { tienePermiso } = useAuth()
  const pedidosPendientes = useQuery({
    queryKey: ['pedidos-pendientes'],
    queryFn: contarPedidosPendientes,
    enabled: tienePermiso('tienda.pedidos') && navigator.onLine,
    refetchInterval: 60_000,
    // Sin conexión no hay número: mejor nada que uno viejo.
    retry: false,
  })
  return { pedidos: pedidosPendientes.data ?? 0 }
}

/*
  El menú achicado a sólo íconos.

  La decisión se guarda en esta computadora y no en el usuario: es una
  preferencia de la pantalla que tiene adelante, no de la persona. La PC
  de la caja tiene un monitor chico y el mostrador necesita el espacio
  para la venta; la de la oficina, no. El mismo Lucas quiere una cosa en
  una y otra en la otra.

  Se lee una sola vez al arrancar. Si el almacenamiento está bloqueado
  —pasa en algunos navegadores— arranca abierto, que es lo que no
  sorprende a nadie.
*/
const CLAVE_MENU = 'gross.menu_colapsado'

function menuGuardado(): boolean {
  try {
    return localStorage.getItem(CLAVE_MENU) === 'si'
  } catch {
    return false
  }
}

const FLECHA_IZQUIERDA = 'M15.75 19.5L8.25 12l7.5-7.5'
const HAMBURGUESA = 'M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5'
const CRUZ = 'M6 18L18 6M6 6l12 12'
const FLECHA_DERECHA = 'M8.25 4.5l7.5 7.5-7.5 7.5'
const SALIR =
  'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75'

function Icono({ d, clase = 'size-5 shrink-0' }: { d: string; clase?: string }) {
  return (
    <svg
      className={clase}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.7}
      stroke="currentColor"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}

/*
  El contenido del menú, uno solo para los dos lugares donde aparece.

  En la computadora es la barra de la izquierda; en el teléfono, un panel
  que se abre encima de la pantalla. Si fueran dos menús escritos por
  separado, el día que se agregue una pantalla nueva aparecería en uno y
  no en el otro.
*/
function ContenidoMenu({
  colapsado,
  alternarMenu,
  enTelefono = false,
}: {
  colapsado: boolean
  alternarMenu?: () => void
  enTelefono?: boolean
}) {
  const { perfil, salir } = useAuth()
  const { pathname } = useLocation()
  const contexto = useContextoMenu()
  const contadores = useContadores()
  const actual = seccionDe(pathname)?.seccion.id

  // Una sección se ve si queda al menos una pestaña que la persona pueda abrir.
  const visibles = SECCIONES.map((s) => {
    const pestanas = pestanasVisibles(s, contexto)
    const destino = destinoDe(s, contexto, ultimaPestana(s.id))
    // El número de una pestaña también se ve en su sección.
    const contador = pestanas.reduce((n, p) => n + (p.contador ? contadores[p.contador] : 0), 0)
    return { ...s, destino, contador }
  }).filter((s) => s.destino !== null)

  return (
    <>
      <div
        className={`flex items-center gap-3 border-b border-white/10 py-4 ${
          colapsado ? 'justify-center px-2' : 'px-5'
        }`}
      >
        <img src="/marca/isotipo.svg" alt="" className="size-9 shrink-0 brightness-0 invert" />
        {!colapsado && (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">Agroveterinaria Gross</p>
            <p className="text-xs text-marca-300/70">Sistema de gestión</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {visibles.map((s) => {
          const activa = s.id === actual
          return (
            <Link
              key={s.id}
              to={s.destino!}
              aria-current={activa ? 'page' : undefined}
              /* Achicado, el nombre sólo existe al pasar el mouse por
                 encima: sin esto habría que aprenderse diez íconos. */
              title={colapsado ? s.etiqueta : undefined}
              className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-colors ${
                // En el teléfono, cada renglón del alto de un dedo.
                enTelefono ? 'py-3' : 'py-2.5'
              } ${colapsado ? 'justify-center px-2' : 'px-3'} ${
                activa ? 'bg-marca-700 text-white' : 'text-marca-200/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="relative">
                <Icono d={s.icono} />
                {colapsado && s.contador > 0 && (
                  <span className="absolute -top-1 -right-1 size-2 rounded-full bg-acento-400" aria-hidden />
                )}
              </span>
              {!colapsado && <span className="flex-1">{s.etiqueta}</span>}
              {!colapsado && s.contador > 0 && (
                <span className="rounded-full bg-acento-400 px-1.5 text-xs font-semibold text-marca-950 tabular-nums">
                  {s.contador}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        {/*
          Sólo el ícono, sin texto.

          Es un control del que lo usa, no algo que haya que explicar
          en cada pantalla: una vez que se sabe qué hace, el cartel
          estorba todos los días. Se va a usar sobre todo en los
          monitores chicos, como el de la caja, donde el ancho es lo que
          falta. En el teléfono y la tablet no va: ahí el menú se cierra
          solo.
        */}
        {alternarMenu && (
          <div className={`mb-2 flex ${colapsado ? 'justify-center' : 'justify-end'}`}>
            <button
              onClick={alternarMenu}
              title={colapsado ? 'Agrandar el menú' : 'Achicar el menú'}
              aria-label={colapsado ? 'Agrandar el menú' : 'Achicar el menú'}
              className="rounded-lg p-2 text-marca-200/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Icono d={colapsado ? FLECHA_DERECHA : FLECHA_IZQUIERDA} />
            </button>
          </div>
        )}

        {!colapsado && (
          <>
            <p className="truncate px-2 text-sm font-medium text-white">{perfil?.nombre}</p>
            <p className="truncate px-2 text-xs text-marca-300/70">{perfil?.rol}</p>
          </>
        )}

        <button
          onClick={salir}
          title={colapsado ? `Cerrar sesión de ${perfil?.nombre ?? ''}`.trim() : undefined}
          className={`mt-2 flex w-full items-center gap-3 rounded-lg py-1.5 text-sm text-marca-200/80 transition-colors hover:bg-white/10 hover:text-white ${
            colapsado ? 'justify-center px-2' : 'px-2 text-left'
          }`}
        >
          {colapsado ? <Icono d={SALIR} /> : 'Cerrar sesión'}
        </button>
      </div>
    </>
  )
}

/*
  Las pestañas de la sección en la que se está.

  Van en la franja de arriba y no adentro del área que se desplaza: la
  Caja, el Mostrador, Productos y Clientes ocupan justo el alto de la
  pantalla, y una barra más adentro los empujaba. En la computadora
  comparten el renglón con el indicador de conexión; en el teléfono van
  en una franja propia, y si no entran bajan de renglón: nunca se
  desplazan hacia el costado.

  Con una sola pestaña visible no se muestra nada: una pestaña sola no
  es una elección.
*/
function Pestanas({ clase }: { clase: string }) {
  const { pathname } = useLocation()
  const contexto = useContextoMenu()
  const contadores = useContadores()
  const donde = seccionDe(pathname)
  if (!donde) return null

  const visibles = pestanasVisibles(donde.seccion, contexto)
  if (visibles.length < 2) return null

  return (
    <nav aria-label={donde.seccion.etiqueta} className={clase}>
      {visibles.map((p) => {
        const activa = p.a === donde.pestana.a
        const n = p.contador ? contadores[p.contador] : 0
        return (
          <Link
            key={p.a}
            to={p.a}
            aria-current={activa ? 'page' : undefined}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors lg:py-3.5 ${
              activa
                ? 'border-marca-700 text-marca-700'
                : 'border-transparent text-piedra-500 hover:border-piedra-300 hover:text-tinta'
            }`}
          >
            {p.etiqueta}
            {n > 0 && (
              <span className="rounded-full bg-acento-400 px-1.5 text-xs font-semibold text-marca-950 tabular-nums">
                {n}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

export default function Layout() {
  const [colapsado, setColapsado] = useState(menuGuardado)
  const [abiertoEnTelefono, setAbiertoEnTelefono] = useState(false)
  const { pathname } = useLocation()

  // Elegir una pantalla cierra el menú del teléfono: si quedara abierto,
  // taparía justo lo que se acaba de pedir.
  useEffect(() => {
    setAbiertoEnTelefono(false)
  }, [pathname])

  // Cada sección vuelve, en esta PC, a la última pestaña que se usó.
  useEffect(() => {
    recordarPestana(pathname)
  }, [pathname])

  function alternarMenu() {
    setColapsado((antes) => {
      const ahora = !antes
      try {
        localStorage.setItem(CLAVE_MENU, ahora ? 'si' : 'no')
      } catch {
        // Que no se pueda recordar la preferencia no impide usarla ahora.
      }
      return ahora
    })
  }

  return (
    <div className="flex h-full">
      {/*
        La barra de la izquierda, desde 1024 píxeles para arriba.

        Antes aparecía desde 768, y ahí el contenido se ACHICABA: una
        tablet con la barra le dejaba a la página 480 píxeles, menos que
        un teléfono acostado. Las tablas, que muestran más columnas a
        medida que la pantalla crece, se pasaban justo en ese tramo
        (30/09). Desde 1024 el ancho del contenido sólo crece con la
        pantalla. Por debajo, el menú es el panel de abajo, que se abre
        con el botón de arriba.
      */}
      <aside
        className={`hidden shrink-0 flex-col bg-marca-950 text-marca-100 transition-[width] duration-200 lg:flex ${
          colapsado ? 'w-16' : 'w-60'
        }`}
      >
        <ContenidoMenu colapsado={colapsado} alternarMenu={alternarMenu} />
      </aside>

      {abiertoEnTelefono && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menú"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setAbiertoEnTelefono(false)
          }}
        >
          {/* Tocar afuera cierra, como en cualquier aplicación del teléfono. */}
          <button
            aria-label="Cerrar el menú"
            onClick={() => setAbiertoEnTelefono(false)}
            className="absolute inset-0 bg-tinta/50"
          />
          <aside className="relative flex h-full w-72 max-w-[85%] flex-col bg-marca-950 text-marca-100 shadow-xl">
            <button
              onClick={() => setAbiertoEnTelefono(false)}
              aria-label="Cerrar el menú"
              className="absolute right-2 top-3 rounded-lg p-2 text-marca-200/70 hover:bg-white/10 hover:text-white"
            >
              <Icono d={CRUZ} />
            </button>
            <ContenidoMenu colapsado={false} enTelefono />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Va arriba de todo y ocupa una franja: avisa sin tapar nada. */}
        <AvisoDeActualizacion />
        <AvisoBaseBloqueada />
        <header className="flex min-h-12 items-center justify-between gap-3 border-b border-borde bg-white px-3 py-2 lg:min-h-14 lg:items-stretch lg:px-6 lg:py-0">
          <div className="flex min-w-0 items-center gap-2 lg:hidden">
            <button
              onClick={() => setAbiertoEnTelefono(true)}
              aria-label="Abrir el menú"
              className="rounded-lg p-2 text-tinta hover:bg-piedra-100"
            >
              <Icono d={HAMBURGUESA} clase="size-6" />
            </button>
            <img src="/marca/isotipo.svg" alt="" className="size-7 shrink-0" />
            <span className="truncate text-sm font-semibold text-tinta">Gross</span>
          </div>
          <Pestanas clase="hidden min-w-0 flex-wrap lg:flex" />
          <div className="flex items-center lg:ml-auto">
            <IndicadorConexion />
          </div>
        </header>
        <Pestanas clase="flex flex-wrap border-b border-borde bg-white px-1 lg:hidden" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
