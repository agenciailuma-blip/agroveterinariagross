-- ═══════════════════════════════════════════════════════════════
-- LA FACTURA DE COMPRA
--
-- Decidido el 10/09: sube a V1-A. Hasta hoy estaba en V1-B.
--
-- ─── QUÉ ENTRA Y QUÉ NO ───
--
-- Entra la CABECERA de la factura que emitió el proveedor: quién,
-- cuál, cuándo y cuánto, con el desglose por alícuota de IVA y las
-- percepciones que le cobraron a Gross.
--
-- NO entran las líneas de la factura, ni el ingreso de stock, ni los
-- costos por producto. Eso es recepción de mercadería, es la parte
-- grande, y sigue en V1-B — con las decisiones que todavía no se
-- tomaron: emparejar los códigos del proveedor con los nuestros, qué
-- pasa cuando cambia el costo, qué pasa si la factura trae un producto
-- que no existe. Nada de eso hace falta para registrar una compra.
--
-- Es la frase de Lucas del 03/09 llevada hasta el final: "una cosa es
-- cargar facturas y otra es subir stock".
--
-- ─── POR QUÉ AHORA Y NO EN V1-B ───
--
-- El 26/10 Gross deja OBTech, que es donde hoy cargan las facturas de
-- compra. Si el sistema no las recibe, desde ese día no hay dónde
-- registrar una compra — y las compras siguen entrando igual.
--
-- ⚠️ Ojo con el otro argumento, que ya se corrigió el 09/09 y no hay que
-- volver a usar: NO es que el contador necesite estas facturas para el
-- IVA. El contador las baja de Mis Comprobantes de ARCA, donde ya están
-- todas las que le emitieron a Gross. Lo que el contador espera de este
-- sistema es el Excel de VENTAS, que se exporta desde el 09/09.
--
-- ─── LA FORMA NO SE INVENTA ───
--
-- Es el espejo de `comprobante` + `comprobante_alicuota` +
-- `comprobante_tributo`, que ya funcionan y ya pasaron por ARCA. Las
-- mismas columnas del otro lado del mostrador: donde allá hay receptor,
-- acá hay proveedor.
-- ═══════════════════════════════════════════════════════════════

create table public.compra (
  id                  uuid primary key default gen_random_uuid(),

  proveedor_id        uuid not null references public.proveedor(id) on delete restrict,

  /*
    El comprobante tal como lo emitió el proveedor. El tipo sale de la
    misma tabla que usa la facturación: son los códigos de ARCA, y una
    nota de crédito de compra es el mismo código que una nota de crédito
    de venta, mirada desde el otro lado.

    Los importes se guardan SIEMPRE positivos, como en las ventas. Que
    una nota de crédito reste lo dice `tipo_comprobante.signo`, no el
    signo de los números: dos formas de representar lo mismo terminan
    contradiciéndose el día que alguien suma sin mirar el tipo.
  */
  tipo_comprobante_id smallint not null references public.tipo_comprobante(id),
  punto_venta         integer not null check (punto_venta > 0),
  numero              bigint  not null check (numero > 0),
  fecha               date    not null,

  /*
    El desglose. `neto_gravado`, `iva_total` y `tributos_total` los
    mantiene un disparador desde las líneas de abajo — igual que los
    totales de una venta— así que la cabecera nunca puede discrepar con
    su propio detalle.

    Lo no gravado y lo exento se cargan acá porque no tienen alícuota:
    no hay línea de dónde sumarlos.
  */
  neto_gravado        numeric(14,4) not null default 0 check (neto_gravado    >= 0),
  neto_no_gravado     numeric(14,4) not null default 0 check (neto_no_gravado >= 0),
  exento              numeric(14,4) not null default 0 check (exento          >= 0),
  iva_total           numeric(14,4) not null default 0 check (iva_total       >= 0),
  tributos_total      numeric(14,4) not null default 0 check (tributos_total  >= 0),

  -- El total no se carga: es la suma. Un total escrito a mano que no
  -- cierra con el detalle es un error que aparece meses después, cuando
  -- ya nadie tiene el papel a mano.
  total               numeric(14,4)
                        generated always as (
                          neto_gravado + neto_no_gravado + exento + iva_total + tributos_total
                        ) stored,

  observaciones       text,

  cargada_por         uuid references public.usuario(id) on delete set null,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),
  eliminado_en        timestamptz
);

/*
  La misma factura no se carga dos veces.

  Un proveedor no puede emitir dos comprobantes con el mismo tipo, punto
  de venta y número. Cargarla de nuevo —porque el papel volvió a
  aparecer, o porque lo hicieron dos personas— duplicaría el gasto y el
  crédito fiscal sin que nada lo avise.
*/
create unique index compra_unica
  on public.compra (proveedor_id, tipo_comprobante_id, punto_venta, numero)
  where eliminado_en is null;

create index compra_fecha_idx     on public.compra (fecha desc);
create index compra_proveedor_idx on public.compra (proveedor_id, fecha desc);
create index compra_cargada_por_idx on public.compra (cargada_por);

