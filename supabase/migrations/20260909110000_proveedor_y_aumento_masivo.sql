-- ═══════════════════════════════════════════════════════════════
-- PROVEEDOR, Y EL AUMENTO DE PRECIOS QUE LO JUSTIFICA
--
-- Puntos 5 y 4 de Lucas, decididos para V1-A el 04/09 con el riesgo
-- de fecha asumido por el.
--
-- ─── POR QUE ESTO ANTES QUE EL RESTO DE COMPRAS ───
--
-- El punto 4 es el que duele todos los dias: cuando un laboratorio
-- aumenta, hoy hay que corregir producto por producto sobre 2.261.
-- Lucas mando la foto de la pantalla que quiere: elegis proveedor,
-- ponés +7%, listo.
--
-- Todo el resto del modulo de compras —ordenes, recepcion de
-- mercaderia, costos historicos— queda en V1-B, donde estaba. Aca
-- entra SOLO lo que hace falta para poder aumentar precios por
-- proveedor.
--
-- ─── EL PROVEEDOR ES MINIMO A PROPOSITO ───
--
-- Nombre, CUIT, contacto. No lleva cuenta corriente, ni saldo, ni
-- condiciones de pago: todo eso pertenece al modulo de compras y
-- meterlo ahora seria construir la mitad de V1-B sin sus pantallas.
--
-- Se copia la forma de `cliente` en lo fiscal —tipo y numero de
-- documento, condicion de IVA con los codigos de ARCA— porque el dia
-- que se carguen facturas de compra, el proveedor ya va a tener lo
-- que esa factura necesita del emisor.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.proveedor (
  id             uuid primary key default gen_random_uuid(),
  codigo         text,
  nombre         text not null check (length(trim(nombre)) > 0),
  nombre_fantasia text,

  -- Fiscal, con los codigos de ARCA como en todo el sistema.
  condicion_iva_id  smallint references public.condicion_iva_receptor(id),
  tipo_documento_id smallint references public.tipo_documento(id),
  numero_documento  text,

  -- Contacto. Un solo bloque: al proveedor se lo llama, no se le
  -- factura, asi que no hace falta el domicilio desarmado en calle y
  -- numero como en el cliente.
  domicilio    text,
  localidad    text,
  provincia    text,
  telefono     text,
  email        text,
  contacto     text,

  observaciones text,
  activo        boolean not null default true,

  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  -- Nada se borra: baja logica, como en todo lo demas.
  eliminado_en   timestamptz
);

-- Un CUIT no puede estar dos veces entre los vigentes. Excluye los
-- dados de baja: si se da de baja y se vuelve a dar de alta, el numero
-- tiene que poder reutilizarse.
create unique index if not exists proveedor_documento_unico
  on public.proveedor (numero_documento)
  where numero_documento is not null and eliminado_en is null;

create index if not exists proveedor_nombre_idx on public.proveedor (nombre)
  where eliminado_en is null;

create trigger proveedor_actualizado_en
  before update on public.proveedor
  for each row execute function app.set_actualizado_en();

comment on table public.proveedor is
  'Proveedor minimo: lo necesario para agrupar productos y aumentarles el precio de una. Las compras, ordenes y cuenta corriente del proveedor son de V1-B.';

-- ───────────────────────────────────────────────────────────────
-- El producto sabe de quien viene
--
-- Anulable: hoy ningun producto tiene proveedor cargado y el catalogo
-- funciona igual. Se va completando a medida que se usa.
--
-- `on delete set null` y no cascade: dar de baja un proveedor no puede
-- llevarse productos puestos.
-- ───────────────────────────────────────────────────────────────
alter table public.producto
  add column if not exists proveedor_id uuid references public.proveedor(id) on delete set null;

create index if not exists producto_proveedor_idx on public.producto (proveedor_id)
  where proveedor_id is not null;

comment on column public.producto.proveedor_id is
  'A quien se le compra. Es el eje del aumento masivo de precios (punto 4 de Lucas).';

