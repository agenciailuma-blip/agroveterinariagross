-- ═══════════════════════════════════════════════════════════════
-- DEVOLUCIONES PARCIALES
--
-- Hasta ahora devolver era todo o nada: el cliente traía una bolsa de
-- tres y había que anular la venta entera y rehacerla. Eso rompe el
-- número de comprobante, obliga a volver a cobrar lo que el cliente sí
-- se queda, y deja al mostrador haciendo cuentas a mano.
--
-- ─── LA VENTA NO SE ANULA ───
--
-- Es la diferencia de fondo con `anular_venta`. La venta pasó: el
-- cliente se llevó dos de las tres bolsas y las pagó. Lo que se registra
-- es un hecho nuevo —volvió una— que la referencia sin borrarla. Por eso
-- hay tabla propia y la venta queda 'cobrada'.
--
-- Y por eso también se puede devolver varias veces: el cliente puede
-- traer una bolsa hoy y otra la semana que viene. Cada devolución es su
-- propia nota de crédito, y lo que controla que no devuelva cuatro de
-- tres es `vista_venta_devolvible`.
--
-- ─── LOS IMPORTES SE PRORRATEAN SOBRE LA LÍNEA ───
--
-- Se devuelve `importe * cantidad_devuelta / cantidad`, y no
-- `precio_unitario * cantidad_devuelta`. Hoy dan lo mismo, pero dejan de
-- darlo en cuanto una línea tenga un descuento o un ajuste: prorratear
-- devuelve lo que el cliente pagó de verdad por esa mercadería, que es
-- lo que hay que devolverle. Con el precio de lista se le devolvería de
-- más.
--
-- ─── EL IVA SE CALCULA POR ALÍCUOTA, NO SOBRE EL TOTAL ───
--
-- Una factura con 21% y 10,5% no se puede devolver con un porcentaje
-- promedio: devolver una bolsa de alimento (10,5%) y un collar (21%)
-- son dos bases distintas. Se agrupa por alícuota con la misma fórmula
-- que usa `vista_venta_iva` para la venta original, así la nota de
-- crédito desglosa igual que la factura.
--
-- ─── LA PERCEPCIÓN SE PRORRATEA, NO SE RECALCULA ───
--
-- Si se recalculara con `calcular_percepcion_iibb` sobre la base
-- devuelta, una devolución chica caería por debajo del mínimo no sujeto
-- —hoy $24.000— y devolvería percepción cero, dejándole al cliente una
-- percepción cobrada por mercadería que devolvió. El mínimo ya se
-- evaluó cuando se hizo la venta; lo que corresponde es devolver la
-- parte proporcional de lo que efectivamente se percibió.
--
-- ─── EL CENTAVO DEL REDONDEO, QUE ALGUIEN VA A PREGUNTAR ───
--
-- Partir una línea en dos devoluciones puede dejar **un centavo** de
-- diferencia entre el neto de la factura y la suma del neto de sus notas
-- de crédito. Una línea de $100.000 al 21% tiene un neto de $82.644,63;
-- devuelta en dos mitades de $50.000 da $41.322,31 cada una, que suman
-- $82.644,62.
--
-- No es un error y no se puede evitar: es lo que pasa al partir en dos un
-- importe que no se divide exacto. Lo que sí importa está bien —**cada
-- nota cierra sola**, su neto más su IVA da su total al centavo, que es
-- lo que ARCA valida, y la suma de los totales devueltos da exactamente
-- el total de la venta—. La diferencia vive sólo en el desglose
-- acumulado, y es de un centavo sobre cientos de miles de pesos.
--
-- ─── LA PLATA SIGUE EL MISMO CRITERIO QUE LA ANULACIÓN ───
--
-- Se descuenta de la cuenta corriente la parte que se había cargado a
-- cuenta corriente, y nada más. El sistema no saca plata de la caja,
-- igual que hoy al anular una venta entera: el efectivo lo entrega el
-- cajero y queda en el arqueo del turno.
-- ═══════════════════════════════════════════════════════════════

