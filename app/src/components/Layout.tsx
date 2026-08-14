import { NavLink, Outlet } from 'react-router-dom'
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
    a: '/precios',
    etiqueta: 'Precios',
    permiso: 'productos.ver',
    icono: 'M7 7h.01M7 3h5a2 2 0 011.4.6l7 7a2 2 0 010 2.8l-5 5a2 2 0 01-2.8 0l-7-7A2 2 0 015 10V5a2 2 0 012-2z',
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
    a: '/usuarios',
    etiqueta: 'Usuarios',
    permiso: 'usuarios.gestionar',
    icono: 'M10.3 4.3a2 2 0 013.4 0l.4.7a2 2 0 002 1l.8-.1a2 2 0 011.7 3l-.4.7a2 2 0 000 2.2l.4.7a2 2 0 01-1.7 3l-.8-.1a2 2 0 00-2 1l-.4.7a2 2 0 01-3.4 0l-.4-.7a2 2 0 00-2-1l-.8.1a2 2 0 01-1.7-3l.4-.7a2 2 0 000-2.2l-.4-.7a2 2 0 011.7-3l.8.1a2 2 0 002-1l.4-.7zM14 12a2 2 0 11-4 0 2 2 0 014 0z',
  },
]

export default function Layout() {
  const { perfil, salir, tienePermiso } = useAuth()

  const visibles = MENU.filter((i) => !i.permiso || tienePermiso(i.permiso))

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col bg-marca-950 text-marca-100">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <img src="/marca/isotipo.svg" alt="" className="size-9 shrink-0 brightness-0 invert" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">Agroveterinaria Gross</p>
            <p className="text-xs text-marca-300/70">Sistema de gestión</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 p-3">
          {visibles.map((item) => (
            <NavLink
              key={item.a}
              to={item.a}
              end={item.a === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-marca-700 text-white'
                    : 'text-marca-200/80 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <svg
                className="size-5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.7}
                stroke="currentColor"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icono} />
              </svg>
              {item.etiqueta}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <p className="truncate px-2 text-sm font-medium text-white">{perfil?.nombre}</p>
          <p className="truncate px-2 text-xs text-marca-300/70">{perfil?.rol}</p>
          <button
            onClick={salir}
            className="mt-2 w-full rounded-lg px-2 py-1.5 text-left text-sm text-marca-200/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
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
