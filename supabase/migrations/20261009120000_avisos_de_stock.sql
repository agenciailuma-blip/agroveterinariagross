-- ═══════════════════════════════════════════════════════════════
-- Los avisos de stock, en sus tres niveles, con pantalla propia
--
-- Hueco del alcance de V1-A encontrado el 05/10: el §4 promete
-- umbrales «configurables en tres niveles: general, por categoría y
-- por producto», y el punto 11 de terminado pide que uno por categoría
-- dispare una alerta. La base los usaba desde agosto, pero sólo el del
-- producto tenía dónde cargarse —su ficha—. El general vivía en
-- Configuración sin pantalla, y el de categoría, sin ninguna.
--
-- Tres cosas:
--
-- 1. Quitar un aviso deja de ser un borrado. Las PC bajan «lo que
--    cambió desde la última vez», y una fila borrada no cambió: no se
--    entera nadie. Un mostrador seguía pintando Crítico con un aviso que
--    ya no existía. Ahora se marca `eliminado_en`, como los productos y
--    los clientes, y la marca viaja. Sigue habiendo una sola fila por
--    producto y por categoría: volver a ponerlo la revive.
--
-- 2. El aviso de una categoría se carga con la misma forma que el del
--    producto: una función que corre como quien llama, y el permiso lo
--    decide la RLS de `umbral_stock` (`stock.configurar_umbrales`).
--
-- 3. El general pasa por una función propia. Vive en `configuracion`,
--    que pide `configuracion.gestionar`, y el Encargado configura
--    avisos pero no Configuración: sin esto, podría poner el de cada
--    producto y el de cada categoría, pero no el que rige para todos.
-- ═══════════════════════════════════════════════════════════════

alter table public.umbral_stock add column eliminado_en timestamptz;

comment on column public.umbral_stock.eliminado_en is
  'Aviso quitado: el producto o la categoría vuelve a heredar. No se borra para que la baja viaje a las PC, que bajan lo que cambió.';

-- ── El del producto: quitar marca, no borra ─────────────────────
create or replace function public.definir_umbral_producto(
  p_producto_id uuid,
  p_bajo        numeric default null,
  p_critico     numeric default null
) returns void
language plpgsql
as $$
begin
  -- Sin valores, el producto vuelve a heredar el de su categoría o el
  -- general. No es lo mismo que poner cero: cero es un aviso válido
  -- que quiere decir «avisame recién cuando no quede nada».
  if p_bajo is null and p_critico is null then
    update public.umbral_stock
       set eliminado_en = now()
     where producto_id = p_producto_id and ambito = 'producto' and eliminado_en is null;
    return;
  end if;

  insert into public.umbral_stock (ambito, producto_id, bajo, critico)
  values ('producto', p_producto_id, coalesce(p_bajo, 0), coalesce(p_critico, 0))
  on conflict (producto_id) where ambito = 'producto'
  do update set bajo = excluded.bajo, critico = excluded.critico, eliminado_en = null;
end $$;

-- ── El de la categoría, igual ───────────────────────────────────
create or replace function public.definir_umbral_categoria(
  p_categoria_id uuid,
  p_bajo         numeric default null,
  p_critico      numeric default null
) returns void
language plpgsql
as $$
begin
  if p_bajo is null and p_critico is null then
    update public.umbral_stock
       set eliminado_en = now()
     where categoria_id = p_categoria_id and ambito = 'categoria' and eliminado_en is null;
    return;
  end if;

  insert into public.umbral_stock (ambito, categoria_id, bajo, critico)
  values ('categoria', p_categoria_id, coalesce(p_bajo, 0), coalesce(p_critico, 0))
  on conflict (categoria_id) where ambito = 'categoria'
  do update set bajo = excluded.bajo, critico = excluded.critico, eliminado_en = null;
end $$;

comment on function public.definir_umbral_categoria(uuid, numeric, numeric) is
  'Define o quita el aviso de stock de una categoría. Sin valores, lo quita y sus productos vuelven al general. Corre como quien llama: el permiso lo exige la RLS de umbral_stock.';

revoke all on function public.definir_umbral_categoria(uuid, numeric, numeric) from public;
grant execute on function public.definir_umbral_categoria(uuid, numeric, numeric) to authenticated;

