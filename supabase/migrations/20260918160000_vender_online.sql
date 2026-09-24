-- ═══════════════════════════════════════════════════════════════
-- «VENDER ONLINE» — lo que se prende desde Productos
--
-- La API de la tienda (20260918140000) publica sólo lo que tiene
-- prendido «Vender online». Esto es lo que lo prende y lo apaga desde la
-- aplicación: producto por producto en la ficha, a un grupo marcado, o
-- a una categoría o marca entera. Y lo que elige la lista de precios de
-- la tienda.
--
-- Todo pasa por funciones y no por escrituras directas a canal_producto:
-- la RLS de esa tabla pedía «configurar umbrales», que no tiene nada que
-- ver con decidir qué se vende en la web. Prender un producto es
-- modificar el producto, y pide ese permiso.
-- ═══════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────
-- 1. El interruptor arranca apagado
--
-- En V1-A la fila de canal_producto era una excepción («no publicar
-- este») y por eso nacía en true. Ahora es la decisión de vender, y una
-- fila que se crea sólo para ponerle colchón a un producto no puede
-- publicarlo de paso.
-- ───────────────────────────────────────────────────────────────
alter table public.canal_producto alter column publicar set default false;

comment on column public.canal_producto.publicar is
  '«Vender online»: el producto se publica en este canal si está en true y cumple las condiciones (app.motivo_para_no_publicar).';


-- ───────────────────────────────────────────────────────────────
-- 2. El canal de la tienda
--
-- Hoy hay uno. Si mañana hay dos tiendas, las pantallas van a tener que
-- elegir cuál; hasta entonces, el más viejo de los activos.
-- ───────────────────────────────────────────────────────────────
create or replace function app.canal_de_la_tienda()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.canal c
  where c.tipo = 'tienda' and c.activo and c.eliminado_en is null
  order by c.creado_en
  limit 1
$$;

revoke all on function app.canal_de_la_tienda() from public;


