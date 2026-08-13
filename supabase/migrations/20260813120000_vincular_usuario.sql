-- ═══════════════════════════════════════════════════════════════
-- 013 — Vincular una cuenta de acceso con un usuario del sistema
--
-- Iniciar sesion y ser usuario del sistema son dos cosas distintas:
-- la cuenta vive en auth.users y el usuario en public.usuario, con su
-- rol y sus permisos. Esta funcion las une.
--
-- Vive en el schema app y NO se le da permiso a authenticated: solo se
-- puede llamar desde el editor SQL o con la clave de servicio. Dar de
-- alta usuarios no puede ser autoservicio, y hasta que exista la
-- pantalla de administracion este es el camino.
-- ═══════════════════════════════════════════════════════════════

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

  -- Si ya estaba vinculada, se actualiza; si no, se crea.
  select id into v_usuario from public.usuario where auth_user_id = v_auth_id;

  if v_usuario is null then
    insert into public.usuario (auth_user_id, nombre, email, rol_id, activo)
    values (v_auth_id, p_nombre, p_email, v_rol_id, true)
    returning id into v_usuario;
  else
    update public.usuario
    set nombre = p_nombre, email = p_email, rol_id = v_rol_id, activo = true
    where id = v_usuario;
  end if;

  return v_usuario;
end;
$$;

comment on function app.vincular_usuario(text, text, text) is
  'Vincula una cuenta de auth.users con un usuario del sistema y le asigna un rol. Solo ejecutable con privilegios administrativos.';

revoke all on function app.vincular_usuario(text, text, text) from public, anon, authenticated;