create trigger compra_actualizado_en
  before update on public.compra
  for each row execute function app.set_actualizado_en();

comment on table public.compra is
  'Cabecera de la factura de compra, como la emitió el proveedor. Sin líneas de producto: la recepción de mercadería es de V1-B.';
comment on column public.compra.total is
  'Suma del desglose. No se carga a mano para que la cabecera no pueda discrepar con su detalle.';

-- ───────────────────────────────────────────────────────────────
-- El desglose por alícuota — lo que mira un libro de IVA
-- ───────────────────────────────────────────────────────────────
create table public.compra_alicuota (
  id              uuid primary key default gen_random_uuid(),
  compra_id       uuid not null references public.compra(id) on delete cascade,
  alicuota_iva_id smallint not null references public.alicuota_iva(id),
  base_imponible  numeric(14,4) not null check (base_imponible >= 0),
  importe         numeric(14,4) not null check (importe >= 0),

  -- Una alícuota por factura: si el 21% apareciera dos veces, el neto
  -- del 21% dejaría de ser un número y pasaría a ser una suma que hay
  -- que acordarse de hacer.
  constraint compra_alicuota_unica unique (compra_id, alicuota_iva_id)
);

create index compra_alicuota_compra_idx on public.compra_alicuota (compra_id);

-- ───────────────────────────────────────────────────────────────
-- Percepciones y otros tributos
--
-- Del lado de las ventas, la percepción de IIBB es plata que Gross le
-- cobra al cliente. Acá es al revés: es plata que le cobraron a Gross, y
-- es crédito suyo. Por eso se guarda con el mismo detalle.
-- ───────────────────────────────────────────────────────────────
create table public.compra_tributo (
  id             uuid primary key default gen_random_uuid(),
  compra_id      uuid not null references public.compra(id) on delete cascade,
  descripcion    text not null,
  base_imponible numeric(14,4) not null default 0 check (base_imponible >= 0),
  alicuota       numeric(6,3),
  importe        numeric(14,4) not null check (importe >= 0)
);

create index compra_tributo_compra_idx on public.compra_tributo (compra_id);

-- ───────────────────────────────────────────────────────────────
-- Los totales se mantienen solos
-- ───────────────────────────────────────────────────────────────
/*
  Es el mismo mecanismo que mantiene los totales de una venta desde sus
  líneas. La cabecera no se escribe a mano en ningún momento: se carga el
  detalle y los totales caen solos.
*/
create or replace function app.recalcular_totales_compra()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_compra uuid := coalesce(new.compra_id, old.compra_id);
begin
  update public.compra c
     set neto_gravado = coalesce(
           (select sum(a.base_imponible) from public.compra_alicuota a where a.compra_id = v_compra), 0),
         iva_total = coalesce(
           (select sum(a.importe) from public.compra_alicuota a where a.compra_id = v_compra), 0),
         tributos_total = coalesce(
           (select sum(t.importe) from public.compra_tributo t where t.compra_id = v_compra), 0)
   where c.id = v_compra;

  return null;
end;
$$;

create trigger compra_alicuota_totales
  after insert or update or delete on public.compra_alicuota
  for each row execute function app.recalcular_totales_compra();

create trigger compra_tributo_totales
  after insert or update or delete on public.compra_tributo
  for each row execute function app.recalcular_totales_compra();

-- ───────────────────────────────────────────────────────────────
-- Quién puede
--
-- Los permisos ya existían desde el primer día: 'compras.ver' y
-- 'compras.registrar', y los tienen Administrador y Encargado. No hace
-- falta crear ninguno.
-- ───────────────────────────────────────────────────────────────
alter table public.compra          enable row level security;
alter table public.compra_alicuota enable row level security;
alter table public.compra_tributo  enable row level security;

create policy compra_select on public.compra
  for select to authenticated
  using ((select app.tiene_permiso('compras.ver')));

create policy compra_insert on public.compra
  for insert to authenticated
  with check ((select app.tiene_permiso('compras.registrar')));

create policy compra_update on public.compra
  for update to authenticated
  using ((select app.tiene_permiso('compras.registrar')))
  with check ((select app.tiene_permiso('compras.registrar')));

create policy compra_alicuota_select on public.compra_alicuota
  for select to authenticated
  using ((select app.tiene_permiso('compras.ver')));

create policy compra_alicuota_escribir on public.compra_alicuota
  for all to authenticated
  using ((select app.tiene_permiso('compras.registrar')))
  with check ((select app.tiene_permiso('compras.registrar')));

create policy compra_tributo_select on public.compra_tributo
  for select to authenticated
  using ((select app.tiene_permiso('compras.ver')));

create policy compra_tributo_escribir on public.compra_tributo
  for all to authenticated
  using ((select app.tiene_permiso('compras.registrar')))
  with check ((select app.tiene_permiso('compras.registrar')));

grant select on public.compra, public.compra_alicuota, public.compra_tributo to authenticated;
grant insert, update on public.compra to authenticated;
grant insert, update, delete on public.compra_alicuota, public.compra_tributo to authenticated;
