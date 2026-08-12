-- ═══════════════════════════════════════════════════════════════
-- 007 — PRECIOS
--
-- DOS DECISIONES QUE HAY QUE TENER CLARAS
--
-- 1) LOS PRECIOS INCLUYEN IVA.
--    producto.precio_venta es el precio final de mostrador, con IVA
--    adentro. Es como piensa el vendedor y como se muestra al cliente.
--    Al emitir una Factura A hay que desarmarlo:
--        neto = precio / (1 + alicuota/100)
--    Queda registrado en configuracion.precios_incluyen_iva para que el
--    modulo de facturacion no tenga que adivinarlo.
--
-- 2) EL ORDEN DE APLICACION.
--    Se aplican en capas, y el orden cambia el resultado:
--
--      precio base del producto
--        -> lista de precios       (segun medio de pago)
--        -> recargo por cuotas
--        -> descuento del cliente
--        -> modificacion manual    (en la venta, con permiso y auditada)
--
--    El descuento del cliente se aplica AL FINAL, sobre el precio ya
--    financiado. Es lo mas habitual en mostrador ("te hago un 10%" se
--    entiende sobre lo que va a pagar), pero es una decision comercial,
--    no tecnica. CONFIRMAR CON EL CLIENTE antes de emitir la primera
--    factura: despues no se puede cambiar sin descuadrar el historico.
--
-- Las reglas viven en tablas chicas a proposito: tienen que replicarse
-- enteras a las terminales para que el mostrador calcule precios sin
-- conexion.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- Listas de precios
--
-- Lucas puede crear las que quiera sin depender del desarrollo. Una
-- lista ajusta el precio base por un porcentaje, y ademas admite precio
-- explicito por producto cuando el porcentaje no alcanza.
-- ───────────────────────────────────────────────────────────────
create table public.lista_precio (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  descripcion       text,
  -- +10 = diez por ciento mas caro que el precio base. Puede ser negativo.
  ajuste_porcentaje numeric(7,4) not null default 0,
  es_predeterminada boolean not null default false,
  orden             integer not null default 0,
  activo            boolean not null default true,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  eliminado_en      timestamptz
);

create unique index lista_precio_nombre_unico on public.lista_precio (lower(nombre))
  where eliminado_en is null;
create unique index lista_precio_predeterminada_unica on public.lista_precio (es_predeterminada)
  where es_predeterminada and eliminado_en is null;

create trigger lista_precio_actualizado_en before update on public.lista_precio
  for each row execute function app.set_actualizado_en();

-- Precio explicito por producto y lista. Le gana al ajuste porcentual.
create table public.producto_precio_lista (
  producto_id     uuid not null references public.producto(id)     on delete cascade,
  lista_precio_id uuid not null references public.lista_precio(id) on delete cascade,
  precio          numeric(14,4) not null check (precio >= 0),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  primary key (producto_id, lista_precio_id)
);

create index producto_precio_lista_lista_idx on public.producto_precio_lista (lista_precio_id);

create trigger producto_precio_lista_actualizado_en before update on public.producto_precio_lista
  for each row execute function app.set_actualizado_en();

comment on table public.producto_precio_lista is
  'Precio fijo de un producto en una lista. Tiene prioridad sobre el ajuste porcentual de la lista.';

-- ───────────────────────────────────────────────────────────────
-- Medios de pago
--
-- Las "dos listas de precios" que usan hoy en realidad son esto:
-- contado y tarjeta con recargo. Se modela como medio de pago que
-- apunta a una lista, que es lo que permite agregar mas adelante
-- transferencia, billeteras o lo que aparezca sin tocar codigo.
-- ───────────────────────────────────────────────────────────────
create table public.medio_pago (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  tipo            text not null check (tipo in (
                    'efectivo', 'tarjeta_debito', 'tarjeta_credito',
                    'transferencia', 'cuenta_corriente', 'otro')),
  lista_precio_id uuid references public.lista_precio(id) on delete set null,
  admite_cuotas   boolean not null default false,
  cuotas_maximas  integer not null default 1 check (cuotas_maximas >= 1),
  -- si suma al arqueo de caja al cerrar el turno
  afecta_caja     boolean not null default true,
  orden           integer not null default 0,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  eliminado_en    timestamptz
);

create unique index medio_pago_nombre_unico on public.medio_pago (lower(nombre))
  where eliminado_en is null;
create index medio_pago_lista_idx on public.medio_pago (lista_precio_id);

create trigger medio_pago_actualizado_en before update on public.medio_pago
  for each row execute function app.set_actualizado_en();

-- Recargo por cantidad de cuotas. Hoy usan hasta 2, pero la tabla no
-- pone limite: si manana suman 3 o 6, se cargan y listo.
create table public.medio_pago_cuota (
  medio_pago_id      uuid not null references public.medio_pago(id) on delete cascade,
  cuotas             integer not null check (cuotas >= 1),
  recargo_porcentaje numeric(7,4) not null default 0,
  activo             boolean not null default true,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  primary key (medio_pago_id, cuotas)
);

