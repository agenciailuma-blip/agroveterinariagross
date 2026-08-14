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
  /** El perfil salió de la copia local porque no se pudo consultar el servidor. */
  perfilEnCache: boolean
  ingresar: (email: string, password: string) => Promise<void>
  salir: () => Promise<void>
  tienePermiso: (clave: string) => boolean
}

const Contexto = createContext<ContextoAuth | null>(null)

const CLAVE_CACHE = 'gross.perfil'

interface RespuestaPerfil {
  id: string
  nombre: string
  email: string | null
  activo: boolean
  rol: { nombre: string; rol_permiso: { permiso_clave: string }[] } | null
}

/*
  El perfil se guarda localmente a propósito.

  Sin esto, la aplicación entera queda trabada detrás de una consulta al
  servidor al arrancar: la terminal tiene toda la base local lista y no
  puede ni pasar de la pantalla de inicio porque no pudo leer un rol.
  Eso convierte el modo sin conexión en decorado.

  El costo de guardarlo es acotado y conocido: si a alguien le cambian
  los permisos mientras la terminal está sin conexión, sigue con los
  viejos hasta que vuelva. Es una propiedad inevitable de cualquier
  sistema que funcione desconectado, y se corrige sola al sincronizar.
*/
function guardarEnCache(authUserId: string, perfil: PerfilUsuario) {
  localStorage.setItem(
    CLAVE_CACHE,
    JSON.stringify({
      authUserId,
      perfil: { ...perfil, permisos: [...perfil.permisos] },
      guardadoEn: Date.now(),
    }),
  )
}

function leerDeCache(authUserId: string): PerfilUsuario | null {
  const crudo = localStorage.getItem(CLAVE_CACHE)
  if (!crudo) return null
  try {
    const g = JSON.parse(crudo) as {
      authUserId: string
      perfil: Omit<PerfilUsuario, 'permisos'> & { permisos: string[] }
    }
    // Sólo sirve si es de la misma cuenta: si en esta máquina entró otra
    // persona, sus permisos no son los de quien está entrando ahora.
    if (g.authUserId !== authUserId) return null
    return { ...g.perfil, permisos: new Set(g.perfil.permisos) }
  } catch {
    return null
  }
}

function esFalloDeRed(mensaje: string) {
  return /failed to fetch|networkerror|load failed|network request failed/i.test(mensaje)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [perfilEnCache, setPerfilEnCache] = useState(false)

  const cargarPerfil = useCallback(async (userId: string) => {
    let respuesta
    try {
      respuesta = await supabase
        .from('usuario')
        .select('id, nombre, email, activo, rol:rol_id ( nombre, rol_permiso ( permiso_clave ) )')
        .eq('auth_user_id', userId)
        .maybeSingle<RespuestaPerfil>()
    } catch (e) {
      respuesta = { data: null, error: { message: e instanceof Error ? e.message : String(e) } }
    }

    const { data, error } = respuesta

    // No se pudo llegar al servidor. Si hay copia local, se sigue con
    // ella: es exactamente el caso para el que existe.
    if (error && esFalloDeRed(error.message)) {
      const guardado = leerDeCache(userId)
      if (guardado) {
        setPerfil(guardado)
        setPerfilEnCache(true)
        setError(null)
        return
      }
      setPerfil(null)
      setError(
        'No hay conexión y esta computadora todavía no tiene una copia de tu perfil. Conectate una vez y después vas a poder entrar sin internet.',
      )
      return
    }

    if (error) {
      // Otro error del servidor: puede ser transitorio, así que la copia
      // local sigue sirviendo si existe.
      const guardado = leerDeCache(userId)
      if (guardado) {
        setPerfil(guardado)
        setPerfilEnCache(true)
        setError(null)
        return
      }
      setError(`No se pudo cargar el perfil: ${error.message}`)
      setPerfil(null)
      return
    }

    // Llegamos al servidor y respondió que esta cuenta no tiene usuario.
    // Eso NO es un problema de conexión: es una cuenta sin habilitar, y
    // la copia local no puede rescatarla.
    if (!data) {
      localStorage.removeItem(CLAVE_CACHE)
      setError(
        'Tu cuenta no está vinculada a ningún usuario del sistema. Pedile al administrador que te dé de alta.',
      )
      setPerfil(null)
      return
    }

    if (!data.activo) {
      localStorage.removeItem(CLAVE_CACHE)
      setError('Tu usuario está dado de baja.')
      setPerfil(null)
      return
    }

    const nuevo: PerfilUsuario = {
      id: data.id,
      nombre: data.nombre,
      email: data.email,
      activo: data.activo,
      rol: data.rol?.nombre ?? 'Sin rol',
      permisos: new Set(data.rol?.rol_permiso.map((p) => p.permiso_clave) ?? []),
    }

    setError(null)
    setPerfilEnCache(false)
    setPerfil(nuevo)
    guardarEnCache(userId, nuevo)
  }, [])

  useEffect(() => {
    let vigente = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!vigente) return
      setSession(data.session)
      if (data.session) await cargarPerfil(data.session.user.id)
      setCargando(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (evento, nuevaSession) => {
      if (!vigente) return
      setSession(nuevaSession)
      if (nuevaSession) {
        // Al refrescarse el token no hace falta releer el perfil: es la
        // misma persona y ya lo tenemos.
        if (evento === 'TOKEN_REFRESHED' && perfil) return
        await cargarPerfil(nuevaSession.user.id)
      } else {
        setPerfil(null)
      }
    })

    return () => {
      vigente = false
      sub.subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargarPerfil])

  // Al volver la conexión se revalida el perfil, para que un cambio de
  // permisos hecho mientras estaba desconectada llegue enseguida.
  useEffect(() => {
    if (!perfilEnCache || !session) return
    function alVolver() {
      void cargarPerfil(session!.user.id)
    }
    window.addEventListener('online', alVolver)
    return () => window.removeEventListener('online', alVolver)
  }, [perfilEnCache, session, cargarPerfil])

  const ingresar = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      throw new Error(
        error.message === 'Invalid login credentials'
          ? 'Usuario o contraseña incorrectos.'
          : esFalloDeRed(error.message)
            ? 'No hay conexión con el servidor. Para entrar por primera vez en esta computadora hace falta internet.'
            : error.message,
      )
    }
  }, [])

  const salir = useCallback(async () => {
    localStorage.removeItem(CLAVE_CACHE)
    await supabase.auth.signOut()
    setPerfil(null)
    setError(null)
    setPerfilEnCache(false)
  }, [])

  const tienePermiso = useCallback(
    (clave: string) => perfil?.permisos.has(clave) ?? false,
    [perfil],
  )

  const valor = useMemo(
    () => ({ session, perfil, cargando, error, perfilEnCache, ingresar, salir, tienePermiso }),
    [session, perfil, cargando, error, perfilEnCache, ingresar, salir, tienePermiso],
  )

  return <Contexto value={valor}>{children}</Contexto>
}

export function useAuth() {
  const ctx = use(Contexto)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
