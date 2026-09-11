import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import AvisoDeActualizacion from '@/components/AvisoDeActualizacion'
import { useAuth } from '@/auth/AuthProvider'
import { IndicadorConexion } from '@/components/IndicadorConexion'

interface ItemMenu {
  a: string
  etiqueta: string
  permiso?: string
  icono: string
}

/* Trazos de íconos, en línea para no sumar una dependencia por cinco dibujos. */
const MENU: ItemMenu[] = [
  { a: '/', etiqueta: 'Inicio', icono: 'M3 12l9-9 9 9M5 10v10h14V10' },
  {
    a: '/productos',
    etiqueta: 'Productos',
    permiso: 'productos.ver',
    icono: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  },
  {
    /*
      Sugerencia 2 de Lucas: el stock como entrada propia.

      Va entre Productos e Inventario porque ese es el orden en que se
      usa: se mira qué falta, y recién si el número no cierra se va a
      contar. Inventario queda como lo que es —el conteo físico— y no
      como el único lugar donde mirar existencias.
    */
    a: '/stock',
    etiqueta: 'Stock',
    permiso: 'stock.ver',
    icono: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-4l-1.5 3h-5L8 13H4',
  },
  {
    a: '/inventario',
    etiqueta: 'Inventario',
    permiso: 'stock.inventariar',
    icono: 'M9 12h6m-6 4h6M9 8h6M5 21h14a1 1 0 001-1V6.4L16.6 3H6a1 1 0 00-1 1v16a1 1 0 001 1z',
  },
  {
    a: '/precios',
    etiqueta: 'Precios',
    permiso: 'productos.ver',
    icono: 'M7 7h.01M7 3h5a2 2 0 011.4.6l7 7a2 2 0 010 2.8l-5 5a2 2 0 01-2.8 0l-7-7A2 2 0 015 10V5a2 2 0 012-2z',
  },
  {
    /*
      Proveedores va después de Precios porque es lo que lo alimenta:
      el aumento masivo de precios se hace por proveedor, y ese es el
      motivo por el que el proveedor existe hoy.
    */
    a: '/proveedores',
    etiqueta: 'Proveedores',
    permiso: 'proveedores.ver',
    icono: 'M3 3h2l.4 2M7 13h10l4-8H5.4M16 16a2 2 0 100 4 2 2 0 000-4zM8 18a2 2 0 11-4 0 2 2 0 014 0z',
  },
  {
    /*
      Compras va pegado a Proveedores porque es lo que se hace con ellos:
      llega la factura del proveedor y se carga. Es lo que hoy hacen en
      OBTech y desde el 26/10 no van a tener dónde.
    */
    a: '/compras',
    etiqueta: 'Compras',
    permiso: 'compras.ver',
    icono: 'M9 12h6m-6 4h6M9 8h6M5 21h14a1 1 0 001-1V6.4L16.6 3H6a1 1 0 00-1 1v16a1 1 0 001 1z',
  },
  {
    a: '/ventas',
    etiqueta: 'Ventas',
    permiso: 'ventas.crear',
    icono: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 2.3M17 17a2 2 0 100 4 2 2 0 000-4zM9 19a2 2 0 11-4 0 2 2 0 014 0z',
  },
  {
    a: '/caja',
    etiqueta: 'Caja',
    permiso: 'ventas.cobrar',
    icono: 'M3 10h18M3 10l2-5h14l2 5M3 10v9a1 1 0 001 1h16a1 1 0 001-1v-9M9 15h6',
  },
  {
    a: '/clientes',
    etiqueta: 'Clientes',
    permiso: 'clientes.ver',
    icono: 'M17 20h5v-2a3 3 0 00-5.4-1.8M17 20H7m10 0v-2c0-.7-.1-1.3-.4-1.8M7 20H2v-2a3 3 0 015.4-1.8M7 20v-2c0-.7.1-1.3.4-1.8m0 0a5 5 0 019.2 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  },
  {
    a: '/facturacion',
    etiqueta: 'Facturación',
    permiso: 'facturacion.ver',
    icono: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.6L19 9.4V19a2 2 0 01-2 2z',
  },
  {
    a: '/remitos',
    etiqueta: 'Remitos',
    permiso: 'facturacion.no_fiscal_ver',
    icono: 'M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0zM3 5h11v12H9M14 8h3.5L21 11.5V17h-2',
  },
  {
    a: '/no-fiscales',
    etiqueta: 'Presupuestos',
    permiso: 'facturacion.no_fiscal_ver',
    icono: 'M9 12h6m-6 4h6M9 8h2m-2 13h10a2 2 0 002-2V7.4L14.6 3H7a2 2 0 00-2 2v14a2 2 0 002 2z',
  },
  {
    /*
      Reportes cierra la parte de mirar y abre la de administrar: es lo
      último que se consulta sobre el día y va justo antes de Usuarios y
      Configuración, que son de otra clase de trabajo.
    */
    a: '/reportes',
    etiqueta: 'Reportes',
    permiso: 'reportes.ver',
    icono: 'M3 3v18h18M7 17v-5m5 5V8m5 9v-3',
  },
  {
    a: '/usuarios',
    etiqueta: 'Usuarios',
    permiso: 'usuarios.gestionar',
    icono: 'M10.3 4.3a2 2 0 013.4 0l.4.7a2 2 0 002 1l.8-.1a2 2 0 011.7 3l-.4.7a2 2 0 000 2.2l.4.7a2 2 0 01-1.7 3l-.8-.1a2 2 0 00-2 1l-.4.7a2 2 0 01-3.4 0l-.4-.7a2 2 0 00-2-1l-.8.1a2 2 0 01-1.7-3l.4-.7a2 2 0 000-2.2l-.4-.7a2 2 0 011.7-3l.8.1a2 2 0 002-1l.4-.7zM14 12a2 2 0 11-4 0 2 2 0 014 0z',
  },
  {
    a: '/configuracion',
    etiqueta: 'Configuración',
    permiso: 'configuracion.gestionar',
    icono: 'M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75',
  },
]

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

export default function Layout() {
  const { perfil, salir, tienePermiso } = useAuth()
  const [colapsado, setColapsado] = useState(menuGuardado)

  const visibles = MENU.filter((i) => !i.permiso || tienePermiso(i.permiso))

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
      <aside
        className={`flex shrink-0 flex-col bg-marca-950 text-marca-100 transition-[width] duration-200 ${
          colapsado ? 'w-16' : 'w-60'
        }`}
      >
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

        <nav className="flex-1 space-y-0.5 p-3">
          {visibles.map((item) => (
            <NavLink
              key={item.a}
              to={item.a}
              end={item.a === '/'}
              /* Achicado, el nombre sólo existe al pasar el mouse por
                 encima: sin esto habría que aprenderse quince íconos. */
              title={colapsado ? item.etiqueta : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-colors ${
                  colapsado ? 'justify-center px-2' : 'px-3'
                } ${
                  isActive
                    ? 'bg-marca-700 text-white'
                    : 'text-marca-200/80 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <Icono d={item.icono} />
              {!colapsado && item.etiqueta}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          {/*
            Sólo el ícono, sin texto.

            Es un control del que lo usa, no algo que haya que explicar
            en cada pantalla: una vez que se sabe qué hace, el cartel
            estorba todos los días. Se va a usar sobre todo en tablet,
            donde el ancho es lo que falta.
          */}
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
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Va arriba de todo y ocupa una franja: avisa sin tapar nada. */}
        <AvisoDeActualizacion />
        <header className="flex items-center justify-end gap-4 border-b border-borde bg-white px-6 py-3">
          <IndicadorConexion />
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
