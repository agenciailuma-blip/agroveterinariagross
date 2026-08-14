import { supabase } from '@/lib/supabase'

export interface UsuarioAdmin {
  id: string
  nombre: string
  email: string | null
  telefono: string | null
  rol_id: string
  opera_con_pin: boolean
  auth_user_id: string | null
  activo: boolean
  rol: { nombre: string } | null
}

export interface Rol {
  id: string
  nombre: string
  descripcion: string | null
  es_sistema: boolean
}

export interface Permiso {
  clave: string
  grupo: string
  descripcion: string
  orden: number
}

export const USUARIO_NUEVO: Partial<UsuarioAdmin> = {
  nombre: '',
  email: null,
  telefono: null,
  activo: true,
  opera_con_pin: false,
}

export async function listarUsuarios(): Promise<UsuarioAdmin[]> {
  const { data, error } = await supabase
    .from('usuario')
    .select('id, nombre, email, telefono, rol_id, opera_con_pin, auth_user_id, activo, rol:rol_id(nombre)')
    .is('eliminado_en', null)
    .order('activo', { ascending: false })
    .order('nombre')
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as UsuarioAdmin[]
}

export async function cargarRolesYPermisos() {
  const [roles, permisos, asignaciones] = await Promise.all([
    supabase.from('rol').select('id, nombre, descripcion, es_sistema').is('eliminado_en', null).order('nombre'),
    supabase.from('permiso').select('clave, grupo, descripcion, orden').order('orden'),
    supabase.from('rol_permiso').select('rol_id, permiso_clave'),
  ])
  if (roles.error) throw new Error(roles.error.message)

  const porRol = new Map<string, Set<string>>()
  for (const a of asignaciones.data ?? []) {
    const rolId = a.rol_id as string
    if (!porRol.has(rolId)) porRol.set(rolId, new Set())
    porRol.get(rolId)!.add(a.permiso_clave as string)
  }

  return {
    roles: (roles.data ?? []) as Rol[],
    permisos: (permisos.data ?? []) as Permiso[],
    porRol,
  }
}

export async function guardarUsuario(id: string | null, campos: Partial<UsuarioAdmin>) {
  const { rol: _r, auth_user_id: _a, opera_con_pin: _p, ...resto } = campos
  const limpio = Object.fromEntries(
    Object.entries(resto).map(([k, v]) => [k, v === '' ? null : v]),
  )

  if (id) {
    const { error } = await supabase.from('usuario').update(limpio).eq('id', id)
    if (error) throw new Error(traducir(error.message))
    return id
  }
  const { data, error } = await supabase
    .from('usuario')
    .insert(limpio)
    .select('id')
    .single<{ id: string }>()
  if (error) throw new Error(traducir(error.message))
  return data.id
}

export async function darDeBaja(id: string) {
  const { error } = await supabase
    .from('usuario')
    .update({ eliminado_en: new Date().toISOString(), activo: false })
    .eq('id', id)
  if (error) throw new Error(traducir(error.message))
}

export async function definirPin(usuarioId: string, pin: string) {
  const { error } = await supabase.rpc('definir_pin_usuario', {
    p_usuario_id: usuarioId,
    p_pin: pin,
  })
  if (error) throw new Error(error.message)
}

export async function quitarPin(usuarioId: string) {
  const { error } = await supabase.rpc('quitar_pin_usuario', { p_usuario_id: usuarioId })
  if (error) throw new Error(error.message)
}

export async function terminalesBloqueadas(): Promise<number> {
  const { data } = await supabase.rpc('hay_terminales_bloqueadas')
  return Number(data ?? 0)
}

export async function desbloquearPines(): Promise<number> {
  const { data, error } = await supabase.rpc('desbloquear_pines')
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}

export async function cambiarPermiso(rolId: string, clave: string, activo: boolean) {
  if (activo) {
    const { error } = await supabase
      .from('rol_permiso')
      .insert({ rol_id: rolId, permiso_clave: clave })
    if (error && error.code !== '23505') throw new Error(traducir(error.message))
  } else {
    const { error } = await supabase
      .from('rol_permiso')
      .delete()
      .eq('rol_id', rolId)
      .eq('permiso_clave', clave)
    if (error) throw new Error(traducir(error.message))
  }
}

function traducir(mensaje: string) {
  if (mensaje.includes('sin nadie que pueda administrar'))
    return 'Ese cambio dejaría al sistema sin nadie que pueda administrar permisos. Asigná primero a otra persona.'
  if (mensaje.includes('usuario_email_unico')) return 'Ya hay otro usuario con ese correo.'
  return mensaje
}
