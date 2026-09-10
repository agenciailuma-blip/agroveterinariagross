-- ═══════════════════════════════════════════════════════════════
-- RESERVAR EL CONCEPTO DE DEPÓSITO
--
-- El módulo de depósitos —altas, transferencias, saldo por depósito—
-- sigue siendo de V1-B. Lo que entra ahora es solamente el lugar donde
-- va a apoyarse: que cada movimiento del libro de stock diga en qué
-- depósito ocurrió.
--
-- ─── POR QUÉ AHORA Y NO CON EL MÓDULO ───
--
-- El 04/09 los depósitos se mandaron a V1-B con el argumento de que
-- Gross tiene uno solo. El 09/09 las capturas de OBTech mostraron una
-- transferencia real entre el depósito 1 (DEPOSITO CENTRAL) y el 5
-- (FRACCIONAMIENTO): usan al menos cinco.
--
-- El libro de movimientos es inmutable y es la verdad del stock — el
-- saldo es una foto derivada que se puede reconstruir de cero. Por eso
-- alcanza con reservar el concepto EN EL LIBRO: lo que se escriba de acá
-- en adelante ya va a saber dónde pasó.
--
-- Un movimiento escrito hoy sin depósito es un movimiento al que hay que
-- inventarle uno en diciembre, cuando el histórico no sean 61 filas sino
-- el año entero de un local que factura todos los días, y cuando además
-- ya se sepa que los depósitos son cinco y no uno.
--
-- ─── QUÉ NO CAMBIA ───
--
-- Nada de lo que se ve. El saldo se sigue calculando sumando todos los
-- movimientos del producto, sin separar por depósito, exactamente como
-- hasta ahora: `stock_saldo`, su disparador y `vista_stock` no se tocan.
--
-- Y ningún lugar de los que escriben en el libro tiene que empezar a
-- mandar el depósito. Si el movimiento llega sin él, un disparador le
-- pone el principal. Eso es lo que permite reservar la columna sin tocar
-- los dieciséis lugares que insertan movimientos, que es donde estaría
-- el riesgo de romper algo que hoy anda.
--
-- ─── EL FRACCIONAMIENTO NO ES UN DEPÓSITO ───
--
-- En OBTech, abrir una bolsa para vender suelto se registra como una
-- transferencia al depósito "FRACCIONAMIENTO". Acá eso ya existe como lo
-- que es: un tipo de movimiento (`apertura`). No se copia esa
-- modelización, que confunde un lugar con una operación.
--
-- Queda anotado igual, porque el día que se migren los datos de OBTech
-- hay que saber que ese "depósito" no es un lugar y que sus movimientos
-- son aperturas.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- El depósito
-- ───────────────────────────────────────────────────────────────
create table public.deposito (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,

  -- El principal es el que se asume cuando nadie dice nada, que hoy es
  -- siempre. Tiene que haber exactamente uno.
  es_principal   boolean not null default false,

  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en   timestamptz
);

create unique index deposito_nombre_unico on public.deposito (lower(nombre))
  where eliminado_en is null;

-- Si hubiera dos principales, "el depósito por omisión" dejaría de ser
-- una pregunta con respuesta, y el disparador de abajo elegiría uno al
-- azar en cada inserción.
create unique index deposito_principal_unico on public.deposito (es_principal)
  where es_principal and eliminado_en is null;

create trigger deposito_actualizado_en
  before update on public.deposito
  for each row execute function app.set_actualizado_en();

comment on table public.deposito is
  'Dónde está la mercadería. El módulo (altas, transferencias, saldo por depósito) es de V1-B; esto existe desde antes para que el libro de movimientos no tenga que migrarse después.';
comment on column public.deposito.es_principal is
  'El que se asume cuando un movimiento no dice en qué depósito ocurrió. Hay exactamente uno.';

alter table public.deposito enable row level security;

create policy deposito_select on public.deposito
  for select to authenticated
  using ((select app.es_usuario_activo()));

create policy deposito_insert on public.deposito
  for insert to authenticated
  with check ((select app.tiene_permiso('configuracion.gestionar')));

create policy deposito_update on public.deposito
  for update to authenticated
  using ((select app.tiene_permiso('configuracion.gestionar')))
  with check ((select app.tiene_permiso('configuracion.gestionar')));

grant select on public.deposito to authenticated;
grant insert, update on public.deposito to authenticated;

-- El único que hay hoy. El nombre es provisorio a propósito: los cinco
-- de OBTech todavía no se conocen —hay que preguntárselos a Lucas— y
-- ponerles nombres inventados sería peor que dejar uno solo.
insert into public.deposito (nombre, es_principal)
select 'Local', true
where not exists (
  select 1 from public.deposito where es_principal and eliminado_en is null
);

-- ───────────────────────────────────────────────────────────────
-- Dónde ocurrió cada movimiento
-- ───────────────────────────────────────────────────────────────
alter table public.movimiento_stock
  add column if not exists deposito_id uuid references public.deposito(id);

/*
  Los movimientos son inmutables, y con razón: un libro que se puede
  editar no es un libro. Pero completar una columna nueva en los que ya
  están escritos es exactamente lo que hay que hacer una sola vez, y el
  disparador que protege el libro no distingue entre eso y una edición.

  Se apaga por el rato exacto que dura el relleno, adentro de la misma
  transacción de la migración. Si algo fallara en el medio, la
  transacción vuelve atrás y el disparador vuelve con ella.
*/
alter table public.movimiento_stock disable trigger movimiento_stock_inmutable;

update public.movimiento_stock
   set deposito_id = (
     select d.id from public.deposito d
      where d.es_principal and d.eliminado_en is null
   )
 where deposito_id is null;

alter table public.movimiento_stock enable trigger movimiento_stock_inmutable;

-- Recién ahora, con el histórico completo, se puede exigir que no falte.
alter table public.movimiento_stock
  alter column deposito_id set not null;

-- Pensado para la consulta que todavía no existe: el saldo de un
-- producto en un depósito. Hoy no la usa nadie y no molesta.
create index movimiento_stock_deposito_idx
  on public.movimiento_stock (deposito_id, producto_id);

comment on column public.movimiento_stock.deposito_id is
  'En qué depósito ocurrió. Si el movimiento llega sin él, se completa con el principal: hoy ninguna pantalla lo manda todavía.';

/*
  El depósito por omisión.

  Ninguno de los lugares que escriben en el libro —la venta, el remito,
  la toma de inventario, el ajuste a mano, la sincronización de una
  terminal que estuvo sin internet— tiene que enterarse de esta columna
  todavía. El día que exista la pantalla de depósitos, los que sí manden
  uno van a funcionar sin tocar nada de esto.

  Y si no hubiera principal, el movimiento falla ruidoso en vez de
  entrar sin depósito: un libro a medias es peor que una operación que no
  se puede completar, porque el agujero aparece meses después.
*/
create or replace function app.completar_deposito_del_movimiento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deposito_id is null then
    select d.id into new.deposito_id
      from public.deposito d
     where d.es_principal and d.eliminado_en is null;

    if new.deposito_id is null then
      raise exception
        'No hay un depósito principal definido: el movimiento de stock no sabría dónde ocurrió.';
    end if;
  end if;

  return new;
end;
$$;

create trigger movimiento_stock_deposito
  before insert on public.movimiento_stock
  for each row execute function app.completar_deposito_del_movimiento();