/*
  Los libros tienen que poder decir «esto vino de aquella devolución».

  Con varias devoluciones parciales sobre la misma venta, apuntar el
  movimiento a la venta no alcanza: quedarían tres reingresos de stock
  indistinguibles y no habría forma de saber cuál corresponde a cuál nota
  de crédito. Se amplían los dos check para admitir la referencia nueva.
*/
alter table public.movimiento_stock
  drop constraint if exists movimiento_stock_referencia_tipo_check;
alter table public.movimiento_stock
  add constraint movimiento_stock_referencia_tipo_check
  check (referencia_tipo = any (array[
    'venta', 'compra', 'inventario', 'fraccionamiento', 'manual', 'remito', 'devolucion'
  ]));

alter table public.movimiento_cuenta_corriente
  drop constraint if exists movimiento_cuenta_corriente_referencia_tipo_check;
alter table public.movimiento_cuenta_corriente
  add constraint movimiento_cuenta_corriente_referencia_tipo_check
  check (referencia_tipo = any (array[
    'venta', 'comprobante', 'recibo', 'manual', 'devolucion'
  ]));

create table if not exists public.devolucion (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.venta(id),
  -- La nota de crédito que la documenta. Queda en null cuando la venta
  -- nunca se facturó: no todo lo que se vende lleva comprobante fiscal.
  comprobante_id uuid references public.comprobante(id),
  motivo text not null,
  total numeric(14,4) not null check (total > 0),
  usuario_id uuid references public.usuario(id),
  terminal_id uuid references public.terminal(id),
  ocurrido_en timestamptz not null default now(),
  creado_en timestamptz not null default now()
);

comment on table public.devolucion is
  'Una devolución parcial de una venta. La venta no se anula: sigue cobrada, y esto registra lo que volvió.';

create index if not exists devolucion_venta on public.devolucion (venta_id);

create table if not exists public.devolucion_linea (
  id uuid primary key default gen_random_uuid(),
  devolucion_id uuid not null references public.devolucion(id) on delete cascade,
  venta_linea_id uuid not null references public.venta_linea(id),
  cantidad numeric(14,4) not null check (cantidad > 0),
  importe numeric(14,4) not null check (importe > 0),
  creado_en timestamptz not null default now()
);

comment on table public.devolucion_linea is
  'Qué y cuánto se devolvió. El importe es la parte proporcional de lo que el cliente pagó por esa línea, con IVA adentro, igual que venta_linea.importe.';

create index if not exists devolucion_linea_devolucion on public.devolucion_linea (devolucion_id);
create index if not exists devolucion_linea_venta_linea on public.devolucion_linea (venta_linea_id);

alter table public.devolucion enable row level security;
alter table public.devolucion_linea enable row level security;

-- Ver una devolución es ver la venta; hacerla es otra cosa, y por eso
-- escribir no se abre acá: pasa sólo por la función de abajo.
create policy devolucion_select on public.devolucion
  for select using ((select app.tiene_permiso('ventas.ver_todas'))
                 or (select app.tiene_permiso('ventas.crear')));

create policy devolucion_linea_select on public.devolucion_linea
  for select using ((select app.tiene_permiso('ventas.ver_todas'))
                 or (select app.tiene_permiso('ventas.crear')));

-- ───────────────────────────────────────────────────────────────
-- Cuánto queda por devolver de cada línea
--
-- Es lo que mira la pantalla para no dejar devolver cuatro de tres, y lo
-- que vuelve a mirar la función antes de escribir: la pantalla puede
-- estar desactualizada si alguien devolvió desde otra terminal.
-- ───────────────────────────────────────────────────────────────
create or replace view public.vista_venta_devolvible
with (security_invoker = true) as
select
  l.venta_id,
  l.id as venta_linea_id,
  l.orden,
  l.producto_id,
  l.codigo_producto,
  l.descripcion,
  l.cantidad as vendida,
  coalesce(d.devuelta, 0) as devuelta,
  l.cantidad - coalesce(d.devuelta, 0) as disponible,
  l.precio_unitario,
  l.importe,
  l.alicuota_iva_id,
  a.porcentaje as alicuota,
  l.condicion_iva
