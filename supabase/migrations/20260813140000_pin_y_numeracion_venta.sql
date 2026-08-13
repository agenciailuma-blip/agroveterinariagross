-- ═══════════════════════════════════════════════════════════════
-- 014 — PIN DE OPERACION Y NUMERACION DE VENTAS
--
-- EL PIN NO ES UNA CONTRASEÑA
--
-- La terminal se autentica una vez y deja la sesion abierta todo el dia.
-- El PIN identifica QUIEN hace cada operacion dentro de esa sesion.
-- Son cuatro digitos: diez mil combinaciones, se rompe por fuerza bruta
-- en segundos. Por eso:
--
--   · el hash vive en app.usuario_pin, fuera del schema expuesto;
--   · verificar_pin() exige una sesion valida, asi que nadie puede
--     probar PINes desde afuera sin ser antes una terminal autorizada;
--   · se bloquea despues de N intentos fallidos.
--
-- Con eso, un PIN de cuatro digitos es suficiente: no protege el acceso
-- al sistema, protege la atribucion de una operacion.
-- ═══════════════════════════════════════════════════════════════

create or replace function app.definir_pin(p_usuario_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_largo integer;
begin
  select coalesce((valor #>> '{}')::integer, 4) into v_largo
  from public.configuracion where clave = 'pin.longitud';

  if p_pin !~ ('^[0-9]{' || coalesce(v_largo, 4) || '}$') then
    raise exception 'El PIN tiene que ser de % digitos numericos.', coalesce(v_largo, 4);
  end if;

  if not exists (select 1 from public.usuario where id = p_usuario_id) then
    raise exception 'El usuario no existe.';
  end if;

  insert into app.usuario_pin (usuario_id, pin_hash, intentos, bloqueado_hasta, actualizado_en)
  values (p_usuario_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), 0, null, now())
  on conflict (usuario_id) do update
    set pin_hash        = excluded.pin_hash,
        intentos        = 0,
        bloqueado_hasta = null,
        actualizado_en  = now();

  update public.usuario set opera_con_pin = true where id = p_usuario_id;
end;
$$;

revoke all on function app.definir_pin(uuid, text) from public, anon, authenticated;

comment on function app.definir_pin(uuid, text) is
  'Define el PIN de operacion de un usuario. Solo con privilegios administrativos, hasta que exista la pantalla de usuarios.';

-- ───────────────────────────────────────────────────────────────
-- Verificacion
--
-- SECURITY DEFINER en public y otorgada a authenticated a proposito:
-- la terminal necesita poder validar el PIN del operador. La funcion
-- exige sesion, limita intentos y devuelve solo lo minimo. Nunca expone
-- el hash ni dice si el PIN existe pero esta bloqueado por otra razon.
-- ───────────────────────────────────────────────────────────────
create or replace function public.verificar_pin(p_pin text)
returns table (usuario_id uuid, nombre text, rol text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max      integer;
  v_registro record;
begin
  if (select auth.uid()) is null then
    raise exception 'Se necesita una sesion de terminal para identificar un operador.';
  end if;

  select coalesce((valor #>> '{}')::integer, 5) into v_max
  from public.configuracion where clave = 'pin.intentos_maximos';
  v_max := coalesce(v_max, 5);

  for v_registro in
    select up.usuario_id, up.pin_hash, up.intentos, up.bloqueado_hasta,
           u.nombre, r.nombre as rol
    from app.usuario_pin up
    join public.usuario u on u.id = up.usuario_id
    join public.rol r     on r.id = u.rol_id
    where u.activo and u.eliminado_en is null
  loop
    if v_registro.pin_hash = extensions.crypt(p_pin, v_registro.pin_hash) then
      if v_registro.bloqueado_hasta is not null and v_registro.bloqueado_hasta > now() then
        raise exception 'El PIN esta bloqueado por intentos fallidos. Pedile a un encargado que lo desbloquee.';
      end if;

      update app.usuario_pin
      set intentos = 0, bloqueado_hasta = null
      where app.usuario_pin.usuario_id = v_registro.usuario_id;

      usuario_id := v_registro.usuario_id;
      nombre     := v_registro.nombre;
      rol        := v_registro.rol;
      return next;
      return;
    end if;
  end loop;

  -- Ningun PIN coincidio. Se cuenta el intento contra todos los que no
  -- estan bloqueados: no se puede saber a quien pertenecia el intento.
  update app.usuario_pin
  set intentos = intentos + 1,
      bloqueado_hasta = case
        when intentos + 1 >= v_max then now() + interval '5 minutes'
        else bloqueado_hasta
      end
  where bloqueado_hasta is null or bloqueado_hasta <= now();

  return;
end;
$$;

revoke all on function public.verificar_pin(text) from public, anon;
grant execute on function public.verificar_pin(text) to authenticated;

comment on function public.verificar_pin(text) is
  'Identifica al operador por PIN dentro de una sesion de terminal ya autenticada. Limita intentos y no revela nada si falla.';

-- ───────────────────────────────────────────────────────────────
-- Numeracion interna de la venta
--
-- Prefijo de la terminal mas secuencia propia. Cada terminal numera
-- sola, que es lo que permite crear ventas sin conexion sin chocar con
-- las otras. No confundir con la numeracion fiscal, que asigna ARCA.
-- ───────────────────────────────────────────────────────────────
create or replace function public.siguiente_codigo_venta(p_terminal_id uuid)
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_prefijo text;
  v_ultimo  integer;
begin
  select coalesce(prefijo, 'T') into v_prefijo
  from public.terminal where id = p_terminal_id;

  if v_prefijo is null then
    raise exception 'La terminal no existe.';
  end if;

  select coalesce(max(substring(codigo from '[0-9]+$')::integer), 0) into v_ultimo
  from public.venta
  where codigo like v_prefijo || '-%';

  return v_prefijo || '-' || lpad((v_ultimo + 1)::text, 6, '0');
end;
$$;

grant execute on function public.siguiente_codigo_venta(uuid) to authenticated;

comment on function public.siguiente_codigo_venta(uuid) is
  'Siguiente numero interno de venta para una terminal. Sin conexion la terminal lo calcula igual contra su base local.';
