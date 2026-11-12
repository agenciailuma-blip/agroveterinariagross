/*
  ─────────────────────────────────────────────────────────────
  Varias listas de precios mayoristas

  Pedido del 12/11: no todos los mayoristas pagan lo mismo. En
  Mayorista → Lista de precios hay una pestaña por lista («Lista 1»,
  «Lista 2»…), cada una con sus productos y sus precios, y a cada
  cliente se le asigna la suya —de a uno o a varios juntos—.

  Hasta acá había una sola, la de configuración
  (mayorista.lista_precio_id). Esa queda como la predeterminada: el
  cliente sin lista, o con una que se dio de baja, compra con ella.

  La lista del cliente se guarda en cliente.lista_precio_id, que ya
  existía. La caja no la usa —el precio de mostrador sale del medio de
  pago—, así que asignarle una lista mayorista no cambia lo que paga en
  el mostrador.

  El catálogo del teléfono trae los productos de todas las listas, cada
  uno con su lista: así se arma sin señal el pedido de cualquier
  cliente con sus precios.
  ─────────────────────────────────────────────────────────────
*/

alter table public.lista_precio add column if not exists es_mayorista boolean not null default false;

update public.lista_precio set es_mayorista = true where id = app.lista_mayorista();

comment on column public.lista_precio.es_mayorista is
  'Una lista de la venta mayorista: aparece como pestaña en Mayorista → Lista de precios y se le asigna a los clientes mayoristas.';

/* La lista con la que compra un cliente mayorista. */
create or replace function app.lista_mayorista_de(p_cliente_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select l.id
    from public.cliente c
    join public.lista_precio l on l.id = c.lista_precio_id
    where c.id = p_cliente_id and l.es_mayorista and l.activo and l.eliminado_en is null
  ), app.lista_mayorista())
$$;

/* Una lista mayorista viva, o el error que corresponde. */
create or replace function app.lista_mayorista_valida(p_lista uuid)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_id uuid := coalesce(p_lista, app.lista_mayorista());
begin
  if v_id is null then
    raise exception 'No hay una lista mayorista configurada.';
  end if;
  if not exists (select 1 from public.lista_precio
                 where id = v_id and es_mayorista and activo and eliminado_en is null) then
    raise exception 'Esa lista mayorista no existe o se dio de baja.';
  end if;
  return v_id;
end;
$$;

-- ───────────────────────────────────────────────────────────────
-- Las listas
-- ───────────────────────────────────────────────────────────────

create or replace function public.mayorista_listas()
returns table (id uuid, nombre text, predeterminada boolean, productos bigint, clientes bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.puede_ver_mayorista() or app.tiene_permiso('productos.editar_precio')) then
    raise exception 'No tenés permiso para la venta mayorista.';
  end if;

  return query
  select l.id, l.nombre, l.id = app.lista_mayorista(),
         (select count(*) from public.producto_precio_lista p where p.lista_precio_id = l.id),
         (select count(*) from public.cliente c
           where c.mayorista and c.eliminado_en is null and app.lista_mayorista_de(c.id) = l.id)
  from public.lista_precio l
  where l.es_mayorista and l.activo and l.eliminado_en is null
  order by l.orden, l.nombre;
end;
$$;