from public.venta_linea l
join public.alicuota_iva a on a.id = l.alicuota_iva_id
left join (
  select dl.venta_linea_id, sum(dl.cantidad) as devuelta
  from public.devolucion_linea dl
  group by dl.venta_linea_id
) d on d.venta_linea_id = l.id;

comment on view public.vista_venta_devolvible is
  'Las líneas de una venta con cuánto se devolvió y cuánto queda. «disponible» es el tope de la próxima devolución.';

grant select on public.vista_venta_devolvible to authenticated;

-- ───────────────────────────────────────────────────────────────
-- La devolución, entera, en una sola transacción
-- ───────────────────────────────────────────────────────────────
create or replace function public.devolver_lineas_de_venta(
  p_venta_id uuid,
  p_lineas   jsonb,   -- [{"venta_linea_id": "...", "cantidad": 2}, ...]
  p_motivo   text
)
returns uuid          -- id de la devolución
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_venta       public.venta;
  v_original    public.comprobante;
  v_usuario     uuid;
  v_devolucion  uuid;
  v_total       numeric := 0;
  v_neto        numeric := 0;
  v_iva         numeric := 0;
  v_exento      numeric := 0;
  v_percepcion  numeric := 0;
  v_alicuota    numeric;
  v_tipo_nc     smallint;
  v_clase       char(1);
  v_numero      bigint;
  v_nc_id       uuid;
  v_pv_numero   integer;
  v_cta_cte     numeric;
  v_proporcion  numeric;
  v_pagado      numeric;
