-- ═══════════════════════════════════════════════════════════════
-- LA API DE LA TIENDA ONLINE — primera etapa: leer el catálogo
--
-- Zubu arma la tienda y necesita leer los productos: nombre público,
-- precio, clasificaciones y stock. La puerta es una Edge Function
-- (api-tienda); lo que decide qué se ve está acá, en la base, por dos
-- razones:
--
--   · La función entra con la llave pública del sistema, que sin un
--     usuario no lee ninguna tabla. Lo único que puede hacer es llamar
--     a api_tienda_catalogo y api_tienda_clasificaciones. Si la puerta
--     tuviera un error, no tiene con qué llegar a los costos.
--
--   · Los campos que salen están escritos a mano en este archivo. No se
--     arman "con lo que tenga la tabla": un campo nuevo en producto no
--     aparece en la tienda hasta que alguien lo agregue acá a propósito.
--
-- Diseño aprobado el 18/09. Para Zubu: docs/api-tienda.md.
-- ═══════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────
-- 1. La lista de precios de cada canal
--
-- La tienda puede cobrar distinto que el mostrador: se elige una lista
-- —la de contado, u otra creada para la web— y la tienda recibe el
-- precio de esa lista. Arranca con la de contado, que es la del precio
-- que se carga en la ficha.
-- ───────────────────────────────────────────────────────────────
alter table public.canal
  add column lista_precio_id uuid references public.lista_precio(id);

comment on column public.canal.lista_precio_id is
  'Lista con la que se le publican los precios a este canal. Sin lista, el precio de contado de la ficha.';

update public.canal
set lista_precio_id = (
  select lp.id from public.lista_precio lp
  where lp.es_predeterminada and lp.activo and lp.eliminado_en is null
  limit 1)
where tipo = 'tienda';

/*
  Una lista que usa un canal no se puede dar de baja.

  Si se pudiera, la tienda seguiría publicando con una lista que ya no
  existe, y no hay una respuesta buena para eso: caer al precio de
  contado cambia los precios de la web sin que nadie lo decida, y no
  publicar nada vacía la tienda. Se frena antes, con un mensaje que
  dice qué hacer.
*/
create or replace function app.lista_en_uso_por_un_canal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (not new.activo or new.eliminado_en is not null)
     and old.activo and old.eliminado_en is null
     and exists (
       select 1 from public.canal c
       where c.lista_precio_id = new.id and c.activo and c.eliminado_en is null)
  then
    raise exception 'La lista "%" es la que usa la tienda online. Elegí otra lista para la tienda antes de darla de baja.', new.nombre;
  end if;
  return new;
end;
$$;

create trigger lista_precio_en_uso_por_un_canal
  before update on public.lista_precio
  for each row execute function app.lista_en_uso_por_un_canal();


-- ───────────────────────────────────────────────────────────────
-- 2. Las claves de acceso
--
-- Zubu no es un usuario del sistema: no tiene PIN, ni permisos, ni
-- cuenta para entrar a la aplicación. Tiene una clave atada a un canal,
-- y el canal decide qué stock ve y con qué colchón.
--
-- Se guarda la huella (SHA-256), nunca la clave: como una contraseña,
-- si alguien copiara la base no podría sacar la clave de acá. Por eso
-- una clave perdida no se recupera; se hace otra.
--
-- Sin políticas de RLS a propósito: nadie la lee desde la aplicación.
-- La leen sólo las funciones de este archivo.
-- ───────────────────────────────────────────────────────────────
create table public.clave_api (
  id            uuid primary key default gen_random_uuid(),
  canal_id      uuid not null references public.canal(id),
  nombre        text not null check (btrim(nombre) <> ''),
  -- el comienzo de la clave, para reconocerla sin tenerla
  prefijo       text not null,
  huella        bytea not null unique,
  creada_en     timestamptz not null default now(),
  ultimo_uso_en timestamptz,
  anulada_en    timestamptz
);

comment on table public.clave_api is
  'Claves de los sistemas de afuera que leen la API (hoy, la tienda de Zubu). Se guarda la huella SHA-256, nunca la clave.';
comment on column public.clave_api.ultimo_uso_en is
  'Para contestar "¿Zubu está consultando?" sin preguntarles. Se anota como mucho una vez por minuto.';

alter table public.clave_api enable row level security;
revoke all on public.clave_api from anon, authenticated;


