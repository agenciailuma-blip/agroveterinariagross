-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE LA IMPORTACIÓN DE CLIENTES Y DE SALDOS DE PROVEEDORES
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo lo que creó.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Corre como un Administrador de verdad y como alguien sin cuenta.
--
-- Lo que se cuida: que reimportar no duplique ni clientes ni deuda, que
-- una celda vacía no borre, que un CUIT mal escrito no entre, y que el
-- saldo quede igual al de la planilla.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

-- El resultado de una fila de la importación.
create function pg_temp.fila(p_resultado jsonb, p_fila integer, p_campo text)
returns text language sql as $$
  select e->>p_campo from jsonb_array_elements(p_resultado) e where (e->>'fila')::integer = p_fila
$$;

create function pg_temp.clientes(p_filas jsonb, p_fecha date)
returns jsonb language sql as $$
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.importar_clientes(p_filas, p_fecha) r
$$;

create function pg_temp.proveedores(p_filas jsonb, p_fecha date)
returns jsonb language sql as $$
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.importar_saldos_proveedores(p_filas, p_fecha) r
$$;

create function pg_temp.saldo(p_codigo text) returns numeric language sql as $$
  select coalesce(sum(m.importe), 0) from public.movimiento_cuenta_corriente m
  join public.cliente c on c.id = m.cliente_id
  where upper(c.codigo) = upper(p_codigo) and c.eliminado_en is null
$$;

do $$
declare
  v_admin uuid;
  v_r     jsonb;
  v_hoja  jsonb;
  v_fecha date := current_date - 2;
  v_prov  uuid;
  v_si    uuid;
