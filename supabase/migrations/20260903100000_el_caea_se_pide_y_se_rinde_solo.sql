-- ═══════════════════════════════════════════════════════════════
-- 043 — EL CAEA SE PIDE Y SE RINDE SOLO
--
-- El contador lo pidio por escrito el 01/09: ARCA quiere un lote de
-- CAEAs pedido por adelantado todos los meses, y quiere que se informe
-- lo que se uso Y lo que no. Si no se informa, no vuelve a habilitar
-- CAEAs.
--
-- Hasta ahora las tres cosas dependian de que alguien apretara un
-- boton, y eso no sirve para una obligacion:
--
--   · Un CAEA que nadie pidio es exactamente igual a no tener
--     contingencia. El dia que ARCA se caiga, el local no factura.
--   · Una fecha tope puede caer un domingo, o durante una semana en que
--     el local este cerrado.
--
-- Por eso no puede depender de que alguien abra el sistema.
--
-- La decision vive aca y la ejecucion en la Edge Function: la base es
-- la que tiene el estado, la Edge Function es la que tiene el
-- certificado. Ninguna hace el trabajo de la otra.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ───────────────────────────────────────────────────────────────
-- El secreto con el que la tarea se identifica
--
-- La tarea no es una persona: no tiene sesion iniciada ni permisos. Se
-- identifica con un secreto que vive cifrado en el Vault de Supabase y
-- que la Edge Function compara antes de hacer nada.
--
-- Sin esto habria dos malas opciones: dejar la funcion abierta a
-- cualquiera, o guardar la clave de servicio en una tabla que un
-- administrador curioso puede leer.
-- ───────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'arca_tarea_secreto') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'arca_tarea_secreto',
      'Con esto se identifica la tarea programada que pide y rinde los CAEA ante ARCA.'
    );
  end if;
end;
$$;

/*
  La Edge Function corre con la clave de servicio y necesita leer ese
  secreto para compararlo. El esquema vault no se expone por la API, asi
  que se le da esta puerta, y solo a ella.
*/
create or replace function public.secreto_de_tarea(p_nombre text)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_nombre;
$$;

revoke all on function public.secreto_de_tarea(text) from public, anon, authenticated;
grant execute on function public.secreto_de_tarea(text) to service_role;

comment on function public.secreto_de_tarea(text) is
  'Devuelve un secreto del Vault. Sólo la clave de servicio puede ejecutarla: es como la Edge Function verifica que quien la llama es la tarea programada y no cualquiera.';