begin
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Hay que indicar el motivo de la devolucion.';
  end if;

  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Hay que elegir al menos un producto para devolver.';
  end if;

  select * into v_venta from public.venta where id = p_venta_id for update;

  if v_venta.id is null then
    raise exception 'La venta no existe.';
  end if;
  if v_venta.estado = 'anulada' then
    raise exception 'La venta esta anulada: no hay nada que devolver.';
  end if;
  if v_venta.estado <> 'cobrada' then
    raise exception 'Solo se devuelve una venta cobrada. Esta esta %.', v_venta.estado;
  end if;

  v_usuario := app.usuario_actual_id();

  /*
    Lo pedido, contra lo que de verdad queda.

    La cantidad se vuelve a mirar acá y no se confía en la pantalla: dos
    cajeros pueden estar devolviendo la misma venta al mismo tiempo desde
    dos terminales, y el segundo tiene que chocar contra el tope.
  */
  -- Se sueltan por las dudas: `on commit drop` alcanza para una llamada
  -- por transaccion, que es como entra desde la aplicacion, pero dos
  -- devoluciones dentro de una misma transaccion chocarian con la tabla
  -- de la primera.
  drop table if exists pedido;
  drop table if exists devuelto;

  create temp table pedido on commit drop as
  select
    (x->>'venta_linea_id')::uuid as venta_linea_id,
    (x->>'cantidad')::numeric    as cantidad
  from jsonb_array_elements(p_lineas) x;

  if exists (select 1 from pedido where cantidad is null or cantidad <= 0) then
    raise exception 'Las cantidades a devolver tienen que ser mayores que cero.';
  end if;

  if exists (
    select 1 from pedido p
    left join public.vista_venta_devolvible d
      on d.venta_linea_id = p.venta_linea_id and d.venta_id = p_venta_id
    where d.venta_linea_id is null
  ) then
    raise exception 'Hay un producto que no pertenece a esta venta.';
  end if;

  if exists (
    select 1 from pedido p
    join public.vista_venta_devolvible d on d.venta_linea_id = p.venta_linea_id
    where p.cantidad > d.disponible
  ) then
    raise exception 'No se puede devolver mas de lo que queda sin devolver.';
  end if;

  -- Lo que se devuelve de cada línea, prorrateado sobre lo que se cobró.
  create temp table devuelto on commit drop as
  select
    p.venta_linea_id,
    p.cantidad,
    d.producto_id,
    d.alicuota_iva_id,
    d.alicuota,
    d.condicion_iva,
    round(d.importe * p.cantidad / d.vendida, 2) as importe
  from pedido p
  join public.vista_venta_devolvible d on d.venta_linea_id = p.venta_linea_id;

  select coalesce(sum(importe), 0) into v_total from devuelto;

  if v_total <= 0 then
    raise exception 'La devolucion no puede ser por cero pesos.';
  end if;

  insert into public.devolucion
    (venta_id, motivo, total, usuario_id, terminal_id)
  values
    (p_venta_id, p_motivo, v_total, v_usuario, v_venta.terminal_origen_id)
  returning id into v_devolucion;

  insert into public.devolucion_linea (devolucion_id, venta_linea_id, cantidad, importe)
  select v_devolucion, venta_linea_id, cantidad, importe from devuelto;

  /*
    El stock vuelve sólo si había salido.

    Se mira el libro de movimientos y no las líneas de la venta, por lo
    mismo que lo hace `anular_venta`: una venta entregada por un remito
    que no descuenta stock no dejó movimiento, y reingresar por ella
    inventaría mercadería que nunca salió.
  */
  insert into public.movimiento_stock
    (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id, usuario_id)
  select d.producto_id, 'devolucion', d.cantidad,
         'Devolucion parcial venta ' || v_venta.codigo, 'devolucion', v_devolucion, v_usuario
  from devuelto d
  where d.producto_id is not null
    and exists (
      select 1 from public.movimiento_stock m
      where m.producto_id = d.producto_id
        and ((m.referencia_tipo = 'venta' and m.referencia_id = v_venta.id)
          or (m.referencia_tipo = 'remito' and m.referencia_id in (
                select cnf.id from public.comprobante_no_fiscal cnf
                where cnf.venta_id = v_venta.id)))
      group by m.producto_id
      having sum(m.cantidad) < 0
    );

  /*
    La deuda baja en la parte que se había cargado a cuenta corriente.

    Si la venta se pagó mitad en efectivo y mitad en cuenta, una
    devolución del 30% baja la deuda un 30% de esa mitad. El resto lo
    entrega el cajero en mano: el sistema no mueve la caja, igual que al
    anular una venta entera.
  */
  select coalesce(sum(vp.importe), 0) into v_cta_cte
  from public.venta_pago vp
  join public.medio_pago mp on mp.id = vp.medio_pago_id
  where vp.venta_id = p_venta_id and mp.tipo = 'cuenta_corriente';

  if v_cta_cte > 0 then
    select coalesce(sum(vp.importe), 0) into v_pagado
    from public.venta_pago vp where vp.venta_id = p_venta_id;

    if v_pagado > 0 then
      insert into public.movimiento_cuenta_corriente
        (cliente_id, tipo, importe, concepto, referencia_tipo, referencia_id, usuario_id)
      values
        (v_venta.cliente_id, 'nota_credito',
         -round(v_total * v_cta_cte / v_pagado, 2),
         'Devolucion parcial venta ' || v_venta.codigo, 'devolucion', v_devolucion, v_usuario);
    end if;
  end if;

  -- ── La nota de crédito ──
  select * into v_original
  from public.comprobante
  where venta_id = p_venta_id
    and estado in ('autorizado', 'informado', 'contingencia')
    and tipo_comprobante_id in (select id from public.tipo_comprobante where familia = 'factura')
  order by creado_en desc
  limit 1;

  -- Sin factura no hay nada que rectificar ante ARCA. La devolución
  -- comercial ya quedó hecha, que es lo que importa en el mostrador.
  if v_original.id is null then
    return v_devolucion;
  end if;

  select tc.clase into v_clase
  from public.tipo_comprobante tc where tc.id = v_original.tipo_comprobante_id;

  select tc.id into v_tipo_nc
  from public.tipo_comprobante tc
  where tc.clase = v_clase and tc.familia = 'nota_credito' and tc.activo;

  if v_tipo_nc is null then
    raise exception 'No hay tipo de nota de credito activo para comprobantes clase %.', v_clase;
  end if;

  -- El desglose, con la misma fórmula que usó la factura.
  select
    coalesce(sum(round(d.importe / (1 + d.alicuota / 100), 2)), 0),
    coalesce(sum(d.importe - round(d.importe / (1 + d.alicuota / 100), 2)), 0)
  into v_neto, v_iva
  from devuelto d where d.condicion_iva = 'gravado';

  select coalesce(sum(d.importe), 0) into v_exento
  from devuelto d where d.condicion_iva = 'exento';

  /*
    La percepción, en la proporción de base que se devuelve.

    Se toma de la factura original y no se vuelve a calcular: el mínimo
    no sujeto ya se evaluó sobre la venta entera, y recalcular sobre una
    devolución chica devolvería cero.
  */
  select ct.importe, ct.alicuota into v_percepcion, v_alicuota
  from public.comprobante_tributo ct
  where ct.comprobante_id = v_original.id and ct.tributo_id = 2
  limit 1;

  if v_percepcion is not null and v_percepcion > 0 and v_original.neto_gravado > 0 then
    v_proporcion := v_neto / v_original.neto_gravado;
    v_percepcion := round(v_percepcion * v_proporcion, 2);
  else
    v_percepcion := 0;
  end if;

  v_numero := app.siguiente_numero_comprobante(v_original.punto_venta_id, v_tipo_nc);

  insert into public.comprobante (
    tipo_comprobante_id, punto_venta_id, numero, venta_id, cliente_id,
    receptor_nombre, receptor_tipo_documento_id, receptor_documento,
    receptor_condicion_iva_id, receptor_domicilio,
    fecha, concepto,
    neto_gravado, neto_no_gravado, exento, iva_total, tributos_total, total,
    moneda, cotizacion, estado, usuario_id
  ) values (
    v_tipo_nc, v_original.punto_venta_id, v_numero, p_venta_id, v_original.cliente_id,
    v_original.receptor_nombre, v_original.receptor_tipo_documento_id, v_original.receptor_documento,
    v_original.receptor_condicion_iva_id, v_original.receptor_domicilio,
    current_date, v_original.concepto,
    v_neto, 0, v_exento, v_iva, v_percepcion, v_total + v_percepcion,
    v_original.moneda, v_original.cotizacion, 'pendiente',
    v_usuario
  ) returning id into v_nc_id;

  insert into public.comprobante_alicuota (comprobante_id, alicuota_iva_id, base_imponible, importe)
  select v_nc_id, d.alicuota_iva_id,
         sum(round(d.importe / (1 + d.alicuota / 100), 2)),
         sum(d.importe - round(d.importe / (1 + d.alicuota / 100), 2))
  from devuelto d
  where d.condicion_iva = 'gravado'
  group by d.alicuota_iva_id;

  if v_percepcion > 0 then
    insert into public.comprobante_tributo
      (comprobante_id, tributo_id, descripcion, base_imponible, alicuota, importe)
    values
      (v_nc_id, 2, 'Percepción IIBB Misiones', v_neto, v_alicuota, v_percepcion);
  end if;

  select pv.numero into v_pv_numero
  from public.punto_venta pv where pv.id = v_original.punto_venta_id;

  insert into public.comprobante_asociado
    (comprobante_id, asociado_id, tipo_comprobante_id, punto_venta_numero, numero, fecha)
  values
    (v_nc_id, v_original.id, v_original.tipo_comprobante_id, v_pv_numero,
     v_original.numero, v_original.fecha);

  update public.devolucion set comprobante_id = v_nc_id where id = v_devolucion;

  return v_devolucion;
end;
$$;

comment on function public.devolver_lineas_de_venta(uuid, jsonb, text) is
  'Devuelve parte de una venta sin anularla: reingresa el stock que había salido, baja la deuda en la parte que se cargó a cuenta corriente y arma la nota de crédito por los importes devueltos, con el IVA por alícuota y la percepción prorrateada. Todo en una transacción; la nota queda pendiente de CAE.';

grant execute on function public.devolver_lineas_de_venta(uuid, jsonb, text) to authenticated;
