-- ═══════════════════════════════════════════════════════════════
-- PRUEBAS DE LO QUE QUEDA POR DEVOLVER, CONTRA LA BASE REAL
--
-- Se corre entera y termina siempre con un error a propósito que deshace
-- todo.
--   · «OK: n comprobaciones»  → anduvo todo.
--   · «FALLA: …»              → la primera que no anduvo, y por qué.
--
-- Lee vista_comprobante_estado como un Administrador de verdad —con las
-- políticas de la base— y compara contra los datos que hay. Lo único
-- que crea es una devolución parcial de una unidad, que se deshace con
-- el error del final. Hace falta al menos una factura devuelta entera
-- (la de la venta de prueba CAJA1-000033, del 15/10) y una cobrada sin
-- devolver con un renglón de dos o más.
-- ═══════════════════════════════════════════════════════════════

create function pg_temp.comprobar(p_ok boolean, p_que text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FALLA: %', p_que; end if;
  perform set_config('prueba.n', (coalesce(nullif(current_setting('prueba.n', true), ''), '0')::integer + 1)::text, true);
end $$;

do $$
declare
  v_auth uuid;
  n_entera int; n_entera_mal int; n_entera_sin_etiqueta int;
  n_sin_devolver int; n_sin_devolver_mal int;
  n_parcial int; n_parcial_mal int;
  v_factura uuid; v_venta uuid; v_linea uuid;
  fila record;
begin
  select u.auth_user_id into v_auth
  from public.usuario u
  join public.rol r on r.id = u.rol_id
  where r.nombre = 'Administrador' and u.auth_user_id is not null
  limit 1;
  perform pg_temp.comprobar(v_auth is not null, 'hace falta un Administrador con cuenta');

  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- 2 a 4. Devuelta entera: la venta está anulada y la factura tiene su nota.
  select count(*),
         count(*) filter (where e.queda_por_devolver),
         count(*) filter (where not (e.tiene_nota_credito and not e.queda_por_devolver))
    into n_entera, n_entera_mal, n_entera_sin_etiqueta
  from public.vista_comprobante_estado e
  join public.venta v on v.id = e.venta_id
  where e.familia = 'factura' and e.estado = 'autorizado'
    and v.estado = 'anulada' and e.tiene_nota_credito;
  perform pg_temp.comprobar(n_entera > 0, 'hace falta una factura devuelta entera para probar');
  perform pg_temp.comprobar(n_entera_mal = 0,
    format('%s facturas devueltas enteras todavía ofrecen devolver por partes', n_entera_mal));
  perform pg_temp.comprobar(n_entera_sin_etiqueta = 0,
    format('%s facturas devueltas enteras no se muestran como «Devuelta»', n_entera_sin_etiqueta));

  -- 5 y 6. Cobrada y sin ninguna devolución: queda todo por devolver.
  select count(*), count(*) filter (where not e.queda_por_devolver)
    into n_sin_devolver, n_sin_devolver_mal
  from public.vista_comprobante_estado e
  join public.venta v on v.id = e.venta_id
  where e.familia = 'factura' and e.estado = 'autorizado'
    and v.estado = 'cobrada' and not e.tiene_nota_credito and not e.tiene_devoluciones_parciales;
  perform pg_temp.comprobar(n_sin_devolver > 0, 'hace falta una factura cobrada sin devolver para probar');
  perform pg_temp.comprobar(n_sin_devolver_mal = 0,
    format('%s facturas sin devolver dejaron de ofrecer la devolución por partes', n_sin_devolver_mal));

  /*
    7 a 9. Una devuelta a medias sigue ofreciendo devolver por partes.

    Los datos de hoy no alcanzan: la única con devoluciones parciales ya
    volvió entera, de a partes. Se arma una acá —una unidad de un renglón
    de dos— y se deshace con el resto. Sin este caso, un arreglo que
    cortara el botón a toda factura con nota de crédito pasaba igual.
  */
  select e.id, vd.venta_id, vd.venta_linea_id into v_factura, v_venta, v_linea
  from public.vista_comprobante_estado e
  join public.venta v on v.id = e.venta_id
  join public.vista_venta_devolvible vd on vd.venta_id = v.id
  where e.familia = 'factura' and e.estado = 'autorizado' and v.estado = 'cobrada'
    and not e.tiene_nota_credito and vd.disponible >= 2
  limit 1;
  perform pg_temp.comprobar(v_linea is not null, 'hace falta una venta cobrada con un renglón de dos o más');

  perform public.devolver_lineas_de_venta(
    v_venta, jsonb_build_array(jsonb_build_object('venta_linea_id', v_linea, 'cantidad', 1)),
    'Prueba del sistema: lo que queda por devolver');

  select * into fila from public.vista_comprobante_estado where id = v_factura;
  perform pg_temp.comprobar(fila.tiene_devoluciones_parciales and fila.tiene_nota_credito,
    'la devolución parcial de prueba quedó anotada, con su nota de crédito');
  perform pg_temp.comprobar(fila.queda_por_devolver,
    'una factura devuelta a medias sigue ofreciendo devolver por partes');

  -- 10. Y con todas las devoluciones parciales, lo que dice la vista es lo que queda de verdad.
  select count(*),
         count(*) filter (where e.queda_por_devolver is distinct from exists (
           select 1 from public.vista_venta_devolvible vd
            where vd.venta_id = e.venta_id and vd.disponible > 0))
    into n_parcial, n_parcial_mal
  from public.vista_comprobante_estado e
  join public.venta v on v.id = e.venta_id
  where e.familia = 'factura' and v.estado = 'cobrada' and e.tiene_devoluciones_parciales;
  perform pg_temp.comprobar(n_parcial_mal = 0,
    format('%s de %s facturas con devoluciones parciales dicen mal lo que queda', n_parcial_mal, n_parcial));

  perform set_config('role', 'postgres', true);
  raise exception 'OK: % comprobaciones', current_setting('prueba.n');
end $$;
