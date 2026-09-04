-- ═══════════════════════════════════════════════════════════════
-- 038 — CONTINGENCIA CON CAEA
--
-- El CAE se pide comprobante por comprobante y exige que ARCA
-- conteste. El CAEA es al reves: ARCA lo entrega por adelantado, una
-- vez por quincena, y habilita a emitir mientras el servicio esta
-- caido. Despues hay que informarle que se emitio con el.
--
-- Desde la RG 5852/2026 el CAEA quedo reservado a indisponibilidad
-- REAL. Por eso la habilitacion no la decide la pantalla: la decide
-- esta base, mirando el registro de intentos fallidos. Un comprobante
-- que ARCA RECHAZO no puede irse por CAEA — el rechazo dice que los
-- datos estan mal, y emitirlo con CAEA seria mandar el mismo error
-- con otro codigo encima.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1. Un CAEA de homologacion no puede usarse en produccion
--
-- Son dos universos separados y el codigo no lo dice por si mismo.
-- Sin esta columna, el dia que se pase a produccion el sistema podria
-- tomar el CAEA de prueba que quedo vigente y emitir con el.
-- ───────────────────────────────────────────────────────────────
alter table public.caea
  add column if not exists ambiente text not null default 'homologacion'
    check (ambiente in ('homologacion', 'produccion')),
  add column if not exists fecha_proceso text;

comment on column public.caea.ambiente is
  'homologacion o produccion. Un CAEA de prueba nunca puede autorizar un comprobante real.';

alter table public.caea drop constraint if exists caea_periodo_quincena_unico;
alter table public.caea add constraint caea_periodo_quincena_unico
  unique (periodo, quincena, ambiente);

-- El codigo era unico global; con dos ambientes deja de tener sentido
drop index if exists caea_codigo_unico;
create unique index caea_codigo_unico on public.caea (codigo, ambiente);

-- ───────────────────────────────────────────────────────────────
-- 2. "Sin movimiento"
--
-- Si una quincena termina y en un punto de venta no se emitio NADA
-- con el CAEA, ARCA igual exige que se lo informen. No informarlo es
-- un incumplimiento aunque no se haya facturado un solo peso.
-- ───────────────────────────────────────────────────────────────
create table public.caea_sin_movimiento (
  id             uuid primary key default gen_random_uuid(),
  caea_id        uuid not null references public.caea(id) on delete cascade,
  punto_venta_id uuid not null references public.punto_venta(id) on delete restrict,
  fecha_proceso  text,
  informado_en   timestamptz not null default now(),

  constraint caea_sin_movimiento_unico unique (caea_id, punto_venta_id)
);

create index caea_sin_movimiento_pv_idx on public.caea_sin_movimiento (punto_venta_id);

comment on table public.caea_sin_movimiento is
  'Constancia de haberle informado a ARCA que un CAEA no se usó en un punto de venta. Obligatorio aunque no se haya emitido nada.';

-- ───────────────────────────────────────────────────────────────
-- 2b. El punto de venta del regimen CAEA
--
-- Descubierto probando contra ARCA el 24/08/2026: FECAEASolicitar
-- devuelve
--
--   15003  Campo CUIT debera poseer al menos un punto de venta activo
--          correspondiente al regimen CAEA
--
-- El CAEA no cuelga del punto de venta comun: ARCA exige que el CUIT
-- tenga dado de alta un punto de venta bajo ESE regimen. Es un tramite
-- en el portal de ARCA, no algo que se resuelva con codigo.
--
-- Se marca con una bandera y no con un valor unico ('cae' o 'caea')
-- porque todavia no esta confirmado si ARCA admite que el mismo numero
-- sirva para los dos. Con la bandera, las dos formas se configuran sin
-- tocar el esquema de nuevo.
-- ───────────────────────────────────────────────────────────────
alter table public.punto_venta
  add column if not exists regimen_caea boolean not null default false;

comment on column public.punto_venta.regimen_caea is
  'Marcado si este punto de venta está dado de alta en ARCA bajo el régimen CAEA. Sin al menos uno, ARCA rechaza el pedido de CAEA con el error 15003.';