create trigger medio_pago_cuota_actualizado_en before update on public.medio_pago_cuota
  for each row execute function app.set_actualizado_en();

-- ───────────────────────────────────────────────────────────────
-- Calculo de precio
--
-- Esta funcion es la referencia canonica del calculo. La terminal la
-- replica en su codigo para poder trabajar sin conexion, y esta version
-- es contra la que se verifica que el resultado coincida.
--
-- SECURITY INVOKER: corre con los permisos de quien llama, asi que las
-- politicas RLS siguen aplicando.
-- ───────────────────────────────────────────────────────────────
create or replace function public.calcular_precio(
  p_producto_id       uuid,
  p_medio_pago_id     uuid    default null,
  p_cuotas            integer default 1,
  p_descuento_cliente numeric default 0
)
returns table (
  precio_base       numeric,
  precio_lista      numeric,
  recargo_cuotas    numeric,
  descuento_cliente numeric,
  precio_final      numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_base       numeric;
  v_lista_id   uuid;
  v_ajuste     numeric := 0;
  v_explicito  numeric;
  v_lista      numeric;
  v_recargo    numeric := 0;
  v_desc       numeric := 0;
  v_decimales  integer;
begin
  select p.precio_venta into v_base
  from public.producto p
  where p.id = p_producto_id and p.eliminado_en is null;

  if v_base is null then
    raise exception 'Producto inexistente o dado de baja: %', p_producto_id;
  end if;

  select coalesce((c.valor #>> '{}')::integer, 2) into v_decimales
  from public.configuracion c where c.clave = 'precios.redondeo_decimales';
  v_decimales := coalesce(v_decimales, 2);

  -- 1) Lista de precios: la del medio de pago, o la predeterminada
  select mp.lista_precio_id into v_lista_id
  from public.medio_pago mp
  where mp.id = p_medio_pago_id and mp.eliminado_en is null;

  if v_lista_id is null then
    select lp.id into v_lista_id
    from public.lista_precio lp
    where lp.es_predeterminada and lp.activo and lp.eliminado_en is null;
  end if;

  -- El precio explicito por producto le gana al ajuste porcentual
  select ppl.precio into v_explicito
  from public.producto_precio_lista ppl
  where ppl.producto_id = p_producto_id and ppl.lista_precio_id = v_lista_id;

  if v_explicito is not null then
    v_lista := v_explicito;
  else
    select coalesce(lp.ajuste_porcentaje, 0) into v_ajuste
    from public.lista_precio lp
    where lp.id = v_lista_id and lp.activo and lp.eliminado_en is null;
    v_ajuste := coalesce(v_ajuste, 0);
    v_lista  := v_base * (1 + v_ajuste / 100);
  end if;

  -- 2) Recargo por cuotas
  if p_medio_pago_id is not null and coalesce(p_cuotas, 1) > 0 then
    select coalesce(mpc.recargo_porcentaje, 0) into v_recargo
    from public.medio_pago_cuota mpc
    where mpc.medio_pago_id = p_medio_pago_id
      and mpc.cuotas = coalesce(p_cuotas, 1)
      and mpc.activo;
    v_recargo := coalesce(v_recargo, 0);
  end if;

  -- 3) Descuento del cliente, sobre el precio ya financiado
  v_desc := coalesce(p_descuento_cliente, 0);

  precio_base       := round(v_base, v_decimales);
  precio_lista      := round(v_lista, v_decimales);
  recargo_cuotas    := v_recargo;
  descuento_cliente := v_desc;
  precio_final      := round(
                         v_lista * (1 + v_recargo / 100) * (1 - v_desc / 100),
                         v_decimales);
  return next;
end;
$$;

comment on function public.calcular_precio(uuid, uuid, integer, numeric) is
  'Referencia canonica del calculo de precio. Orden: base -> lista -> recargo por cuotas -> descuento de cliente. La terminal replica esta logica para operar sin conexion.';

grant execute on function public.calcular_precio(uuid, uuid, integer, numeric) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- RLS
-- ───────────────────────────────────────────────────────────────
alter table public.lista_precio          enable row level security;
alter table public.producto_precio_lista enable row level security;
alter table public.medio_pago            enable row level security;
alter table public.medio_pago_cuota      enable row level security;

-- Todo usuario activo necesita leer precios: sin esto no puede vender.
create policy lista_precio_select on public.lista_precio
  for select to authenticated using ((select app.es_usuario_activo()));
create policy lista_precio_insert on public.lista_precio
  for insert to authenticated with check ((select app.tiene_permiso('productos.editar_precio')));
create policy lista_precio_update on public.lista_precio
  for update to authenticated
  using ((select app.tiene_permiso('productos.editar_precio')))
  with check ((select app.tiene_permiso('productos.editar_precio')));
create policy lista_precio_delete on public.lista_precio
  for delete to authenticated using ((select app.tiene_permiso('productos.editar_precio')));

