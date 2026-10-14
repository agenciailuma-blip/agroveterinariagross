-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE LA PLANILLA DE PRODUCTOS CON EL MÍNIMO Y LA SUELTA
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo lo que creó.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Corre como un Administrador de verdad, con las políticas de la base.
--
-- Lo que se cuida: que el mínimo quede como el aviso propio del producto
-- —el mismo de la ficha— sin borrar lo que la planilla no trae; que la
-- caja, la tableta y la pastilla queden atadas en una sola importación;
-- que lo que no se puede atar no frene el producto, y que lo mal escrito
-- no cree nada. Y el peso y las unidades por bulto, que necesita el
-- pedido al proveedor cuando su mínimo es en kilos o en bultos.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

create function pg_temp.importar(p_filas jsonb)
returns jsonb language sql as $$
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.importar_productos(p_filas, true) r
$$;

-- El resultado de una fila de la importación.
create function pg_temp.fila(p_resultado jsonb, p_fila integer, p_campo text)
returns text language sql as $$
  select e->>p_campo from jsonb_array_elements(p_resultado) e where (e->>'fila')::integer = p_fila
$$;

create function pg_temp.id(p_codigo text) returns uuid language sql as $$
  select id from public.producto where upper(codigo) = upper(p_codigo) and eliminado_en is null
$$;

-- El aviso propio del producto, como «bajo/crítico»; null si no tiene.
create function pg_temp.aviso(p_codigo text) returns text language sql as $$
  select u.bajo::numeric(14,0) || '/' || u.critico::numeric(14,0)
    from public.umbral_stock u
   where u.producto_id = pg_temp.id(p_codigo) and u.ambito = 'producto' and u.eliminado_en is null
$$;

do $$
declare
  v_admin uuid;
  v_r     jsonb;
  v_ctid  tid;
