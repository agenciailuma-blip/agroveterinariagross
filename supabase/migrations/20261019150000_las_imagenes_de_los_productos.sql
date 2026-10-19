-- ═══════════════════════════════════════════════════════════════
-- Las imágenes de los productos, desde el sistema
--
-- Acordado con Zubu y Lucas el 19/10: las fotos se cargan en el sistema
-- —que es el origen de todo el catálogo— y la tienda las toma de la API.
-- Cargarlas en la tienda sería hacerlo dos veces, y la próxima vez que
-- cambie un producto quedarían distintas.
--
-- Cómo:
-- - El archivo va al almacenamiento de Supabase, en un depósito público:
--   la tienda las muestra con su dirección, sin pasar por la API.
-- - Llega convertido a WebP desde la pantalla, achicado a 1200 px del
--   lado más largo: lo que acordaron para la web, y lo que hace que mil
--   productos con dos fotos entren holgados en el plan gratis (1 GB).
-- - Una fila por foto, con su orden: la primera es la principal.
-- - El catálogo de la API las manda en «imagenes», con su dirección.
--   Agregar, quitar u ordenar una foto le cambia la fecha al producto,
--   así la tienda se entera en su próxima consulta.
-- ═══════════════════════════════════════════════════════════════

-- ─── El depósito ───

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('productos', 'productos', true, 2097152, array['image/webp'])
on conflict (id) do nothing;

/*
  Subir, reemplazar y borrar: sólo quien puede modificar productos. Leer
  no necesita política: el depósito es público para que la tienda las
  muestre, y lo que hay ahí son fotos de góndola.
*/
create policy productos_imagen_subir on storage.objects
  for insert to authenticated
  with check (bucket_id = 'productos' and app.tiene_permiso('productos.editar'));

create policy productos_imagen_reemplazar on storage.objects
  for update to authenticated
  using (bucket_id = 'productos' and app.tiene_permiso('productos.editar'))
  with check (bucket_id = 'productos' and app.tiene_permiso('productos.editar'));

create policy productos_imagen_borrar on storage.objects
  for delete to authenticated
  using (bucket_id = 'productos' and app.tiene_permiso('productos.editar'));

-- ─── Las fotos de cada producto ───

create table public.producto_imagen (
  id           uuid primary key default gen_random_uuid(),
  producto_id  uuid not null references public.producto(id) on delete cascade,
  -- La ruta dentro del depósito: «<producto>/<archivo>.webp».
  ruta         text not null unique,
  ancho        integer check (ancho > 0),
  alto         integer check (alto > 0),
  orden        integer not null default 0,
  creado_en    timestamptz not null default now(),
  creado_por   uuid references public.usuario(id),
  eliminado_en timestamptz
);

comment on table public.producto_imagen is
  'Las fotos de cada producto para la tienda online. La de menor orden es la principal. Los archivos están en el depósito «productos».';

create index producto_imagen_producto_idx on public.producto_imagen (producto_id, orden) where eliminado_en is null;

alter table public.producto_imagen enable row level security;

create policy producto_imagen_ver on public.producto_imagen
  for select to authenticated
  using (app.tiene_permiso('productos.ver'));

-- Se escribe sólo por las funciones de abajo.
revoke insert, update, delete on public.producto_imagen from anon, authenticated;

-- Cada cambio le mueve la fecha al producto: así le llega a la tienda.
create trigger producto_imagen_toca_producto
  after insert or update or delete on public.producto_imagen
  for each row execute function app.tocar_producto();

-- La dirección pública de las fotos, para armar la que va en el catálogo.
insert into public.configuracion (clave, valor, descripcion, grupo)
values ('tienda.url_imagenes',
        to_jsonb('https://ywggnhoifhtoncnxrodh.supabase.co/storage/v1/object/public/productos/'::text),
        'Dirección pública del depósito de fotos de productos. El catálogo de la API le suma la ruta de cada foto.',
        'tienda')
on conflict (clave) do nothing;

-- ─── Agregar, quitar y ordenar ───

