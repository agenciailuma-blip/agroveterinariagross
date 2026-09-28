-- ═══════════════════════════════════════════════════════════════
-- IMPORTAR CLIENTES CON SU SALDO, Y LOS SALDOS DE LOS PROVEEDORES
--
-- El día del corte hay que traer de OBTech dos cosas que hoy no tienen
-- importación: los clientes con lo que debe cada uno, y lo que Gross le
-- debe a cada proveedor. A mano, uno por uno, son semanas; y el punto 12
-- del alcance pide que estén «cargados y verificados».
--
-- ─── LO QUE SE CUIDA ───
--
-- · Se puede importar la misma planilla las veces que haga falta. El
--   cliente se reconoce por su código; si no tiene, por su CUIT o DNI; y
--   si tampoco, por el nombre exacto, sólo si hay uno solo que se llame
--   así. Se actualiza, no se duplica.
-- · Una celda vacía no borra lo que ya estaba (como en productos).
-- · El saldo se deja IGUAL al de la planilla, no se suma. Importar dos
--   veces el mismo archivo no duplica la deuda; importar uno corregido
--   deja un movimiento por la diferencia, con su fecha y quién lo hizo.
--   El libro de la cuenta no se edita nunca.
-- · Un CUIT con el dígito verificador mal no entra: con ese CUIT, ARCA
--   rechazaría la primera factura A, con el cliente adelante.
--
-- ─── QUIÉN ───
--
-- Cargar deudas no es cargar un cliente. Los clientes con saldo piden
-- 'clientes.editar' y 'cuentacorriente.limite' (Administrador y
-- Encargado); los proveedores, 'proveedores.gestionar' y
-- 'proveedores.pagar'.
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- Lo que viene escrito en la planilla, a lo que entiende la base
-- ───────────────────────────────────────────────────────────────