-- ───────────────────────────────────────────────────────────────
-- Que quincenas habria que pedirle a ARCA
--
-- ARCA acepta el pedido desde 5 dias corridos antes del inicio de la
-- quincena y hasta el ultimo dia de esa quincena. Lo dijo ella misma en
-- el error 15006 cuando se probo el 24/08.
-- ───────────────────────────────────────────────────────────────
create or replace function app.quincenas_a_pedir()
returns table (periodo integer, quincena smallint)
language sql
stable
security definer
set search_path = ''
as $$
  with ambiente as (
    select coalesce((select valor #>> '{}' from public.configuracion where clave = 'arca.ambiente'),
                    'homologacion') as valor
  ),
  dias as (
    select coalesce((select (valor #>> '{}')::integer from public.configuracion
                     where clave = 'arca.caea_pedir_dias_antes'), 5) as antes
  ),
  candidatas as (
    select
      (extract(year from d)::int * 100 + extract(month from d)::int) as periodo,
      (case when extract(day from d) <= 15 then 1 else 2 end)::smallint as quincena,
      (case when extract(day from d) <= 15
            then date_trunc('month', d)::date
            else date_trunc('month', d)::date + 15 end) as desde,
      (case when extract(day from d) <= 15
            then date_trunc('month', d)::date + 14
            else (date_trunc('month', d) + interval '1 month - 1 day')::date end) as hasta
    from (values (current_date), (current_date + 16)) as t(d)
  )
  select distinct c.periodo, c.quincena
  from candidatas c, dias, ambiente
  where current_date between c.desde - dias.antes and c.hasta
    and not exists (
      select 1 from public.caea k
      where k.periodo = c.periodo
        and k.quincena = c.quincena
        and k.ambiente = ambiente.valor
    );
$$;

revoke all on function app.quincenas_a_pedir() from public, anon;
grant execute on function app.quincenas_a_pedir() to authenticated, service_role;

comment on function app.quincenas_a_pedir() is
  'Quincenas que ARCA aceptaría pedir hoy y de las que todavía no tenemos CAEA. La ventana —desde 5 días antes del inicio hasta el último día— la informó ARCA en el error 15006.';

-- ───────────────────────────────────────────────────────────────
-- La tarea diaria
--
-- La Edge Function sigue exigiendo un token valido en la puerta de
-- entrada de Supabase. La clave publicable alcanza para pasar esa
-- puerta —no da permisos, es la misma que lleva la aplicacion web— y
-- adentro la funcion pide el secreto de la tarea, que es lo que de
-- verdad autoriza.
--
-- Se deja asi, y no bajando la verificacion de token, para que un
-- desconocido ni siquiera llegue al codigo de la funcion.
-- ───────────────────────────────────────────────────────────────
create or replace function app.mantenimiento_caea()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url      text := 'https://ywggnhoifhtoncnxrodh.supabase.co/functions/v1/arca-wsfe-caea';
  v_publica  text := 'sb_publishable_SjOO407vpbWz7mPPj0rukw_Hj4EP0Bd';
  v_secreto  text;
  v_cabezas  jsonb;
  v_hecho    jsonb := '[]'::jsonb;
  v_fila     record;
begin
  select decrypted_secret into v_secreto
  from vault.decrypted_secrets where name = 'arca_tarea_secreto';

  if v_secreto is null then
    return jsonb_build_object('error', 'Falta el secreto arca_tarea_secreto en el Vault.');
  end if;

  v_cabezas := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_publica,
    'apikey', v_publica,
    'x-tarea-secreto', v_secreto
  );

  -- 1. Pedir los CAEA que falten y que ARCA aceptaria hoy
  for v_fila in select * from app.quincenas_a_pedir()
  loop
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('accion', 'solicitar',
                                 'periodo', v_fila.periodo,
                                 'orden', v_fila.quincena),
      headers := v_cabezas,
      timeout_milliseconds := 60000
    );
    v_hecho := v_hecho || jsonb_build_object(
      'accion', 'solicitar', 'periodo', v_fila.periodo, 'quincena', v_fila.quincena);
  end loop;

  /*
    2. Informar lo emitido con CAEA.

    Se informa apenas se puede, no cerca del vencimiento. Un comprobante
    informado ya no puede perderse, y esperar solo agrega el riesgo de
    que la fecha tope llegue un dia que nadie este mirando.
  */
  if exists (select 1 from public.comprobante where estado = 'contingencia') then
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('accion', 'informar'),
      headers := v_cabezas,
      timeout_milliseconds := 120000
    );
    v_hecho := v_hecho || jsonb_build_object('accion', 'informar');
  end if;

  /*
    3. Los CAEA que terminaron sin usarse.

    ARCA los exige informar igual. Es lo que mas se olvida, justamente
    porque no paso nada: no hay ningun comprobante que le recuerde a
    nadie que habia algo pendiente.
  */
  for v_fila in
    select k.id
    from public.caea k
    where k.fecha_hasta < current_date
      and k.estado <> 'informado'
      and not exists (select 1 from public.comprobante c where c.caea_id = k.id)
      and exists (select 1 from public.punto_venta p
                  where p.regimen_caea and p.activo and p.eliminado_en is null
                    and not exists (select 1 from public.caea_sin_movimiento m
                                    where m.caea_id = k.id and m.punto_venta_id = p.id))
  loop
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('accion', 'sin_movimiento', 'caea_id', v_fila.id),
      headers := v_cabezas,
      timeout_milliseconds := 60000
    );
    v_hecho := v_hecho || jsonb_build_object('accion', 'sin_movimiento', 'caea', v_fila.id);
  end loop;

  return jsonb_build_object('corrido_en', now(), 'pedidos', v_hecho);
end;
$$;

revoke all on function app.mantenimiento_caea() from public, anon, authenticated;

comment on function app.mantenimiento_caea() is
  'Tarea diaria: pide los CAEA que falten, informa lo emitido con ellos y avisa los que quedaron sin usar. Decide acá y ejecuta en la Edge Function, que es la que tiene el certificado.';

-- ───────────────────────────────────────────────────────────────
-- Todos los dias a las 9 de la mañana de Misiones (12 UTC)
--
-- A esa hora el local ya abrio: si algo falla y hace falta que alguien
-- mire, hay alguien. Correrla de madrugada haria que un problema espere
-- hasta el mediodia sin que nadie se entere.
-- ───────────────────────────────────────────────────────────────
select cron.schedule(
  'mantenimiento-caea',
  '0 12 * * *',
  $$ select app.mantenimiento_caea(); $$
);
