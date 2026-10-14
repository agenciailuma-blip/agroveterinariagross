-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE LA CAJA Y LA SUELTA, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo lo que creó.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Los datos se arman como dueño de la base; las ventas se cobran y se
-- anulan como un Administrador de verdad, con las políticas de la base.
--
-- El caso es el de Lucas, en tres niveles: una caja de 10 tabletas de
-- 10 pastillas. Vender una pastilla con la caja cerrada tiene que dejar
-- cero cajas, 9 tabletas y 9 pastillas —nunca una caja que ya no está—.
-- Y el alimento suelto: una bolsa de 15 kg que se vende por kilo.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

-- Espera un error con el mensaje que corresponde, no «cualquier error».
create function pg_temp.falla(p_sql text, p_mensaje text, p_que text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform pg_temp.comprobar(false, p_que);
exception when others then
  perform pg_temp.comprobar(sqlerrm like p_mensaje, p_que || ' — dijo: ' || sqlerrm);
end $$;

create function pg_temp.total(p_producto uuid)
returns numeric language sql as $$
  select coalesce((select cantidad from public.stock_saldo where producto_id = p_producto), 0)
$$;

create function pg_temp.en(p_producto uuid, p_deposito uuid)
returns numeric language sql as $$
  select coalesce((select cantidad from public.stock_deposito
                    where producto_id = p_producto and deposito_id = p_deposito), 0)
$$;

-- Una venta en caja con un renglón del producto.
create function pg_temp.venta(p_codigo text, p_producto uuid, p_cantidad numeric, p_precio numeric)
returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.venta (codigo, cliente_id, estado, documentacion)
  values (p_codigo, (select id from public.cliente where nombre = 'PRUEBA CONSUMIDOR SUELTA'),
          'en_caja', 'no_fiscal') returning id into v;
  insert into public.venta_linea (venta_id, producto_id, codigo_producto, descripcion, cantidad,
    precio_original, precio_acordado, precio_unitario, alicuota_iva_id, condicion_iva)
  values (v, p_producto, 'PRUEBA', 'Prueba caja y suelta', p_cantidad, p_precio, p_precio, p_precio, 5, 'gravado');
  insert into public.venta_pago (venta_id, medio_pago_id, importe)
  values (v, (select id from public.medio_pago where tipo = 'efectivo' and activo limit 1), p_cantidad * p_precio);
  return v;
end $$;

do $$
declare
  v_admin     uuid;
  v_principal uuid;
  v_d2        uuid;
  v_caja      uuid;
  v_tableta   uuid;
  v_pastilla  uuid;
  v_bolsa     uuid;
  v_kg        uuid;
  v_otro      uuid;
  v1 uuid; v2 uuid; v3 uuid; v4 uuid; v5 uuid;
  v_mov       uuid;
  v_disp      numeric;
  v_estado    text;
begin
  select u.auth_user_id into v_admin
  from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null
  limit 1;
  perform pg_temp.comprobar(v_admin is not null, 'no hay un Administrador con cuenta para probar');
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_principal := app.deposito_principal();

  -- ─── Datos de prueba: la caja, la tableta y la pastilla ───
  insert into public.cliente (nombre, condicion_iva_id, tipo_documento_id, numero_documento)
    values ('PRUEBA CONSUMIDOR SUELTA', 5, 96, '99999998');
  insert into public.producto (codigo, nombre_interno, precio_venta, costo, alicuota_iva_id, unidad_medida)
    values ('PRUEBA-CAJA', 'PRUEBA CAJA X10', 20000, 5000, 5, 'caja') returning id into v_caja;
  insert into public.producto (codigo, nombre_interno, precio_venta, alicuota_iva_id, envase_id, cantidad_por_envase)
    values ('PRUEBA-TAB', 'PRUEBA TABLETA X10', 2500, 5, v_caja, 10) returning id into v_tableta;
  insert into public.producto (codigo, nombre_interno, precio_venta, alicuota_iva_id, envase_id, cantidad_por_envase)
    values ('PRUEBA-PAST', 'PRUEBA PASTILLA', 300, 5, v_tableta, 10) returning id into v_pastilla;
  insert into public.movimiento_stock (producto_id, tipo, cantidad, referencia_tipo)
    values (v_caja, 'carga_inicial', 2, 'manual');

  -- ─── 1. Atar: la suelta toma el costo del envase ───
  perform pg_temp.comprobar((select costo from public.producto where id = v_tableta) = 500,
    'la tableta no tomó el costo de la caja dividido diez');
  perform pg_temp.comprobar((select costo from public.producto where id = v_pastilla) = 50,
    'la pastilla no tomó el costo de la tableta dividido diez');

  -- ─── 2. Lo que se ve antes de vender ───
  perform pg_temp.comprobar(
    (select disponible = 200 and cantidad = 0 from public.vista_stock where producto_id = v_pastilla),
    'con dos cajas cerradas, la vista no dice 200 pastillas disponibles y cero sueltas');
  perform pg_temp.comprobar(
    (select disponible = 20 from public.vista_stock where producto_id = v_tableta),
    'con dos cajas cerradas, la vista no dice 20 tabletas disponibles');
  perform pg_temp.comprobar(
    (select estado = 'ok' from public.vista_stock where producto_id = v_pastilla),
    'una pastilla sin sueltas pero con cajas cerradas figura con stock bajo');
  perform pg_temp.comprobar(
    (select array_agg(producto_id order by nivel) = array[v_caja, v_tableta, v_pastilla]
       from public.cadena_de_envases(v_tableta)),
    'la cadena de la tableta no va de la caja a la pastilla');

  perform set_config('role', 'authenticated', true);

  -- ─── 3. El ejemplo de Lucas: una pastilla con todo cerrado ───
  v1 := pg_temp.venta('PRUEBA-SUELTA-1', v_pastilla, 1, 300);
  perform public.cobrar_venta(v1);
  perform pg_temp.comprobar(
    pg_temp.total(v_caja) = 1 and pg_temp.total(v_tableta) = 9 and pg_temp.total(v_pastilla) = 9,
    format('vender una pastilla no dejó 1 caja, 9 tabletas y 9 pastillas: quedó %s, %s y %s',
      pg_temp.total(v_caja), pg_temp.total(v_tableta), pg_temp.total(v_pastilla)));

  select id into v_mov from public.movimiento_stock
   where referencia_tipo = 'venta' and referencia_id = v1 and producto_id = v_pastilla;
  perform pg_temp.comprobar(
    (select count(*) = 4
            and count(*) filter (where tipo = 'apertura' and producto_id = v_caja and cantidad = -1) = 1
            and count(*) filter (where tipo = 'fraccionamiento' and producto_id = v_tableta and cantidad = 10) = 1
            and count(*) filter (where tipo = 'apertura' and producto_id = v_tableta and cantidad = -1) = 1
            and count(*) filter (where tipo = 'fraccionamiento' and producto_id = v_pastilla and cantidad = 10) = 1
       from public.movimiento_stock where referencia_tipo = 'fraccionamiento' and referencia_id = v_mov),
    'las aperturas no quedaron en el libro, cada una con su movimiento, atadas a la venta');
  perform pg_temp.comprobar(
    (select bool_and(m.ocurrido_en = vm.ocurrido_en and m.usuario_id is not distinct from vm.usuario_id
                     and m.deposito_id = vm.deposito_id)
       from public.movimiento_stock m, public.movimiento_stock vm
      where m.referencia_tipo = 'fraccionamiento' and m.referencia_id = v_mov and vm.id = v_mov),
    'las aperturas no llevan la fecha, la persona y el depósito de la venta');

  -- ─── 4. Con sueltas no se abre nada; cuando faltan, se abren las que hagan falta ───
  v2 := pg_temp.venta('PRUEBA-SUELTA-2', v_pastilla, 9, 300);
  perform public.cobrar_venta(v2);
  perform pg_temp.comprobar(pg_temp.total(v_pastilla) = 0 and pg_temp.total(v_tableta) = 9,
    'vender las 9 sueltas abrió una tableta sin hacer falta');

  v3 := pg_temp.venta('PRUEBA-SUELTA-3', v_pastilla, 25, 300);
  perform public.cobrar_venta(v3);
  perform pg_temp.comprobar(pg_temp.total(v_tableta) = 6 and pg_temp.total(v_pastilla) = 5
                            and pg_temp.total(v_caja) = 1,
    format('vender 25 pastillas no abrió exactamente 3 tabletas: quedaron %s tabletas y %s pastillas',
      pg_temp.total(v_tableta), pg_temp.total(v_pastilla)));
  perform pg_temp.comprobar(
    (select disponible = 5 + 10 * (6 + 10 * 1) and estado = 'ok' from public.vista_stock where producto_id = v_pastilla),
    'la vista no cuenta las sueltas más lo que se puede abrir');

  -- ─── 5. Lo que vuelve, vuelve suelto ───
  perform public.anular_venta(v3, 'Prueba de caja y suelta');
  perform pg_temp.comprobar(pg_temp.total(v_pastilla) = 30 and pg_temp.total(v_tableta) = 6
                            and pg_temp.total(v_caja) = 1,
    'anular la venta no devolvió las pastillas sueltas, o volvió a cerrar tabletas');

  -- ─── 6. Si no alcanza ni abriendo todo, la suelta queda vendida de más y la caja no ───
  -- Hay 30 sueltas, 6 tabletas y 1 caja: 190 pastillas en total.
  v4 := pg_temp.venta('PRUEBA-SUELTA-4', v_pastilla, 200, 300);
  perform public.cobrar_venta(v4);
  perform pg_temp.comprobar(pg_temp.total(v_caja) = 0 and pg_temp.total(v_tableta) = 0
                            and pg_temp.total(v_pastilla) = -10,
    format('vender de más no dejó todo abierto y 10 pastillas vendidas de más: quedó %s, %s y %s',
      pg_temp.total(v_caja), pg_temp.total(v_tableta), pg_temp.total(v_pastilla)));
  perform pg_temp.comprobar(
    (select estado = 'sobrevendido' from public.vista_stock where producto_id = v_pastilla),
    'la pastilla vendida de más no figura como sobrevendida');

  reset role;

  -- ─── 7. Un ajuste o un conteo en negativo no abren nada ───
  insert into public.movimiento_stock (producto_id, tipo, cantidad, referencia_tipo)
    values (v_caja, 'carga_inicial', 1, 'manual');
  insert into public.movimiento_stock (producto_id, tipo, cantidad, referencia_tipo)
    values (v_pastilla, 'ajuste', -1, 'manual'), (v_pastilla, 'inventario', -1, 'manual');
  perform pg_temp.comprobar(pg_temp.total(v_caja) = 1 and pg_temp.total(v_pastilla) = -12,
    'un ajuste o un conteo en negativo abrieron una caja');

  -- ─── 8. Lo que no se puede atar ───
  perform pg_temp.falla(format('update public.producto set envase_id = %L, cantidad_por_envase = 1 where id = %L',
      v_pastilla, v_caja),
    'Ese producto ya sale de adentro de éste%', 'se pudo meter la caja adentro de su propia pastilla');
  perform pg_temp.falla(format('update public.producto set envase_id = id, cantidad_por_envase = 1 where id = %L', v_caja),
    'Ese producto ya sale de adentro de éste%', 'un producto quedó como su propio envase');
  insert into public.producto (codigo, nombre_interno, precio_venta, alicuota_iva_id)
    values ('PRUEBA-OTRA', 'PRUEBA OTRA SUELTA', 100, 5) returning id into v_otro;
  perform pg_temp.falla(format('update public.producto set envase_id = %L, cantidad_por_envase = 5 where id = %L',
      v_caja, v_otro),
    '%producto_una_suelta_por_envase%', 'una caja se pudo abrir en dos sueltas distintas');
  perform pg_temp.falla(format('update public.producto set envase_id = %L where id = %L', v_tableta, v_otro),
    '%producto_envase_completo%', 'se ató una suelta sin decir cuántas trae el envase');
  perform pg_temp.falla(format('update public.producto set cantidad_por_envase = 0 where id = %L', v_tableta),
    '%producto_cantidad_por_envase_positiva%', 'un envase quedó trayendo cero');

  -- ─── 9. El costo baja por la cadena ───
  update public.producto set costo = 6000 where id = v_caja;
  perform pg_temp.comprobar(
    (select costo from public.producto where id = v_tableta) = 600
    and (select costo from public.producto where id = v_pastilla) = 60,
    'el costo nuevo de la caja no bajó a la tableta y a la pastilla');

  -- ─── 10. Un envase dado de baja no se abre ───
  update public.producto set eliminado_en = now() where id = v_caja;
  insert into public.movimiento_stock (producto_id, tipo, cantidad, referencia_tipo, referencia_id)
    values (v_tableta, 'venta', -1, 'venta', gen_random_uuid());
  perform pg_temp.comprobar(pg_temp.total(v_caja) = 1 and pg_temp.total(v_tableta) = -1,
    'se abrió una caja dada de baja');
  update public.producto set eliminado_en = null where id = v_caja;

  -- ─── 11. El alimento suelto: la bolsa de 15 kg ───
  insert into public.producto (codigo, nombre_interno, precio_venta, costo, alicuota_iva_id, unidad_medida)
    values ('PRUEBA-BOLSA', 'PRUEBA BOLSA 15KG', 45000, 30000, 5, 'bolsa') returning id into v_bolsa;
  insert into public.producto (codigo, nombre_interno, precio_venta, alicuota_iva_id, unidad_medida,
                               envase_id, cantidad_por_envase)
    values ('PRUEBA-KG', 'PRUEBA SUELTO X KG', 3500, 5, 'kg', v_bolsa, 15) returning id into v_kg;
  insert into public.movimiento_stock (producto_id, tipo, cantidad, referencia_tipo)
    values (v_bolsa, 'carga_inicial', 2, 'manual');
  perform pg_temp.comprobar((select costo from public.producto where id = v_kg) = 2000,
    'el kilo suelto no tomó el costo de la bolsa dividido 15');

  perform set_config('role', 'authenticated', true);
  v5 := pg_temp.venta('PRUEBA-SUELTA-5', v_kg, 2.5, 3500);
  perform public.cobrar_venta(v5);
  perform pg_temp.comprobar(pg_temp.total(v_bolsa) = 1 and pg_temp.total(v_kg) = 12.5,
    'vender 2,5 kg con la bolsa cerrada no dejó una bolsa y 12,5 kg sueltos');
  reset role;

  -- ─── 12. Se abre lo del depósito de la venta, no lo del otro local ───
  insert into public.deposito (nombre) values ('PRUEBA Depósito suelto') returning id into v_d2;
  insert into public.movimiento_stock (producto_id, tipo, cantidad, referencia_tipo, deposito_id)
    values (v_bolsa, 'carga_inicial', 1, 'manual', v_d2);
  perform pg_temp.comprobar(app.disponible_abriendo(v_kg, v_principal) = 12.5 + 15
                            and app.disponible_abriendo(v_kg, v_d2) = 15
                            and app.disponible_abriendo(v_kg) = 12.5 + 30,
    'lo disponible por depósito no cuenta sólo los envases de ese depósito');
  insert into public.movimiento_stock (producto_id, tipo, cantidad, referencia_tipo, referencia_id, deposito_id)
    values (v_kg, 'venta', -30, 'venta', gen_random_uuid(), v_principal);
  perform pg_temp.comprobar(pg_temp.en(v_bolsa, v_principal) = 0 and pg_temp.en(v_bolsa, v_d2) = 1
                            and pg_temp.en(v_kg, v_principal) = -2.5,
    'faltando en el principal, se abrió la bolsa del otro depósito');
  perform pg_temp.comprobar(
    (select disponible = 15 and estado <> 'sobrevendido' from public.vista_stock_por_deposito
      where producto_id = v_kg and deposito_id = v_d2),
    'la vista por depósito no cuenta la bolsa cerrada de ese depósito');

  -- ─── 13. El libro sigue cerrando ───
  perform pg_temp.comprobar(not exists (
      select 1
        from (select producto_id, deposito_id, sum(cantidad) as c
                from public.movimiento_stock group by 1, 2) m
        full join public.stock_deposito s using (producto_id, deposito_id)
       where coalesce(m.c, 0) <> coalesce(s.cantidad, 0)),
    'el saldo de cada depósito no coincide con la suma del libro');

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
