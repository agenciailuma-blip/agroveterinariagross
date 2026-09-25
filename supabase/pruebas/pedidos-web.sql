-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE LA PANTALLA PEDIDOS WEB, CONTRA LA BASE REAL
--
-- Se corre igual que las otras: entera, y termina siempre con un error
-- a propósito que deshace todo lo que creó.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Corre como un Administrador de verdad, para que los permisos se
-- controlen como en la aplicación, y como alguien sin cuenta para ver
-- que lo frenan.
--
-- Lo que se cuida es lo que mueve plata: que lo cobrado en la web no
-- salga sin factura, que la factura no diga otra cosa que lo cobrado,
-- que cancelar devuelva el stock, y que toda plata que hay que
-- devolverle al comprador quede anotada —venga por donde venga—.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

/*
  Cuando se espera un error, se exige el mensaje que corresponde y no
  «cualquier error»: la comprobación que falla también lanza uno, y un
  bloque que aceptara cualquiera daría por bueno justamente lo que
  tenía que atrapar. Pasó al romper el permiso a propósito.
*/

create function pg_temp.como(p_auth_user_id uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_auth_user_id, 'role', 'authenticated')::text, true)
$$;

-- Un pedido de la tienda con una sola línea. Devuelve el id del pedido.
create function pg_temp.pedido(p_numero text, p_producto uuid, p_cantidad numeric, p_precio numeric,
                               p_pagado boolean, p_comprador jsonb default null)
returns uuid language plpgsql as $$
declare v_r json;
begin
  v_r := app.registrar_pedido_de_la_tienda(app.canal_de_la_tienda(), jsonb_build_object(
    'numero', p_numero, 'pagado', p_pagado,
    'comprador', coalesce(p_comprador, jsonb_build_object('nombre', 'Comprador ' || p_numero)),
    'entrega', jsonb_build_object('tipo', 'envio', 'domicilio', 'Calle 1', 'localidad', 'Oberá'),
    'productos', jsonb_build_array(jsonb_build_object('id', p_producto, 'cantidad', p_cantidad, 'precio', p_precio))));
  return (select id from public.pedido_tienda where numero_externo = p_numero);
end $$;

create function pg_temp.stock(p_producto uuid)
returns numeric language sql as $$
  select coalesce(sum(cantidad), 0) from public.movimiento_stock where producto_id = p_producto
$$;

-- Lo que haría ARCA: darle el CAE. Sin esto no hay forma de probar la
-- nota de crédito sin hablar con ARCA de verdad.
create function pg_temp.autorizar(p_comprobante uuid)
returns void language sql as $$
  update public.comprobante set estado = 'autorizado', cae = '99999999999999',
         cae_vencimiento = current_date + 10, autorizado_en = now()
  where id = p_comprobante
$$;

do $$
declare
  v_admin    uuid;
  v_a        uuid;
  v_b        uuid;
  v_p        uuid;
  v_comp     uuid;
  v_comp2    uuid;
  v_nota     uuid;
  v_n        integer;
  v_x        numeric;
  v_clave    text;
  v_j        json;
  v_reint    public.pedido_reintegro;
  v_linea    uuid;
  v_sec      bigint;