-- ───────────────────────────────────────────────────────────────
-- 3. El CAEA que rige hoy
-- ───────────────────────────────────────────────────────────────
create or replace function app.caea_vigente()
returns public.caea
language sql
stable
security definer
set search_path = ''
as $$
  select c.*
  from public.caea c
  where c.estado    = 'vigente'
    and c.ambiente  = coalesce(
          (select valor #>> '{}' from public.configuracion where clave = 'arca.ambiente'),
          'homologacion')
    and current_date between c.fecha_desde and c.fecha_hasta
  order by c.solicitado_en desc
  limit 1;
$$;

revoke all on function app.caea_vigente() from public, anon;
grant execute on function app.caea_vigente() to authenticated;

-- ───────────────────────────────────────────────────────────────
-- 4. Emitir con CAEA
--
-- El unico camino para que un comprobante salga por contingencia. Las
-- tres condiciones que exige son las que despues hay que poder
-- justificar ante ARCA, asi que se verifican del lado del servidor.
-- ───────────────────────────────────────────────────────────────
create or replace function public.emitir_con_caea(
  p_comprobante_id uuid,
  p_motivo         text default null
)
returns table (caea text, numero bigint, fecha date)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_comp     public.comprobante;
  v_caea     public.caea;
  v_minimo   integer;
  v_fallidos integer;
  v_propios  integer;
  v_pv       uuid;
  v_numero   bigint;
begin
  if not (select app.tiene_permiso('facturacion.contingencia')) then
    raise exception 'No tenés permiso para operar la contingencia de ARCA.';
  end if;

  select * into v_comp from public.comprobante c where c.id = p_comprobante_id;
  if v_comp.id is null then
    raise exception 'El comprobante no existe.';
  end if;
  /*
    Un comprobante RECHAZADO no puede irse por contingencia. Un rechazo
    es ARCA contestando "tus datos estan mal": el servicio anda, y el
    CAEA no arregla un comprobante mal armado — lo unico que hace es
    mandar el mismo error con otro codigo encima.

    La condicion se lee del estado y no del ultimo intento registrado.
    Probandolo aparecio por que: varios intentos escritos dentro de la
    misma transaccion comparten creado_en, y "el ultimo" deja de estar
    definido. El estado del comprobante no tiene ese problema.
  */
  if v_comp.estado = 'rechazado' then
    raise exception 'ARCA rechazó este comprobante, no está caído. Hay que corregir el motivo del rechazo, no emitirlo por contingencia.';
  end if;
  if v_comp.estado <> 'pendiente' then
    raise exception 'El comprobante está % y no corresponde emitirlo por contingencia.', v_comp.estado;
  end if;

  -- Condicion 1: tiene que haber un CAEA vigente para hoy.
  select * into v_caea from app.caea_vigente();
  if v_caea.id is null then
    raise exception 'No hay CAEA vigente para hoy. Hay que pedirlo a ARCA por adelantado, antes del corte.';
  end if;

  /*
    Condicion 2: indisponibilidad demostrable. Se exige el numero
    configurado de intentos fallidos por caida en la ultima hora en el
    punto de venta, y al menos uno de este comprobante — para que no
    se pueda declarar contingencia sin haber intentado.
  */
  select coalesce((valor #>> '{}')::integer, 3) into v_minimo
  from public.configuracion where clave = 'arca.reintentos_antes_de_caea';

  select count(*) into v_fallidos
  from public.intento_arca i
  where i.punto_venta_id = v_comp.punto_venta_id
    and i.resultado      in ('error', 'timeout')
    and i.creado_en      > now() - interval '1 hour';

  select count(*) into v_propios
  from public.intento_arca i
  where i.comprobante_id = p_comprobante_id
    and i.resultado      in ('error', 'timeout');

  if v_fallidos < coalesce(v_minimo, 3) or v_propios < 1 then
    raise exception
      'Todavía no se puede usar el CAEA: hay % intentos fallidos por caída en la última hora (hacen falta %) y % de este comprobante (hace falta 1). Reintentá el CAE.',
      v_fallidos, coalesce(v_minimo, 3), v_propios;
  end if;

  /*
    El comprobante pasa al punto de venta del regimen CAEA y toma un
    numero de ESA serie. Si el punto de venta comun tambien esta
    habilitado para CAEA, se queda donde esta y conserva su numero: no
    hay motivo para moverlo.
  */
  if v_comp.punto_venta_id in (
       select p.id from public.punto_venta p
       where p.regimen_caea and p.activo and p.eliminado_en is null)
  then
    v_pv     := v_comp.punto_venta_id;
    v_numero := v_comp.numero;
  else
    select p.id into v_pv
    from public.punto_venta p
    where p.regimen_caea and p.activo and p.eliminado_en is null
    order by p.numero
    limit 1;

    if v_pv is null then
      raise exception 'No hay ningún punto de venta habilitado en ARCA bajo el régimen CAEA. Es un trámite en el portal de ARCA: sin eso, ARCA rechaza el pedido con el error 15003.';
    end if;

    v_numero := app.siguiente_numero_comprobante(v_pv, v_comp.tipo_comprobante_id);
  end if;

  update public.comprobante c
     set punto_venta_id  = v_pv,
         numero          = v_numero,
         modalidad       = 'caea',
         caea_id         = v_caea.id,
         cae             = v_caea.codigo,
         cae_vencimiento = v_caea.fecha_hasta,
         estado          = 'contingencia',
         arca_resultado  = null,
         arca_observaciones = jsonb_build_array(jsonb_build_object(
           'codigo',  'CAEA',
           'mensaje', coalesce(nullif(trim(p_motivo), ''), 'ARCA no respondió') ||
                      ' — emitido por contingencia el ' || to_char(now(), 'DD/MM/YYYY HH24:MI')
         )),
         autorizado_en   = now()
   where c.id = p_comprobante_id;

  caea   := v_caea.codigo;
  numero := v_numero;
  fecha  := v_comp.fecha;
  return next;
end;
$$;

comment on function public.emitir_con_caea(uuid, text) is
  'Emite un comprobante por contingencia con el CAEA vigente. Exige indisponibilidad demostrable de ARCA (RG 5852/2026) y rechaza los comprobantes que ARCA objetó por contenido.';

revoke all on function public.emitir_con_caea(uuid, text) from public, anon;
grant execute on function public.emitir_con_caea(uuid, text) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- 5. La alineacion tiene que contar los comprobantes con CAEA
--
-- Trampa real: mientras un lote de CAEA no esta informado, ARCA no
-- sabe que existe. FECompUltimoAutorizado devuelve el numero ANTERIOR
-- al corte. Si al volver el servicio le pedimos CAE al siguiente
-- comprobante alineando contra ese numero, le asignamos uno que ya
-- tiene un comprobante emitido con CAEA.
--
-- La serie es una sola por punto de venta y tipo, la compartan CAE y
-- CAEA. Asi que el siguiente numero es el que sigue al mayor de los
-- dos, no al que ARCA todavia alcanza a ver.
-- ───────────────────────────────────────────────────────────────
create or replace function public.alinear_numeracion_comprobante(
  p_comprobante_id uuid,
  p_ultimo_arca    bigint
)
returns table (numero bigint, fecha date, se_renumero boolean, se_corrigio_fecha boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_comp       public.comprobante;
  v_siguiente  bigint;
  v_tolerancia integer;
  v_fecha      date;
  v_libre      bigint;
  v_ocupante   uuid;
  v_tope       bigint;
  v_caea       bigint;
begin
  select * into v_comp from public.comprobante c where c.id = p_comprobante_id;
  if v_comp.id is null then
    raise exception 'El comprobante no existe.';
  end if;
  if v_comp.estado not in ('pendiente', 'rechazado') then
    raise exception 'El comprobante esta % y no se puede renumerar.', v_comp.estado;
  end if;

  -- Lo emitido con CAEA ocupa lugar en la serie aunque ARCA no lo vea
  -- todavia. Los informados tambien: ahi ARCA ya los cuenta y el
  -- greatest() no cambia nada.
  select coalesce(max(c.numero), 0) into v_caea
  from public.comprobante c
  where c.punto_venta_id      = v_comp.punto_venta_id
    and c.tipo_comprobante_id = v_comp.tipo_comprobante_id
    and c.modalidad           = 'caea'
    and c.estado              in ('contingencia', 'informado');

  v_siguiente := greatest(coalesce(p_ultimo_arca, 0), v_caea) + 1;
  v_tope      := v_siguiente;

  if v_siguiente <> v_comp.numero then
    select c.id into v_ocupante
    from public.comprobante c
    where c.punto_venta_id      = v_comp.punto_venta_id
      and c.tipo_comprobante_id = v_comp.tipo_comprobante_id
      and c.numero              = v_siguiente
      and c.id                  <> p_comprobante_id
      and c.estado              <> 'anulado';

    if v_ocupante is not null then
      if exists (select 1 from public.comprobante c
                 where c.id = v_ocupante and c.estado not in ('pendiente', 'rechazado')) then
        raise exception 'El numero % ya lo tiene un comprobante autorizado. La numeracion local quedo adelantada respecto de ARCA.', v_siguiente;
      end if;

      select coalesce(max(c.numero), 0) + 1 into v_libre
      from public.comprobante c
      where c.punto_venta_id      = v_comp.punto_venta_id
        and c.tipo_comprobante_id = v_comp.tipo_comprobante_id
        and c.estado              <> 'anulado';

      update public.comprobante set numero = v_libre where id = v_ocupante;
      v_tope := greatest(v_tope, v_libre);
    end if;
  end if;

  select coalesce((valor #>> '{}')::integer, 5) into v_tolerancia
  from public.configuracion where clave = 'arca.dias_tolerancia_cae';

  v_fecha := v_comp.fecha;
  if abs(current_date - v_comp.fecha) > coalesce(v_tolerancia, 5) then
    v_fecha := current_date;
  end if;

  update public.comprobante c
     set numero = v_siguiente,
         fecha  = v_fecha
   where c.id = p_comprobante_id;

  update public.secuencia_comprobante s
     set ultimo_numero   = greatest(s.ultimo_numero, v_tope),
         ultimo_arca     = p_ultimo_arca,
         sincronizado_en = now()
   where s.punto_venta_id      = v_comp.punto_venta_id
     and s.tipo_comprobante_id = v_comp.tipo_comprobante_id;

  numero            := v_siguiente;
  fecha             := v_fecha;
  se_renumero       := v_siguiente <> v_comp.numero;
  se_corrigio_fecha := v_fecha <> v_comp.fecha;
  return next;
end;
$$;

comment on function public.alinear_numeracion_comprobante(uuid, bigint) is
  'Alinea el número con ARCA antes de pedir el CAE. Cuenta también lo emitido con CAEA sin informar: ARCA todavía no lo ve, pero ocupa lugar en la serie.';

-- ───────────────────────────────────────────────────────────────
-- 6. Estado del CAEA para la pantalla
-- ───────────────────────────────────────────────────────────────
create or replace view public.vista_caea_estado
with (security_invoker = true) as
select
  c.id,
  c.codigo,
  c.periodo,
  c.quincena,
  c.fecha_desde,
  c.fecha_hasta,
  c.fecha_tope_informar,
  c.estado,
  c.ambiente,
  current_date between c.fecha_desde and c.fecha_hasta          as rige_hoy,
  (c.fecha_tope_informar - current_date)                        as dias_para_informar,
  (select count(*) from public.comprobante k
    where k.caea_id = c.id and k.estado = 'contingencia')       as por_informar,
  (select count(*) from public.comprobante k
    where k.caea_id = c.id and k.estado = 'informado')          as informados,
  case
    when c.estado = 'informado' then 'cerrado'
    when exists (select 1 from public.comprobante k
                  where k.caea_id = c.id and k.estado = 'contingencia')
      then case
        when c.fecha_tope_informar is null              then 'por_informar'
        when c.fecha_tope_informar <  current_date      then 'vencido'
        when c.fecha_tope_informar -  current_date <= 2 then 'urgente'
        else 'por_informar'
      end
    when current_date between c.fecha_desde and c.fecha_hasta   then 'listo'
    else 'sin_uso'
  end                                                           as situacion
from public.caea c;

comment on view public.vista_caea_estado is
  'CAEA por quincena con lo que falta informarle a ARCA y cuántos días quedan para hacerlo.';

-- ───────────────────────────────────────────────────────────────
-- 7. El registro de intentos tiene que admitir las operaciones nuevas
--
-- Consultar un CAEA ya otorgado e informar "sin movimiento" son
-- llamadas distintas de las que ya estaban listadas. Anotarlas con el
-- nombre de otra operacion arruinaria justamente el registro que la
-- RG 5852/2026 pide poder mostrar.
-- ───────────────────────────────────────────────────────────────
alter table public.intento_arca drop constraint if exists intento_arca_operacion_check;
alter table public.intento_arca add constraint intento_arca_operacion_check
  check (operacion in (
    'FECAESolicitar', 'FECAEASolicitar', 'FECAEAConsultar', 'FECAEARegInformativo',
    'FECAEASinMovimientoInformar', 'FECompUltimoAutorizado', 'FECompConsultar',
    'FEDummy', 'FEParamGet', 'WSAA'));

-- ───────────────────────────────────────────────────────────────
-- 8. RLS y permisos
-- ───────────────────────────────────────────────────────────────
alter table public.caea_sin_movimiento enable row level security;

create policy caea_sin_movimiento_select on public.caea_sin_movimiento
  for select to authenticated using ((select app.tiene_permiso('facturacion.ver')));
create policy caea_sin_movimiento_insert on public.caea_sin_movimiento
  for insert to authenticated with check ((select app.tiene_permiso('facturacion.contingencia')));

grant select on public.caea_sin_movimiento, public.vista_caea_estado to authenticated;
grant insert on public.caea_sin_movimiento to authenticated;

insert into public.configuracion (clave, valor, descripcion, grupo) values
  ('arca.caea_pedir_dias_antes', '5',
   'Días antes del inicio de la quincena en que ARCA acepta que se pida el CAEA.', 'arca')
on conflict (clave) do nothing;
