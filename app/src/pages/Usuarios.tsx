import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import {
  cambiarPermiso,
  cargarRolesYPermisos,
  darDeBaja,
  definirPin,
  desbloquearPines,
  guardarUsuario,
  listarUsuarios,
  quitarPin,
  terminalesBloqueadas,
  USUARIO_NUEVO,
} from '@/lib/api/usuarios'
import type { UsuarioAdmin } from '@/lib/api/usuarios'

type Pestania = 'gente' | 'roles'

const claseInput =
  'w-full rounded-lg border border-borde px-2.5 py-1.5 text-sm text-tinta outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20'

export default function Usuarios() {
  const { tienePermiso } = useAuth()
  const [pestania, setPestania] = useState<Pestania>('gente')

  const puedeUsuarios = tienePermiso('usuarios.gestionar')
  const puedeRoles = tienePermiso('roles.gestionar')

  if (!puedeUsuarios && !puedeRoles) {
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        No tenés permiso para administrar usuarios ni roles.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-tinta">Usuarios y permisos</h1>
        <p className="text-sm text-piedra-500">
          Quién puede operar el sistema y qué puede hacer cada uno.
        </p>
      </div>

      <div className="flex gap-1 border-b border-borde">
        {puedeUsuarios && (
          <Solapa activa={pestania === 'gente'} onClick={() => setPestania('gente')}>
            Personas
          </Solapa>
        )}
        {puedeRoles && (
          <Solapa activa={pestania === 'roles'} onClick={() => setPestania('roles')}>
            Roles y permisos
          </Solapa>
        )}
      </div>

      {pestania === 'gente' && puedeUsuarios ? <Personas /> : <RolesYPermisos />}
    </div>
  )
}

