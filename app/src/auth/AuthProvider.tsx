import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface PerfilUsuario {
  id: string
  nombre: string
  email: string | null
  activo: boolean
  rol: string
  permisos: Set<string>
}

interface ContextoAuth {
  session: Session | null
  perfil: PerfilUsuario | null
  cargando: boolean
  error: string | null
  ingresar: (email: string, password: string) => Promise<void>
  salir: () => Promise<void>
  tienePermiso: (clave: string) => boolean
}

const Contexto = createContext<ContextoAuth | null>(null)

/*
  Respuesta del embed de PostgREST: usuario -> rol -> rol_permiso.
  El rol viene como objeto porque la relación es de uno a uno.
*/
interface RespuestaPerfil {
  id: string
  nombre: string
  email: string | null
  activo: boolean
  rol: { nombre: string; rol_permiso: { permiso_clave: string }[] } | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargarPerfil = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('usuario')
      .select('id, nombre, email, activo, rol:rol_id ( nombre, rol_permiso ( permiso_clave ) )')
      .eq('auth_user_id', userId)
      .maybeSingle<RespuestaPerfil>()

    if (error) {
      setError(`No se pudo cargar el perfil: ${error.message}`)
      setPerfil(null)
      return
    }

    if (!data) {
      // Existe la cuenta pero nadie la vinculó a un usuario del sistema.
      setError(
        'Tu cuenta no está vinculada a ningún usuario del sistema. Pedile al administrador que te dé de alta.',
      )
      setPerfil(null)
      return
    }

    if (!data.activo) {
      setError('Tu usuario está dado de baja.')
      setPerfil(null)
      return
    }

    setError(null)
    setPerfil({
      id: data.id,
      nombre: data.nombre,
      email: data.email,
      activo: data.activo,
      rol: data.rol?.nombre ?? 'Sin rol',
      permisos: new Set(data.rol?.rol_permiso.map((p) => p.permiso_clave) ?? []),
    })
  }, [])

  useEffect(() => {
    let vigente = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!vigente) return
      setSession(data.session)
      if (data.session) await cargarPerfil(data.session.user.id)
      setCargando(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_evento, nuevaSession) => {
      if (!vigente) return
      setSession(nuevaSession)
      if (nuevaSession) {
        await cargarPerfil(nuevaSession.user.id)
      } else {
        setPerfil(null)
      }
    })

    return () => {
      vigente = false
      sub.subscription.unsubscribe()
    }
  }, [cargarPerfil])

  const ingresar = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      throw new Error(
        error.message === 'Invalid login credentials'
          ? 'Usuario o contraseña incorrectos.'
          : error.message,
      )
    }
  }, [])

  const salir = useCallback(async () => {
    await supabase.auth.signOut()
    setPerfil(null)
    setError(null)
  }, [])

  const tienePermiso = useCallback(
    (clave: string) => perfil?.permisos.has(clave) ?? false,
    [perfil],
  )

  const valor = useMemo(
    () => ({ session, perfil, cargando, error, ingresar, salir, tienePermiso }),
    [session, perfil, cargando, error, ingresar, salir, tienePermiso],
  )

  return <Contexto value={valor}>{children}</Contexto>
}

export function useAuth() {
  const ctx = use(Contexto)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