begin
  select u.auth_user_id into v_admin
  from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null
  limit 1;
  perform pg_temp.comprobar(v_admin is not null, 'no hay un Administrador con cuenta para probar');
  perform pg_temp.como(v_admin);

  perform pg_temp.comprobar(
    (select count(*) = 2 from public.rol_permiso rp join public.rol r on r.id = rp.rol_id
     where rp.permiso_clave = 'tienda.pedidos' and r.nombre in ('Administrador', 'Encargado'))
    and not exists (select 1 from public.rol_permiso rp join public.rol r on r.id = rp.rol_id
                    where rp.permiso_clave = 'tienda.pedidos' and r.nombre in ('Cajero', 'Vendedor')),
    'el permiso de pedidos no quedó en Administrador y Encargado, y sólo ahí');

  -- ─── Datos de prueba ───
  insert into public.producto (codigo, nombre_interno, nombre_publico, precio_venta)
    values ('PRUEBA-PW-A', 'PRUEBA PW A', 'Producto web A', 10000) returning id into v_a;
  insert into public.producto (codigo, nombre_interno, nombre_publico, precio_venta)
    values ('PRUEBA-PW-B', 'PRUEBA PW B', 'Producto web B', 2500) returning id into v_b;
  insert into public.canal_producto (canal_id, producto_id, publicar)
    values (app.canal_de_la_tienda(), v_a, true), (app.canal_de_la_tienda(), v_b, true);
  insert into public.movimiento_stock (producto_id, tipo, cantidad, motivo, referencia_tipo)
    values (v_a, 'carga_inicial', 50, 'Prueba de pedidos web', 'manual'),
           (v_b, 'carga_inicial', 50, 'Prueba de pedidos web', 'manual');

  -- ─── 1. El recorrido de un pedido pagado en la web ───
  v_p := pg_temp.pedido('PRUEBA-PW-1', v_a, 2, 10000, true);

  perform pg_temp.comprobar(
    exists (select 1 from public.pedidos_web('por_preparar') w where w.id = v_p and w.comprobante_id is null
            and w.total = 20000 and jsonb_array_length(w.lineas) = 1),
    'el pedido recién recibido no aparece en «por preparar», o aparece con factura');

  begin
    perform public.pedido_web_marcar(v_p, 'entregado');
    perform pg_temp.comprobar(false, 'se entregó sin factura un pedido que ya se cobró en la web');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'Falta facturar%', sqlerrm);
  end;

  perform public.pedido_web_marcar(v_p, 'preparado');
  perform pg_temp.comprobar(
    (select estado = 'preparado' and preparado_por is not null from public.pedido_tienda where id = v_p),
    'preparar no dejó el estado o quién lo hizo');

  begin
    perform public.pedido_web_marcar(v_p, 'preparado');
    perform pg_temp.comprobar(false, 'se preparó dos veces el mismo pedido');
  exception when raise_exception then perform pg_temp.comprobar(sqlerrm like 'Sólo se prepara%', sqlerrm);
  end;

  v_comp := public.pedido_web_facturar(v_p);
  perform pg_temp.comprobar(
    (select estado = 'pendiente' and total = 20000 from public.comprobante where id = v_comp),
    'la factura del pedido no quedó esperando el CAE por lo que se cobró');

  -- Reintentar después de que ARCA no contestó devuelve la misma: no arma otra.
  v_comp2 := public.pedido_web_facturar(v_p);
  perform pg_temp.comprobar(v_comp2 = v_comp, 'reintentar la factura armó un segundo comprobante');

  perform public.pedido_web_marcar(v_p, 'entregado');
  perform pg_temp.comprobar(
    (select estado = 'entregado' and entregado_por is not null from public.pedido_tienda where id = v_p),
    'con la factura emitida, el pedido no se pudo entregar');

  perform pg_temp.autorizar(v_comp);
  begin
    perform public.pedido_web_facturar(v_p);
    perform pg_temp.comprobar(false, 'se volvió a facturar un pedido ya facturado');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like '%ya está facturado%', sqlerrm);
  end;

  begin
    perform public.pedido_web_cancelar(v_p, 'Me arrepentí');
    perform pg_temp.comprobar(false, 'se canceló un pedido ya entregado, en vez de pedir la devolución');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like '%devolución%', sqlerrm);
  end;

  -- ─── 2. La devolución de un pedido entregado deja el reintegro ───
  /*
    La devolución corre como un usuario de verdad, con las políticas de
    la base, y no como su dueño. Así se encontró el 25/09 que ninguna
    devolución parcial se podía registrar desde la aplicación: corriendo
    como dueño, la política que faltaba no se nota.
  */
  select id into v_linea from public.venta_linea
  where venta_id = (select venta_id from public.pedido_tienda where id = v_p);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.devolver_lineas_de_venta(
      (select venta_id from public.pedido_tienda where id = v_p),
      jsonb_build_array(jsonb_build_object('venta_linea_id', v_linea, 'cantidad', 1)),
      'Vino roto');
  exception when others then
    perform set_config('role', 'none', true);
    perform pg_temp.comprobar(false, 'un usuario con permiso no pudo registrar la devolución: ' || sqlerrm);
  end;

  /*
    Y quedó atada a su nota de crédito. Es lo que lee la pantalla para
    pedirle el CAE: si el dato no se guarda, dice «la venta no estaba
    facturada» y la nota queda sin autorizar. Pasó el 25/09: la base
    ignoraba en silencio ese último paso.
  */
  perform pg_temp.comprobar(
    (select tc.familia = 'nota_credito' from public.devolucion d
     join public.comprobante c on c.id = d.comprobante_id
     join public.tipo_comprobante tc on tc.id = c.tipo_comprobante_id
     where d.venta_id = (select venta_id from public.pedido_tienda where id = v_p)),
    'la devolución no quedó atada a su nota de crédito');

  perform set_config('role', 'none', true);

  /*
    Una devolución es un registro: no se edita. Se prueba como dueño de
    la base, que se saltea las políticas, para ver que el control no
    depende de ellas.
  */
  begin
    update public.devolucion set total = 1
    where venta_id = (select venta_id from public.pedido_tienda where id = v_p);
    perform pg_temp.comprobar(false, 'se le cambió el total a una devolución');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'Una devolución no se modifica%', sqlerrm);
  end;

  select * into v_reint from public.pedido_reintegro where pedido_id = v_p;
  perform pg_temp.comprobar(v_reint.motivo = 'devolucion' and v_reint.importe = 10000 and v_reint.hecho_en is null,
    format('la devolución no dejó el reintegro por lo devuelto (%s %s)', v_reint.motivo, v_reint.importe));
  perform pg_temp.comprobar(
    exists (select 1 from public.pedidos_web('por_preparar') w where w.id = v_p and w.a_reintegrar = 10000 and w.devuelto = 10000),
    'un pedido entregado con plata por devolver no sigue a la vista en la primera pestaña');

  -- ─── 3. Anotar el reintegro ───
  begin
    perform public.pedido_web_reintegro_hecho(v_reint.id, ' ');
    perform pg_temp.comprobar(false, 'se anotó un reintegro sin la referencia de la pasarela');
  exception when raise_exception then perform pg_temp.comprobar(sqlerrm like 'Anotá la referencia%', sqlerrm);
  end;
  perform public.pedido_web_reintegro_hecho(v_reint.id, 'mp-reintegro-1');
  perform pg_temp.comprobar(
    (select hecho_en is not null and hecho_por is not null and referencia = 'mp-reintegro-1'
     from public.pedido_reintegro where id = v_reint.id),
    'el reintegro no quedó anotado con quién y la referencia');
  begin
    perform public.pedido_web_reintegro_hecho(v_reint.id, 'mp-reintegro-1');
    perform pg_temp.comprobar(false, 'se anotó dos veces el mismo reintegro');
  exception when raise_exception then perform pg_temp.comprobar(sqlerrm like 'Ese reintegro ya estaba%', sqlerrm);
  end;
  perform pg_temp.comprobar(
    not exists (select 1 from public.pedidos_web('por_preparar') w where w.id = v_p),
    'un pedido entregado y sin nada por devolver sigue en la primera pestaña');

  -- ─── 4. Cancelar un pedido pagado sin facturar: stock y reintegro ───
  v_x := pg_temp.stock(v_b);
  v_p := pg_temp.pedido('PRUEBA-PW-2', v_b, 4, 2500, true);
  perform pg_temp.comprobar(pg_temp.stock(v_b) = v_x - 4, 'el pedido pagado no descontó el stock');

  begin
    perform public.pedido_web_cancelar(v_p, 'x');
    perform pg_temp.comprobar(false, 'se canceló sin motivo');
  exception when raise_exception then perform pg_temp.comprobar(sqlerrm like 'Hay que indicar el motivo%', sqlerrm);
  end;

  v_nota := public.pedido_web_cancelar(v_p, 'Sin stock real');
  perform pg_temp.comprobar(v_nota is null, 'cancelar un pedido sin factura emitió una nota de crédito');
  perform pg_temp.comprobar(pg_temp.stock(v_b) = v_x, 'cancelar no devolvió el stock');
  perform pg_temp.comprobar(
    (select p.estado = 'cancelado' and p.cancelado_por is not null and p.motivo_cancelacion = 'Sin stock real'
            and v.estado = 'anulada'
     from public.pedido_tienda p join public.venta v on v.id = p.venta_id where p.id = v_p),
    'cancelar no dejó el pedido cancelado con quién y el motivo, o la venta sin anular');
  perform pg_temp.comprobar(
    (select count(*) = 1 and sum(importe) = 10000 and bool_and(motivo = 'cancelacion')
     from public.pedido_reintegro where pedido_id = v_p),
    'cancelar un pedido pagado no dejó un reintegro por el total');
  perform pg_temp.comprobar(
    exists (select 1 from public.pedidos_web('por_preparar') w where w.id = v_p)
    and exists (select 1 from public.pedidos_web('cancelados') w where w.id = v_p),
    'un cancelado con plata por devolver no está a la vista en las dos pestañas');

  begin
    perform public.pedido_web_cancelar(v_p, 'Otra vez');
    perform pg_temp.comprobar(false, 'se canceló dos veces el mismo pedido');
  exception when raise_exception then perform pg_temp.comprobar(sqlerrm like 'El pedido ya estaba cancelado%', sqlerrm);
  end;

  -- ─── 5. Cancelar un pedido facturado: nota de crédito y reintegro ───
  v_p := pg_temp.pedido('PRUEBA-PW-3', v_b, 2, 2500, true);
  v_comp := public.pedido_web_facturar(v_p);
  perform pg_temp.autorizar(v_comp);
  v_nota := public.pedido_web_cancelar(v_p, 'El cliente no lo quiere');
  perform pg_temp.comprobar(
    (select c.total = 5000 and c.estado = 'pendiente' and tc.familia = 'nota_credito'
     from public.comprobante c join public.tipo_comprobante tc on tc.id = c.tipo_comprobante_id where c.id = v_nota),
    'cancelar un pedido facturado no emitió la nota de crédito por el total');
  perform pg_temp.comprobar(
    (select count(*) = 1 and sum(importe) = 5000 from public.pedido_reintegro where pedido_id = v_p),
    'cancelar un pedido facturado no dejó el reintegro');

  -- ─── 6. Anular desde Facturación, sin pasar por Pedidos ───
  -- Quien lo anula no sabe que era de la tienda, y el comprador igual
  -- tiene que recibir su plata.
  v_p := pg_temp.pedido('PRUEBA-PW-4', v_b, 1, 2500, true);
  perform public.anular_venta_con_nota_credito((select venta_id from public.pedido_tienda where id = v_p), 'Desde Facturación');
  perform pg_temp.comprobar(
    (select estado = 'cancelado' from public.pedido_tienda where id = v_p)
    and (select count(*) = 1 and sum(importe) = 2500 from public.pedido_reintegro where pedido_id = v_p),
    'anular la venta desde Facturación no canceló el pedido ni dejó el reintegro');

  -- ─── 7. El que paga en el local ───
  v_p := pg_temp.pedido('PRUEBA-PW-5', v_b, 1, 2500, false);
  begin
    perform public.pedido_web_facturar(v_p);
    perform pg_temp.comprobar(false, 'se facturó desde Pedidos algo que se cobra en la caja');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like '%se factura en la caja%', sqlerrm);
  end;
  begin
    perform public.pedido_web_marcar(v_p, 'entregado');
    perform pg_temp.comprobar(false, 'se entregó un pedido que todavía no se cobró');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'Todavía no se cobró%', sqlerrm);
  end;
  perform public.pedido_web_cancelar(v_p, 'No vino a buscarlo');
  perform pg_temp.comprobar(
    (select estado = 'cancelado' from public.pedido_tienda where id = v_p)
    and not exists (select 1 from public.pedido_reintegro where pedido_id = v_p),
    'cancelar lo que se paga en el local dejó un reintegro de plata que nadie cobró');

  -- ─── 8. Marcado para revisar ───
  v_p := pg_temp.pedido('PRUEBA-PW-6', v_a, 1, 7000, true);  -- precio muy distinto del de lista
  perform pg_temp.comprobar((select revisar is not null from public.pedido_tienda where id = v_p),
    'un precio muy distinto no marcó el pedido');
  begin
    perform public.pedido_web_facturar(v_p);
    perform pg_temp.comprobar(false, 'se facturó un pedido marcado sin que nadie lo revise');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like '%marcado para revisar%', sqlerrm);
  end;
  perform pg_temp.comprobar(
    not exists (select 1 from public.comprobante where venta_id = (select venta_id from public.pedido_tienda where id = v_p)),
    'el freno de revisar dejó un comprobante armado');
  v_comp := public.pedido_web_facturar(v_p, true);
  perform pg_temp.comprobar(
    (select revisado_en is not null and revisado_por is not null from public.pedido_tienda where id = v_p)
    and (select total = 7000 from public.comprobante where id = v_comp),
    'confirmando la revisión no facturó por lo cobrado, o no quedó quién revisó');

  -- ─── 9. La factura que diría otra cosa que lo cobrado ───
  -- Un responsable inscripto con una compra grande: le corresponde
  -- percepción, y la factura sumaría plata que la web no cobró.
  select coalesce(sum(ultimo_numero), 0) into v_sec from public.secuencia_comprobante;
  v_p := pg_temp.pedido('PRUEBA-PW-7', v_a, 100, 10000, true,
    jsonb_build_object('nombre', 'Empresa de Prueba SA', 'documento', '30712345678',
                       'tipo_documento', 'CUIT', 'condicion_iva', 'responsable_inscripto'));
  begin
    perform public.pedido_web_facturar(v_p, true);
    perform pg_temp.comprobar(false, 'se facturó por más de lo que el cliente pagó en la web');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like '%percepción de IIBB%', sqlerrm);
  end;
  perform pg_temp.comprobar(
    not exists (select 1 from public.comprobante where venta_id = (select venta_id from public.pedido_tienda where id = v_p))
    and (select coalesce(sum(ultimo_numero), 0) from public.secuencia_comprobante) = v_sec,
    'la factura frenada dejó un comprobante o se comió un número');

  -- ─── 10. Los permisos ───
  perform pg_temp.como(gen_random_uuid());
  begin
    perform * from public.pedidos_web('por_preparar');
    perform pg_temp.comprobar(false, 'alguien sin permiso vio los pedidos');
  exception when raise_exception then perform pg_temp.comprobar(sqlerrm like 'No tenés permiso%', sqlerrm);
  end;
  begin
    perform public.pedido_web_marcar(v_p, 'preparado');
    perform pg_temp.comprobar(false, 'alguien sin permiso preparó un pedido');
  exception when raise_exception then perform pg_temp.comprobar(sqlerrm like 'No tenés permiso%', sqlerrm);
  end;
  begin
    perform public.pedido_web_cancelar(v_p, 'Sin permiso');
    perform pg_temp.comprobar(false, 'alguien sin permiso canceló un pedido');
  exception when raise_exception then perform pg_temp.comprobar(sqlerrm like 'No tenés permiso%', sqlerrm);
  end;
  perform pg_temp.comprobar(public.pedidos_web_pendientes() = 0, 'el contador del menú le cuenta pedidos a quien no los puede ver');
  perform pg_temp.como(v_admin);
  perform pg_temp.comprobar(public.pedidos_web_pendientes() > 0, 'el contador del menú no cuenta lo pendiente');

  perform pg_temp.comprobar(
    not has_function_privilege('anon', 'public.pedido_web_facturar(uuid, boolean)', 'execute')
    and not has_function_privilege('anon', 'public.pedidos_web(text)', 'execute')
    and has_function_privilege('anon', 'public.api_tienda_estado_pedido(text, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.api_tienda_estado_pedido(text, text)', 'execute'),
    'los permisos de ejecución no son los esperados');

  -- ─── 11. La tienda pregunta por su pedido ───
  v_clave := app.crear_clave_api(app.canal_de_la_tienda(), 'Prueba de pedidos web');

  v_j := public.api_tienda_estado_pedido(v_clave, 'PRUEBA-PW-1');
  perform pg_temp.comprobar(
    v_j ->> 'estado' = 'entregado' and (v_j ->> 'cobrado')::boolean
    and v_j ->> 'factura' ~ '^[ABC] \d{5}-\d{8}$'
    and json_array_length(v_j -> 'reintegros') = 1
    and (v_j -> 'reintegros' -> 0 ->> 'devuelto')::boolean
    and (v_j -> 'reintegros' -> 0 ->> 'importe')::numeric = 10000,
    format('el estado del pedido entregado no es el esperado: %s', v_j));

  v_j := public.api_tienda_estado_pedido(v_clave, 'PRUEBA-PW-6');
  perform pg_temp.comprobar(v_j ->> 'factura' is null,
    'la tienda ve un número de factura que ARCA todavía no autorizó');

  v_j := public.api_tienda_estado_pedido(v_clave, 'PRUEBA-PW-2');
  perform pg_temp.comprobar(
    v_j ->> 'estado' = 'cancelado'
    and not (v_j -> 'reintegros' -> 0 ->> 'devuelto')::boolean
    and (v_j -> 'reintegros' -> 0 ->> 'motivo') = 'cancelacion',
    format('el pedido cancelado no le dice a la tienda cuánto devolver: %s', v_j));

  -- El dato del comprador no sale: la tienda ya lo tiene.
  perform pg_temp.comprobar(
    not (v_j::jsonb ?| array['comprador', 'cliente', 'documento', 'email', 'total_costo']),
    'la consulta de estado devuelve datos del comprador');

  begin
    perform public.api_tienda_estado_pedido(v_clave, 'NO-EXISTE-123');
    perform pg_temp.comprobar(false, 'un pedido inexistente no dio error');
  exception when sqlstate 'PT404' then perform pg_temp.comprobar(true, '');
  end;
  begin
    perform public.api_tienda_estado_pedido('gross_esta_clave_no_existe_0123456789abcdef', 'PRUEBA-PW-1');
    perform pg_temp.comprobar(false, 'una clave inventada pudo consultar un pedido');
  exception when sqlstate 'PT401' then perform pg_temp.comprobar(true, '');
  end;

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
