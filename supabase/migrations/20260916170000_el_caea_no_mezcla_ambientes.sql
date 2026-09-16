-- ═══════════════════════════════════════════════════════════════
-- El aviso de "sin movimiento" no mezcla homologacion con produccion
--
-- Aparecio el 16/09, al cargar el punto de venta 9 (regimen CAEA, alta
-- en ARCA del 11/09). La tarea diaria mando por primera vez el aviso
-- del CAEA de la primera quincena de septiembre, y homologacion lo
-- rechazo:
--
--   1204  El PtoVta debe corresponder a un punto de venta CAEA
--
-- FEParamGetPtosVenta en homologacion contesta "602 Sin Resultados":
-- ese ambiente no tiene ningun punto de venta para el CUIT de Gross.
-- El alta se hizo en produccion y homologacion no la ve. Es asi, no
-- es un error nuestro, y no tiene arreglo de este lado.
--
-- Lo que si es nuestro: el paso 3 de la tarea buscaba los CAEA sin
-- informar SIN MIRAR EL AMBIENTE. Mientras todo corre en homologacion
-- no se nota. El dia que arca.ambiente pase a 'produccion', los CAEA
-- de prueba que homologacion nunca acepto seguirian en la lista, y la
-- tarea le mandaria a la ARCA real, todos los dias, codigos que la
-- ARCA real nunca otorgo.
--
-- Los pasos 1 y 2 ya estaban bien: quincenas_a_pedir() filtra por
-- ambiente, y un comprobante en contingencia solo puede tener el CAEA
-- que devolvio app.caea_vigente(), que tambien filtra.
-- ═══════════════════════════════════════════════════════════════

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
  v_ambiente text;
begin
  select decrypted_secret into v_secreto
  from vault.decrypted_secrets where name = 'arca_tarea_secreto';

  if v_secreto is null then
    return jsonb_build_object('error', 'Falta el secreto arca_tarea_secreto en el Vault.');
  end if;

  -- El mismo valor por defecto que usan la Edge Function y caea_vigente()
  select coalesce((select valor #>> '{}' from public.configuracion
                   where clave = 'arca.ambiente'), 'homologacion')
  into v_ambiente;

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

    Solo los del ambiente configurado: un CAEA de homologacion no existe
    para la ARCA de produccion, y al reves.
  */
  for v_fila in
    select k.id
    from public.caea k
    where k.fecha_hasta < current_date
      and k.ambiente = v_ambiente
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
  'Tarea diaria: pide los CAEA que falten, informa lo emitido con ellos y avisa los que quedaron sin usar, siempre del ambiente configurado. Decide acá y ejecuta en la Edge Function, que es la que tiene el certificado.';