begin
  select u.auth_user_id into v_admin from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null limit 1;
  perform pg_temp.comprobar(v_admin is not null, 'no hay un Administrador con cuenta para probar');
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  v_hoja := jsonb_build_array(
    jsonb_build_object('codigo', 'PRUEBA-C1', 'nombre', 'Prueba Mayorista', 'condicion_iva', 'Resp. Inscripto',
      'documento', '20-12345678-6', 'cuenta_corriente', 'Sí', 'limite_credito', '500000',
      'saldo', '120000.5', 'telefono', '3755 400000', 'domicilio', 'Av. Libertad 100'),
    jsonb_build_object('nombre', 'Prueba Vecino', 'condicion_iva', 'CF', 'documento', '12.345.678', 'saldo', '0'),
    jsonb_build_object('codigo', 'PRUEBA-C3', 'nombre', 'Prueba Sin Cuit', 'condicion_iva', 'RI'),
    jsonb_build_object('codigo', 'PRUEBA-C4', 'nombre', 'Prueba Cuit Mal', 'documento', '30711111118'),
    jsonb_build_object('codigo', 'PRUEBA-C5', 'nombre', 'Prueba Rara', 'condicion_iva', 'Rarísima'),
    jsonb_build_object('codigo', 'PRUEBA-C6', 'nombre', 'Prueba Sin Cuenta', 'cuenta_corriente', 'no', 'saldo', '5000'),
    jsonb_build_object('codigo', 'PRUEBA-C7', 'nombre', 'Prueba A Favor', 'condicion_iva', 'Monotributo',
      'documento', '27123456780', 'saldo', '-1500'));

  -- ─── 1. La primera importación ───
  v_r := pg_temp.clientes(v_hoja, v_fecha);
  perform pg_temp.comprobar(pg_temp.fila(v_r, 1, 'resultado') = 'creado', 'el mayorista no se creó: ' || coalesce(pg_temp.fila(v_r, 1, 'detalle'), ''));
  perform pg_temp.comprobar(
    (select condicion_iva_id = 1 and tipo_documento_id = 80 and numero_documento = '20123456786'
            and cuenta_corriente and limite_credito = 500000 and provincia = 'Misiones'
       from public.cliente where codigo = 'PRUEBA-C1' and eliminado_en is null),
    'el mayorista no quedó como RI con su CUIT limpio, cuenta corriente y límite');
  perform pg_temp.comprobar(pg_temp.saldo('PRUEBA-C1') = 120000.5, 'el saldo del mayorista no es 120.000,50');
  perform pg_temp.comprobar(
    (select vencimiento = v_fecha + 30 and ocurrido_en::date = v_fecha
       from public.movimiento_cuenta_corriente m join public.cliente c on c.id = m.cliente_id
      where c.codigo = 'PRUEBA-C1' and m.tipo = 'saldo_inicial'),
    'el saldo no quedó a la fecha del corte, venciendo a los días del cliente');

  perform pg_temp.comprobar(
    (select tipo_documento_id = 96 and condicion_iva_id = 5 from public.cliente
      where numero_documento = '12345678' and eliminado_en is null),
    'el vecino no quedó con DNI y consumidor final');
  perform pg_temp.comprobar(pg_temp.fila(v_r, 3, 'detalle') = 'Es Responsable Inscripto: necesita un CUIT (11 dígitos).',
    'un RI sin CUIT no dio el error claro: ' || coalesce(pg_temp.fila(v_r, 3, 'detalle'), ''));
  perform pg_temp.comprobar(pg_temp.fila(v_r, 4, 'detalle') like 'El CUIT 30711111118 no es válido%',
    'un CUIT con el dígito mal entró');
  perform pg_temp.comprobar(pg_temp.fila(v_r, 5, 'detalle') like 'No se entiende la condición%',
    'una condición inventada entró');
  perform pg_temp.comprobar(
    (select cuenta_corriente from public.cliente where codigo = 'PRUEBA-C6' and eliminado_en is null)
    and pg_temp.fila(v_r, 6, 'detalle') like '%se la habilitó%',
    'un cliente con saldo quedó sin cuenta corriente, o sin avisar');
  perform pg_temp.comprobar(pg_temp.saldo('PRUEBA-C7') = -1500, 'el saldo a favor no quedó negativo');

  -- ─── 2. Reimportar lo mismo no duplica nada ───
  v_r := pg_temp.clientes(v_hoja, v_fecha);
  perform pg_temp.comprobar(pg_temp.fila(v_r, 1, 'resultado') = 'actualizado' and pg_temp.fila(v_r, 2, 'resultado') = 'actualizado',
    'la segunda importación creó en vez de actualizar');
  perform pg_temp.comprobar(
    (select count(*) = 1 from public.cliente where codigo = 'PRUEBA-C1' and eliminado_en is null)
    and (select count(*) = 1 from public.cliente where numero_documento = '12345678' and eliminado_en is null),
    'reimportar duplicó clientes');
  perform pg_temp.comprobar(pg_temp.saldo('PRUEBA-C1') = 120000.5
    and (select count(*) = 1 from public.movimiento_cuenta_corriente m join public.cliente c on c.id = m.cliente_id
          where c.codigo = 'PRUEBA-C1'),
    'reimportar duplicó la deuda o dejó movimientos de más');

  -- ─── 3. Una planilla corregida deja el saldo igual al nuevo, y una celda vacía no borra ───
  v_r := pg_temp.clientes(jsonb_build_array(
    jsonb_build_object('codigo', 'PRUEBA-C1', 'nombre', 'Prueba Mayorista SA', 'saldo', '100.000,00')), v_fecha);
  perform pg_temp.comprobar(pg_temp.fila(v_r, 1, 'resultado') = 'error', 'un número con coma decimal llegó sin limpiar y la base no lo rechazó');
  v_r := pg_temp.clientes(jsonb_build_array(
    jsonb_build_object('codigo', 'PRUEBA-C1', 'nombre', 'Prueba Mayorista SA', 'saldo', '100000')), v_fecha);
  perform pg_temp.comprobar(pg_temp.saldo('PRUEBA-C1') = 100000, 'el saldo corregido no quedó en 100.000');
  perform pg_temp.comprobar(pg_temp.fila(v_r, 1, 'detalle') like 'Ya tenía saldo inicial de $ 120.000,50: se corrigió a $ 100.000,00.',
    'la corrección no avisó: ' || coalesce(pg_temp.fila(v_r, 1, 'detalle'), ''));
  perform pg_temp.comprobar(
    (select nombre = 'Prueba Mayorista SA' and telefono = '3755 400000' and numero_documento = '20123456786' and condicion_iva_id = 1
       from public.cliente where codigo = 'PRUEBA-C1' and eliminado_en is null),
    'una celda vacía borró un dato');

  -- ─── 4. Proveedores ───
  v_hoja := jsonb_build_array(
    jsonb_build_object('nombre', 'PRUEBA LABORATORIO', 'documento', '30-50001091-2', 'saldo', '300000'),
    jsonb_build_object('nombre', 'PRUEBA DISTRIBUIDORA', 'saldo', '45000'),
    jsonb_build_object('nombre', 'PRUEBA CUIT MAL', 'documento', '30711111118', 'saldo', '1'));
  v_r := pg_temp.proveedores(v_hoja, v_fecha);
  select id into v_prov from public.proveedor where numero_documento = '30500010912' and eliminado_en is null;
  perform pg_temp.comprobar(v_prov is not null and pg_temp.fila(v_r, 1, 'resultado') = 'creado', 'el laboratorio no se creó');
  perform pg_temp.comprobar(
    (select importe = 300000 and fecha = v_fecha from public.proveedor_saldo_inicial where proveedor_id = v_prov and anulado_en is null),
    'el saldo del laboratorio no quedó a la fecha del corte');
  perform pg_temp.comprobar(pg_temp.fila(v_r, 3, 'resultado') = 'error', 'un proveedor con CUIT mal entró');

  v_r := pg_temp.proveedores(v_hoja, v_fecha);
  perform pg_temp.comprobar((select count(*) = 1 from public.proveedor_saldo_inicial where proveedor_id = v_prov),
    'reimportar el mismo saldo dejó registros de más');
  perform pg_temp.comprobar(
    (select count(*) = 1 from public.proveedor where app.texto_para_comparar(nombre) = 'prueba distribuidora' and eliminado_en is null),
    'reimportar un proveedor sin CUIT lo duplicó');

  v_r := pg_temp.proveedores(jsonb_build_array(jsonb_build_object('nombre', 'Prueba Laboratorio', 'saldo', '250000')), v_fecha);
  perform pg_temp.comprobar(
    (select importe = 250000 from public.proveedor_saldo_inicial where proveedor_id = v_prov and anulado_en is null)
    and pg_temp.fila(v_r, 1, 'detalle') like 'Tenía saldo inicial de $ 300.000,00%',
    'un saldo corregido no reemplazó al anterior, o no avisó (y se reconoce por el nombre)');

  -- Con un pago imputado, el saldo ya no se cambia desde la planilla.
  select id into v_si from public.proveedor_saldo_inicial where proveedor_id = v_prov and anulado_en is null;
  perform public.registrar_pago_proveedor(v_prov, current_date,
    jsonb_build_array(jsonb_build_object('medio', 'transferencia', 'importe', 1000)),
    jsonb_build_array(jsonb_build_object('origen', 'saldo_inicial', 'id', v_si, 'importe', 1000)));
  v_r := pg_temp.proveedores(jsonb_build_array(jsonb_build_object('nombre', 'Prueba Laboratorio', 'saldo', '1')), v_fecha);
  perform pg_temp.comprobar(pg_temp.fila(v_r, 1, 'detalle') like 'Ese saldo ya tiene pagos imputados%',
    'la planilla pisó un saldo que ya tenía pagos');

  -- ─── 5. Sin permiso, nada ───
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  begin
    perform pg_temp.clientes(jsonb_build_array(jsonb_build_object('nombre', 'Intruso')), v_fecha);
    perform pg_temp.comprobar(false, 'alguien sin permiso importó clientes');
  exception when raise_exception then
    perform pg_temp.comprobar(sqlerrm like 'No tenés permiso%', sqlerrm);
  end;

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