-- ───────────────────────────────────────────────────────────────
-- Permisos
-- ───────────────────────────────────────────────────────────────
insert into public.permiso (clave, grupo, descripcion, orden) values
  ('proveedores.ver',      'proveedores', 'Ver los proveedores',                     10),
  ('proveedores.gestionar','proveedores', 'Crear, editar y dar de baja proveedores', 20),
  ('productos.aumentar_precios', 'productos', 'Aumentar precios en masa por proveedor o rubro', 60)
on conflict (clave) do nothing;

-- Administrador y Encargado. El aumento masivo toca el precio de
-- cientos de productos de una: no es para el mostrador.
insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, p.clave
from public.rol r
cross join (values ('proveedores.ver'), ('proveedores.gestionar'), ('productos.aumentar_precios')) as p(clave)
where r.nombre in ('Administrador', 'Encargado')
on conflict do nothing;

-- El vendedor y el cajero ven proveedores para saber a quien pedirle,
-- pero no los tocan.
insert into public.rol_permiso (rol_id, permiso_clave)
select r.id, 'proveedores.ver'
from public.rol r where r.nombre in ('Vendedor', 'Cajero')
on conflict do nothing;

-- ───────────────────────────────────────────────────────────────
-- RLS
-- ───────────────────────────────────────────────────────────────
alter table public.proveedor enable row level security;

drop policy if exists proveedor_select on public.proveedor;
create policy proveedor_select on public.proveedor
  for select to authenticated using ((select app.tiene_permiso('proveedores.ver')));

drop policy if exists proveedor_insert on public.proveedor;
create policy proveedor_insert on public.proveedor
  for insert to authenticated with check ((select app.tiene_permiso('proveedores.gestionar')));

drop policy if exists proveedor_update on public.proveedor;
create policy proveedor_update on public.proveedor
  for update to authenticated using ((select app.tiene_permiso('proveedores.gestionar')))
  with check ((select app.tiene_permiso('proveedores.gestionar')));

grant select on public.proveedor to authenticated;
grant insert, update on public.proveedor to authenticated;

-- ───────────────────────────────────────────────────────────────
-- El aumento masivo — punto 4
--
-- ─── POR QUE UNA FUNCION Y NO UN UPDATE DESDE EL NAVEGADOR ───
--
-- Tres razones, y la tercera es la que decide:
--
-- 1. Son cientos de filas. Un update en el servidor es una vuelta;
--    desde el navegador serian cientos.
-- 2. Es todo o nada. A mitad de camino el catalogo queda con la mitad
--    de los precios aumentados y nadie sabe cual mitad.
-- 3. HAY QUE PODER DESHACERLO. Un +70% tipeado donde iba +7% arruina
--    el mostrador entero, y el error se descubre con el primer cliente.
--    Por eso cada aumento se registra —quien, cuando, a que le pego y
--    con que porcentaje— y existe `revertir_aumento()`.
--
-- Sin lo tercero esto seria una funcion peligrosa. Con eso, es una
-- funcion que se puede usar sin miedo, que es la unica forma de que
-- Lucas la use de verdad.
-- ───────────────────────────────────────────────────────────────
create table if not exists public.aumento_precio (
  id            uuid primary key default gen_random_uuid(),
  -- A que le pego. Los dos pueden ser nulos = todo el catalogo.
  proveedor_id  uuid references public.proveedor(id) on delete set null,
  categoria_id  uuid references public.categoria(id) on delete set null,
  porcentaje    numeric(6,2) not null check (porcentaje <> 0),
  -- Sobre que se aplico: el precio de venta, el costo, o los dos.
  alcance       text not null default 'precio'
                  check (alcance in ('precio', 'costo', 'ambos')),
  productos     integer not null default 0,
  motivo        text,
  aplicado_por  uuid references public.usuario(id) on delete set null,
  aplicado_en   timestamptz not null default now(),
  revertido_en  timestamptz,
  revertido_por uuid references public.usuario(id) on delete set null
);

comment on table public.aumento_precio is
  'Cada aumento masivo, para poder deshacerlo. Un +70% donde iba +7% se descubre con el primer cliente, y sin esto no habria forma de volver atras.';

