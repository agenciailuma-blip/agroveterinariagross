-- ═══════════════════════════════════════════════════════════════
-- 015 — EL LIMITE DE INTENTOS DE PIN VA POR TERMINAL, NO POR USUARIO
--
-- PROBLEMA DE LA VERSION ANTERIOR
--
-- Como el PIN se ingresa sin decir de quien es, un intento fallido no se
-- puede atribuir a nadie. La primera version contaba el fallo contra
-- TODOS los PIN no bloqueados. Eso frena la fuerza bruta, pero tiene un
-- costo inaceptable en un mostrador: alguien tecleando mal cinco veces
-- deja sin operar a los cuatro vendedores durante cinco minutos.
--
-- SOLUCION
--
-- Contar los intentos contra la SESION que los hace, es decir contra la
-- terminal autenticada. Quien esta probando PINes se bloquea solo, y las
-- otras cajas siguen trabajando. Que es ademas lo correcto: el atacante
-- es la sesion, no el operador.
--
-- Sobre el hallazgo del linter: verificar_pin() es SECURITY DEFINER y
-- ejecutable por authenticated a proposito. La terminal necesita validar
-- el PIN del operador y el hash no puede salir del schema privado. La
-- funcion exige sesion, limita intentos y no devuelve nada cuando falla.
-- ═══════════════════════════════════════════════════════════════

create table app.intento_pin (
  auth_user_id    uuid primary key,
  intentos        integer not null default 0,
  bloqueado_hasta timestamptz,
  actualizado_en  timestamptz not null default now()
);

revoke all on table app.intento_pin from public, anon, authenticated;

comment on table app.intento_pin is
  'Intentos fallidos de PIN por sesion de terminal. Aisla el bloqueo: una terminal equivocandose no frena a las demas.';

create or replace function public.verificar_pin(p_pin text)
returns table (usuario_id uuid, nombre text, rol text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sesion   uuid := (select auth.uid());
  v_max      integer;
  v_bloqueo  timestamptz;
  v_registro record;
begin
  if v_sesion is null then
    raise exception 'Se necesita una sesion de terminal para identificar un operador.';
  end if;

  select bloqueado_hasta into v_bloqueo
  from app.intento_pin where auth_user_id = v_sesion;

  if v_bloqueo is not null and v_bloqueo > now() then
    raise exception 'Demasiados intentos fallidos en esta terminal. Volve a probar en % segundos.',
      ceil(extract(epoch from (v_bloqueo - now())))::integer;
  end if;

  select coalesce((valor #>> '{}')::integer, 5) into v_max
  from public.configuracion where clave = 'pin.intentos_maximos';
  v_max := coalesce(v_max, 5);

  for v_registro in
    select up.usuario_id, up.pin_hash, u.nombre, r.nombre as rol
    from app.usuario_pin up
    join public.usuario u on u.id = up.usuario_id
    join public.rol r     on r.id = u.rol_id
    where u.activo and u.eliminado_en is null
  loop
    if v_registro.pin_hash = extensions.crypt(p_pin, v_registro.pin_hash) then
      -- Acierto: se limpia el contador de esta terminal.
      delete from app.intento_pin where auth_user_id = v_sesion;

      usuario_id := v_registro.usuario_id;
      nombre     := v_registro.nombre;
      rol        := v_registro.rol;
      return next;
      return;
    end if;
  end loop;

  insert into app.intento_pin (auth_user_id, intentos, actualizado_en)
  values (v_sesion, 1, now())
  on conflict (auth_user_id) do update
    set intentos        = app.intento_pin.intentos + 1,
        bloqueado_hasta = case
          when app.intento_pin.intentos + 1 >= v_max then now() + interval '2 minutes'
          else app.intento_pin.bloqueado_hasta
        end,
        actualizado_en  = now();

  return;
end;
$$;

revoke all on function public.verificar_pin(text) from public, anon;
grant execute on function public.verificar_pin(text) to authenticated;

comment on function public.verificar_pin(text) is
  'Identifica al operador por PIN dentro de una sesion de terminal autenticada. Los intentos fallidos se cuentan y bloquean por terminal, no por usuario, para que una terminal equivocandose no frene a las demas. SECURITY DEFINER deliberado: el hash vive en el schema privado.';

-- Las columnas de intentos en usuario_pin quedan sin uso: el conteo se
-- mudo a intento_pin. Se dejan para no romper nada y se documenta.
comment on column app.usuario_pin.intentos is
  'Sin uso desde la migracion 015. El conteo de intentos se hace por terminal en app.intento_pin.';
