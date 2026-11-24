import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { confirmar, pedirTexto } from '@/components/Dialogo'
import {
  administrarCuenta,
  cambiarPermiso,
  borrarRol,
  cargarRolesYPermisos,
  CLAVE_MINIMA,
  crearRol,
  definirPin,
  desbloquearPines,
  editarRol,
  guardarUsuario,
  listarUsuarios,
  quitarPin,
  terminalesBloqueadas,
  USUARIO_NUEVO,
} from '@/lib/api/usuarios'
import type { AccionDeCuenta, UsuarioAdmin } from '@/lib/api/usuarios'
import { avanzarConEnter } from '@/lib/teclado'
import EncabezadoOrdenable from '@/components/EncabezadoOrdenable'
import { useOrden } from '@/lib/useOrden'

type Pestania = 'gente' | 'roles'

const claseInput =
  'w-full rounded-lg border border-borde px-2.5 py-1.5 text-sm text-tinta outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20'

export default function Usuarios() {
  const { tienePermiso } = useAuth()
  const puedeUsuarios = tienePermiso('usuarios.gestionar')
  const puedeRoles = tienePermiso('roles.gestionar')
  const [pestania, setPestania] = useState<Pestania>(puedeUsuarios ? 'gente' : 'roles')

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
  const { perfil } = useAuth()
  const [editando, setEditando] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [form, setForm] = useState<Partial<UsuarioAdmin>>(USUARIO_NUEVO)
  // La contraseña para entrar, sólo al crear: la elige quien administra y se la pasa a la persona.
  const [clave, setClave] = useState('')
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

  const original = usuarios.data?.find((u) => u.id === editando) ?? null
  const orden = useOrden('usuarios', usuarios.data, {
    persona: (u) => u.nombre,
    rol: (u) => u.rol?.nombre,
    entra: (u) => (u.auth_user_id ? 'con correo' : u.opera_con_pin ? 'con PIN' : null),
  })
  const conAcceso = !creando && !!original?.auth_user_id
  const conCorreo = !!form.email?.trim()

  const guardar = useMutation({
    mutationFn: async () => {
      const id = await guardarUsuario(creando ? null : editando, form)
      // Una persona nueva con contraseña ya puede entrar.
      if (creando && conCorreo && clave) {
        try {
          await administrarCuenta('dar_acceso', id, clave)
        } catch (e) {
          throw new Error(
            `Se creó la persona, pero no la cuenta para entrar: ${e instanceof Error ? e.message : e} Probá con «Dar acceso» en su fila.`,
          )
        }
        return 'Creada: ya puede entrar con su correo y esa contraseña'
      }
      // Si se corrigió el correo de alguien que ya entra, la cuenta pasa a entrar con el nuevo.
      if (conAcceso && (original?.email ?? '').trim().toLowerCase() !== (form.email ?? '').trim().toLowerCase()) {
        await administrarCuenta('sincronizar_correo', id)
        return 'Guardado: ahora entra con el correo nuevo'
      }
      return 'Guardado'
    },
    onSuccess: (texto) => {
      setError(null)
      setEditando(null)
      setCreando(false)
      setClave('')
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      avisar(texto)
    },
    onError: (e) => {
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    },
  })

  const cuenta = useMutation({
    mutationFn: ({ accion, id, clave }: { accion: AccionDeCuenta; id: string; clave?: string; aviso: string }) =>
      administrarCuenta(accion, id, clave),
    onSuccess: (_d, v) => {
      setError(null)
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      avisar(v.aviso)
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo.'),
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

  const desbloquear = useMutation({
    mutationFn: desbloquearPines,
    onSuccess: (n) => {
      bloqueadas.refetch()
      avisar(n ? `${n} terminal${n === 1 ? '' : 'es'} desbloqueada${n === 1 ? '' : 's'}` : 'Nada que desbloquear')
    },
  })

  function abrir(u: UsuarioAdmin) {
    setClave('')
    setCreando(false)
    setEditando(u.id)
    setForm(u)
    setError(null)
  }

  function nuevo() {
    setClave('')
    setCreando(true)
    setEditando(null)
    setForm({ ...USUARIO_NUEVO, rol_id: refs.data?.roles.find((r) => r.nombre === 'Vendedor')?.id })
    setError(null)
  }

  async function pedirClave(u: UsuarioAdmin) {
    const nueva = !u.auth_user_id
    const valor = await pedirTexto({
      titulo: nueva ? `Acceso para ${u.nombre}` : `Contraseña nueva para ${u.nombre}`,
      detalle: nueva
        ? `Va a entrar con ${u.email} y esta contraseña. Pasásela vos.`
        : `Sigue entrando con ${u.email}. La contraseña anterior deja de servir.`,
      etiqueta: `Contraseña (al menos ${CLAVE_MINIMA} caracteres)`,
      minimo: CLAVE_MINIMA,
      aceptar: nueva ? 'Dar acceso' : 'Cambiar la contraseña',
    })
    if (valor === null) return
    cuenta.mutate({
      accion: nueva ? 'dar_acceso' : 'cambiar_clave',
      id: u.id,
      clave: valor,
      aviso: nueva ? `${u.nombre} ya puede entrar` : 'Contraseña cambiada',
    })
  }

  async function pedirPin(u: UsuarioAdmin) {
    const valor = await pedirTexto({
      titulo: `PIN de ${u.nombre}`,
      detalle: 'Lo va a tipear en el mostrador cada vez que arme o cobre una venta.',
      etiqueta: 'PIN de 4 dígitos',
      ejemplo: '1234',
      aceptar: 'Guardar el PIN',
    })
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
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-borde" onKeyDown={avanzarConEnter}>
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
            {creando && conCorreo && (
              <label className="col-span-4 block sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-piedra-600">
                  Contraseña para entrar{' '}
                  <span className="font-normal text-piedra-400">(al menos {CLAVE_MINIMA} caracteres; se la pasás vos)</span>
                </span>
                <input
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  autoComplete="new-password"
                  className={claseInput}
                />
              </label>
            )}
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

          {conAcceso && !conCorreo && (
            <p className="mt-3 text-xs text-amber-700">
              Entra al sistema con su correo: no puede quedar vacío. Para que deje de entrar, usá «Quitar acceso».
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => guardar.mutate()}
              disabled={
                !form.nombre?.trim() ||
                !form.rol_id ||
                guardar.isPending ||
                (creando && conCorreo && clave.length > 0 && clave.length < CLAVE_MINIMA) ||
                (conAcceso && !conCorreo)
              }
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
            {/*
              En el celular, el rol y cómo entra van debajo del nombre, y
              los botones uno abajo del otro: con las cuatro columnas la
              tabla medía 497 px en 343.
            */}
            <tr>
              <EncabezadoOrdenable columna="persona" orden={orden} className="px-3 py-2.5 font-medium sm:px-4">Persona</EncabezadoOrdenable>
              <EncabezadoOrdenable columna="rol" orden={orden} className="hidden px-4 py-2.5 font-medium sm:table-cell">Rol</EncabezadoOrdenable>
              <EncabezadoOrdenable columna="entra" orden={orden} className="hidden px-4 py-2.5 font-medium md:table-cell">Cómo entra</EncabezadoOrdenable>
              <th className="px-3 py-2.5 sm:px-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-piedra-100">
            {orden.filas.map((u) => (
              <tr key={u.id} className={u.activo ? '' : 'opacity-50'}>
                <td className="px-3 py-2.5 align-top sm:px-4">
                  <p className="font-medium text-tinta">{u.nombre}</p>
                  <p className="break-all text-xs text-piedra-400">{u.email ?? 'sin correo'}</p>
                  <p className="text-xs text-piedra-600 sm:hidden">{u.rol?.nombre}</p>
                  <div className="mt-1 md:hidden">
                    <ComoEntra u={u} />
                  </div>
                </td>
                <td className="hidden px-4 py-2.5 align-top text-piedra-600 sm:table-cell">{u.rol?.nombre}</td>
                <td className="hidden px-4 py-2.5 align-top md:table-cell">
                  <ComoEntra u={u} />
                </td>
                <td className="px-3 py-2.5 text-right align-top text-xs sm:px-4">
                  <div className="flex flex-col items-end gap-1.5 lg:flex-row lg:justify-end lg:gap-3">
                  <button onClick={() => abrir(u)} className="text-marca-700 hover:underline">
                    Editar
                  </button>
                  <button
                    onClick={() => pedirPin(u)}
                    className="whitespace-nowrap text-marca-700 hover:underline"
                  >
                    {u.opera_con_pin ? 'Cambiar PIN' : 'Dar PIN'}
                  </button>
                  {u.opera_con_pin && (
                    <button
                      onClick={() => sacarPin.mutate(u.id)}
                      className="whitespace-nowrap text-piedra-500 hover:underline"
                    >
                      Quitar PIN
                    </button>
                  )}
                  {u.email && u.activo && (
                    <button
                      onClick={() => pedirClave(u)}
                      disabled={cuenta.isPending}
                      className="whitespace-nowrap text-marca-700 hover:underline disabled:opacity-40"
                    >
                      {u.auth_user_id ? 'Cambiar contraseña' : 'Dar acceso'}
                    </button>
                  )}
                  {u.auth_user_id && u.id !== perfil?.id && (
                    <button
                      onClick={async () => {
                        const sigue = await confirmar({
                          titulo: `¿Quitarle el acceso a ${u.nombre}?`,
                          detalle:
                            'Deja de poder iniciar sesión con su correo. Sigue en la lista, con su rol y su PIN, y se le puede volver a dar acceso.',
                          aceptar: 'Quitar acceso',
                          peligro: true,
                        })
                        if (sigue) cuenta.mutate({ accion: 'quitar_acceso', id: u.id, aviso: 'Acceso quitado' })
                      }}
                      disabled={cuenta.isPending}
                      className="whitespace-nowrap text-piedra-500 hover:underline disabled:opacity-40"
                    >
                      Quitar acceso
                    </button>
                  )}
                  {u.id !== perfil?.id && (
                    <button
                      onClick={async () => {
                        const sigue = await confirmar({
                          titulo: `¿Eliminar a ${u.nombre}?`,
                          detalle: u.auth_user_id
                            ? 'Sale de la lista y se borra su cuenta: deja de poder entrar, también en las PC donde tenga la sesión abierta. Lo que hizo hasta hoy queda registrado con su nombre.'
                            : 'Sale de la lista y deja de poder operar. Lo que hizo hasta hoy queda registrado con su nombre.',
                          aceptar: 'Eliminar',
                          peligro: true,
                        })
                        if (sigue) cuenta.mutate({ accion: 'eliminar', id: u.id, aviso: `${u.nombre} salió de la lista` })
                      }}
                      disabled={cuenta.isPending}
                      className="text-red-600 hover:underline disabled:opacity-40"
                    >
                      Eliminar
                    </button>
                  )}
                  </div>
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
        necesitan poder iniciar sesión. Desde el 12/11 esa cuenta se da
        desde acá (función administrar-usuarios), sin pasar por Supabase.
      */}
      <div className="rounded-xl bg-piedra-100 p-4 text-sm text-piedra-600">
        <p className="font-medium text-tinta">Sobre las cuentas de acceso</p>
        <p className="mt-1">
          Un vendedor de mostrador <strong>no necesita cuenta</strong>: alcanza con darle un PIN y
          opera dentro de la sesión de la terminal. Sólo la oficina y las computadoras necesitan
          poder iniciar sesión.
        </p>
        <p className="mt-1">
          Para que alguien inicie sesión, cargale el correo y tocá <strong>Dar acceso</strong>: elegís
          la contraseña y se la pasás. Si se la olvida, <strong>Cambiar contraseña</strong>.
        </p>
      </div>
    </div>
  )
}

/*
  Cómo entra cada persona al sistema. Va en su columna y, en el celular,
  debajo del nombre: «No puede operar» es justo lo que hay que ver.
*/
function ComoEntra({ u }: { u: UsuarioAdmin }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {u.auth_user_id && (
        <span className="rounded-full bg-marca-100 px-2 py-0.5 text-xs text-marca-800">Sesión propia</span>
      )}
      {u.opera_con_pin && <span className="rounded-full bg-verde-100 px-2 py-0.5 text-xs text-verde-800">PIN</span>}
      {/*
        Con correo cargado y sin cuenta todavía, no está roto: está
        esperando. La cuenta se vincula sola la primera vez que la persona
        entra con ese correo.
      */}
      {!u.auth_user_id && u.email && (
        <span
          className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
          title="Se va a vincular sola la primera vez que entre con este correo"
        >
          Todavía no entró
        </span>
      )}
      {!u.auth_user_id && !u.email && !u.opera_con_pin && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">No puede operar</span>
      )}
      {!u.activo && <span className="rounded-full bg-piedra-100 px-2 py-0.5 text-xs text-piedra-600">Inactivo</span>}
    </div>
  )
}

/*
  El formulario del rol: nuevo o para corregir nombre y descripción. A
  uno de fábrica sólo se le cambia la descripción: la caja usa su nombre
  sin conexión.
*/
interface FormRol {
  id: string | null
  nombre: string
  descripcion: string
  copiarDe: string
  deFabrica: boolean
}

function RolesYPermisos() {
  const qc = useQueryClient()
  const [rolActivo, setRolActivo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [formRol, setFormRol] = useState<FormRol | null>(null)

  const refs = useQuery({ queryKey: ['roles-permisos'], queryFn: cargarRolesYPermisos })
  // Para decir cuántas personas tiene cada rol y no ofrecer borrar uno ocupado.
  const usuarios = useQuery({ queryKey: ['usuarios'], queryFn: listarUsuarios })

  useEffect(() => {
    const roles = refs.data?.roles ?? []
    if (roles.length && !roles.some((r) => r.id === rolActivo)) setRolActivo(roles[0].id)
  }, [refs.data, rolActivo])

  const gentePorRol = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const u of usuarios.data ?? []) {
      if (!m.has(u.rol_id)) m.set(u.rol_id, [])
      m.get(u.rol_id)!.push(u.nombre)
    }
    return m
  }, [usuarios.data])

  const guardarRol = useMutation({
    mutationFn: async (f: FormRol) => {
      if (f.id) {
        await editarRol(f.id, f.nombre, f.descripcion)
        return f.id
      }
      return crearRol(f.nombre, f.descripcion, f.copiarDe || null)
    },
    // Se espera la lista nueva antes de elegir el rol: si no, todavía no
    // está y la pantalla vuelve al primero.
    onSuccess: async (id) => {
      setError(null)
      await qc.invalidateQueries({ queryKey: ['roles-permisos'] })
      setFormRol(null)
      setRolActivo(id)
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el rol.')
      qc.invalidateQueries({ queryKey: ['roles-permisos'] })
    },
  })

  const sacarRol = useMutation({
    mutationFn: borrarRol,
    onSuccess: () => {
      setError(null)
      setRolActivo(null)
      qc.invalidateQueries({ queryKey: ['roles-permisos'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo borrar el rol.'),
  })

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
  const rol = refs.data.roles.find((r) => r.id === rolActivo) ?? null
  const gente = gentePorRol.get(rolActivo ?? '') ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {refs.data.roles.map((r) => (
          <button
            key={r.id}
            onClick={() => {
              setRolActivo(r.id)
              setFormRol(null)
            }}
            title={`${refs.data.porRol.get(r.id)?.size ?? 0} permisos`}
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
        <button
          onClick={() => {
            setError(null)
            setFormRol({ id: null, nombre: '', descripcion: '', copiarDe: '', deFabrica: false })
          }}
          className="rounded-lg border border-dashed border-marca-500 px-3.5 py-2 text-sm font-medium text-marca-700 hover:bg-marca-50"
        >
          + Nuevo rol
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      {formRol && (
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-borde" onKeyDown={avanzarConEnter}>
          <h2 className="mb-3 font-medium text-tinta">
            {formRol.id ? `Editando ${rol?.nombre ?? 'el rol'}` : 'Nuevo rol'}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-piedra-600">Nombre</span>
              <input
                autoFocus={!formRol.deFabrica}
                value={formRol.nombre}
                disabled={formRol.deFabrica}
                onChange={(e) => setFormRol({ ...formRol, nombre: e.target.value })}
                placeholder="Repositor"
                className={`${claseInput} disabled:bg-piedra-50 disabled:text-piedra-500`}
              />
              {formRol.deFabrica && (
                <span className="mt-1 block text-xs text-piedra-400">Es de fábrica: el nombre no se cambia.</span>
              )}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-piedra-600">
                Descripción <span className="font-normal text-piedra-400">(opcional)</span>
              </span>
              <input
                autoFocus={formRol.deFabrica}
                value={formRol.descripcion}
                onChange={(e) => setFormRol({ ...formRol, descripcion: e.target.value })}
                placeholder="Repone góndolas y cuenta stock"
                className={claseInput}
              />
            </label>
            {!formRol.id && (
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-piedra-600">Arrancar con los permisos de</span>
                <select
                  value={formRol.copiarDe}
                  onChange={(e) => setFormRol({ ...formRol, copiarDe: e.target.value })}
                  className={claseInput}
                >
                  <option value="">Ninguno: lo armo desde cero</option>
                  {refs.data.roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre} ({refs.data.porRol.get(r.id)?.size ?? 0} permisos)
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => guardarRol.mutate(formRol)}
              disabled={!formRol.nombre.trim() || guardarRol.isPending}
              className="rounded-lg bg-marca-700 px-4 py-2 text-sm font-medium text-white hover:bg-marca-600 disabled:opacity-40"
            >
              {guardarRol.isPending ? 'Guardando…' : formRol.id ? 'Guardar' : 'Crear el rol'}
            </button>
            <button
              onClick={() => {
                setFormRol(null)
                setError(null)
              }}
              className="rounded-lg px-4 py-2 text-sm font-medium text-piedra-500 hover:bg-piedra-100"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {rol && !formRol && (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-borde">
          <div className="min-w-0">
            <p className="font-medium text-tinta">
              {rol.nombre}
              {rol.es_sistema && (
                <span className="ml-2 rounded-full bg-piedra-100 px-2 py-0.5 text-xs font-normal text-piedra-600">
                  de fábrica
                </span>
              )}
            </p>
            {rol.descripcion && <p className="text-sm text-piedra-500">{rol.descripcion}</p>}
            <p className="mt-1 text-xs text-piedra-400">
              {gente.length === 0
                ? 'Nadie tiene este rol todavía.'
                : `${gente.length} persona${gente.length === 1 ? '' : 's'}: ${gente.join(', ')}`}
            </p>
          </div>
          <div className="flex gap-3 text-xs">
            <button
              onClick={() => {
                setError(null)
                setFormRol({
                  id: rol.id,
                  nombre: rol.nombre,
                  descripcion: rol.descripcion ?? '',
                  copiarDe: '',
                  deFabrica: rol.es_sistema,
                })
              }}
              className="text-marca-700 hover:underline"
            >
              Editar
            </button>
            {!rol.es_sistema && (
              <button
                onClick={async () => {
                  if (gente.length > 0) {
                    setError(
                      `${rol.nombre} tiene ${gente.length} persona${gente.length === 1 ? '' : 's'} asignada${gente.length === 1 ? '' : 's'}. Pasalas a otro rol desde Personas antes de borrarlo.`,
                    )
                    return
                  }
                  const sigue = await confirmar({
                    titulo: `¿Borrar el rol ${rol.nombre}?`,
                    detalle: 'Sale de la lista. Lo que se hizo con él queda en el registro de auditoría.',
                    aceptar: 'Borrar',
                    peligro: true,
                  })
                  if (sigue) sacarRol.mutate(rol.id)
                }}
                disabled={sacarRol.isPending}
                className="text-red-600 hover:underline disabled:opacity-40"
              >
                Borrar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Armando uno nuevo no se muestran las casillas: serían las del rol de arriba. */}
      {!(formRol && !formRol.id) && (
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
      )}
    </div>
  )
}