-- El detalle: que precio tenia cada producto antes. Es lo que permite
-- revertir EXACTAMENTE, y no aplicando el porcentaje inverso —que no
-- da lo mismo por el redondeo y deja centavos corridos para siempre.
create table if not exists public.aumento_precio_linea (
  id                uuid primary key default gen_random_uuid(),
  aumento_id        uuid not null references public.aumento_precio(id) on delete cascade,
  producto_id       uuid not null references public.producto(id) on delete cascade,
  precio_anterior   numeric(14,4),
  precio_nuevo      numeric(14,4),
  costo_anterior    numeric(14,4),
  costo_nuevo       numeric(14,4)
);

create index if not exists aumento_precio_linea_idx
  on public.aumento_precio_linea (aumento_id);

alter table public.aumento_precio       enable row level security;
alter table public.aumento_precio_linea enable row level security;

drop policy if exists aumento_precio_select on public.aumento_precio;
create policy aumento_precio_select on public.aumento_precio
  for select to authenticated using ((select app.tiene_permiso('productos.ver')));

drop policy if exists aumento_precio_linea_select on public.aumento_precio_linea;
create policy aumento_precio_linea_select on public.aumento_precio_linea
  for select to authenticated using ((select app.tiene_permiso('productos.ver')));

grant select on public.aumento_precio, public.aumento_precio_linea to authenticated;

-- ─── Cuantos productos toca, sin tocarlos ───
-- Para que la pantalla pueda decir "esto le pega a 148 productos"
-- ANTES de aplicar. Un aumento masivo a ciegas no se aplica: se
-- adivina.
create or replace function public.contar_productos_para_aumento(
  p_proveedor_id uuid default null,
  p_categoria_id uuid default null
)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer
  from public.producto p
  where p.eliminado_en is null
    and p.activo
    and (p_proveedor_id is null or p.proveedor_id = p_proveedor_id)
    and (p_categoria_id is null or p.categoria_id = p_categoria_id);
$$;

grant execute on function public.contar_productos_para_aumento(uuid, uuid) to authenticated;