-- ── El general ──────────────────────────────────────────────────
/*
  Con permiso de dueño porque escribe en `configuracion`, y por eso
  controla el permiso a mano: el de avisos, no el de Configuración.
  Los dos valores van juntos, en una sola llamada: de a uno, poner
  bajo 2 cuando el crítico es 3 se frenaría a mitad de camino.
*/
create or replace function public.definir_umbral_general(p_bajo numeric, p_critico numeric)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not app.tiene_permiso('stock.configurar_umbrales') then
    raise exception 'No tenés permiso para cambiar los avisos de stock.';
  end if;
  if p_bajo is null or p_critico is null or p_bajo < 0 or p_critico < 0 then
    raise exception 'El aviso general necesita los dos números, y no pueden ser negativos.';
  end if;
  if p_critico > p_bajo then
    raise exception 'El nivel crítico tiene que ser menor o igual que el nivel bajo.';
  end if;

  insert into public.configuracion (clave, valor)
  values ('stock.umbral_bajo_general', to_jsonb(p_bajo)),
         ('stock.umbral_critico_general', to_jsonb(p_critico))
  on conflict (clave) do update set valor = excluded.valor;
end;
$$;

comment on function public.definir_umbral_general(numeric, numeric) is
  'El aviso de stock que rige para todo producto sin uno propio ni de su categoría. Pide stock.configurar_umbrales, no configuracion.gestionar.';

revoke all on function public.definir_umbral_general(numeric, numeric) from public;
grant execute on function public.definir_umbral_general(numeric, numeric) to authenticated;

-- ── Lo que ve la pantalla ───────────────────────────────────────
/*
  Cada categoría con cuántos productos tiene y su aviso, si tiene. Es
  la tabla de la pestaña Avisos: «a cuántos les va a pegar» se ve antes
  de cambiarlo, como en el aumento de precios.
*/
create or replace function public.avisos_por_categoria()
returns table (
  categoria_id uuid,
  nombre text,
  productos bigint,
  bajo numeric,
  critico numeric
)
language sql
stable
security invoker
set search_path to ''
as $$
  select c.id, c.nombre,
         (select count(*) from public.producto p
           where p.categoria_id = c.id and p.eliminado_en is null),
         u.bajo, u.critico
    from public.categoria c
    left join public.umbral_stock u
      on u.categoria_id = c.id and u.ambito = 'categoria' and u.eliminado_en is null
   where c.eliminado_en is null
   order by c.orden, c.nombre;
$$;

grant execute on function public.avisos_por_categoria() to authenticated;

-- ── vista_stock: un aviso quitado no cuenta ─────────────────────
-- La misma de la caja y la suelta (08/10), con `eliminado_en is null`
-- en los dos avisos.
create or replace view public.vista_stock
with (security_invoker = true) as
select p.id as producto_id,
    p.codigo,
    p.nombre_interno,
    p.nombre_publico,
    p.precio_venta,
    p.costo,
    p.margen_sobre_costo,
    case
        when p.costo is null or p.costo <= 0::numeric then null::numeric
        else round((p.precio_venta / p.costo - 1::numeric) * 100::numeric, 2)
    end as margen_real,
    case
        when p.costo is null or p.costo <= 0::numeric or p.margen_sobre_costo is null then null::numeric
        else round((p.precio_venta / p.costo - 1::numeric) * 100::numeric - p.margen_sobre_costo, 2)
    end as desvio_margen,
    case
        when p.costo is null or p.margen_sobre_costo is null then null::numeric
        else round(p.costo * (1::numeric + p.margen_sobre_costo / 100::numeric), 2)
    end as precio_sugerido,
    p.unidad_medida,
    p.alicuota_iva_id,
    p.categoria_id,
    p.marca_id,
    p.activo,
    p.revisado_en,
    p.es_producto_veterinario,
    p.es_fitosanitario,
    coalesce(s.cantidad, 0::numeric) as cantidad,
    s.actualizado_en as stock_actualizado_en,
    u.bajo as umbral_bajo,
    u.critico as umbral_critico,
    case
        when d.disponible < 0::numeric then 'sobrevendido'::text
        when d.disponible <= u.critico then 'critico'::text
        when d.disponible <= u.bajo then 'bajo'::text
        else 'ok'::text
    end as estado,
    p.envase_id,
    p.cantidad_por_envase,
    d.disponible
   from producto p
     left join stock_saldo s on s.producto_id = p.id
     left join umbral_stock up
       on up.producto_id = p.id and up.ambito = 'producto'::text and up.eliminado_en is null
     left join umbral_stock uc
       on uc.categoria_id = p.categoria_id and uc.ambito = 'categoria'::text and uc.eliminado_en is null
     cross join lateral (
       select coalesce(up.bajo, uc.bajo, (select (c.valor #>> '{}'::text[])::numeric
                                            from configuracion c
                                           where c.clave = 'stock.umbral_bajo_general'::text)) as bajo,
              coalesce(up.critico, uc.critico, (select (c.valor #>> '{}'::text[])::numeric
                                                  from configuracion c
                                                 where c.clave = 'stock.umbral_critico_general'::text)) as critico
     ) u
     cross join lateral (
       select case when p.envase_id is null then coalesce(s.cantidad, 0::numeric)
                   else app.disponible_abriendo(p.id) end as disponible
     ) d
  where p.eliminado_en is null;
