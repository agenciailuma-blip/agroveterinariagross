import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Inicio from '@/pages/Inicio'
import Productos from '@/pages/Productos'
import Precios from '@/pages/Precios'
import PuntoDeVenta from '@/pages/PuntoDeVenta'
import Caja from '@/pages/Caja'
import Clientes from '@/pages/Clientes'
import EnConstruccion from '@/pages/EnConstruccion'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // El mostrador tiene que ver datos frescos, pero sin castigar la
      // conexión: se revalida al volver a la pestaña, no cada segundo.
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

function Ruteo() {
  const { session, perfil, cargando, error, salir } = useAuth()

  if (cargando) {
    return (
      <div className="grid min-h-full place-items-center bg-slate-100">
        <p className="text-sm text-slate-500">Cargando…</p>
      </div>
    )
  }

  if (!session) return <Login />

  // Hay sesión pero el usuario no está habilitado en el sistema.
  if (!perfil) {
    return (
      <div className="grid min-h-full place-items-center bg-slate-100 p-4">
        <div className="max-w-md rounded-xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <h1 className="font-semibold text-slate-900">No podés entrar todavía</h1>
          <p className="mt-2 text-sm text-slate-600">
            {error ?? 'Tu cuenta no tiene un usuario asociado en el sistema.'}
          </p>
          <button
            onClick={salir}
            className="mt-5 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="productos" element={<Productos />} />
        <Route path="precios" element={<Precios />} />
        <Route path="ventas" element={<PuntoDeVenta />} />
        <Route path="caja" element={<Caja />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="facturacion" element={<EnConstruccion titulo="Facturación" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Ruteo />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