-- ───────────────────────────────────────────────────────────────
-- 3. Cómo está cada producto en la tienda
--
-- Lo lee la ficha para decir, en una línea, qué ve la tienda: «se vende
-- online, la tienda ve 3», o «prendido, pero no sale: le falta el nombre
-- público». Sale de la MISMA cuenta que la API (app.productos_de_canal):
-- si la ficha calculara por su lado, algún día diría «se vende» de un
-- producto que la tienda no ve.
--
-- SECURITY DEFINER con el permiso controlado adentro: así el stock que
-- se muestra es el real aunque quien mira no tenga permiso de stock, y
-- nadie sin permiso de ver productos lee nada.
-- ───────────────────────────────────────────────────────────────
create or replace function public.estado_en_tienda(p_productos uuid[])
returns table (
  producto_id    uuid,
  vender_online  boolean,
  colchon_propio numeric,
  colchon_canal  numeric,
  stock          numeric,
  precio         numeric,
  motivo         text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_canal uuid := app.canal_de_la_tienda();
begin
  if not app.tiene_permiso('productos.ver') then
    raise exception 'No tenés permiso para ver productos.';
  end if;
  if v_canal is null then
    return;
  end if;

  return query
    select pc.producto_id, pc.vender_online, cp.colchon, c.colchon_default,
           pc.stock, pc.precio, pc.motivo
    from app.productos_de_canal(v_canal) pc
    join public.canal c on c.id = v_canal
    left join public.canal_producto cp on cp.canal_id = v_canal and cp.producto_id = pc.producto_id
    where pc.producto_id = any(p_productos);
end;
$$;


-- ───────────────────────────────────────────────────────────────
-- 4. Prender y apagar
--
-- Devuelve cuántos cambiaron de verdad: prender lo que ya estaba
-- prendido no cuenta, y el aviso de la pantalla dice lo que pasó.
--
-- Apagar no crea filas: un producto que nunca se prendió ya está
-- apagado, y una fila de más le movería la fecha y le mandaría a la
-- tienda una baja de algo que nunca tuvo.
-- ───────────────────────────────────────────────────────────────
create or replace function public.definir_venta_online(p_productos uuid[], p_vender boolean)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_canal     uuid := app.canal_de_la_tienda();
  v_cambiados integer;
begin
  if not app.tiene_permiso('productos.editar') then
    raise exception 'No tenés permiso para modificar productos.';
  end if;
  if v_canal is null then
    raise exception 'No hay un canal de tienda online activo.';
  end if;
  if p_vender is null then
    raise exception 'Hay que decir si se vende online o no.';
  end if;

  if p_vender then
    with cambiados as (
      insert into public.canal_producto (canal_id, producto_id, publicar)
      select v_canal, p.id, true
      from public.producto p
      where p.id = any(p_productos) and p.eliminado_en is null
      on conflict (canal_id, producto_id) do update set publicar = true
        where not public.canal_producto.publicar
      returning 1
    )
    select count(*) into v_cambiados from cambiados;
  else
    update public.canal_producto set publicar = false
    where canal_id = v_canal and producto_id = any(p_productos) and publicar;
    get diagnostics v_cambiados = row_count;
  end if;

  return v_cambiados;
end;
$$;

/*
  Una categoría o una marca entera, en la base y no desde la pantalla:
  la lista de Productos muestra de a 100, y «marcar todos» ahí marcaría
  los 100 que se ven de una categoría de 800.

  Es una acción de una vez, no una regla (decidido el 18/09): prende los
  que hay hoy. Un producto que se cargue mañana en esa categoría se
  prende en su ficha. Una regla haría aparecer productos en la web sin
  que nadie lo decida.

  Toma exactamente lo que muestra la lista con ese filtro —los que no
  están dados de baja, de esa categoría y esa marca—, para que la
  cantidad que se confirma sea la que se ve.
*/
create or replace function public.definir_venta_online_por_clasificacion(
  p_categoria_id uuid,
  p_marca_id     uuid,
  p_vender       boolean
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_categoria_id is null and p_marca_id is null then
    raise exception 'Elegí una categoría o una marca: sin eso se prenderían todos los productos.';
  end if;

  return public.definir_venta_online(
    array(
      select p.id from public.producto p
      where p.eliminado_en is null
        and (p_categoria_id is null or p.categoria_id = p_categoria_id)
        and (p_marca_id is null or p.marca_id = p_marca_id)),
    p_vender);
end;
$$;


-- ───────────────────────────────────────────────────────────────
-- 5. El colchón de un producto
--
-- null = usa el del canal. Ponerle colchón a un producto apagado no lo
-- prende: la fila nace con publicar en false.
-- ───────────────────────────────────────────────────────────────
create or replace function public.definir_colchon_tienda(p_producto_id uuid, p_colchon numeric)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_canal uuid := app.canal_de_la_tienda();
begin
  if not app.tiene_permiso('productos.editar') then
    raise exception 'No tenés permiso para modificar productos.';
  end if;
  if v_canal is null then
    raise exception 'No hay un canal de tienda online activo.';
  end if;
  if p_colchon is not null and p_colchon < 0 then
    raise exception 'El colchón no puede ser negativo: son unidades que la tienda no ve.';
  end if;

  if p_colchon is null then
    update public.canal_producto set colchon = null
    where canal_id = v_canal and producto_id = p_producto_id and colchon is not null;
  else
    insert into public.canal_producto (canal_id, producto_id, publicar, colchon)
    values (v_canal, p_producto_id, false, p_colchon)
    on conflict (canal_id, producto_id) do update set colchon = excluded.colchon
      where public.canal_producto.colchon is distinct from excluded.colchon;
  end if;
end;
$$;


-- ───────────────────────────────────────────────────────────────
-- 6. La lista de precios de la tienda
--
-- Pide el mismo permiso que el resto de Precios. Cambiarla mueve la
-- fecha del canal, y con eso todos los productos publicados le llegan a
-- la tienda en la consulta siguiente con el precio nuevo.
-- ───────────────────────────────────────────────────────────────
create or replace function public.elegir_lista_de_la_tienda(p_lista_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_canal uuid := app.canal_de_la_tienda();
begin
  if not app.tiene_permiso('configuracion.gestionar') then
    raise exception 'No tenés permiso para administrar precios.';
  end if;
  if v_canal is null then
    raise exception 'No hay un canal de tienda online activo.';
  end if;
  if not exists (select 1 from public.lista_precio l
                 where l.id = p_lista_id and l.activo and l.eliminado_en is null) then
    raise exception 'Esa lista no existe o está dada de baja.';
  end if;

  update public.canal set lista_precio_id = p_lista_id
  where id = v_canal and lista_precio_id is distinct from p_lista_id;
end;
$$;


-- ───────────────────────────────────────────────────────────────
-- Permisos
--
-- Supabase le da ejecución a anon y a authenticated sobre cada función
-- nueva de public. Estas son de la aplicación: sólo authenticated, y
-- cada una controla su permiso adentro.
-- ───────────────────────────────────────────────────────────────
revoke all on function public.estado_en_tienda(uuid[])                                  from public, anon;
revoke all on function public.definir_venta_online(uuid[], boolean)                     from public, anon;
revoke all on function public.definir_venta_online_por_clasificacion(uuid, uuid, boolean) from public, anon;
revoke all on function public.definir_colchon_tienda(uuid, numeric)                     from public, anon;
revoke all on function public.elegir_lista_de_la_tienda(uuid)                           from public, anon;

grant execute on function public.estado_en_tienda(uuid[])                                  to authenticated;
grant execute on function public.definir_venta_online(uuid[], boolean)                     to authenticated;
grant execute on function public.definir_venta_online_por_clasificacion(uuid, uuid, boolean) to authenticated;
grant execute on function public.definir_colchon_tienda(uuid, numeric)                     to authenticated;
grant execute on function public.elegir_lista_de_la_tienda(uuid)                           to authenticated;