/* Crear (sin id) o renombrar una lista mayorista. */
create or replace function public.mayorista_guardar_lista(p_id uuid, p_nombre text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_id     uuid;
begin
  if not app.tiene_permiso('productos.editar_precio') then
    raise exception 'No tenés permiso para cambiar precios.';
  end if;
  if v_nombre is null then
    raise exception 'Poné el nombre de la lista.';
  end if;
  if exists (select 1 from public.lista_precio
             where lower(nombre) = lower(v_nombre) and eliminado_en is null
               and id is distinct from p_id) then
    raise exception 'Ya hay una lista que se llama «%».', v_nombre;
  end if;

  if p_id is null then
    insert into public.lista_precio (nombre, descripcion, ajuste_porcentaje, es_predeterminada, orden, activo, es_mayorista)
    values (v_nombre, 'Lista de la venta mayorista. Sólo vale el precio cargado por producto.', 0, false,
            coalesce((select max(orden) from public.lista_precio), 0) + 1, true, true)
    returning id into v_id;
    return v_id;
  end if;

  update public.lista_precio set nombre = v_nombre
   where id = p_id and es_mayorista and eliminado_en is null
  returning id into v_id;
  if v_id is null then
    raise exception 'Esa lista mayorista no existe.';
  end if;
  return v_id;
end;
$$;

/*
  Dar de baja una lista. La predeterminada no: es la de los clientes sin
  lista. Sus clientes pasan a la predeterminada.
*/
create or replace function public.mayorista_baja_lista(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.tiene_permiso('productos.editar_precio') then
    raise exception 'No tenés permiso para cambiar precios.';
  end if;
  if p_id = app.lista_mayorista() then
    raise exception 'La lista predeterminada no se puede dar de baja: es la de los clientes sin lista.';
  end if;
  if not exists (select 1 from public.lista_precio where id = p_id and es_mayorista and eliminado_en is null) then
    raise exception 'Esa lista mayorista no existe.';
  end if;

  update public.cliente set lista_precio_id = app.lista_mayorista() where lista_precio_id = p_id;
  update public.lista_precio set eliminado_en = now(), activo = false where id = p_id;
end;
$$;

/* Asignar una lista a uno o varios clientes mayoristas. */
create or replace function public.mayorista_asignar_lista(p_clientes uuid[], p_lista uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lista   uuid;
  v_cuantos integer;
begin
  if not app.tiene_permiso('mayorista.clientes') then
    raise exception 'No tenés permiso para cambiar los clientes mayoristas.';
  end if;
  v_lista := app.lista_mayorista_valida(p_lista);
  if coalesce(array_length(p_clientes, 1), 0) = 0 then
    raise exception 'Elegí al menos un cliente.';
  end if;

  update public.cliente set lista_precio_id = v_lista
   where id = any(p_clientes) and mayorista and eliminado_en is null;
  get diagnostics v_cuantos = row_count;
  return v_cuantos;
end;
$$;

-- ───────────────────────────────────────────────────────────────
-- Los precios, ahora de una lista
-- ───────────────────────────────────────────────────────────────

drop function if exists public.mayorista_lista();
create function public.mayorista_lista(p_lista uuid default null)
returns table (producto_id uuid, codigo text, nombre text, precio numeric, precio_venta numeric, stock numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lista uuid;
begin
  if not app.tiene_permiso('productos.editar_precio') then
    raise exception 'No tenés permiso para cambiar precios.';
  end if;
  v_lista := app.lista_mayorista_valida(p_lista);

  return query
  select p.id, p.codigo, p.nombre_interno, ppl.precio, p.precio_venta, coalesce(s.cantidad, 0)
  from public.producto_precio_lista ppl
  join public.producto p on p.id = ppl.producto_id and p.eliminado_en is null
  left join public.stock_saldo s on s.producto_id = p.id
  where ppl.lista_precio_id = v_lista
  order by p.nombre_interno;
end;
$$;

drop function if exists public.mayorista_guardar_precio(uuid, numeric);
create function public.mayorista_guardar_precio(p_producto_id uuid, p_precio numeric, p_lista uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lista uuid;
begin
  if not app.tiene_permiso('productos.editar_precio') then
    raise exception 'No tenés permiso para cambiar precios.';
  end if;
  v_lista := app.lista_mayorista_valida(p_lista);

  if p_precio is null then
    delete from public.producto_precio_lista
    where producto_id = p_producto_id and lista_precio_id = v_lista;
    return;
  end if;
  if p_precio < 0 then
    raise exception 'El precio no puede ser negativo.';
  end if;

  insert into public.producto_precio_lista (producto_id, lista_precio_id, precio)
  values (p_producto_id, v_lista, round(p_precio, 2))
  on conflict (producto_id, lista_precio_id) do update set precio = excluded.precio;
end;
$$;

drop function if exists public.mayorista_guardar_precios(jsonb);
create function public.mayorista_guardar_precios(p_cambios jsonb, p_lista uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lista uuid;
  v_cambio jsonb;
  v_producto uuid;
  v_precio numeric;
  v_cuantos integer := 0;
begin
  if not app.tiene_permiso('productos.editar_precio') then
    raise exception 'No tenés permiso para cambiar precios.';
  end if;
  v_lista := app.lista_mayorista_valida(p_lista);
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'array' then
    raise exception 'La planilla no se entiende.';
  end if;

  for v_cambio in select value from jsonb_array_elements(p_cambios) loop
    v_producto := (v_cambio ->> 'producto_id')::uuid;
    v_precio := (v_cambio ->> 'precio')::numeric;

    if v_precio is null then
      delete from public.producto_precio_lista
      where producto_id = v_producto and lista_precio_id = v_lista;
    else
      if v_precio <= 0 then
        raise exception 'El precio tiene que ser mayor que cero.';
      end if;
      if not exists (select 1 from public.producto p where p.id = v_producto and p.eliminado_en is null and p.activo) then
        raise exception 'Uno de los productos ya no está en el catálogo.';
      end if;
      insert into public.producto_precio_lista (producto_id, lista_precio_id, precio)
      values (v_producto, v_lista, round(v_precio, 2))
      on conflict (producto_id, lista_precio_id) do update set precio = excluded.precio;
    end if;
    v_cuantos := v_cuantos + 1;
  end loop;
  return v_cuantos;
end;
$$;

-- ───────────────────────────────────────────────────────────────
-- El catálogo y los clientes del teléfono, con su lista
-- ───────────────────────────────────────────────────────────────

drop function if exists public.mayorista_catalogo();
create function public.mayorista_catalogo()
returns table (producto_id uuid, codigo text, nombre text, precio numeric, stock numeric,
               unidades_por_bulto numeric, lista_precio_id uuid, predeterminada boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ve_stock boolean := app.tiene_permiso('mayorista.ver_stock') or app.tiene_permiso('mayorista.atender');
begin
  if not app.puede_ver_mayorista() then
    raise exception 'No tenés permiso para la venta mayorista.';
  end if;

  return query
  select p.id, p.codigo, p.nombre_interno, ppl.precio,
         case when v_ve_stock then coalesce(s.cantidad, 0) end,
         p.unidades_por_bulto::numeric,
         l.id, l.id = app.lista_mayorista()
  from public.producto_precio_lista ppl
  join public.lista_precio l on l.id = ppl.lista_precio_id
                            and l.es_mayorista and l.activo and l.eliminado_en is null
  join public.producto p on p.id = ppl.producto_id
  left join public.stock_saldo s on s.producto_id = p.id
  where p.eliminado_en is null and p.activo
  order by p.nombre_interno;
end;
$$;

drop function if exists public.mayorista_clientes();
create function public.mayorista_clientes()
returns table (id uuid, nombre text, nombre_fantasia text, tipo_documento_id smallint, numero_documento text,
               condicion_iva_id smallint, calle text, numero text, localidad text, zona text, ruta text,
               telefono text, email text, latitud numeric, longitud numeric, cuenta_corriente boolean,
               saldo numeric, vencido numeric, vencimiento_mas_antiguo date,
               ultimo_pedido_en timestamptz, ultimo_pedido_numero bigint, pide_proforma boolean,
               lista_precio_id uuid, lista_nombre text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ve_deuda boolean := app.tiene_permiso('mayorista.ver_deuda') or app.tiene_permiso('mayorista.atender');
begin
  if not app.puede_ver_mayorista() then
    raise exception 'No tenés permiso para la venta mayorista.';
  end if;

  return query
  select c.id, c.nombre, c.nombre_fantasia, c.tipo_documento_id, c.numero_documento, c.condicion_iva_id,
         c.calle, c.numero, c.localidad, c.zona, c.ruta, c.telefono, c.email, c.latitud, c.longitud,
         c.cuenta_corriente,
         case when v_ve_deuda then coalesce(d.saldo, 0) end,
         case when v_ve_deuda then coalesce(d.vencido_30 + d.vencido_60 + d.vencido_mas_60, 0) end,
         case when v_ve_deuda then d.vencimiento_mas_antiguo end,
         u.recibido_en, u.numero,
         c.pide_proforma,
         lm.id, lm.nombre
  from public.cliente c
  left join public.vista_deuda_antiguedad d on d.cliente_id = c.id
  left join lateral (
    select pm.recibido_en, pm.numero from public.pedido_mayorista pm
    where pm.cliente_id = c.id and pm.estado <> 'cancelado'
    order by pm.recibido_en desc limit 1
  ) u on true
  left join public.lista_precio lm on lm.id = app.lista_mayorista_de(c.id)
  where c.mayorista and c.eliminado_en is null and c.activo
  order by c.ruta nulls last, c.localidad nulls last, c.nombre;
end;
$$;

-- ───────────────────────────────────────────────────────────────
-- El pedido y la factura toman la lista del cliente
-- ───────────────────────────────────────────────────────────────

do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.mayorista_enviar_pedido(uuid, uuid, jsonb, text, timestamptz)'::regprocedure);
  if position('v_lista      uuid := app.lista_mayorista();' in v_def) = 0 then
    raise exception 'mayorista_enviar_pedido cambió: revisar esta migración.';
  end if;
  v_def := replace(v_def, 'v_lista      uuid := app.lista_mayorista();', 'v_lista      uuid := app.lista_mayorista_de(p_cliente_id);');
  v_def := replace(v_def, 'ya no está en la lista mayorista. Actualizá el catálogo y armalo de nuevo.',
                          'no está en la lista de precios de este cliente. Actualizá el catálogo y armalo de nuevo.');
  execute v_def;

  v_def := pg_get_functiondef('public.mayorista_facturar_pedido(uuid, text)'::regprocedure);
  if position('app.lista_mayorista(), p_documentacion' in v_def) = 0 then
    raise exception 'mayorista_facturar_pedido cambió: revisar esta migración.';
  end if;
  v_def := replace(v_def, 'app.lista_mayorista(), p_documentacion', 'app.lista_mayorista_de(v_pedido.cliente_id), p_documentacion');
  execute v_def;
end;
$$;

revoke all on function public.mayorista_listas(), public.mayorista_guardar_lista(uuid, text),
  public.mayorista_baja_lista(uuid), public.mayorista_asignar_lista(uuid[], uuid),
  public.mayorista_lista(uuid), public.mayorista_guardar_precio(uuid, numeric, uuid),
  public.mayorista_guardar_precios(jsonb, uuid), public.mayorista_catalogo(), public.mayorista_clientes()
  from public, anon;
grant execute on function public.mayorista_listas(), public.mayorista_guardar_lista(uuid, text),
  public.mayorista_baja_lista(uuid), public.mayorista_asignar_lista(uuid[], uuid),
  public.mayorista_lista(uuid), public.mayorista_guardar_precio(uuid, numeric, uuid),
  public.mayorista_guardar_precios(jsonb, uuid), public.mayorista_catalogo(), public.mayorista_clientes()
  to authenticated;
