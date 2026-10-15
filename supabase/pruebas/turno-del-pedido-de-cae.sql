-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DEL TURNO PARA PEDIR CAE, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo lo que hizo.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Usa tres comprobantes que ya existen —dos de la misma serie y uno de
-- otra— sólo para saber su serie: no los cambia. El turno se toma con
-- el rol de la función (service_role), que es el único que puede.
--
-- Adentro de una transacción now() no avanza: para que un turno venza
-- se lo deja con un vencimiento en el pasado.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

do $$
declare
  a1 uuid; a2 uuid; b uuid;
  pv uuid; tipo smallint;
  f1 uuid := gen_random_uuid();
  f2 uuid := gen_random_uuid();
  f3 uuid := gen_random_uuid();
  f4 uuid := gen_random_uuid();
  f5 uuid := gen_random_uuid();
  f6 uuid := gen_random_uuid();
  r record;
  rechazado boolean;
begin
  -- Una serie con al menos dos comprobantes, y otro de otra serie.
  select c.punto_venta_id, c.tipo_comprobante_id into pv, tipo
  from public.comprobante c
  group by 1, 2 having count(*) >= 2
  limit 1;
  select c.id into a1 from public.comprobante c
   where c.punto_venta_id = pv and c.tipo_comprobante_id = tipo order by c.id limit 1;
  select c.id into a2 from public.comprobante c
   where c.punto_venta_id = pv and c.tipo_comprobante_id = tipo and c.id <> a1 order by c.id limit 1;
  select c.id into b from public.comprobante c
   where (c.punto_venta_id, c.tipo_comprobante_id) <> (pv, tipo) limit 1;
  perform pg_temp.comprobar(a1 is not null and a2 is not null and b is not null,
    'hacen falta dos comprobantes de una serie y uno de otra');

  -- Lo que quedara de otra corrida no cuenta.
  delete from public.turno_pedido_cae;

  perform set_config('role', 'service_role', true);

  -- 1. La serie libre se toma.
  select * into r from public.tomar_turno_cae(a1, f1, now() + interval '30 seconds');
  perform pg_temp.comprobar(r.tomado and r.ocupado_por is null, 'la serie libre se toma');

  -- 2. Otro comprobante de la misma serie espera, y sabe por quién.
  select * into r from public.tomar_turno_cae(a2, f2, now() + interval '30 seconds');
  perform pg_temp.comprobar(not r.tomado, 'otro comprobante de la misma serie no la toma');
  perform pg_temp.comprobar(r.ocupado_por = a1, 'dice para qué comprobante está tomada');

  -- 3. El mismo comprobante, otra vez —el reintento apretado de más—, tampoco.
  select * into r from public.tomar_turno_cae(a1, f3, now() + interval '30 seconds');
  perform pg_temp.comprobar(not r.tomado and r.ocupado_por = a1,
    'un segundo pedido para el mismo comprobante no toma el turno');

  -- 4. Otra serie no espera a nadie.
  select * into r from public.tomar_turno_cae(b, f4, now() + interval '30 seconds');
  perform pg_temp.comprobar(r.tomado, 'otra serie se toma aunque la primera esté ocupada');

  -- 5. Soltar con una ficha ajena no suelta nada.
  perform public.soltar_turno_cae(f2);
  perform pg_temp.comprobar(
    (select t.ficha from public.turno_pedido_cae t
      where t.punto_venta_id = pv and t.tipo_comprobante_id = tipo) = f1,
    'soltar con otra ficha deja el turno de quien lo tiene');

  -- 6. Un turno vencido —la función se murió a mitad de camino— se toma.
  update public.turno_pedido_cae set hasta = now() - interval '1 second'
   where punto_venta_id = pv and tipo_comprobante_id = tipo;
  select * into r from public.tomar_turno_cae(a2, f5, now() + interval '30 seconds');
  perform pg_temp.comprobar(r.tomado, 'un turno vencido se toma');

  -- 7. Y el que lo tenía, si termina tarde, no se lo suelta al nuevo.
  perform public.soltar_turno_cae(f1);
  perform pg_temp.comprobar(
    (select t.ficha from public.turno_pedido_cae t
      where t.punto_venta_id = pv and t.tipo_comprobante_id = tipo) = f5,
    'el que termina tarde no le suelta el turno al que lo tiene ahora');

  -- 8. Soltado por su dueño, queda libre.
  perform public.soltar_turno_cae(f5);
  select * into r from public.tomar_turno_cae(a1, f6, now() + interval '30 seconds');
  perform pg_temp.comprobar(r.tomado, 'soltado por su dueño, la serie vuelve a estar libre');

  -- 9. Un comprobante que no existe no toma nada.
  begin
    perform public.tomar_turno_cae(gen_random_uuid(), gen_random_uuid(), now() + interval '30 seconds');
    rechazado := false;
  exception when others then
    rechazado := sqlerrm like '%no existe%';
  end;
  perform pg_temp.comprobar(rechazado, 'un comprobante que no existe se rechaza');

  -- 10 y 11. Nadie con sesión, ni sin ella, puede tomar ni soltar el turno.
  perform set_config('role', 'authenticated', true);
  begin
    perform public.tomar_turno_cae(a2, gen_random_uuid(), now() + interval '30 seconds');
    rechazado := false;
  exception when insufficient_privilege then
    rechazado := true;
  end;
  perform pg_temp.comprobar(rechazado, 'un usuario con sesión no puede tomar el turno');
  begin
    perform public.soltar_turno_cae(f6);
    rechazado := false;
  exception when insufficient_privilege then
    rechazado := true;
  end;
  perform pg_temp.comprobar(rechazado, 'un usuario con sesión no puede soltar el turno');

  perform set_config('role', 'anon', true);
  begin
    perform public.tomar_turno_cae(a2, gen_random_uuid(), now() + interval '30 seconds');
    rechazado := false;
  exception when insufficient_privilege then
    rechazado := true;
  end;
  perform pg_temp.comprobar(rechazado, 'sin sesión no se puede tomar el turno');

  -- 12. Y la tabla no se ve desde la app.
  perform set_config('role', 'authenticated', true);
  begin
    perform 1 from public.turno_pedido_cae;
    rechazado := false;
  exception when insufficient_privilege then
    rechazado := true;
  end;
  perform pg_temp.comprobar(rechazado, 'la tabla del turno no se lee desde la app');

  perform set_config('role', 'postgres', true);
  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