-- ───────────────────────────────────────────────────────────────
-- 3. La fecha del producto se mueve con lo que cuelga de él
--
-- La tienda pide "lo que cambió desde tal momento", y eso se mira en
-- producto.actualizado_en. Pero cambiarle a un producto los animales,
-- las etapas, los códigos de barra, el interruptor de la tienda o el
-- precio fijo de una lista no tocaba esa fecha: la tienda nunca se
-- enteraba. Peor con los animales y las etapas, que no tienen fecha
-- propia y la ficha los guarda borrando y volviendo a escribir.
--
-- El único efecto sobre el local es que las terminales vuelven a bajar
-- ese producto en la sincronización siguiente, que es lo que ya pasa
-- cada vez que se guarda desde la ficha.
--
-- La condición actualizado_en < now() hace que, dentro de una misma
-- transacción, el producto se toque una sola vez: la importación de
-- miles de productos con sus códigos no paga una escritura por código.
-- ───────────────────────────────────────────────────────────────
create or replace function app.tocar_producto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    update public.producto set actualizado_en = now()
    where id = new.producto_id and actualizado_en < now();
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.producto_id is distinct from new.producto_id) then
    update public.producto set actualizado_en = now()
    where id = old.producto_id and actualizado_en < now();
  end if;
  return null;
end;
$$;

comment on function app.tocar_producto() is
  'Mueve la fecha del producto cuando cambia algo que cuelga de él. Sin esto, la tienda no se entera de que le cambiaron los animales o los códigos.';

create trigger producto_animal_toca_producto
  after insert or update or delete on public.producto_animal
  for each row execute function app.tocar_producto();
create trigger producto_etapa_vida_toca_producto
  after insert or update or delete on public.producto_etapa_vida
  for each row execute function app.tocar_producto();
create trigger producto_codigo_barra_toca_producto
  after insert or update or delete on public.producto_codigo_barra
  for each row execute function app.tocar_producto();
create trigger canal_producto_toca_producto
  after insert or update or delete on public.canal_producto
  for each row execute function app.tocar_producto();
create trigger producto_precio_lista_toca_producto
  after insert or update or delete on public.producto_precio_lista
  for each row execute function app.tocar_producto();


