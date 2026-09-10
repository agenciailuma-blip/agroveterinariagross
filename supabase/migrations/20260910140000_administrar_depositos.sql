-- ═══════════════════════════════════════════════════════════════
-- ADMINISTRAR LOS DEPÓSITOS
--
-- El 10/09 se aclaró el dato que faltaba: hoy Gross tiene **uno**, y en
-- breve son **dos**, porque abre el segundo local. Los cinco de OBTech
-- no son referencia — bien pueden ser los que ese sistema trae de
-- fábrica, y nadie confirmó que los usen.
--
-- Eso cambia la decisión del día anterior. Reservar el concepto ya no
-- alcanza: si en unas semanas hay dos, hay que poder darle de alta,
-- nombrarlo y elegir cuál es el principal, como cualquier otra sección
-- del sistema.
--
-- Lo que sigue siendo de V1-B es el MÓDULO: transferencias entre
-- depósitos y saldo de stock separado por depósito. Poder nombrarlos no
-- es lo mismo que poder mover mercadería entre ellos.
--
-- ─── POR QUÉ CAMBIAR EL PRINCIPAL ES UNA FUNCIÓN Y NO DOS GUARDADOS ───
--
-- Son dos escrituras que tienen que pasar juntas: apagar el que estaba y
-- prender el nuevo. En dos viajes desde la pantalla, un corte en el
-- medio deja al local **sin depósito principal** — y el disparador que
-- completa los movimientos de stock empieza a rechazar toda venta, que
-- es exactamente la falla más cara que puede tener el mostrador.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.marcar_deposito_principal(p_deposito_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.deposito
     where id = p_deposito_id and activo and eliminado_en is null
  ) then
    raise exception 'Ese depósito no existe o está desactivado, así que no puede ser el principal.';
  end if;

  -- Primero se apaga el anterior: el índice no tolera dos principales.
  update public.deposito set es_principal = false
   where es_principal and id <> p_deposito_id;

  update public.deposito set es_principal = true
   where id = p_deposito_id and not es_principal;
end;
$$;

comment on function public.marcar_deposito_principal is
  'Cambia cuál es el depósito por omisión. Las dos escrituras van juntas: sin principal, ningún movimiento de stock puede registrarse.';

grant execute on function public.marcar_deposito_principal(uuid) to authenticated;

/*
  El principal no se puede desactivar ni dar de baja.

  No es una regla de pantalla: es la que sostiene que todo movimiento de
  stock tenga dónde ocurrir. Si el principal desapareciera, la próxima
  venta fallaría con un error que no menciona depósitos por ningún lado y
  nadie ataría los cabos.

  La salida es la que corresponde: primero se elige otro principal, y
  recién ahí se da de baja este.
*/
create or replace function app.el_principal_siempre_existe()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.es_principal and new.es_principal and (not new.activo or new.eliminado_en is not null) then
    raise exception
      'El depósito principal no se puede desactivar. Elegí otro como principal y después dalo de baja.';
  end if;

  return new;
end;
$$;

create trigger deposito_principal_protegido
  before update on public.deposito
  for each row execute function app.el_principal_siempre_existe();