/* Sin acentos, en minúsculas y con los signos como espacios. */
create or replace function app.texto_para_comparar(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(lower(translate(coalesce(p, ''),
           'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '[^a-z0-9]+', ' ', 'g'))
$$;

/*
  La condición frente al IVA, como la escribe una persona o la exporta
  OBTech: «Responsable Inscripto», «RI», «Resp. Inscripto», «Monotributo»,
  «Consumidor Final», «CF»... Devuelve null si no se entiende: mejor
  preguntar que facturar A a un consumidor final.
*/
create or replace function app.condicion_iva_desde_texto(p text)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case
    when t = '' then null
    when t in ('ri', 'r i', 'resp insc', 'responsable inscripto', 'iva responsable inscripto')
      or t like '%inscripto%' then 1
    when t like '%monotributista social%' or t like '%monotributo social%' then 13
    when t like '%monotrib%' or t in ('mt', 'rm', 'm') then 6
    when t like '%no alcanzado%' then 15
    when t like '%exento%' or t = 'ex' then 4
    when t like '%no categorizado%' then 7
    when t like '%consumidor%' or t in ('cf', 'c f', 'final') then 5
    else null
  end
  from (select app.texto_para_comparar(p) as t) x
$$;

/* Sí o no, como se escriba. Null si la celda no dice nada que se entienda. */
create or replace function app.si_o_no(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when t in ('si', 's', 'x', '1', 'true', 'verdadero', 'yes', 'habilitada', 'habilitado') then true
    when t in ('no', 'n', '0', 'false', 'falso') then false
    else null
  end
  from (select app.texto_para_comparar(p) as t) x
$$;

/*
  Si un CUIT es válido: once dígitos y el último cierra con el módulo 11
  de ARCA. Es la cuenta que hace ARCA antes de rechazar la factura.
*/
create or replace function app.cuit_valido(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_digitos text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  v_pesos   int[] := array[5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  v_suma    int := 0;
  v_resto   int;
  v_dv      int;
begin
  if length(v_digitos) <> 11 then
    return false;
  end if;
  for i in 1..10 loop
    v_suma := v_suma + substr(v_digitos, i, 1)::int * v_pesos[i];
  end loop;
  v_resto := 11 - (v_suma % 11);
  v_dv := case v_resto when 11 then 0 when 10 then 9 else v_resto end;
  return v_dv = substr(v_digitos, 11, 1)::int;
end;
$$;

/* Un número de la planilla, que ya viene limpio desde la pantalla. */
create or replace function app.numero_de_planilla(p text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
  if nullif(btrim(coalesce(p, '')), '') is null then
    return null;
  end if;
  return btrim(p)::numeric;
exception when others then
  raise exception 'no se entiende el número «%»', p;
end;
$$;

-- ───────────────────────────────────────────────────────────────
-- Clientes
-- ───────────────────────────────────────────────────────────────
create or replace function public.importar_clientes(
  p_filas       jsonb,
  p_fecha_saldo date default null
)
returns table (
  fila      integer,
  codigo    text,
  resultado text,   -- creado | actualizado | error
  detalle   text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fila        jsonb;
  v_indice      integer := 0;
  v_codigo      text;
  v_nombre      text;
  v_doc         text;
  v_tipo_doc    smallint;
  v_condicion   smallint;
  v_cc          boolean;
  v_limite      numeric;
  v_dias        numeric;
  v_saldo       numeric;
  v_actual      numeric;
  v_id          uuid;
  v_n           integer;
  v_avisos      text[];
  v_cliente     public.cliente;
  v_fecha       date := coalesce(p_fecha_saldo, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
  v_usuario     uuid := app.usuario_actual_id();
begin
  if not (app.tiene_permiso('clientes.editar') and app.tiene_permiso('cuentacorriente.limite')) then
    raise exception 'No tenés permiso para importar clientes con su cuenta corriente.';
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas)
  loop
    v_indice := v_indice + 1;
    v_avisos := '{}';
    v_codigo := nullif(btrim(v_fila->>'codigo'), '');
    v_nombre := nullif(btrim(v_fila->>'nombre'), '');
    v_id := null;

    begin
      if v_nombre is null then
        raise exception 'Falta el nombre.';
      end if;

      -- El documento: CUIT si son once dígitos, DNI si son siete u ocho.
      v_doc := nullif(regexp_replace(coalesce(v_fila->>'documento', ''), '\D', '', 'g'), '');
      v_tipo_doc := null;
      if v_doc is not null then
        if length(v_doc) = 11 then
          if not app.cuit_valido(v_doc) then
            raise exception 'El CUIT % no es válido: el último dígito no cierra. Revisalo, porque ARCA rechazaría la factura.', v_doc;
          end if;
          v_tipo_doc := 80;
        elsif length(v_doc) in (7, 8) then
          v_tipo_doc := 96;
        else
          raise exception 'El documento «%» no es un CUIT (11 dígitos) ni un DNI (7 u 8).', v_fila->>'documento';
        end if;
      end if;

      v_condicion := null;
      if nullif(btrim(v_fila->>'condicion_iva'), '') is not null then
        v_condicion := app.condicion_iva_desde_texto(v_fila->>'condicion_iva');
        if v_condicion is null then
          raise exception 'No se entiende la condición frente al IVA «%». Escribí Responsable Inscripto, Monotributo, Exento o Consumidor Final.', v_fila->>'condicion_iva';
        end if;
      end if;

      v_cc := null;
      if nullif(btrim(v_fila->>'cuenta_corriente'), '') is not null then
        v_cc := app.si_o_no(v_fila->>'cuenta_corriente');
        if v_cc is null then
          raise exception 'En «cuenta corriente» va sí o no, y dice «%».', v_fila->>'cuenta_corriente';
        end if;
      end if;

      v_limite := app.numero_de_planilla(v_fila->>'limite_credito');
      v_dias   := app.numero_de_planilla(v_fila->>'dias_vencimiento');
      v_saldo  := app.numero_de_planilla(v_fila->>'saldo');

      if v_limite is not null and v_limite < 0 then
        raise exception 'El límite de crédito no puede ser negativo.';
      end if;
      if v_dias is not null and (v_dias < 0 or v_dias <> trunc(v_dias)) then
        raise exception 'Los días de vencimiento van en un número entero.';
      end if;

      -- Quién es: por código, por documento, o por el nombre si es único.
      if v_codigo is not null then
        select c.id into v_id from public.cliente c
        where upper(c.codigo) = upper(v_codigo) and c.eliminado_en is null;
      end if;
      if v_id is null and v_doc is not null then
        select c.id into v_id from public.cliente c
        where c.numero_documento = v_doc and c.tipo_documento_id = v_tipo_doc and c.eliminado_en is null;
      end if;
      if v_id is null and v_codigo is null and v_doc is null then
        select count(*), min(c.id::text)::uuid into v_n, v_id from public.cliente c
        where app.texto_para_comparar(c.nombre) = app.texto_para_comparar(v_nombre) and c.eliminado_en is null;
        if v_n <> 1 then
          v_id := null;
        end if;
        v_avisos := v_avisos || 'Sin código ni documento: si se importa otra planilla con otro nombre, puede quedar repetido.';
      end if;

      -- Con saldo, tiene que tener cuenta corriente: si no, la deuda no
      -- se ve en la caja ni en los reportes.
      if coalesce(v_saldo, 0) <> 0 and v_cc is distinct from true then
        if v_cc = false then
          v_avisos := v_avisos || 'La planilla dice que no tiene cuenta corriente, pero tiene saldo: se la habilitó.';
        end if;
        v_cc := true;
      end if;

      if v_id is null then
        insert into public.cliente (
          codigo, nombre, condicion_iva_id, tipo_documento_id, numero_documento,
          calle, localidad, provincia, codigo_postal, telefono, email,
          cuenta_corriente, limite_credito, dias_vencimiento
        ) values (
          v_codigo, v_nombre, coalesce(v_condicion, 5), coalesce(v_tipo_doc, 99), v_doc,
          nullif(btrim(v_fila->>'domicilio'), ''), nullif(btrim(v_fila->>'localidad'), ''),
          coalesce(nullif(btrim(v_fila->>'provincia'), ''), 'Misiones'),
          nullif(btrim(v_fila->>'codigo_postal'), ''), nullif(btrim(v_fila->>'telefono'), ''),
          nullif(btrim(v_fila->>'email'), ''),
          coalesce(v_cc, false), v_limite, coalesce(v_dias, 30)::integer
        ) returning id into v_id;
        resultado := 'creado';
      else
        update public.cliente c set
          codigo            = coalesce(v_codigo, c.codigo),
          nombre            = v_nombre,
          condicion_iva_id  = coalesce(v_condicion, c.condicion_iva_id),
          tipo_documento_id = coalesce(v_tipo_doc, c.tipo_documento_id),
          numero_documento  = coalesce(v_doc, c.numero_documento),
          calle             = coalesce(nullif(btrim(v_fila->>'domicilio'), ''), c.calle),
          localidad         = coalesce(nullif(btrim(v_fila->>'localidad'), ''), c.localidad),
          provincia         = coalesce(nullif(btrim(v_fila->>'provincia'), ''), c.provincia),
          codigo_postal     = coalesce(nullif(btrim(v_fila->>'codigo_postal'), ''), c.codigo_postal),
          telefono          = coalesce(nullif(btrim(v_fila->>'telefono'), ''), c.telefono),
          email             = coalesce(nullif(btrim(v_fila->>'email'), ''), c.email),
          cuenta_corriente  = coalesce(v_cc, c.cuenta_corriente),
          limite_credito    = coalesce(v_limite, c.limite_credito),
          dias_vencimiento  = coalesce(v_dias::integer, c.dias_vencimiento)
        where c.id = v_id;
        resultado := 'actualizado';
      end if;

      /*
        El saldo: se deja igual al de la planilla. Lo que ya se cargó como
        saldo inicial se resta, y entra sólo la diferencia. Vence como una
        venta nueva a cuenta de ese cliente, a sus días de siempre: no hay
        forma de saber cuánto de lo que traía OBTech ya estaba vencido.
      */
      if v_saldo is not null then
        select * into v_cliente from public.cliente where id = v_id;
        select coalesce(sum(m.importe), 0) into v_actual
        from public.movimiento_cuenta_corriente m
        where m.cliente_id = v_id and m.tipo = 'saldo_inicial';

        if round(v_saldo - v_actual, 2) <> 0 then
          insert into public.movimiento_cuenta_corriente
            (cliente_id, tipo, importe, concepto, vencimiento, referencia_tipo, usuario_id, ocurrido_en)
          values
            (v_id, 'saldo_inicial', round(v_saldo - v_actual, 2),
             case when v_actual = 0 then 'Saldo inicial' else 'Saldo inicial · corrección' end,
             v_fecha + v_cliente.dias_vencimiento, 'manual', v_usuario,
             (v_fecha::timestamp + interval '12 hours') at time zone 'America/Argentina/Buenos_Aires');
          if v_actual <> 0 then
            v_avisos := v_avisos || format('Ya tenía saldo inicial de %s: se corrigió a %s.', app.pesos(v_actual), app.pesos(v_saldo));
          end if;
        end if;
      end if;

      fila := v_indice; codigo := coalesce(v_codigo, v_doc, v_nombre);
      detalle := nullif(array_to_string(v_avisos, ' '), '');
      return next;

    exception when others then
      fila := v_indice; codigo := coalesce(v_codigo, v_doc, v_nombre); resultado := 'error';
      detalle := case
        when sqlerrm like '%cliente_ri_requiere_cuit%' then 'Es Responsable Inscripto: necesita un CUIT (11 dígitos).'
        when sqlerrm like '%cliente_documento_unico%' then 'Ese CUIT o DNI ya es de otro cliente.'
        when sqlerrm like '%cliente_codigo_unico%' then 'Ese código ya es de otro cliente.'
        else sqlerrm
      end;
      return next;
    end;
  end loop;
end;
$$;

comment on function public.importar_clientes(jsonb, date) is
  'Importa o actualiza clientes desde una planilla, con su saldo de cuenta corriente a una fecha. Idempotente: reimportar no duplica clientes ni deuda.';

revoke all on function public.importar_clientes(jsonb, date) from public, anon;
grant execute on function public.importar_clientes(jsonb, date) to authenticated;

-- ───────────────────────────────────────────────────────────────
-- Saldos de proveedores
-- ───────────────────────────────────────────────────────────────
create or replace function public.importar_saldos_proveedores(
  p_filas jsonb,
  p_fecha date default null
)
returns table (
  fila      integer,
  codigo    text,
  resultado text,
  detalle   text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fila    jsonb;
  v_indice  integer := 0;
  v_nombre  text;
  v_doc     text;
  v_saldo   numeric;
  v_id      uuid;
  v_n       integer;
  v_previo  public.proveedor_saldo_inicial;
  v_avisos  text[];
  v_fecha   date := coalesce(p_fecha, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
begin
  if not (app.tiene_permiso('proveedores.gestionar') and app.tiene_permiso('proveedores.pagar')) then
    raise exception 'No tenés permiso para importar los saldos de los proveedores.';
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas)
  loop
    v_indice := v_indice + 1;
    v_avisos := '{}';
    v_nombre := nullif(btrim(v_fila->>'nombre'), '');
    v_id := null;

    begin
      if v_nombre is null then
        raise exception 'Falta el nombre del proveedor.';
      end if;

      v_doc := nullif(regexp_replace(coalesce(v_fila->>'documento', ''), '\D', '', 'g'), '');
      if v_doc is not null and not app.cuit_valido(v_doc) then
        raise exception 'El CUIT «%» no es válido.', v_fila->>'documento';
      end if;

      v_saldo := app.numero_de_planilla(v_fila->>'saldo');

      if v_doc is not null then
        select p.id into v_id from public.proveedor p
        where p.numero_documento = v_doc and p.eliminado_en is null;
      end if;
      if v_id is null then
        select count(*), min(p.id::text)::uuid into v_n, v_id from public.proveedor p
        where app.texto_para_comparar(p.nombre) = app.texto_para_comparar(v_nombre) and p.eliminado_en is null;
        if v_n <> 1 then
          v_id := null;
        end if;
      end if;

      if v_id is null then
        insert into public.proveedor (nombre, tipo_documento_id, numero_documento, telefono, email)
        values (v_nombre, case when v_doc is not null then 80 end, v_doc,
                nullif(btrim(v_fila->>'telefono'), ''), nullif(btrim(v_fila->>'email'), ''))
        returning id into v_id;
        resultado := 'creado';
      else
        update public.proveedor p set
          tipo_documento_id = case when v_doc is not null then 80 else p.tipo_documento_id end,
          numero_documento  = coalesce(v_doc, p.numero_documento),
          telefono          = coalesce(nullif(btrim(v_fila->>'telefono'), ''), p.telefono),
          email             = coalesce(nullif(btrim(v_fila->>'email'), ''), p.email)
        where p.id = v_id;
        resultado := 'actualizado';
      end if;

      -- El saldo, sólo si cambió: reemplazarlo por el mismo número dejaría
      -- un registro anulado de más en cada reimportación.
      if v_saldo is not null then
        select * into v_previo from public.proveedor_saldo_inicial
        where proveedor_id = v_id and anulado_en is null;

        if v_previo.id is null or round(v_previo.importe, 2) <> round(v_saldo, 2) or v_previo.fecha <> v_fecha then
          perform public.definir_saldo_inicial_proveedor(v_id, v_fecha, v_saldo,
            coalesce(nullif(btrim(v_fila->>'detalle'), ''), 'Saldo importado'));
          if v_previo.id is not null then
            v_avisos := v_avisos || format('Tenía saldo inicial de %s: se reemplazó por %s.', app.pesos(v_previo.importe), app.pesos(v_saldo));
          end if;
        end if;
      end if;

      fila := v_indice; codigo := coalesce(v_doc, v_nombre);
      detalle := nullif(array_to_string(v_avisos, ' '), '');
      return next;

    exception when others then
      fila := v_indice; codigo := coalesce(v_doc, v_nombre); resultado := 'error';
      detalle := case
        when sqlerrm like '%proveedor_documento_unico%' then 'Ese CUIT ya es de otro proveedor.'
        else sqlerrm
      end;
      return next;
    end;
  end loop;
end;
$$;

comment on function public.importar_saldos_proveedores(jsonb, date) is
  'Importa proveedores con lo que se les debe a una fecha, como saldo inicial de su cuenta. Idempotente. No reemplaza un saldo que ya tiene pagos imputados.';

revoke all on function public.importar_saldos_proveedores(jsonb, date) from public, anon;
grant execute on function public.importar_saldos_proveedores(jsonb, date) to authenticated;