begin
  select u.auth_user_id into v_admin from public.usuario u join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.activo and u.eliminado_en is null and u.auth_user_id is not null limit 1;
  perform pg_temp.comprobar(v_admin is not null, 'no hay un Administrador con cuenta para probar');
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- ─── 1. El mínimo solo: rojo con ese número, sin amarillo antes ───
  v_r := pg_temp.importar(jsonb_build_array(
    jsonb_build_object('codigo', 'PRUEBA-IMP-BOLSA', 'nombre_interno', 'PRUEBA BOLSA 15 KG',
                       'precio_venta', '78500', 'stock_critico', '2'),
    jsonb_build_object('codigo', 'PRUEBA-IMP-PIPETA', 'nombre_interno', 'PRUEBA PIPETA',
                       'precio_venta', '9000', 'stock_bajo', '10', 'stock_critico', '3'),
    jsonb_build_object('codigo', 'PRUEBA-IMP-COLLAR', 'nombre_interno', 'PRUEBA COLLAR',
                       'precio_venta', '6400')));
  perform pg_temp.comprobar(pg_temp.fila(v_r, 1, 'resultado') = 'creado' and pg_temp.fila(v_r, 1, 'detalle') is null,
    'la bolsa con mínimo no entró limpia: ' || v_r::text);
  perform pg_temp.comprobar(pg_temp.aviso('PRUEBA-IMP-BOLSA') = '2/2',
    'el mínimo solo no quedó como bajo y crítico iguales, dio ' || coalesce(pg_temp.aviso('PRUEBA-IMP-BOLSA'), 'nada'));
  perform pg_temp.comprobar(pg_temp.aviso('PRUEBA-IMP-PIPETA') = '10/3',
    'con los dos números no quedó 10/3, dio ' || coalesce(pg_temp.aviso('PRUEBA-IMP-PIPETA'), 'nada'));
  perform pg_temp.comprobar(pg_temp.aviso('PRUEBA-IMP-COLLAR') is null,
    'un producto sin mínimo en la planilla quedó con aviso propio: tiene que heredar el de su categoría o el general');

  -- ─── 2. Lo que la planilla no trae, no se toca ───
  v_r := pg_temp.importar(jsonb_build_array(
    jsonb_build_object('codigo', 'PRUEBA-IMP-PIPETA', 'stock_bajo', '6')));
  perform pg_temp.comprobar(pg_temp.aviso('PRUEBA-IMP-PIPETA') = '6/3',
    'cambiar sólo el bajo tocó el crítico: dio ' || coalesce(pg_temp.aviso('PRUEBA-IMP-PIPETA'), 'nada'));

  -- Y si el que viene choca con el que estaba, se acomoda el que no vino.
  v_r := pg_temp.importar(jsonb_build_array(
    jsonb_build_object('codigo', 'PRUEBA-IMP-PIPETA', 'stock_critico', '8')));
  perform pg_temp.comprobar(pg_temp.fila(v_r, 1, 'resultado') = 'actualizado'
                            and pg_temp.aviso('PRUEBA-IMP-PIPETA') = '8/8',
    'un crítico mayor que el bajo que ya estaba no subió el bajo: dio ' || coalesce(pg_temp.aviso('PRUEBA-IMP-PIPETA'), 'nada'));
  v_r := pg_temp.importar(jsonb_build_array(
    jsonb_build_object('codigo', 'PRUEBA-IMP-PIPETA', 'stock_bajo', '4')));
  perform pg_temp.comprobar(pg_temp.aviso('PRUEBA-IMP-PIPETA') = '4/4',
    'un bajo menor que el crítico que ya estaba no bajó el crítico: dio ' || coalesce(pg_temp.aviso('PRUEBA-IMP-PIPETA'), 'nada'));

  -- Reimportar lo mismo no reescribe el aviso: cada reescritura viaja a
  -- todas las PC del local.
  select ctid into v_ctid from public.umbral_stock
   where producto_id = pg_temp.id('PRUEBA-IMP-PIPETA') and ambito = 'producto';
  v_r := pg_temp.importar(jsonb_build_array(
    jsonb_build_object('codigo', 'PRUEBA-IMP-PIPETA', 'stock_bajo', '4', 'stock_critico', '4')));
  perform pg_temp.comprobar((select ctid from public.umbral_stock
                              where producto_id = pg_temp.id('PRUEBA-IMP-PIPETA') and ambito = 'producto') = v_ctid,
    'reimportar el mismo aviso lo reescribió');

  -- Un aviso que se había quitado en la ficha vuelve con la planilla.
  perform public.definir_umbral_producto(pg_temp.id('PRUEBA-IMP-COLLAR'), 5, 1);
  perform public.definir_umbral_producto(pg_temp.id('PRUEBA-IMP-COLLAR'), null, null);
  v_r := pg_temp.importar(jsonb_build_array(
    jsonb_build_object('codigo', 'PRUEBA-IMP-COLLAR', 'stock_critico', '1')));
  perform pg_temp.comprobar(pg_temp.aviso('PRUEBA-IMP-COLLAR') = '1/1',
    'un aviso quitado no revivió con la planilla, o heredó el bajo del que se había quitado: dio '
      || coalesce(pg_temp.aviso('PRUEBA-IMP-COLLAR'), 'nada'));

  -- ─── 3. Lo mal escrito no crea nada ───
  v_r := pg_temp.importar(jsonb_build_array(
    jsonb_build_object('codigo', 'PRUEBA-IMP-MAL1', 'nombre_interno', 'PRUEBA MAL', 'stock_bajo', '2', 'stock_critico', '5'),
    jsonb_build_object('codigo', 'PRUEBA-IMP-MAL2', 'nombre_interno', 'PRUEBA MAL', 'stock_critico', '-1'),
    jsonb_build_object('codigo', 'PRUEBA-IMP-MAL3', 'nombre_interno', 'PRUEBA MAL', 'sale_de', 'PRUEBA-IMP-BOLSA'),
    jsonb_build_object('codigo', 'PRUEBA-IMP-MAL4', 'nombre_interno', 'PRUEBA MAL', 'cantidad_por_envase', '10'),
    jsonb_build_object('codigo', 'PRUEBA-IMP-MAL5', 'nombre_interno', 'PRUEBA MAL', 'sale_de', 'PRUEBA-IMP-BOLSA',
                       'cantidad_por_envase', '0'),
    jsonb_build_object('codigo', 'PRUEBA-IMP-MAL6', 'nombre_interno', 'PRUEBA MAL', 'sale_de', 'prueba-imp-mal6',
                       'cantidad_por_envase', '5')));
  perform pg_temp.comprobar(pg_temp.fila(v_r, 1, 'detalle') = 'El stock crítico no puede ser mayor que el bajo.',
    'un crítico mayor que el bajo no dijo por qué: ' || coalesce(pg_temp.fila(v_r, 1, 'detalle'), 'nada'));
  perform pg_temp.comprobar(pg_temp.fila(v_r, 2, 'detalle') = 'El aviso de stock no puede ser negativo.',
    'un mínimo negativo no dijo por qué: ' || coalesce(pg_temp.fila(v_r, 2, 'detalle'), 'nada'));
  perform pg_temp.comprobar(pg_temp.fila(v_r, 3, 'detalle') = 'Sale de PRUEBA-IMP-BOLSA, pero falta cuántas trae.',
    'una suelta sin cuántas trae no dijo por qué: ' || coalesce(pg_temp.fila(v_r, 3, 'detalle'), 'nada'));
  perform pg_temp.comprobar(pg_temp.fila(v_r, 4, 'detalle') = 'Dice cuántas trae, pero no de qué envase sale.',
    'cuántas trae sin el envase no dijo por qué: ' || coalesce(pg_temp.fila(v_r, 4, 'detalle'), 'nada'));
  perform pg_temp.comprobar(pg_temp.fila(v_r, 5, 'detalle') like 'Cuántas trae el envase tiene que ser más que cero%',
    '«trae 0» no dijo por qué: ' || coalesce(pg_temp.fila(v_r, 5, 'detalle'), 'nada'));
  perform pg_temp.comprobar(pg_temp.fila(v_r, 6, 'detalle') = 'Un producto no puede salir de adentro de sí mismo.',
    'un producto que sale de sí mismo no dijo por qué: ' || coalesce(pg_temp.fila(v_r, 6, 'detalle'), 'nada'));
  perform pg_temp.comprobar(
    (select count(*) from jsonb_array_elements(v_r) e where e->>'resultado' = 'error') = 6
    and not exists (select 1 from public.producto where codigo like 'PRUEBA-IMP-MAL%'),
    'una fila mal escrita creó el producto igual');

  -- ─── 4. Caja, tableta y pastilla en una sola planilla ───
  v_r := pg_temp.importar(jsonb_build_array(
    jsonb_build_object('codigo', 'PRUEBA-IMP-CAJA', 'nombre_interno', 'PRUEBA CAJA X10',
                       'precio_venta', '20000', 'costo', '5000', 'stock_critico', '1'),
    jsonb_build_object('codigo', 'PRUEBA-IMP-TAB', 'nombre_interno', 'PRUEBA TABLETA X10',
                       'precio_venta', '2500', 'sale_de', 'prueba-imp-caja', 'cantidad_por_envase', '10'),
    jsonb_build_object('codigo', 'PRUEBA-IMP-PAST', 'nombre_interno', 'PRUEBA PASTILLA',
                       'precio_venta', '300', 'costo', '999', 'sale_de', 'PRUEBA-IMP-TAB', 'cantidad_por_envase', '10')));
  perform pg_temp.comprobar(
    (select count(*) from jsonb_array_elements(v_r) e where e->>'resultado' = 'creado' and e->>'detalle' is null) = 3,
    'la caja, la tableta y la pastilla no entraron las tres limpias: ' || v_r::text);
  perform pg_temp.comprobar(
    (select envase_id = pg_temp.id('PRUEBA-IMP-CAJA') and cantidad_por_envase = 10
       from public.producto where id = pg_temp.id('PRUEBA-IMP-TAB'))
    and (select envase_id = pg_temp.id('PRUEBA-IMP-TAB') and cantidad_por_envase = 10
           from public.producto where id = pg_temp.id('PRUEBA-IMP-PAST')),
    'la tableta y la pastilla no quedaron atadas a su envase');
  perform pg_temp.comprobar(
    (select costo from public.producto where id = pg_temp.id('PRUEBA-IMP-TAB')) = 500
    and (select costo from public.producto where id = pg_temp.id('PRUEBA-IMP-PAST')) = 50,
    'el costo no bajó por la cadena, o el de la planilla le ganó al de la caja');
  perform pg_temp.comprobar(
    (select count(*) from public.cadena_de_envases(pg_temp.id('PRUEBA-IMP-PAST'))) = 3,
    'la ficha no ve la cadena entera de tres niveles');

  -- Reimportar la misma planilla deja todo igual, y una suelta ya atada
  -- sigue sacando el costo de su envase aunque la planilla traiga otro.
  v_r := pg_temp.importar(jsonb_build_array(
    jsonb_build_object('codigo', 'PRUEBA-IMP-CAJA', 'costo', '5000', 'stock_critico', '1'),
    jsonb_build_object('codigo', 'PRUEBA-IMP-TAB', 'sale_de', 'PRUEBA-IMP-CAJA', 'cantidad_por_envase', '10'),
    jsonb_build_object('codigo', 'PRUEBA-IMP-PAST', 'costo', '999', 'sale_de', 'PRUEBA-IMP-TAB', 'cantidad_por_envase', '10')));
  perform pg_temp.comprobar(
    (select count(*) from jsonb_array_elements(v_r) e where e->>'resultado' = 'actualizado' and e->>'detalle' is null) = 3
    and (select costo from public.producto where id = pg_temp.id('PRUEBA-IMP-PAST')) = 50,
    'reimportar la cadena no la dejó igual: ' || v_r::text);

  -- Una caja nueva en la planilla le cambia el costo a toda la cadena.
  v_r := pg_temp.importar(jsonb_build_array(
    jsonb_build_object('codigo', 'PRUEBA-IMP-CAJA', 'costo', '6000')));
  perform pg_temp.comprobar((select costo from public.producto where id = pg_temp.id('PRUEBA-IMP-PAST')) = 60,
    'el costo nuevo de la caja no llegó a la pastilla');

  -- ─── 5. Lo que no se puede atar no frena el producto ───
  v_r := pg_temp.importar(jsonb_build_array(
    jsonb_build_object('codigo', 'PRUEBA-IMP-SINCAJA', 'nombre_interno', 'PRUEBA SUELTA HUÉRFANA',
                       'sale_de', 'NO-EXISTE-123', 'cantidad_por_envase', '10'),
    jsonb_build_object('codigo', 'PRUEBA-IMP-TAB2', 'nombre_interno', 'PRUEBA OTRA TABLETA',
                       'sale_de', 'PRUEBA-IMP-CAJA', 'cantidad_por_envase', '20'),
    jsonb_build_object('codigo', 'PRUEBA-IMP-CAJA', 'sale_de', 'PRUEBA-IMP-PAST', 'cantidad_por_envase', '1')));
  perform pg_temp.comprobar(pg_temp.fila(v_r, 1, 'resultado') = 'creado'
    and pg_temp.fila(v_r, 1, 'detalle') = 'No se ató a su envase: no hay ningún producto con el código NO-EXISTE-123.'
    and (select envase_id is null from public.producto where id = pg_temp.id('PRUEBA-IMP-SINCAJA')),
    'un envase que no existe frenó el producto o no lo dijo: ' || coalesce(pg_temp.fila(v_r, 1, 'detalle'), 'nada'));
  perform pg_temp.comprobar(pg_temp.fila(v_r, 2, 'resultado') = 'creado'
    and pg_temp.fila(v_r, 2, 'detalle') like 'No se ató a su envase: PRUEBA-IMP-CAJA ya se abre en PRUEBA-IMP-TAB%'
    and (select envase_id is null from public.producto where id = pg_temp.id('PRUEBA-IMP-TAB2')),
    'una segunda suelta para la misma caja no se frenó: ' || coalesce(pg_temp.fila(v_r, 2, 'detalle'), 'nada'));
  perform pg_temp.comprobar(pg_temp.fila(v_r, 3, 'resultado') = 'actualizado'
    and pg_temp.fila(v_r, 3, 'detalle') like 'No se ató a su envase: Ese producto ya sale de adentro de éste%'
    and (select envase_id is null from public.producto where id = pg_temp.id('PRUEBA-IMP-CAJA')),
    'la caja saliendo de su propia pastilla no se frenó: ' || coalesce(pg_temp.fila(v_r, 3, 'detalle'), 'nada'));

  -- Dos cosas para mirar en la misma fila: las dos se dicen.
  v_r := pg_temp.importar(jsonb_build_array(
    jsonb_build_object('codigo', 'PRUEBA-IMP-BOLSA', 'codigo_barra', 'PRUEBA-BARRA-IMP'),
    jsonb_build_object('codigo', 'PRUEBA-IMP-COLLAR', 'codigo_barra', 'PRUEBA-BARRA-IMP',
                       'sale_de', 'NO-EXISTE-123', 'cantidad_por_envase', '2')));
  perform pg_temp.comprobar(
    pg_temp.fila(v_r, 2, 'detalle') like 'No se ató a su envase:%'
    and pg_temp.fila(v_r, 2, 'detalle') like '%el código de barra PRUEBA-BARRA-IMP ya es de otro producto.',
    'con dos avisos en la misma fila se perdió uno: ' || coalesce(pg_temp.fila(v_r, 2, 'detalle'), 'nada'));

  -- ─── 6. El aviso importado es el que pinta Stock ───
  reset role;
  insert into public.movimiento_stock (producto_id, tipo, cantidad, referencia_tipo)
    values (pg_temp.id('PRUEBA-IMP-BOLSA'), 'carga_inicial', 2, 'manual');
  perform pg_temp.comprobar(
    (select estado = 'critico' and umbral_critico = 2 from public.vista_stock
      where producto_id = pg_temp.id('PRUEBA-IMP-BOLSA')),
    'con dos bolsas y mínimo 2, Stock no la pinta crítica');

  -- ─── 7. El peso y el bulto ───
  v_r := pg_temp.importar(jsonb_build_array(
    jsonb_build_object('codigo', 'PRUEBA-IMP-ALIM', 'nombre_interno', 'PRUEBA ALIMENTO 15 KG',
                       'peso_kg', '15', 'unidades_por_bulto', '1'),
    jsonb_build_object('codigo', 'PRUEBA-IMP-PIPETA', 'unidades_por_bulto', '12')));
  perform pg_temp.comprobar(
    (select peso_kg = 15 and unidades_por_bulto = 1 from public.producto where id = pg_temp.id('PRUEBA-IMP-ALIM'))
    and (select peso_kg is null and unidades_por_bulto = 12 from public.producto where id = pg_temp.id('PRUEBA-IMP-PIPETA')),
    'el peso y las unidades por bulto no quedaron como en la planilla: ' || v_r::text);

  v_r := pg_temp.importar(jsonb_build_array(
    jsonb_build_object('codigo', 'PRUEBA-IMP-ALIM', 'precio_venta', '80000')));
  perform pg_temp.comprobar(
    (select peso_kg = 15 and unidades_por_bulto = 1 from public.producto where id = pg_temp.id('PRUEBA-IMP-ALIM')),
    'reimportar sin las columnas borró el peso o el bulto');

  v_r := pg_temp.importar(jsonb_build_array(
    jsonb_build_object('codigo', 'PRUEBA-IMP-ALIM', 'peso_kg', '0'),
    jsonb_build_object('codigo', 'PRUEBA-IMP-ALIM', 'unidades_por_bulto', '0'),
    jsonb_build_object('codigo', 'PRUEBA-IMP-NUEVO0', 'nombre_interno', 'PRUEBA PESO CERO', 'peso_kg', '0')));
  perform pg_temp.comprobar(
    pg_temp.fila(v_r, 1, 'detalle') = 'El peso tiene que ser más que cero.'
    and pg_temp.fila(v_r, 2, 'detalle') = 'Las unidades por bulto tienen que ser más que cero.'
    and pg_temp.fila(v_r, 3, 'resultado') = 'error'
    and pg_temp.id('PRUEBA-IMP-NUEVO0') is null
    and (select peso_kg = 15 and unidades_por_bulto = 1 from public.producto where id = pg_temp.id('PRUEBA-IMP-ALIM')),
    'un peso o un bulto en cero entró, o no dijo por qué: ' || v_r::text);

  -- Desde la ficha, la base frena lo mismo.
  begin
    update public.producto set peso_kg = 0 where id = pg_temp.id('PRUEBA-IMP-ALIM');
    perform pg_temp.comprobar(false, 'la base aceptó un peso cero desde la ficha');
  exception when check_violation then
    perform pg_temp.comprobar(sqlerrm like '%producto_peso_positivo%', 'el peso cero se frenó por otro motivo: ' || sqlerrm);
  end;

  -- ─── 8. Sin permiso para avisos, el producto entra y lo dice ───
  delete from public.rol_permiso rp using public.rol r
   where r.id = rp.rol_id and r.nombre = 'Administrador' and rp.permiso_clave = 'stock.configurar_umbrales';
  perform set_config('role', 'authenticated', true);
  v_r := pg_temp.importar(jsonb_build_array(
    jsonb_build_object('codigo', 'PRUEBA-IMP-SINPERMISO', 'nombre_interno', 'PRUEBA SIN PERMISO', 'stock_critico', '3')));
  perform pg_temp.comprobar(pg_temp.fila(v_r, 1, 'resultado') = 'creado'
    and pg_temp.fila(v_r, 1, 'detalle') like 'El aviso de stock no se cargó%'
    and pg_temp.aviso('PRUEBA-IMP-SINPERMISO') is null,
    'sin permiso para avisos, la fila no entró o no lo dijo: ' || v_r::text);

  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
