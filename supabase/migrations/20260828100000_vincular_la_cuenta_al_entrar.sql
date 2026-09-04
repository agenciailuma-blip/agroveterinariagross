-- ═══════════════════════════════════════════════════════════════
-- 041 — LA CUENTA SE VINCULA SOLA AL ENTRAR
--
-- Sintoma: das de alta a alguien en la pantalla de Usuarios, le ponés
-- el rol, entra con su correo, y el sistema le dice "tu cuenta no está
-- vinculada a ningún usuario del sistema".
--
-- Son dos cosas distintas y hasta ahora nada las unia:
--
--   auth.users      la cuenta con la que se inicia sesion (correo y
--                   contraseña). La crea Supabase.
--   public.usuario  el usuario del sistema, con su rol y sus permisos.
--                   Lo crea la pantalla de Usuarios.
--
-- Se juntan por usuario.auth_user_id. La pantalla de Usuarios nunca lo
-- completaba —no puede: cuando das de alta a alguien, esa persona
-- todavia no inicio sesion nunca y su cuenta puede no existir— y la
-- unica forma de unirlas era una funcion que solo corre desde el editor
-- SQL. O sea: cada persona que se da de alta choca contra esa pared.
--
-- Ahora se vinculan solas cuando la persona entra por primera vez, que
-- es el unico momento en que las dos puntas existen a la vez.
--
-- ⚠️ Esto convierte al correo en la llave del alta. Por eso el registro
-- publico en Supabase (Authentication → Providers → "Allow new users to
-- sign up") tiene que quedar APAGADO: las cuentas las crea el
-- administrador. Si estuviera abierto, cualquiera que se registrara con
-- un correo que un administrador dejo preparado tomaria ese rol.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.reclamar_usuario()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth   uuid := (select auth.uid());
  v_email  text;
  v_conf   timestamptz;
  v_id     uuid;
begin
  if v_auth is null then
    return null;
  end if;

  -- Si esta cuenta ya tiene su usuario, no hay nada que reclamar.
  select id into v_id from public.usuario where auth_user_id = v_auth;
  if v_id is not null then
    return v_id;
  end if;

  select u.email, u.email_confirmed_at into v_email, v_conf
  from auth.users u where u.id = v_auth;

  /*
    El correo tiene que estar confirmado. Es lo que prueba que quien
    entra maneja de verdad esa casilla, y sin eso el alta que dejo
    preparada el administrador se la podria quedar cualquiera.
  */
  if v_email is null or v_conf is null then
    return null;
  end if;

  /*
    Se toma UNA fila que espera por ese correo, y sólo si todavía no
    tiene cuenta. El "auth_user_id is null" del where es lo que impide
    quedarse con el usuario de otro: una fila ya vinculada nunca vuelve
    a estar disponible, ni siquiera si comparten correo.
  */
  update public.usuario u
     set auth_user_id = v_auth
   where u.id = (
     select x.id from public.usuario x
     where lower(x.email) = lower(v_email)
       and x.auth_user_id is null
       and x.activo
       and x.eliminado_en is null
     order by x.creado_en
     limit 1
   )
     and u.auth_user_id is null
  returning u.id into v_id;

  return v_id;
end;
$$;

comment on function public.reclamar_usuario() is
  'Une la cuenta de quien está entrando con el usuario del sistema que el administrador dejó dado de alta con ese mismo correo. Sólo con el correo confirmado, y sólo sobre un usuario que no tenga cuenta todavía.';

revoke all on function public.reclamar_usuario() from public, anon;
grant execute on function public.reclamar_usuario() to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Y la vinculación manual deja de duplicar
--
-- app.vincular_usuario() buscaba el usuario por auth_user_id. Si ya
-- existía uno con ese mismo correo pero sin cuenta —que es justamente
-- lo que deja la pantalla de Usuarios— no lo encontraba y creaba un
-- SEGUNDO usuario. La persona terminaba dos veces en la lista, con dos
-- roles posibles y un PIN en cada uno.
--
-- Ahora busca primero por cuenta y después por correo.
-- ───────────────────────────────────────────────────────────────
create or replace function app.vincular_usuario(
  p_email  text,
  p_nombre text,
  p_rol    text default 'Administrador'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_id uuid;
  v_rol_id  uuid;
  v_usuario uuid;
begin
  select id into v_auth_id from auth.users where lower(email) = lower(p_email);
  if v_auth_id is null then
    raise exception 'No existe una cuenta con el correo %. Creala primero desde Authentication > Users.', p_email;
  end if;

  select id into v_rol_id from public.rol
  where lower(nombre) = lower(p_rol) and eliminado_en is null;
  if v_rol_id is null then
    raise exception 'No existe el rol %.', p_rol;
  end if;

  select id into v_usuario from public.usuario where auth_user_id = v_auth_id;

  -- Todavía sin cuenta, pero dado de alta con ese correo: es la misma
  -- persona esperando entrar.
  if v_usuario is null then
    select id into v_usuario from public.usuario
    where lower(email) = lower(p_email)
      and auth_user_id is null
      and eliminado_en is null
    order by creado_en
    limit 1;
  end if;

  if v_usuario is null then
    insert into public.usuario (auth_user_id, nombre, email, rol_id, activo)
    values (v_auth_id, p_nombre, p_email, v_rol_id, true)
    returning id into v_usuario;
  else
    update public.usuario
    set auth_user_id = v_auth_id,
        nombre       = coalesce(nullif(trim(p_nombre), ''), nombre),
        email        = p_email,
        rol_id       = v_rol_id,
        activo       = true
    where id = v_usuario;
  end if;

  return v_usuario;
end;
$$;

revoke all on function app.vincular_usuario(text, text, text) from public, anon, authenticated;