/*
  Una foto se anota DESPUÉS de subir el archivo, y sólo si el archivo
  está: una fila sin archivo sería una foto rota en la tienda.
*/
create function public.agregar_imagen_producto(p_producto_id uuid, p_ruta text, p_ancho integer, p_alto integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid;
  v_maximo  constant integer := 8;
begin
  if not app.tiene_permiso('productos.editar') then
    raise exception 'No tenés permiso para modificar productos.';
  end if;
  if not exists (select 1 from public.producto where id = p_producto_id and eliminado_en is null) then
    raise exception 'El producto no existe o está dado de baja.';
  end if;
  if p_ruta is null or p_ruta not like p_producto_id::text || '/%' then
    raise exception 'La foto tiene que estar en la carpeta del producto.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'productos' and o.name = p_ruta) then
    raise exception 'El archivo de la foto no llegó al almacenamiento. Probá subirla de nuevo.';
  end if;
  if (select count(*) from public.producto_imagen
      where producto_id = p_producto_id and eliminado_en is null) >= v_maximo then
    raise exception 'Un producto puede tener hasta % fotos. Quitá alguna para sumar otra.', v_maximo;
  end if;

  insert into public.producto_imagen (producto_id, ruta, ancho, alto, orden, creado_por)
  values (p_producto_id, p_ruta, p_ancho, p_alto,
          coalesce((select max(orden) + 1 from public.producto_imagen
                    where producto_id = p_producto_id and eliminado_en is null), 0),
          app.usuario_actual_id())
  returning id into v_id;

  return v_id;
end;
$$;

/*
  Devuelve la ruta: el archivo lo borra la pantalla, con el permiso de
  quien quita. Borrar el registro del almacenamiento desde acá no borra
  el archivo de verdad.
*/
create function public.quitar_imagen_producto(p_imagen_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ruta text;
begin
  if not app.tiene_permiso('productos.editar') then
    raise exception 'No tenés permiso para modificar productos.';
  end if;
  update public.producto_imagen set eliminado_en = now()
  where id = p_imagen_id and eliminado_en is null
  returning ruta into v_ruta;
  return v_ruta;
end;
$$;

-- La primera de la lista queda principal.
create function public.ordenar_imagenes_producto(p_producto_id uuid, p_imagenes uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.tiene_permiso('productos.editar') then
    raise exception 'No tenés permiso para modificar productos.';
  end if;
  update public.producto_imagen pi
  set orden = x.posicion - 1
  from unnest(p_imagenes) with ordinality as x(id, posicion)
  where pi.id = x.id and pi.producto_id = p_producto_id and pi.eliminado_en is null
    and pi.orden is distinct from x.posicion - 1;
end;
$$;

revoke all on function public.agregar_imagen_producto(uuid, text, integer, integer) from public, anon;
revoke all on function public.quitar_imagen_producto(uuid) from public, anon;
revoke all on function public.ordenar_imagenes_producto(uuid, uuid[]) from public, anon;
grant execute on function public.agregar_imagen_producto(uuid, text, integer, integer) to authenticated, service_role;
grant execute on function public.quitar_imagen_producto(uuid) to authenticated, service_role;
grant execute on function public.ordenar_imagenes_producto(uuid, uuid[]) to authenticated, service_role;

-- ─── El catálogo de la API: las fotos de cada producto ───

create or replace function app.catalogo_de_canal(p_canal_id uuid, p_desde text, p_limite integer, p_hasta timestamptz)
returns json
language plpgsql
stable
set search_path = ''
as $$
declare
  v_limite    integer := coalesce(p_limite, 500);
  v_desde_t   timestamptz;
  v_desde_i   uuid;
  v_completo  boolean := true;
  v_marca     json;
  v_canal_act timestamptz;
  v_lista_act timestamptz;
  v_cantidad  integer;
  v_filas     json;
  v_ultimo_t  timestamptz;
  v_ultimo_i  uuid;
  v_imagenes  text := coalesce((select c.valor #>> '{}' from public.configuracion c where c.clave = 'tienda.url_imagenes'), '');
begin
  if v_limite < 1 or v_limite > 1000 then
    raise exception using errcode = 'PT400', message = 'limite_invalido';
  end if;

  if p_desde is not null then
    begin
      v_marca := convert_from(decode(
        translate(p_desde, '-_', '+/') || repeat('=', (4 - length(p_desde) % 4) % 4),
        'base64'), 'UTF8')::json;
      v_desde_t  := (v_marca ->> 't')::timestamptz;
      v_desde_i  := (v_marca ->> 'i')::uuid;
      v_completo := coalesce((v_marca ->> 'c')::boolean, false);
    exception when others then
      v_desde_t := null;
    end;
    if v_desde_t is null or v_desde_i is null then
      raise exception using errcode = 'PT400', message = 'desde_invalido';
    end if;
  end if;

  select c.actualizado_en, coalesce(l.actualizado_en, c.actualizado_en)
  into v_canal_act, v_lista_act
  from public.canal c
  left join public.lista_precio l on l.id = c.lista_precio_id
  where c.id = p_canal_id;

  with candidatos as (
    select pc.*,
           case when pc.motivo is null
                then greatest(pc.cambio_producto, coalesce(pc.cambio_stock, pc.cambio_producto),
                              v_canal_act, v_lista_act)
                else pc.cambio_producto
           end as cambio
    from app.productos_de_canal(p_canal_id) pc
  ), pagina as (
    select *, row_number() over (order by cambio, producto_id) as n
    from candidatos
    where cambio < p_hasta
      and (v_desde_t is null or (cambio, producto_id) > (v_desde_t, v_desde_i))
      and (not v_completo or motivo is null)
    order by cambio, producto_id
    limit v_limite + 1
  )
  select
    count(*)::integer,
    coalesce(json_agg(
      case when x.motivo is null then json_build_object(
        'id',              p.id,
        'publicado',       true,
        'solo_consultar',  coalesce(cp.solo_consultar, false),
        'codigo',          p.codigo,
        'codigos_barra',   (select coalesce(json_agg(cb.codigo order by cb.es_principal desc, cb.codigo), '[]'::json)
                            from public.producto_codigo_barra cb
                            where cb.producto_id = p.id and cb.eliminado_en is null),
        'nombre',          btrim(p.nombre_publico),
        'descripcion',     nullif(btrim(p.descripcion), ''),
        'precio',          trim_scale(x.precio),
        'unidad',          p.unidad_medida,
        'stock',           trim_scale(x.stock),
        'requiere_receta', p.requiere_receta,
        'categoria',       case when cat.eliminado_en is null then cat.slug end,
        'marca',           case when m.eliminado_en is null then m.slug end,
        'presentacion',    case when pr.eliminado_en is null then pr.slug end,
        'animales',        (select coalesce(json_agg(a.slug order by a.orden, a.slug), '[]'::json)
                            from public.producto_animal pa
                            join public.animal a on a.id = pa.animal_id
                            where pa.producto_id = p.id and a.eliminado_en is null),
        'etapas_de_vida',  (select coalesce(json_agg(e.slug order by e.orden, e.slug), '[]'::json)
                            from public.producto_etapa_vida pe
                            join public.etapa_vida e on e.id = pe.etapa_vida_id
                            where pe.producto_id = p.id and e.eliminado_en is null),
        'imagenes',        (select coalesce(json_agg(json_build_object(
                                      'url',   v_imagenes || pi.ruta,
                                      'ancho', pi.ancho,
                                      'alto',  pi.alto) order by pi.orden, pi.creado_en), '[]'::json)
                            from public.producto_imagen pi
                            where pi.producto_id = p.id and pi.eliminado_en is null),
        'actualizado_en',  app.iso_utc(x.cambio))
      else json_build_object(
        'id',             p.id,
        'publicado',      false,
        'actualizado_en', app.iso_utc(x.cambio))
      end
      order by x.n) filter (where x.n <= v_limite), '[]'::json),
    max(x.cambio) filter (where x.n = v_limite),
    (max(x.producto_id::text) filter (where x.n = v_limite))::uuid
  into v_cantidad, v_filas, v_ultimo_t, v_ultimo_i
  from pagina x
  join public.producto p             on p.id = x.producto_id
  left join public.canal_producto cp on cp.canal_id = p_canal_id and cp.producto_id = p.id
  left join public.categoria cat     on cat.id = p.categoria_id
  left join public.marca m           on m.id = p.marca_id
  left join public.presentacion pr   on pr.id = p.presentacion_id;

  /*
    Si quedan más, la marca es la última fila entregada: la página
    siguiente arranca justo después. Si no quedan, la marca es la de
    agua, y ya no recorre el catálogo entero: desde ahí, sólo cambios.
  */
  return json_build_object(
    'canal',       (select c.nombre from public.canal c where c.id = p_canal_id),
    'generado_en', app.iso_utc(now()),
    'frescura',    app.frescura_de_canal(p_canal_id),
    'productos',   v_filas,
    'hay_mas',     v_cantidad > v_limite,
    'siguiente',   case when v_cantidad > v_limite
                        then app.marca_codificar(v_ultimo_t, v_ultimo_i, v_completo)
                        else app.marca_codificar(p_hasta, '00000000-0000-0000-0000-000000000000', false)
                   end);
end;
$$;
