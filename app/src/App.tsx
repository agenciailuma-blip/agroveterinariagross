import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import { SyncProvider } from '@/lib/local/SyncProvider'
import { Dialogos } from '@/components/Dialogo'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Inicio from '@/pages/Inicio'
import Productos from '@/pages/Productos'
import ImportarProductos from '@/pages/ImportarProductos'
import Inventario from '@/pages/Inventario'
import Stock from '@/pages/Stock'
import Precios from '@/pages/Precios'
import Proveedores from '@/pages/Proveedores'
import Compras from '@/pages/Compras'
import PuntoDeVenta from '@/pages/PuntoDeVenta'
import Caja from '@/pages/Caja'
import Clientes from '@/pages/Clientes'
import Usuarios from '@/pages/Usuarios'
import Configuracion from '@/pages/Configuracion'
import Facturacion from '@/pages/Facturacion'
import ComprobanteImprimible from '@/pages/ComprobanteImprimible'
import Remitos from '@/pages/Remitos'
import NoFiscales from '@/pages/NoFiscales'
import NoFiscalImprimible from '@/pages/NoFiscalImprimible'
import Reportes from '@/pages/Reportes'
import ResumenCuentaCorriente from '@/pages/ResumenCuentaCorriente'

/*
  networkMode: 'always' es lo más importante de esta configuración.

  Por defecto, React Query PAUSA consultas y mutaciones cuando el
  navegador se declara sin conexión, y las deja esperando a que vuelva
  la red. Para una aplicación común está bien: no tiene sentido pedirle
  datos a un servidor inalcanzable.

  Acá es exactamente al revés. Los datos viven en la base local: buscar
  un producto o guardar una venta no necesitan internet para nada. Con
  el modo por defecto, el mostrador quedaba con el botón en "Enviando…"
  y el buscador en "Buscando…" indefinidamente, sin ningún error —
  porque el código nunca llegaba a ejecutarse. Se quedaba esperando una
  red que no hacía falta.

  Con 'always' todo corre siempre. Lo que de verdad necesita internet ya
  falla por su cuenta, con su propio mensaje.
*/
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'always',
      // El mostrador tiene que ver datos frescos, pero sin castigar la
      // conexión: se revalida al volver a la pestaña, no cada segundo.
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
    mutations: {
      networkMode: 'always',
    },
  },
})

function Ruteo() {
  const { session, perfil, cargando, error, salir } = useAuth()
  const sinConexion = !navigator.onLine

  if (cargando) {
    return (
      <div className="grid min-h-full place-items-center bg-piedra-100">
        <p className="text-sm text-piedra-500">Cargando…</p>
      </div>
    )
  }

  if (!session) return <Login />

  // Hay sesión pero el usuario no está habilitado en el sistema.
  if (!perfil) {
    return (
      <div className="grid min-h-full place-items-center bg-piedra-100 p-4">
        <div className="max-w-md rounded-xl bg-white p-6 text-center shadow-sm ring-1 ring-borde">
          <h1 className="font-semibold text-tinta">No podés entrar todavía</h1>
          <p className="mt-2 text-sm text-piedra-600">
            {error ?? 'Tu cuenta no tiene un usuario asociado en el sistema.'}
          </p>
          {sinConexion && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
              Estás sin conexión. Si ya habías entrado antes en esta computadora, volvé a
              intentarlo con internet una vez y después va a funcionar sin él.
            </p>
          )}
          <button
            onClick={salir}
            className="mt-5 rounded-lg bg-piedra-100 px-4 py-2 text-sm font-medium text-piedra-700 hover:bg-piedra-200"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  return (
    <SyncProvider>
      <Rutas />
    </SyncProvider>
  )
}

function Rutas() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="productos" element={<Productos />} />
        <Route path="productos/importar" element={<ImportarProductos />} />
        <Route path="stock" element={<Stock />} />
        <Route path="inventario" element={<Inventario />} />
        <Route path="precios" element={<Precios />} />
        <Route path="proveedores" element={<Proveedores />} />
        <Route path="compras" element={<Compras />} />
        <Route path="ventas" element={<PuntoDeVenta />} />
        <Route path="caja" element={<Caja />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="usuarios" element={<Usuarios />} />
        <Route path="configuracion" element={<Configuracion />} />
        <Route path="facturacion" element={<Facturacion />} />
        <Route path="remitos" element={<Remitos />} />
        <Route path="no-fiscales" element={<NoFiscales />} />
        <Route path="reportes" element={<Reportes />} />
      </Route>
      {/*
        Fuera del Layout a propósito: el comprobante se imprime, y no
        tiene que salir con el menú lateral pegado al costado.
      */}
      <Route path="comprobante/:id" element={<ComprobanteImprimible />} />
      <Route path="no-fiscal/:id" element={<NoFiscalImprimible />} />
      <Route path="cuenta-corriente/:clienteId" element={<ResumenCuentaCorriente />} />
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
          {/*
            Arriba de todo y afuera del ruteo: una pregunta abierta no
            se puede perder porque la pantalla de atrás cambió.
          */}
          <Dialogos />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
