-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE LOS PEDIDOS DE LA TIENDA, CONTRA LA BASE REAL
--
-- Se corre igual que las otras: entera, y termina siempre con un error
-- a propósito que deshace todo lo que creó.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Lo que se cuida acá es lo que mueve plata y stock: que un pedido no
-- entre dos veces, que lo pagado descuente y lo no pagado no, que la
-- plata de la web no entre al arqueo, y que lo raro quede marcado en
-- vez de facturarse solo.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

do $$
declare
  v_canal    uuid;
  v_clave    text;
  v_a        uuid;
  v_b        uuid;
  v_r        json;
  v_venta    public.venta;
  v_pedido   public.pedido_tienda;
  v_stock    numeric;
  v_medio    uuid;
  v_cliente  uuid;
  v_ventas   integer;
begin
  v_canal := app.canal_de_la_tienda();
  select medio_pago_id into v_medio from public.canal where id = v_canal;
  perform pg_temp.comprobar(v_medio is not null, 'el canal de la tienda no tiene medio de pago');
  perform pg_temp.comprobar(
    (select not afecta_caja and not activo from public.medio_pago where id = v_medio),
    'el medio de pago de la tienda afecta el arqueo, o se ofrece en el mostrador');

  -- ─── Datos de prueba ───
  insert into public.producto (codigo, nombre_interno, nombre_publico, precio_venta)
    values ('PRUEBA-PED-A', 'PRUEBA PED A', 'Producto de pedido A', 10000) returning id into v_a;
  insert into public.producto (codigo, nombre_interno, nombre_publico, precio_venta)
    values ('PRUEBA-PED-B', 'PRUEBA PED B', 'Producto de pedido B', 2500) returning id into v_b;
  insert into public.canal_producto (canal_id, producto_id, publicar)
    values (v_canal, v_a, true), (v_canal, v_b, true);
  insert into public.movimiento_stock (producto_id, tipo, cantidad, motivo, referencia_tipo)
    values (v_a, 'carga_inicial', 10, 'Prueba de pedidos', 'manual'),
           (v_b, 'carga_inicial', 10, 'Prueba de pedidos', 'manual');

  -- ─── 1. Un pedido pagado en la web ───
  v_r := app.registrar_pedido_de_la_tienda(v_canal, jsonb_build_object(
    'numero', 'PRUEBA-1',
    'pagado', true,
    'referencia_pago', 'mp-999',
    'comprador', jsonb_build_object('nombre', 'Compradora de Prueba', 'email', 'prueba@ejemplo.com',
                                    'documento', '30111222', 'tipo_documento', 'DNI',
                                    'condicion_iva', 'consumidor_final'),
    'entrega', jsonb_build_object('tipo', 'envio', 'domicilio', 'Calle Falsa 123', 'localidad', 'Oberá'),
    'productos', jsonb_build_array(
      jsonb_build_object('id', v_a, 'cantidad', 2, 'precio', 10000),
      jsonb_build_object('id', v_b, 'cantidad', 1, 'precio', 2500))));

  perform pg_temp.comprobar((v_r ->> 'venta') like 'WEB-%', format('la venta no tiene código de web: %s', v_r ->> 'venta'));
  perform pg_temp.comprobar((v_r ->> 'total')::numeric = 22500, format('el total tenía que ser 22500 y es %s', v_r ->> 'total'));
  perform pg_temp.comprobar((v_r ->> 'revisar') is null, format('marcó para revisar un pedido normal: %s', v_r ->> 'revisar'));

  select * into v_venta from public.venta where codigo = v_r ->> 'venta';
  perform pg_temp.comprobar(v_venta.estado = 'cobrada', format('un pedido pagado tenía que quedar cobrado y quedó %s', v_venta.estado));
  perform pg_temp.comprobar(v_venta.total = 22500, 'el total de la venta no es la suma de las líneas');
  perform pg_temp.comprobar(v_venta.documentacion = 'fiscal', 'la venta de la web no queda marcada para facturar');

  perform pg_temp.comprobar(
    (select count(*) from public.venta_pago where venta_id = v_venta.id and medio_pago_id = v_medio and importe = 22500) = 1,
    'el cobro no quedó con el medio de pago de la tienda');

  select cantidad into v_stock from public.stock_saldo where producto_id = v_a;
  perform pg_temp.comprobar(v_stock = 8, format('había 10 y se vendieron 2: el stock tenía que quedar en 8 y quedó en %s', v_stock));

  select * into v_pedido from public.pedido_tienda where numero_externo = 'PRUEBA-1';
  perform pg_temp.comprobar(v_pedido.estado = 'recibido' and v_pedido.entrega = 'envio'
                            and v_pedido.domicilio = 'Calle Falsa 123' and v_pedido.pagado_en_la_web,
    'el pedido no guardó la entrega o el estado');
  perform pg_temp.comprobar(v_pedido.venta_id = v_venta.id, 'el pedido no quedó atado a su venta');

  -- El comprador quedó como cliente, y la venta es de él
  select id into v_cliente from public.cliente where numero_documento = '30111222' and eliminado_en is null;
  perform pg_temp.comprobar(v_cliente is not null and v_venta.cliente_id = v_cliente,
    'el comprador no quedó como cliente de la venta');

  -- ─── 2. El mismo pedido dos veces ───
  select count(*) into v_ventas from public.venta where codigo like 'WEB-%';
  v_r := app.registrar_pedido_de_la_tienda(v_canal, jsonb_build_object(
    'numero', 'PRUEBA-1', 'pagado', true,
    'comprador', jsonb_build_object('nombre', 'Compradora de Prueba'),
    'productos', jsonb_build_array(jsonb_build_object('id', v_a, 'cantidad', 2, 'precio', 10000))));
  perform pg_temp.comprobar((v_r ->> 'repetido')::boolean, 'un pedido repetido no se reconoció');
  perform pg_temp.comprobar((select count(*) from public.venta where codigo like 'WEB-%') = v_ventas,
    'un pedido repetido creó otra venta');
  select cantidad into v_stock from public.stock_saldo where producto_id = v_a;
  perform pg_temp.comprobar(v_stock = 8, 'un pedido repetido volvió a descontar stock');

  -- ─── 3. Un pedido para pagar en el local ───
  v_r := app.registrar_pedido_de_la_tienda(v_canal, jsonb_build_object(
    'numero', 'PRUEBA-2', 'pagado', false,
    'comprador', jsonb_build_object('nombre', 'Otro Comprador', 'documento', '30111333'),
    'entrega', jsonb_build_object('tipo', 'retira'),
    'productos', jsonb_build_array(jsonb_build_object('id', v_b, 'cantidad', 3, 'precio', 2500))));

  select * into v_venta from public.venta where codigo = v_r ->> 'venta';
  perform pg_temp.comprobar(v_venta.estado = 'en_caja',
    format('un pedido a pagar en el local tenía que quedar en la cola de la caja y quedó %s', v_venta.estado));
  perform pg_temp.comprobar(v_venta.enviada_caja_en is not null, 'no quedó marcado cuándo entró a la cola');
  -- De B quedaban 9: había 10 y uno salió en el pedido pagado de arriba.
  select cantidad into v_stock from public.stock_saldo where producto_id = v_b;
  perform pg_temp.comprobar(v_stock = 9, format('lo que se paga en el local no descuenta hasta cobrarse: el stock tenía que quedar en 9 y quedó en %s', v_stock));
  perform pg_temp.comprobar((select count(*) from public.venta_pago where venta_id = v_venta.id) = 0,
    'se registró un cobro de algo que todavía no se pagó');

  -- ─── 4. Lo que queda marcado para revisar ───
  v_r := app.registrar_pedido_de_la_tienda(v_canal, jsonb_build_object(
    'numero', 'PRUEBA-3', 'pagado', true,
    'comprador', jsonb_build_object('nombre', 'Mayorista SA', 'documento', '30712345674',
                                    'tipo_documento', 'CUIT', 'condicion_iva', 'responsable_inscripto'),
    'productos', jsonb_build_array(jsonb_build_object('id', v_a, 'cantidad', 1, 'precio', 10000))));
  perform pg_temp.comprobar((v_r ->> 'revisar') like '%factura A%', format('una factura A no quedó marcada: %s', v_r ->> 'revisar'));

  /*
    Y el que dice ser responsable inscripto sin mandar CUIT: entra
    igual, como consumidor final, y queda marcado. La base no admite un
    RI sin CUIT, y el pedido ya está pagado.
  */
  v_r := app.registrar_pedido_de_la_tienda(v_canal, jsonb_build_object(
    'numero', 'PRUEBA-3B', 'pagado', true,
    'comprador', jsonb_build_object('nombre', 'Dice Ser RI', 'documento', '30111444',
                                    'tipo_documento', 'DNI', 'condicion_iva', 'responsable_inscripto'),
    'productos', jsonb_build_array(jsonb_build_object('id', v_b, 'cantidad', 1, 'precio', 2500))));
  perform pg_temp.comprobar((v_r ->> 'revisar') like '%no mandó CUIT%',
    format('un RI sin CUIT no quedó marcado: %s', v_r ->> 'revisar'));
  perform pg_temp.comprobar(
    (select condicion_iva_id from public.cliente where numero_documento = '30111444' and eliminado_en is null) = 5,
    'un RI sin CUIT no se cargó como consumidor final');

  v_r := app.registrar_pedido_de_la_tienda(v_canal, jsonb_build_object(
    'numero', 'PRUEBA-4', 'pagado', true,
    'comprador', jsonb_build_object('nombre', 'Comprador Precio'),
    'productos', jsonb_build_array(jsonb_build_object('id', v_a, 'cantidad', 1, 'precio', 3000))));
  perform pg_temp.comprobar((v_r ->> 'revisar') like '%precio%',
    format('un precio que no coincide con el del sistema no quedó marcado: %s', v_r ->> 'revisar'));
  perform pg_temp.comprobar((v_r ->> 'total')::numeric = 3000,
    'no se facturó lo que el cliente pagó, sino el precio del sistema');

  v_r := app.registrar_pedido_de_la_tienda(v_canal, jsonb_build_object(
    'numero', 'PRUEBA-5', 'pagado', true,
    'comprador', jsonb_build_object('nombre', 'Comprador Sin Stock'),
    'productos', jsonb_build_array(jsonb_build_object('id', v_a, 'cantidad', 500, 'precio', 10000))));
  perform pg_temp.comprobar((v_r ->> 'revisar') like '%stock%',
    format('un pedido sin stock suficiente no quedó marcado: %s', v_r ->> 'revisar'));
  perform pg_temp.comprobar((v_r ->> 'venta') is not null, 'un pedido sin stock no entró, y el cliente ya había pagado');

  v_r := app.registrar_pedido_de_la_tienda(v_canal, jsonb_build_object(
    'numero', 'PRUEBA-6', 'pagado', true, 'total', 999,
    'comprador', jsonb_build_object('nombre', 'Comprador Total'),
    'productos', jsonb_build_array(jsonb_build_object('id', v_b, 'cantidad', 1, 'precio', 2500))));
  perform pg_temp.comprobar((v_r ->> 'revisar') like '%total%',
    format('un total que no cierra no quedó marcado: %s', v_r ->> 'revisar'));

  -- ─── 5. Lo que no se acepta ───
  declare
    v_malos jsonb[] := array[
      jsonb_build_object('pagado', true, 'comprador', jsonb_build_object('nombre', 'X'),
                         'productos', jsonb_build_array(jsonb_build_object('id', v_a, 'cantidad', 1, 'precio', 1))),
      jsonb_build_object('numero', 'M-1', 'comprador', jsonb_build_object('nombre', 'X'), 'productos', '[]'::jsonb),
      jsonb_build_object('numero', 'M-2', 'productos', jsonb_build_array(jsonb_build_object('id', v_a, 'cantidad', 1, 'precio', 1))),
      jsonb_build_object('numero', 'M-3', 'comprador', jsonb_build_object('nombre', 'X'),
                         'entrega', jsonb_build_object('tipo', 'teletransporte'),
                         'productos', jsonb_build_array(jsonb_build_object('id', v_a, 'cantidad', 1, 'precio', 1))),
      jsonb_build_object('numero', 'M-4', 'comprador', jsonb_build_object('nombre', 'X'),
                         'productos', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'cantidad', 1, 'precio', 1))),
      jsonb_build_object('numero', 'M-5', 'comprador', jsonb_build_object('nombre', 'X'),
                         'productos', jsonb_build_array(jsonb_build_object('id', v_a, 'cantidad', 0, 'precio', 1))),
      jsonb_build_object('numero', 'M-6', 'comprador', jsonb_build_object('nombre', 'X'),
                         'productos', jsonb_build_array(jsonb_build_object('id', v_a, 'cantidad', 1, 'precio', -5))),
      jsonb_build_object('numero', 'M-7', 'comprador', jsonb_build_object('nombre', 'X'),
                         'productos', jsonb_build_array(jsonb_build_object('id', v_a, 'cantidad', 'dos', 'precio', 1)))
    ];
    v_malo jsonb;
  begin
    foreach v_malo in array v_malos loop
      begin
        perform app.registrar_pedido_de_la_tienda(v_canal, v_malo);
        perform pg_temp.comprobar(false, format('entró un pedido mal armado: %s', v_malo));
      exception when sqlstate 'PT400' then
        perform pg_temp.comprobar(true, '');
      end;
    end loop;
  end;

  perform pg_temp.comprobar(
    (select count(*) from public.venta where codigo like 'WEB-%' and creado_en > now() - interval '1 minute') = 7,
    'un pedido rechazado dejó una venta a medias');

  -- ─── 6. La puerta y la clave ───
  begin
    perform public.api_tienda_registrar_pedido('gross_esta_clave_no_existe_0123456789abcdef',
      jsonb_build_object('numero', 'X', 'comprador', jsonb_build_object('nombre', 'X'),
                         'productos', jsonb_build_array(jsonb_build_object('id', v_a, 'cantidad', 1, 'precio', 1))));
    perform pg_temp.comprobar(false, 'una clave inventada pudo registrar un pedido');
  exception when sqlstate 'PT401' then perform pg_temp.comprobar(true, '');
  end;

  v_clave := app.crear_clave_api(v_canal, 'Prueba de pedidos');
  v_r := public.api_tienda_registrar_pedido(v_clave, jsonb_build_object(
    'numero', 'PRUEBA-PUERTA', 'pagado', false,
    'comprador', jsonb_build_object('nombre', 'Por la puerta'),
    'productos', jsonb_build_array(jsonb_build_object('id', v_b, 'cantidad', 1, 'precio', 2500))));
  perform pg_temp.comprobar((v_r ->> 'venta') like 'WEB-%', 'con una clave buena, el pedido no entró');

  perform pg_temp.comprobar(
    has_function_privilege('anon', 'public.api_tienda_registrar_pedido(text, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.api_tienda_registrar_pedido(text, jsonb)', 'execute'),
    'los permisos de la puerta de pedidos no son los esperados');

  -- ─── 7. El medio de pago de la tienda no se puede dar de baja ───
  begin
    update public.medio_pago set eliminado_en = now() where id = v_medio;
    perform pg_temp.comprobar(false, 'se pudo dar de baja el medio de pago con el que cobra la tienda');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'El medio de pago%tienda online%', sqlerrm);
  end;

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