create policy producto_precio_lista_select on public.producto_precio_lista
  for select to authenticated using ((select app.es_usuario_activo()));
create policy producto_precio_lista_insert on public.producto_precio_lista
  for insert to authenticated with check ((select app.tiene_permiso('productos.editar_precio')));
create policy producto_precio_lista_update on public.producto_precio_lista
  for update to authenticated
  using ((select app.tiene_permiso('productos.editar_precio')))
  with check ((select app.tiene_permiso('productos.editar_precio')));
create policy producto_precio_lista_delete on public.producto_precio_lista
  for delete to authenticated using ((select app.tiene_permiso('productos.editar_precio')));

create policy medio_pago_select on public.medio_pago
  for select to authenticated using ((select app.es_usuario_activo()));
create policy medio_pago_insert on public.medio_pago
  for insert to authenticated with check ((select app.tiene_permiso('configuracion.gestionar')));
create policy medio_pago_update on public.medio_pago
  for update to authenticated
  using ((select app.tiene_permiso('configuracion.gestionar')))
  with check ((select app.tiene_permiso('configuracion.gestionar')));
create policy medio_pago_delete on public.medio_pago
  for delete to authenticated using ((select app.tiene_permiso('configuracion.gestionar')));

create policy medio_pago_cuota_select on public.medio_pago_cuota
  for select to authenticated using ((select app.es_usuario_activo()));
create policy medio_pago_cuota_insert on public.medio_pago_cuota
  for insert to authenticated with check ((select app.tiene_permiso('configuracion.gestionar')));
create policy medio_pago_cuota_update on public.medio_pago_cuota
  for update to authenticated
  using ((select app.tiene_permiso('configuracion.gestionar')))
  with check ((select app.tiene_permiso('configuracion.gestionar')));
create policy medio_pago_cuota_delete on public.medio_pago_cuota
  for delete to authenticated using ((select app.tiene_permiso('configuracion.gestionar')));

grant select on public.lista_precio, public.producto_precio_lista,
                 public.medio_pago, public.medio_pago_cuota to authenticated;
grant insert, update, delete on public.lista_precio, public.producto_precio_lista,
                                public.medio_pago, public.medio_pago_cuota to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- SEMILLA
--
-- Los porcentajes de recargo van en CERO: Lucas todavia no los paso.
-- Se cargan desde la pantalla de configuracion, sin migracion.
-- ═══════════════════════════════════════════════════════════════
insert into public.configuracion (clave, valor, descripcion, grupo) values
  ('precios.incluyen_iva',        'true', 'Los precios de venta incluyen IVA. Al facturar se desarma el neto.', 'precios'),
  ('precios.redondeo_decimales',  '2',    'Decimales a los que se redondea el precio final',                    'precios'),
  ('precios.orden_descuento_cliente', '"al_final"',
     'Momento en que se aplica el descuento del cliente. A confirmar con el cliente antes de la primera factura.', 'precios');

insert into public.lista_precio (nombre, descripcion, ajuste_porcentaje, es_predeterminada, orden) values
  ('Contado', 'Precio de lista, sin recargo',                    0, true,  10),
  ('Tarjeta', 'Precio con recargo por financiacion en tarjeta',  0, false, 20);

insert into public.medio_pago (nombre, tipo, lista_precio_id, admite_cuotas, cuotas_maximas, afecta_caja, orden)
select 'Efectivo', 'efectivo', lp.id, false, 1, true, 10
from public.lista_precio lp where lp.nombre = 'Contado';

insert into public.medio_pago (nombre, tipo, lista_precio_id, admite_cuotas, cuotas_maximas, afecta_caja, orden)
select 'Tarjeta de debito', 'tarjeta_debito', lp.id, false, 1, false, 20
from public.lista_precio lp where lp.nombre = 'Contado';

insert into public.medio_pago (nombre, tipo, lista_precio_id, admite_cuotas, cuotas_maximas, afecta_caja, orden)
select 'Tarjeta de credito', 'tarjeta_credito', lp.id, true, 2, false, 30
from public.lista_precio lp where lp.nombre = 'Tarjeta';

insert into public.medio_pago (nombre, tipo, lista_precio_id, admite_cuotas, cuotas_maximas, afecta_caja, orden)
select 'Transferencia', 'transferencia', lp.id, false, 1, false, 40
from public.lista_precio lp where lp.nombre = 'Contado';

insert into public.medio_pago (nombre, tipo, lista_precio_id, admite_cuotas, cuotas_maximas, afecta_caja, orden)
select 'Cuenta corriente', 'cuenta_corriente', lp.id, false, 1, false, 50
from public.lista_precio lp where lp.nombre = 'Contado';

insert into public.medio_pago_cuota (medio_pago_id, cuotas, recargo_porcentaje)
select mp.id, c.cuotas, 0
from public.medio_pago mp
cross join (values (1), (2)) as c(cuotas)
where mp.nombre = 'Tarjeta de credito';