-- ─── Aplicar ───
-- ⚠️ SECURITY DEFINER, y no es un descuido.
--
-- Primero se escribio SECURITY INVOKER y fallo: no hay politica de
-- insert sobre `aumento_precio`. La tentacion es agregarla, y seria un
-- error — con insert directo, cualquiera con el permiso podria fabricar
-- un registro de "revertido" sin revertir nada, o borrar el rastro de un
-- aumento. El registro que existe para poder deshacer un error no puede
-- ser editable por fuera del mecanismo que lo deshace.
--
-- El permiso se verifica adentro, que es el patron ya documentado en
-- ESTADO §9 para las funciones privilegiadas de `public`.
create or replace function public.aumentar_precios(
  p_porcentaje   numeric,
  p_proveedor_id uuid default null,
  p_categoria_id uuid default null,
  p_alcance      text default 'precio',
  p_motivo       text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid;
  v_factor  numeric;
  v_n       integer;
  v_usuario uuid;
begin
  if not app.tiene_permiso('productos.aumentar_precios') then
    raise exception 'No tenes permiso para aumentar precios en masa.';
  end if;

  if p_porcentaje is null or p_porcentaje = 0 then
    raise exception 'El porcentaje tiene que ser distinto de cero.';
  end if;
  -- Un tope. No impide equivocarse, pero frena el dedo pegado en el
  -- teclado: nadie aumenta 900% a proposito.
  if abs(p_porcentaje) > 100 then
    raise exception 'Un aumento de %%%% es casi seguro un error de tipeo. Si es a proposito, hacelo en dos veces.', p_porcentaje;
  end if;
  if p_alcance not in ('precio', 'costo', 'ambos') then
    raise exception 'Alcance invalido: %.', p_alcance;
  end if;

  -- Sin filtro le pega al catalogo entero. Se permite —a veces es lo
  -- que se quiere, cuando aumenta todo— pero exige motivo escrito,
  -- porque es la operacion mas destructiva del sistema.
  if p_proveedor_id is null and p_categoria_id is null
     and coalesce(length(trim(p_motivo)), 0) < 3 then
    raise exception 'Un aumento a TODO el catalogo tiene que decir por que.';
  end if;

  v_usuario := app.usuario_actual_id();
  v_factor  := 1 + p_porcentaje / 100;

  insert into public.aumento_precio
    (proveedor_id, categoria_id, porcentaje, alcance, motivo, aplicado_por)
  values (p_proveedor_id, p_categoria_id, p_porcentaje, p_alcance, nullif(trim(p_motivo), ''), v_usuario)
  returning id into v_id;

  -- Se guarda el ANTES de cada producto antes de tocarlo. Es lo que
  -- hace posible revertir exactamente.
  with tocados as (
    select p.id, p.precio_venta, p.costo
    from public.producto p
    where p.eliminado_en is null
      and p.activo
      and (p_proveedor_id is null or p.proveedor_id = p_proveedor_id)
      and (p_categoria_id is null or p.categoria_id = p_categoria_id)
    for update
  )
  insert into public.aumento_precio_linea
    (aumento_id, producto_id, precio_anterior, precio_nuevo, costo_anterior, costo_nuevo)
  select v_id, t.id,
         t.precio_venta,
         case when p_alcance in ('precio', 'ambos')
              then round(t.precio_venta * v_factor, 2) else t.precio_venta end,
         t.costo,
         case when p_alcance in ('costo', 'ambos') and t.costo is not null
              then round(t.costo * v_factor, 2) else t.costo end
  from tocados t;

  get diagnostics v_n = row_count;

  update public.producto p
  set precio_venta = l.precio_nuevo,
      costo        = l.costo_nuevo
  from public.aumento_precio_linea l
  where l.aumento_id = v_id and l.producto_id = p.id;

  update public.aumento_precio set productos = v_n where id = v_id;

  return v_id;
end $$;

comment on function public.aumentar_precios is
  'Aumenta precio y/o costo de los productos de un proveedor y/o una categoria. Guarda el valor anterior de cada uno para poder revertirlo exactamente.';

grant execute on function public.aumentar_precios(numeric, uuid, uuid, text, text) to authenticated;

-- ─── Deshacer ───
--
-- Restituye el valor EXACTO que tenia cada producto, no el porcentaje
-- inverso: aplicar -7% despues de +7% no devuelve al mismo numero, y
-- deja el catalogo con centavos corridos que nadie va a notar hasta
-- que alguien compare contra una lista vieja.
--
-- Solo revierte los que NO se tocaron despues. Si alguien le corrigio
-- el precio a mano a un producto despues del aumento, esa correccion
-- es mas nueva y mas deliberada que el aumento: pisarla seria perder
-- trabajo humano.
create or replace function public.revertir_aumento(p_aumento_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aumento public.aumento_precio;
  v_n       integer;
begin
  if not app.tiene_permiso('productos.aumentar_precios') then
    raise exception 'No tenes permiso para revertir un aumento.';
  end if;

  select * into v_aumento from public.aumento_precio where id = p_aumento_id for update;
  if v_aumento.id is null then
    raise exception 'Ese aumento no existe.';
  end if;
  if v_aumento.revertido_en is not null then
    raise exception 'Ese aumento ya fue revertido el %.', v_aumento.revertido_en::date;
  end if;

  update public.producto p
  set precio_venta = l.precio_anterior,
      costo        = l.costo_anterior
  from public.aumento_precio_linea l
  where l.aumento_id = p_aumento_id
    and l.producto_id = p.id
    -- Solo si sigue teniendo el precio que dejo el aumento.
    and p.precio_venta = l.precio_nuevo;

  get diagnostics v_n = row_count;

  update public.aumento_precio
  set revertido_en = now(), revertido_por = app.usuario_actual_id()
  where id = p_aumento_id;

  return v_n;
end $$;

comment on function public.revertir_aumento is
  'Devuelve cada producto al precio exacto que tenia antes del aumento. Saltea los que alguien corrigio a mano despues: esa correccion es mas nueva y mas deliberada.';

grant execute on function public.revertir_aumento(uuid) to authenticated;