-- ───────────────────────────────────────────────────────────────
-- 4. Qué se publica
--
-- "Vender online" es la decisión: nada sale hasta que alguien lo
-- prende (canal_producto.publicar). Las condiciones son el control: un
-- producto prendido sale sólo si además está activo, tiene nombre
-- público y precio.
--
-- Devuelve el motivo por el que NO sale, o null si sale. Es texto y no
-- un sí/no porque la ficha lo va a mostrar tal cual: "Prendido, pero no
-- sale: le falta el nombre público" evita que alguien busque en la web
-- un producto que nunca va a aparecer.
--
-- Sin nombre público no sale, aunque la vista vieja de V1-A usaba el
-- interno en ese caso: en la tienda se leería "ALIM BAL TOTALMAX PERRO
-- 20KG".
--
-- Los fitosanitarios no salen hasta que Gross lo decida (18/09): la ley
-- XVI-144 de Misiones pide receta agronómica para venderlos y la tienda
-- no tiene cómo pedirla.
-- ───────────────────────────────────────────────────────────────
create or replace function app.motivo_para_no_publicar(
  p_vender           boolean,
  p_activo           boolean,
  p_eliminado_en     timestamptz,
  p_nombre_publico   text,
  p_precio           numeric,
  p_es_fitosanitario boolean
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_eliminado_en is not null                  then 'Está dado de baja'
    when not coalesce(p_vender, false)               then 'No está marcado para vender online'
    when not coalesce(p_activo, false)               then 'Está inactivo'
    when nullif(btrim(p_nombre_publico), '') is null then 'Le falta el nombre público'
    when coalesce(p_precio, 0) <= 0                  then 'No tiene precio'
    when coalesce(p_es_fitosanitario, false)         then 'Es fitosanitario: no se vende online hasta que Gross lo decida'
  end
$$;


-- ───────────────────────────────────────────────────────────────
-- 5. Cada producto visto desde un canal
--
-- Un solo lugar para las cuentas: el precio con la lista del canal, el
-- stock con el colchón y si se publica. Lo usa la API, y lo va a usar
-- la ficha para mostrar el estado: si fueran dos cuentas, la ficha
-- diría "se vende online" de un producto que la tienda no ve.
--
-- EL PRECIO es el de public.calcular_precio, que es la referencia: el
-- precio fijo del producto en esa lista si lo tiene, si no el de
-- contado con el ajuste de la lista, redondeado como dice Configuración.
--
-- EL STOCK es lo que hay menos el colchón, y nunca negativo. El colchón
-- son unidades que existen pero la tienda no ve, para que una venta del
-- mostrador y una de la web en el mismo minuto no se lleven la misma
-- bolsa. Sale el del producto si tiene, si no el del canal.
-- ───────────────────────────────────────────────────────────────
create or replace function app.productos_de_canal(p_canal_id uuid)
returns table (
  producto_id     uuid,
  vender_online   boolean,
  colchon         numeric,
  stock           numeric,
  precio          numeric,
  motivo          text,
  cambio_producto timestamptz,
  cambio_stock    timestamptz
)
language sql
stable
set search_path = ''
as $$
  with redondeo as (
    select coalesce(
      (select (cf.valor #>> '{}')::integer from public.configuracion cf
       where cf.clave = 'precios.redondeo_decimales'),
      2) as decimales
  ), calculo as (
    select
      p.id,
      coalesce(cp.publicar, false)            as vender,
      coalesce(cp.colchon, c.colchon_default) as colchon,
      greatest(0, coalesce(s.cantidad, 0) - coalesce(cp.colchon, c.colchon_default)) as stock,
      round(
        coalesce(ppl.precio, p.precio_venta * (1 + coalesce(l.ajuste_porcentaje, 0) / 100)),
        r.decimales)                          as precio,
      p.activo,
      p.eliminado_en,
      p.nombre_publico,
      p.es_fitosanitario,
      p.actualizado_en,
      s.actualizado_en                        as stock_actualizado_en
    from public.canal c
    cross join redondeo r
    cross join public.producto p
    left join public.lista_precio          l   on l.id = c.lista_precio_id
    left join public.producto_precio_lista ppl on ppl.producto_id = p.id
                                              and ppl.lista_precio_id = c.lista_precio_id
    left join public.stock_saldo           s   on s.producto_id = p.id
    left join public.canal_producto        cp  on cp.canal_id = c.id and cp.producto_id = p.id
    where c.id = p_canal_id
  )
  select
    id, vender, colchon, stock, precio,
    app.motivo_para_no_publicar(vender, activo, eliminado_en, nombre_publico, precio, es_fitosanitario),
    actualizado_en,
    stock_actualizado_en
  from calculo
$$;

comment on function app.productos_de_canal(uuid) is
  'Cada producto visto desde un canal: precio con la lista del canal, stock con el colchón, y el motivo por el que no se publica (null si se publica).';


-- ───────────────────────────────────────────────────────────────
-- 6. La marca de agua
--
-- El problema: la tienda pide "lo que cambió desde la marca", y la
-- marca que se le devuelve es un momento. Una fecha de modificación es
-- el momento en que EMPEZÓ la transacción que escribió, no el momento
-- en que terminó. Si Zubu consulta mientras alguien está guardando un
-- precio, ese precio todavía no se ve pero va a quedar con una fecha
-- anterior a la marca: la consulta siguiente pregunta "desde la marca"
-- y el precio nuevo no aparece nunca. La tienda vendería al precio
-- viejo hasta que el producto vuelva a cambiar, que puede ser en
-- semanas.
--
-- La solución: la marca nunca pasa por delante de una transacción
-- abierta. Es el comienzo de la más vieja que esté en curso (o ahora,
-- si no hay ninguna). Todo lo que se escriba con fecha anterior ya
-- terminó y se ve; lo que está en curso queda del lado de adelante y
-- sale en la consulta siguiente. A cambio, a veces un producto llega
-- dos veces, y eso no hace daño.
--
-- No se filtra por las que ya escribieron: una transacción puede leer
-- un rato y escribir al final con la fecha de su comienzo.
--
-- Las abiertas hace más de 15 minutos no cuentan: ninguna escritura
-- legítima del sistema dura tanto (la API corta a los segundos), y una
-- sesión colgada frenaría la marca para siempre. Frenarla no rompe
-- nada —la tienda recibiría de más—, pero para siempre sí molesta.
--
-- Lee pg_stat_activity: por eso es SECURITY DEFINER, que la corre como
-- el dueño, que puede ver las transacciones de todas las sesiones.
-- ───────────────────────────────────────────────────────────────
create or replace function app.marca_de_agua()
returns timestamptz
language sql
volatile
security definer
set search_path = ''
as $$
  select least(
    now(),
    (select min(a.xact_start)
     from pg_catalog.pg_stat_activity a
     where a.datname = pg_catalog.current_database()
       and a.pid <> pg_catalog.pg_backend_pid()
       and a.xact_start is not null
       and a.xact_start > now() - interval '15 minutes'))
$$;

comment on function app.marca_de_agua() is
  'El momento hasta el que la tienda puede dar por visto todo: el comienzo de la transacción abierta más vieja, o ahora. Evita que un cambio que se está guardando quede detrás de la marca.';


-- ───────────────────────────────────────────────────────────────
-- 7. La frescura, para la tienda
--
-- No es la de Inicio (frescura_stock), y es a propósito. Aquella toma
-- la terminal que hace más tiempo que no sincroniza: es la regla
-- correcta para avisarle al encargado, pero una PC apagada la deja
-- trabada, y la tienda vería "no confiable" todo el día.
--
-- Acá: el stock es confiable si ALGUNA terminal del local sincronizó
-- dentro de la tolerancia del canal y NINGUNA tiene un error de
-- sincronización sin resolver. Alcanza porque cuando se corta internet
-- se corta para todas a la vez; si una sola PC lo pierde, sus ventas le
-- llegan a la Caja por la red del local y la Caja las sube; y una PC
-- con internet que no puede subir lo suyo deja anotado el error.
--
-- De noche, con el local cerrado, dice "no confiable": el stock está
-- bien, pero el sistema no lo puede probar. Qué hace la tienda con eso
-- lo deciden Gross y Zubu.
-- ───────────────────────────────────────────────────────────────
create or replace function app.iso_utc(p timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(p at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$$;

create or replace function app.frescura_de_canal(p_canal_id uuid)
returns json
language sql
stable
set search_path = ''
as $$
  with local as (
    select max(t.ultima_sincronizacion)                        as ultima,
           count(*) filter (where t.ultimo_error_sync is not null) as con_error
    from public.terminal t
    where t.tipo in ('caja', 'mostrador') and t.activo and t.eliminado_en is null
  )
  select json_build_object(
    'ultima_conexion_del_local', app.iso_utc(l.ultima),
    'minutos_sin_conexion',      floor(extract(epoch from now() - l.ultima) / 60)::integer,
    'tolerancia_minutos',        c.tolerancia_minutos,
    'confiable',                 coalesce(
                                   l.ultima > now() - make_interval(mins => c.tolerancia_minutos)
                                   and l.con_error = 0,
                                   false))
  from local l
  cross join public.canal c
  where c.id = p_canal_id
$$;


-- ───────────────────────────────────────────────────────────────
-- 8. El catálogo
--
-- Sin "desde" trae el catálogo entero, sólo lo publicado. Con "desde"
-- trae lo que cambió, y lo que dejó de publicarse viaja como
-- {id, publicado: false} para que la tienda lo baje, sin nombre ni
-- precio: lo que no está a la venta no se muestra, ni siquiera ahí.
--
-- "desde" es opaca para Zubu: un momento y un id, en base64. El id
-- desempata productos que cambiaron en el mismo instante —una
-- importación los deja a todos con la misma fecha— y hace que la
-- página siguiente arranque justo después de la última, sin saltear ni
-- repetir. Lleva además si se está recorriendo el catálogo entero, para
-- que las páginas 2 en adelante sigan sin traer lo no publicado.
--
-- Qué fecha cuenta como el cambio de un producto publicado: la suya, la
-- de su stock, la del canal (colchón, lista elegida) y la de la lista.
-- De uno no publicado, sólo la suya: si no, cada venta de un producto
-- que no está en la tienda le mandaría a Zubu un aviso de baja.
-- ───────────────────────────────────────────────────────────────
create or replace function app.marca_codificar(p_momento timestamptz, p_id uuid, p_completo boolean)
returns text
language sql
stable
set search_path = ''
as $$
  select rtrim(translate(replace(encode(convert_to(
    json_build_object('t', app.iso_utc(p_momento), 'i', p_id, 'c', p_completo)::text,
    'UTF8'), 'base64'), E'\n', ''), '+/', '-_'), '=')
$$;

create or replace function app.catalogo_de_canal(
  p_canal_id uuid,
  p_desde    text,
  p_limite   integer,
  p_hasta    timestamptz
)
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
  join public.producto p           on p.id = x.producto_id
  left join public.categoria cat   on cat.id = p.categoria_id
  left join public.marca m         on m.id = p.marca_id
  left join public.presentacion pr on pr.id = p.presentacion_id;

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


-- ───────────────────────────────────────────────────────────────
-- 9. Las clasificaciones
--
-- Las mismas que la tienda, sin traducir: se mandan con el slug, que es
-- como las nombra la tienda, y el nombre para mostrar. Los productos
-- las citan por slug, así que un cambio de nombre acá no obliga a
-- reenviar ningún producto.
-- ───────────────────────────────────────────────────────────────
create or replace function app.clasificaciones_de_tienda()
returns json
language sql
stable
set search_path = ''
as $$
  select json_build_object(
    'generado_en', app.iso_utc(now()),
    'categorias', (
      select coalesce(json_agg(json_build_object(
               'slug', c.slug, 'nombre', c.nombre, 'padre', pc.slug, 'orden', c.orden, 'activo', c.activo)
             order by c.orden, c.nombre), '[]'::json)
      from public.categoria c
      left join public.categoria pc on pc.id = c.padre_id
      where c.eliminado_en is null),
    'marcas', (
      select coalesce(json_agg(json_build_object(
               'slug', m.slug, 'nombre', m.nombre, 'activo', m.activo)
             order by m.nombre), '[]'::json)
      from public.marca m where m.eliminado_en is null),
    'animales', (
      select coalesce(json_agg(json_build_object(
               'slug', a.slug, 'nombre', a.nombre, 'orden', a.orden, 'activo', a.activo)
             order by a.orden, a.nombre), '[]'::json)
      from public.animal a where a.eliminado_en is null),
    'etapas_de_vida', (
      select coalesce(json_agg(json_build_object(
               'slug', e.slug, 'nombre', e.nombre, 'orden', e.orden, 'activo', e.activo)
             order by e.orden, e.nombre), '[]'::json)
      from public.etapa_vida e where e.eliminado_en is null),
    'presentaciones', (
      select coalesce(json_agg(json_build_object(
               'slug', pr.slug, 'nombre', pr.nombre, 'activo', pr.activo)
             order by pr.nombre), '[]'::json)
      from public.presentacion pr where pr.eliminado_en is null))
$$;


-- ───────────────────────────────────────────────────────────────
-- 10. La clave: de quién es y qué canal ve
--
-- El error lleva el código PT401: PostgREST lo traduce a un 401, así
-- que la respuesta es la correcta aunque alguien llame a la base sin
-- pasar por la puerta. No dice si la clave no existe o si fue anulada:
-- a quien prueba claves no hay que contarle cuál estuvo cerca.
-- ───────────────────────────────────────────────────────────────
create or replace function app.canal_de_la_clave(p_clave text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_clave_id uuid;
  v_canal_id uuid;
begin
  select k.id, k.canal_id into v_clave_id, v_canal_id
  from public.clave_api k
  join public.canal c on c.id = k.canal_id
  where k.huella = pg_catalog.sha256(convert_to(coalesce(p_clave, ''), 'UTF8'))
    and k.anulada_en is null
    and c.activo and c.eliminado_en is null;

  if v_clave_id is null then
    raise exception using errcode = 'PT401', message = 'clave_invalida';
  end if;

  update public.clave_api set ultimo_uso_en = now()
  where id = v_clave_id
    and (ultimo_uso_en is null or ultimo_uso_en < now() - interval '1 minute');

  return v_canal_id;
end;
$$;


-- ───────────────────────────────────────────────────────────────
-- 11. Las dos consultas que ve la puerta
--
-- Son las únicas funciones que puede ejecutar la llave pública (anon).
-- SECURITY DEFINER porque anon no lee ninguna tabla: lo que puede leer
-- es exactamente lo que estas funciones devuelven, y nada más.
-- ───────────────────────────────────────────────────────────────
create or replace function public.api_tienda_catalogo(
  p_clave  text,
  p_desde  text    default null,
  p_limite integer default 500
)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_canal uuid;
  v_hasta timestamptz;
begin
  v_canal := app.canal_de_la_clave(p_clave);
  -- La marca de agua se toma ANTES de leer el catálogo: así lo que
  -- terminó antes de la marca ya se ve en la lectura que sigue.
  v_hasta := app.marca_de_agua();
  return app.catalogo_de_canal(v_canal, p_desde, p_limite, v_hasta);
end;
$$;

comment on function public.api_tienda_catalogo(text, text, integer) is
  'API de la tienda: el catálogo del canal de la clave. Sin desde, entero; con desde, lo que cambió. Ver docs/api-tienda.md.';

create or replace function public.api_tienda_clasificaciones(p_clave text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.canal_de_la_clave(p_clave);
  return app.clasificaciones_de_tienda();
end;
$$;

comment on function public.api_tienda_clasificaciones(text) is
  'API de la tienda: categorías, marcas, animales, etapas de vida y presentaciones. Ver docs/api-tienda.md.';

revoke all on function public.api_tienda_catalogo(text, text, integer) from public;
revoke all on function public.api_tienda_clasificaciones(text)         from public;
grant execute on function public.api_tienda_catalogo(text, text, integer) to anon;
grant execute on function public.api_tienda_clasificaciones(text)         to anon;

-- Las funciones internas no las llama nadie de afuera.
revoke all on function app.motivo_para_no_publicar(boolean, boolean, timestamptz, text, numeric, boolean) from public;
revoke all on function app.productos_de_canal(uuid)                      from public;
revoke all on function app.marca_de_agua()                               from public;
revoke all on function app.frescura_de_canal(uuid)                       from public;
revoke all on function app.marca_codificar(timestamptz, uuid, boolean)   from public;
revoke all on function app.catalogo_de_canal(uuid, text, integer, timestamptz) from public;
revoke all on function app.clasificaciones_de_tienda()                   from public;
revoke all on function app.canal_de_la_clave(text)                       from public;


-- ───────────────────────────────────────────────────────────────
-- 12. Crear y anular claves
--
-- Sólo nosotros, desde la base: están en el esquema app, que la API no
-- publica, y sin permiso para nadie. La clave se ve una sola vez, al
-- crearla; después sólo queda la huella.
--
-- Para cambiar la clave sin cortar la tienda: se crea una nueva, Zubu
-- la cambia, y recién ahí se anula la vieja.
-- ───────────────────────────────────────────────────────────────
create or replace function app.crear_clave_api(p_canal_id uuid, p_nombre text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_clave text;
begin
  if not exists (select 1 from public.canal c
                 where c.id = p_canal_id and c.activo and c.eliminado_en is null) then
    raise exception 'El canal no existe o está inactivo.';
  end if;
  if nullif(btrim(p_nombre), '') is null then
    raise exception 'La clave necesita un nombre que diga de quién es.';
  end if;

  -- 32 bytes al azar: no se adivina probando.
  v_clave := 'gross_' || rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');

  insert into public.clave_api (canal_id, nombre, prefijo, huella)
  values (p_canal_id, btrim(p_nombre), left(v_clave, 12),
          pg_catalog.sha256(convert_to(v_clave, 'UTF8')));

  return v_clave;
end;
$$;

create or replace function app.anular_clave_api(p_prefijo text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_anuladas integer;
begin
  update public.clave_api set anulada_en = now()
  where prefijo = p_prefijo and anulada_en is null;
  get diagnostics v_anuladas = row_count;
  if v_anuladas = 0 then
    raise exception 'No hay una clave vigente que empiece con %.', p_prefijo;
  end if;
  return v_anuladas;
end;
$$;

revoke all on function app.crear_clave_api(uuid, text) from public;
revoke all on function app.anular_clave_api(text)      from public;


-- ───────────────────────────────────────────────────────────────
-- 13. La vista vieja
--
-- vista_stock_canal es de V1-A y nadie la usa. Se deja, pero con un
-- aviso: publica todo lo que no esté apagado y usa el nombre interno
-- cuando falta el público, que es justo lo que se decidió no hacer.
-- ───────────────────────────────────────────────────────────────
comment on view public.vista_stock_canal is
  'De V1-A, sin uso. NO es lo que ve la tienda: eso sale de app.productos_de_canal, con el interruptor Vender online y sus condiciones.';
