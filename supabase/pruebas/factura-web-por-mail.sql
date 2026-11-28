-- A quién le sale sola la factura (28/11).
--
-- No deja nada escrito: termina siempre con un error que dice el
-- resultado («PRUEBA OK» o qué falló) y deshace todo. Se corre después
-- de la migración 20261128120000, o junto con ella en el mismo envío
-- para probarla antes de aplicarla.
--
-- Necesita en la base una factura autorizada de un pedido web y una de
-- mostrador; lo que escribe para armar los casos se deshace.

do $$
declare
  v_admin uuid;
  v_web record;
  v_comun uuid;
  v_otra_venta uuid;
  v_r text;
  v_hechos text := '';
begin
  select u.auth_user_id into v_admin
  from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.auth_user_id is not null limit 1;

  select c.id, c.venta_id, btrim(p.email) as email into v_web
  from public.comprobante c
  join public.pedido_tienda p on p.venta_id = c.venta_id
  where c.cae is not null and c.tipo_comprobante_id in (1, 6, 11, 51, 201, 206)
    and nullif(btrim(p.email), '') is not null
  order by c.creado_en desc limit 1;

  select c.id into v_comun
  from public.comprobante c
  where c.cae is not null and c.tipo_comprobante_id in (1, 6, 11, 51, 201, 206)
    and c.venta_id is not null
    and not exists (select 1 from public.pedido_tienda p where p.venta_id = c.venta_id)
    and not exists (select 1 from public.comprobante_venta cv where cv.comprobante_id = c.id)
    and not exists (select 1 from public.venta_pago vp join public.medio_pago m on m.id = vp.medio_pago_id
                    where vp.venta_id = c.venta_id and m.tipo = 'cuenta_corriente')
  order by c.creado_en desc limit 1;

  if v_admin is null or v_web.id is null or v_comun is null then
    raise exception 'PRUEBA SIN DATOS: admin %, web %, común %', v_admin is not null, v_web.id is not null, v_comun is not null;
  end if;

  update public.configuracion set valor = 'true'::jsonb where clave = 'correo.envio_activo';
  delete from public.comprobante_envio where comprobante_id in (v_web.id, v_comun);

  -- Sin sesión no contesta.
  perform set_config('request.jwt.claims', '{}', true);
  if public.mail_automatico_de_factura(v_web.id) is not null then
    raise exception 'FALLA: sin permiso contestó un mail';
  end if;
  v_hechos := v_hechos || ' sin-permiso';

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  v_r := public.mail_automatico_de_factura(v_web.id);
  if v_r is distinct from v_web.email then
    raise exception 'FALLA: el pedido web no devolvió el mail del comprador';
  end if;
  v_hechos := v_hechos || ' web';

  if public.mail_automatico_de_factura(v_comun) is not null then
    raise exception 'FALLA: una factura de mostrador sin cuenta corriente saldría sola';
  end if;
  v_hechos := v_hechos || ' mostrador';

  insert into public.comprobante_envio (comprobante_id, destinatario, estado)
  values (v_web.id, 'prueba@example.com', 'error');
  if public.mail_automatico_de_factura(v_web.id) is distinct from v_web.email then
    raise exception 'FALLA: un intento con error no tiene que frenar el siguiente';
  end if;
  update public.comprobante_envio set estado = 'enviado' where comprobante_id = v_web.id;
  if public.mail_automatico_de_factura(v_web.id) is not null then
    raise exception 'FALLA: la mandaría dos veces';
  end if;
  v_hechos := v_hechos || ' una-sola-vez';
  delete from public.comprobante_envio where comprobante_id = v_web.id;

  update public.configuracion set valor = 'false'::jsonb where clave = 'correo.envio_activo';
  if public.mail_automatico_de_factura(v_web.id) is not null then
    raise exception 'FALLA: con el envío apagado contestó un mail';
  end if;
  update public.configuracion set valor = 'true'::jsonb where clave = 'correo.envio_activo';
  v_hechos := v_hechos || ' apagado';

  -- Si la factura junta un pedido web con una venta de mostrador, no sale sola.
  select c.venta_id into v_otra_venta from public.comprobante c where c.id = v_comun;
  insert into public.comprobante_venta (comprobante_id, venta_id) values (v_web.id, v_otra_venta);
  if public.mail_automatico_de_factura(v_web.id) is not null then
    raise exception 'FALLA: una factura mezclada salió al comprador web';
  end if;
  v_hechos := v_hechos || ' mezclada';

  -- Dos pedidos web y uno sin mail: no se sabe si son de la misma persona.
  insert into public.pedido_tienda
  select (jsonb_populate_record(p, jsonb_build_object(
            'id', gen_random_uuid(), 'venta_id', v_otra_venta, 'email', null,
            'numero_externo', p.numero_externo || '-PRUEBA'))).*
  from public.pedido_tienda p where p.venta_id = v_web.venta_id limit 1;
  if public.mail_automatico_de_factura(v_web.id) is not null then
    raise exception 'FALLA: salió a uno de los dos compradores';
  end if;
  update public.pedido_tienda set email = v_web.email where venta_id = v_otra_venta;
  if public.mail_automatico_de_factura(v_web.id) is distinct from v_web.email then
    raise exception 'FALLA: dos pedidos del mismo mail tienen que salir';
  end if;
  v_hechos := v_hechos || ' dos-pedidos';

  raise exception 'PRUEBA OK:% (nada queda escrito)', v_hechos;
end;
$$;
