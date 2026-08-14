-- ═══════════════════════════════════════════════════════════════
-- 019 — ADMINISTRACION DE USUARIOS Y PERMISOS
--
-- Hasta ahora dar de alta a alguien requeria correr SQL a mano. Eso no
-- puede quedar asi: cuando entre un vendedor nuevo un martes a la
-- manana, el encargado tiene que poder resolverlo solo.
--
-- DOS COSAS DISTINTAS QUE SE CONFUNDEN
--
--   Cuenta de acceso  Sirve para iniciar sesion. Vive en auth.users.
--                     La necesitan la oficina y las terminales.
--   Usuario del       Es quien opera y tiene rol y permisos. Vive en
--   sistema           public.usuario.
--
-- Un vendedor de mostrador NO necesita cuenta de acceso: opera con PIN
-- dentro de la sesion de la terminal. Por eso esta pantalla puede dar de
-- alta gente sin tocar el sistema de autenticacion, que es el 90% de los
-- casos. Vincular una cuenta de acceso es una accion aparte y mas rara.
--
-- EL CANDADO QUE IMPORTA
--
-- Se impide dejar el sistema sin nadie que pueda administrar permisos.
-- Es el error que no se puede deshacer desde la propia aplicacion:
-- alguien se quita el permiso equivocado y hay que entrar por SQL a
-- rescatarlo.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- PIN
--
-- SECURITY DEFINER porque el hash vive en el schema privado. La
-- autorizacion se verifica adentro: o tiene permiso de gestionar
-- usuarios, o esta cambiando su propio PIN.
-- ───────────────────────────────────────────────────────────────
create or replace function public.definir_pin_usuario(p_usuario_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_propio boolean;
begin
  select exists (
    select 1 from public.usuario
    where id = p_usuario_id and auth_user_id = (select auth.uid())
  ) into v_propio;

  if not v_propio and not app.tiene_permiso('usuarios.gestionar') then
    raise exception 'No tenes permiso para definir el PIN de otra persona.';
  end if;

  perform app.definir_pin(p_usuario_id, p_pin);
end;
$$;

revoke all on function public.definir_pin_usuario(uuid, text) from public, anon;
grant execute on function public.definir_pin_usuario(uuid, text) to authenticated;

comment on function public.definir_pin_usuario(uuid, text) is
  'Define el PIN de operacion. SECURITY DEFINER porque el hash vive fuera del schema expuesto; la autorizacion se verifica adentro.';

create or replace function public.quitar_pin_usuario(p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.tiene_permiso('usuarios.gestionar') then
    raise exception 'No tenes permiso para quitar el PIN de otra persona.';
  end if;

  delete from app.usuario_pin where usuario_id = p_usuario_id;
  update public.usuario set opera_con_pin = false where id = p_usuario_id;
end;
$$;

revoke all on function public.quitar_pin_usuario(uuid) from public, anon;
grant execute on function public.quitar_pin_usuario(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Desbloquear terminales
--
-- El bloqueo por intentos fallidos es por terminal y dura dos minutos.
-- Si alguien esta apurado con gente esperando, un encargado lo levanta.
-- ───────────────────────────────────────────────────────────────
create or replace function public.desbloquear_pines()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_liberadas integer;
begin
  if not app.tiene_permiso('usuarios.gestionar') then
    raise exception 'No tenes permiso para desbloquear terminales.';
  end if;

  delete from app.intento_pin where bloqueado_hasta is not null;
  get diagnostics v_liberadas = row_count;
  return v_liberadas;
end;
$$;

revoke all on function public.desbloquear_pines() from public, anon;
grant execute on function public.desbloquear_pines() to authenticated;

create or replace function public.hay_terminales_bloqueadas()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from app.intento_pin
  where bloqueado_hasta is not null and bloqueado_hasta > now()
$$;

revoke all on function public.hay_terminales_bloqueadas() from public, anon;
grant execute on function public.hay_terminales_bloqueadas() to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Nadie puede dejar el sistema sin administradores
--
-- Se controla el permiso de gestionar roles, que es el unico que
-- permite recuperar cualquier otro. Si se pierde, hay que entrar por
-- SQL: es el unico error de configuracion que no se arregla desde la
-- propia aplicacion.
-- ───────────────────────────────────────────────────────────────
create or replace function app.proteger_ultimo_administrador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quedan integer;
begin
  select count(*) into v_quedan
  from public.usuario u
  join public.rol_permiso rp on rp.rol_id = u.rol_id
  where rp.permiso_clave = 'roles.gestionar'
    and u.activo
    and u.eliminado_en is null
    and u.auth_user_id is not null;

  if v_quedan = 0 then
    raise exception 'Este cambio dejaria al sistema sin nadie que pueda administrar permisos. Asigna primero a otra persona.';
  end if;

  return null;
end;
$$;

create constraint trigger rol_permiso_ultimo_administrador
  after delete or update on public.rol_permiso
  deferrable initially deferred
  for each row execute function app.proteger_ultimo_administrador();

create constraint trigger usuario_ultimo_administrador
  after update or delete on public.usuario
  deferrable initially deferred
  for each row execute function app.proteger_ultimo_administrador();

comment on function app.proteger_ultimo_administrador() is
  'Impide que un cambio de permisos o de usuarios deje al sistema sin nadie capaz de administrar roles.';
