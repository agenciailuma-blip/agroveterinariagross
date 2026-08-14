-- ═══════════════════════════════════════════════════════════════
-- 020 — Verificar permiso tambien al CONSULTAR bloqueos
--
-- hay_terminales_bloqueadas() quedo SECURITY DEFINER sin verificar
-- nada. El dato que expone es menor —cuantas terminales estan
-- bloqueadas— pero la regla no admite excepciones por tamano: si una
-- funcion privilegiada no verifica, en la proxima revision alguien la
-- toma de ejemplo y copia el descuido a una que si importa.
--
-- Las otras cuatro funciones privilegiadas del sistema si verifican, y
-- el linter las va a seguir marcando: es esperable. Una funcion
-- SECURITY DEFINER invocable por usuarios con sesion es correcta
-- mientras autorice adentro, que es exactamente lo que hacen.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.hay_terminales_bloqueadas()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.tiene_permiso('usuarios.gestionar') then
    raise exception 'No tenes permiso para consultar el estado de las terminales.';
  end if;

  return (
    select count(*)::integer from app.intento_pin
    where bloqueado_hasta is not null and bloqueado_hasta > now()
  );
end;
$$;

revoke all on function public.hay_terminales_bloqueadas() from public, anon;
grant execute on function public.hay_terminales_bloqueadas() to authenticated;

comment on function public.hay_terminales_bloqueadas() is
  'Cuantas terminales estan bloqueadas por intentos fallidos de PIN. Requiere permiso de gestionar usuarios.';