function Solapa({
  activa,
  onClick,
  children,
}: {
  activa: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        activa ? 'border-marca-700 text-marca-700' : 'border-transparent text-piedra-500 hover:text-tinta'
      }`}
    >
      {children}
    </button>
  )
}

function Personas() {
  const qc = useQueryClient()
  const [editando, setEditando] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [form, setForm] = useState<Partial<UsuarioAdmin>>(USUARIO_NUEVO)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const usuarios = useQuery({ queryKey: ['usuarios'], queryFn: listarUsuarios })
  const refs = useQuery({ queryKey: ['roles-permisos'], queryFn: cargarRolesYPermisos })
  const bloqueadas = useQuery({
    queryKey: ['terminales-bloqueadas'],
    queryFn: terminalesBloqueadas,
    refetchInterval: 30_000,
  })

  function avisar(texto: string) {
    setAviso(texto)
    setTimeout(() => setAviso(null), 3000)
  }

  const guardar = useMutation({
    mutationFn: () => guardarUsuario(creando ? null : editando, form),
    onSuccess: () => {
      setError(null)
      setEditando(null)
      setCreando(false)
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      avisar('Guardado')
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo guardar.'),
  })

  const pin = useMutation({
    mutationFn: ({ id, valor }: { id: string; valor: string }) => definirPin(id, valor),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      avisar('PIN actualizado')
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo definir el PIN.'),
  })

  const sacarPin = useMutation({
    mutationFn: (id: string) => quitarPin(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      avisar('PIN quitado')
    },
  })

  const baja = useMutation({
    mutationFn: (id: string) => darDeBaja(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      avisar('Usuario dado de baja')
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo dar de baja.'),
  })

  const desbloquear = useMutation({
    mutationFn: desbloquearPines,
    onSuccess: (n) => {
      bloqueadas.refetch()
      avisar(n ? `${n} terminal${n === 1 ? '' : 'es'} desbloqueada${n === 1 ? '' : 's'}` : 'Nada que desbloquear')
    },
  })

  function abrir(u: UsuarioAdmin) {
    setCreando(false)
    setEditando(u.id)
    setForm(u)
    setError(null)
  }

  function nuevo() {
    setCreando(true)
    setEditando(null)
    setForm({ ...USUARIO_NUEVO, rol_id: refs.data?.roles.find((r) => r.nombre === 'Vendedor')?.id })
    setError(null)
  }

  function pedirPin(u: UsuarioAdmin) {
    const valor = window.prompt(`PIN de 4 dígitos para ${u.nombre}`, '')
    if (valor === null) return
    if (!/^[0-9]{4}$/.test(valor.trim())) {
      setError('El PIN tiene que ser de 4 dígitos numéricos.')
      return
    }
    setError(null)
    pin.mutate({ id: u.id, valor: valor.trim() })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={nuevo}
            className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600"
          >
            Nueva persona
          </button>
          {aviso && (
            <span className="rounded-full bg-verde-100 px-3 py-1 text-xs font-medium text-verde-800 ring-1 ring-verde-200">
              {aviso}
            </span>
          )}
        </div>

        {!!bloqueadas.data && (
          <button
            onClick={() => desbloquear.mutate()}
            className="rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900 ring-1 ring-amber-300 hover:bg-amber-200"
          >
            {bloqueadas.data} terminal{bloqueadas.data === 1 ? '' : 'es'} bloqueada
            {bloqueadas.data === 1 ? '' : 's'} · desbloquear
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      {(creando || editando) && refs.data && (
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-borde">
          <h2 className="mb-3 font-medium text-tinta">
            {creando ? 'Nueva persona' : `Editando ${form.nombre}`}
          </h2>
          <div className="grid grid-cols-4 gap-3">
            <label className="col-span-2 block">
              <span className="mb-1 block text-xs font-medium text-piedra-600">Nombre</span>
              <input
                autoFocus
                value={form.nombre ?? ''}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                className={claseInput}
              />
            </label>
            <label className="col-span-2 block">
              <span className="mb-1 block text-xs font-medium text-piedra-600">Rol</span>
              <select
                value={form.rol_id ?? ''}
                onChange={(e) => setForm({ ...form, rol_id: e.target.value })}
                className={claseInput}
              >
                <option value="">Elegí un rol</option>
                {refs.data.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 block">
              <span className="mb-1 block text-xs font-medium text-piedra-600">
                Correo <span className="font-normal text-piedra-400">(sólo si va a iniciar sesión)</span>
              </span>
              <input
                type="email"
                value={form.email ?? ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={claseInput}
              />
            </label>
            <label className="col-span-2 block">
              <span className="mb-1 block text-xs font-medium text-piedra-600">Teléfono</span>
              <input
                value={form.telefono ?? ''}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                className={claseInput}
              />
            </label>
            <label className="col-span-4 flex items-center gap-2 text-sm text-tinta">
              <input
                type="checkbox"
                checked={form.activo ?? true}
                onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                className="size-4 rounded border-borde text-marca-700 focus:ring-marca-500"
              />
              Activo
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => guardar.mutate()}
              disabled={!form.nombre?.trim() || !form.rol_id || guardar.isPending}
              className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600 disabled:opacity-40"
            >
              {guardar.isPending ? 'Guardando…' : creando ? 'Crear' : 'Guardar'}
            </button>
            <button
              onClick={() => {
                setCreando(false)
                setEditando(null)
                setError(null)
              }}
              className="rounded-lg px-4 py-2 text-sm font-medium text-piedra-500 hover:bg-piedra-100"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-borde">
        <table className="w-full text-sm">
          <thead className="border-b border-borde bg-piedra-50 text-left text-xs tracking-wide text-piedra-500 uppercase">
            <tr>
              <th className="px-4 py-2.5 font-medium">Persona</th>
              <th className="px-4 py-2.5 font-medium">Rol</th>
              <th className="px-4 py-2.5 font-medium">Cómo entra</th>
              <th className="w-64 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-piedra-100">
            {usuarios.data?.map((u) => (
              <tr key={u.id} className={u.activo ? '' : 'opacity-50'}>
                <td className="px-4 py-2.5">
                  <p className="font-medium text-tinta">{u.nombre}</p>
                  <p className="text-xs text-piedra-400">{u.email ?? 'sin correo'}</p>
                </td>
                <td className="px-4 py-2.5 text-piedra-600">{u.rol?.nombre}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {u.auth_user_id && (
                      <span className="rounded-full bg-marca-100 px-2 py-0.5 text-xs text-marca-800">
                        Sesión propia
                      </span>
                    )}
                    {u.opera_con_pin && (
                      <span className="rounded-full bg-verde-100 px-2 py-0.5 text-xs text-verde-800">
                        PIN
                      </span>
                    )}
                    {!u.auth_user_id && !u.opera_con_pin && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                        No puede operar
                      </span>
                    )}
                    {!u.activo && (
                      <span className="rounded-full bg-piedra-100 px-2 py-0.5 text-xs text-piedra-600">
                        Inactivo
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right text-xs">
                  <button onClick={() => abrir(u)} className="text-marca-700 hover:underline">
                    Editar
                  </button>
                  <button
                    onClick={() => pedirPin(u)}
                    className="ml-3 text-marca-700 hover:underline"
                  >
                    {u.opera_con_pin ? 'Cambiar PIN' : 'Dar PIN'}
                  </button>
                  {u.opera_con_pin && (
                    <button
                      onClick={() => sacarPin.mutate(u.id)}
                      className="ml-3 text-piedra-500 hover:underline"
                    >
                      Quitar PIN
                    </button>
                  )}
                  {u.activo && (
                    <button
                      onClick={() => {
                        if (window.confirm(`¿Dar de baja a ${u.nombre}?`)) baja.mutate(u.id)
                      }}
                      className="ml-3 text-red-600 hover:underline"
                    >
                      Baja
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/*
        La cuenta de acceso y el usuario del sistema son cosas distintas.
        Un vendedor de mostrador no necesita cuenta: opera con PIN dentro
        de la sesión de la terminal. Sólo la oficina y las terminales
        necesitan poder iniciar sesión, y eso se crea aparte.
      */}
      <div className="rounded-xl bg-piedra-100 p-4 text-sm text-piedra-600">
        <p className="font-medium text-tinta">Sobre las cuentas de acceso</p>
        <p className="mt-1">
          Un vendedor de mostrador <strong>no necesita cuenta</strong>: alcanza con darle un PIN y
          opera dentro de la sesión de la terminal. Sólo la oficina y las computadoras necesitan
          poder iniciar sesión.
        </p>
        <p className="mt-1">
          Esas cuentas todavía se crean desde el panel de Supabase y se vinculan con una consulta.
          Cuando el sistema esté en producción se reemplaza por una invitación por correo desde acá.
        </p>
      </div>
    </div>
  )
}

function RolesYPermisos() {
  const qc = useQueryClient()
  const [rolActivo, setRolActivo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refs = useQuery({ queryKey: ['roles-permisos'], queryFn: cargarRolesYPermisos })

  useEffect(() => {
    if (!rolActivo && refs.data?.roles.length) setRolActivo(refs.data.roles[0].id)
  }, [refs.data, rolActivo])

  const cambiar = useMutation({
    mutationFn: ({ clave, activo }: { clave: string; activo: boolean }) =>
      cambiarPermiso(rolActivo!, clave, activo),
    onSuccess: () => {
      setError(null)
      qc.invalidateQueries({ queryKey: ['roles-permisos'] })
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar.')
      qc.invalidateQueries({ queryKey: ['roles-permisos'] })
    },
  })

  const grupos = useMemo(() => {
    const mapa = new Map<string, typeof refs.data extends undefined ? never : NonNullable<typeof refs.data>['permisos']>()
    for (const p of refs.data?.permisos ?? []) {
      if (!mapa.has(p.grupo)) mapa.set(p.grupo, [])
      mapa.get(p.grupo)!.push(p)
    }
    return [...mapa.entries()]
  }, [refs.data])

  if (!refs.data) return <p className="text-sm text-piedra-500">Cargando…</p>

  const asignados = refs.data.porRol.get(rolActivo ?? '') ?? new Set<string>()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {refs.data.roles.map((r) => (
          <button
            key={r.id}
            onClick={() => setRolActivo(r.id)}
            className={`rounded-lg px-3.5 py-2 text-sm font-medium ring-1 transition-colors ${
              rolActivo === r.id
                ? 'bg-marca-700 text-white ring-marca-700'
                : 'bg-white text-piedra-600 ring-borde hover:bg-piedra-50'
            }`}
          >
            {r.nombre}
            <span className="ml-2 text-xs opacity-70">
              {refs.data.porRol.get(r.id)?.size ?? 0}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {grupos.map(([grupo, permisos]) => (
          <div key={grupo} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-borde">
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-piedra-400 uppercase">
              {grupo}
            </h3>
            <div className="space-y-1.5">
              {permisos.map((p) => (
                <label
                  key={p.clave}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1 text-sm hover:bg-piedra-50"
                >
                  <input
                    type="checkbox"
                    checked={asignados.has(p.clave)}
                    disabled={cambiar.isPending}
                    onChange={(e) => cambiar.mutate({ clave: p.clave, activo: e.target.checked })}
                    className="mt-0.5 size-4 shrink-0 rounded border-borde text-marca-700 focus:ring-marca-500"
                  />
                  <span className="text-tinta">{p.descripcion}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
