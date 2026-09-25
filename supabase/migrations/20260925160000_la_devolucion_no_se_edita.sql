-- ═══════════════════════════════════════════════════════════════
-- UNA DEVOLUCIÓN NO SE EDITA: SÓLO SE LE ANOTA SU NOTA DE CRÉDITO
--
-- La migración anterior abrió la modificación de devolucion para que
-- la función pueda anotar la nota de crédito. El permiso por columna
-- que la acompaña no alcanza: la base le da a los usuarios permiso
-- sobre la tabla entera, y el de la tabla gana. Sin esto, alguien con
-- permiso de facturar podría cambiar el total o el motivo de una
-- devolución que todavía no tiene nota, por fuera de la pantalla.
--
-- Este control corre para todos, dueño incluido: una devolución es un
-- registro de lo que pasó, y lo único que le falta al nacer es el
-- número de su nota de crédito.
-- ═══════════════════════════════════════════════════════════════

create or replace function app.la_devolucion_no_se_edita()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'comprobante_id') is distinct from (to_jsonb(old) - 'comprobante_id') then
    raise exception 'Una devolución no se modifica: si estuvo mal, se registra otra.';
  end if;
  if old.comprobante_id is not null and new.comprobante_id is distinct from old.comprobante_id then
    raise exception 'La devolución ya tiene su nota de crédito.';
  end if;
  return new;
end;
$$;

create trigger la_devolucion_no_se_edita
  before update on public.devolucion
  for each row execute function app.la_devolucion_no_se_edita();

revoke all on function app.la_devolucion_no_se_edita() from public;
