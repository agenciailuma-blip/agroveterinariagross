-- ═══════════════════════════════════════════════════════════════
-- 027 — DATOS DEL EMISOR Y REGISTRO DE IMPRESIÓN
--
-- Para imprimir un comprobante hacen falta datos del emisor que hasta
-- ahora no estaban en ninguna parte: el domicilio comercial, el número
-- de Ingresos Brutos y la fecha de inicio de actividades son
-- obligatorios en el encabezado de toda factura.
--
-- Van a 'configuracion' y no al código porque son exactamente el tipo
-- de dato que cambia sin avisar (una mudanza, un alta de IIBB) y que
-- el administrador tiene que poder corregir sin esperar una nueva
-- versión del sistema.
-- ═══════════════════════════════════════════════════════════════

insert into public.configuracion (clave, valor, descripcion, grupo) values
  ('comercio.nombre_fantasia', '"Agroveterinaria Gross"',
   'Nombre comercial que se imprime arriba del comprobante.', 'comercio'),
  ('comercio.domicilio', '"Libertad 315"',
   'Domicilio comercial, como figura en la constancia de ARCA.', 'comercio'),
  ('comercio.localidad', '"Oberá, Misiones"',
   'Localidad y provincia del domicilio comercial.', 'comercio'),
  -- ⚠️ Los dos que siguen quedan vacíos a propósito: no los pude
  -- verificar y son datos que van impresos en un comprobante fiscal.
  -- Mejor que el encabezado los muestre en blanco y alguien lo note,
  -- a que salga un número inventado en una factura.
  ('comercio.ingresos_brutos', '""',
   'Número de Ingresos Brutos. CONFIRMAR con el contador: para un agente de percepción suele ser el CUIT, pero no está verificado.', 'comercio'),
  ('comercio.inicio_actividades', '""',
   'Fecha de inicio de actividades (dd/mm/aaaa) como figura en ARCA. CONFIRMAR: la constancia muestra altas por actividad, la más antigua es 11/2013.', 'comercio')
on conflict (clave) do nothing;

-- ───────────────────────────────────────────────────────────────
-- Registrar que un comprobante se imprimió
--
-- Mueve el semáforo de amarillo (autorizado, sin imprimir) a verde.
-- Es una función y no un update directo porque 'impresiones' es un
-- contador: dos cajas imprimiendo el mismo duplicado no se tienen que
-- pisar. Y así la pantalla no necesita permiso de escritura sobre
-- toda la tabla de comprobantes.
-- ───────────────────────────────────────────────────────────────
create or replace function public.registrar_impresion(p_comprobante_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_impresiones integer;
begin
  update public.comprobante
     set impresiones = impresiones + 1
   where id = p_comprobante_id
     and estado in ('autorizado', 'informado', 'contingencia')
  returning impresiones into v_impresiones;

  if v_impresiones is null then
    raise exception 'Solo se imprime un comprobante autorizado.';
  end if;

  return v_impresiones;
end;
$$;

comment on function public.registrar_impresion(uuid) is
  'Suma una impresión al comprobante y devuelve el total. Mueve el semáforo de amarillo a verde.';

grant execute on function public.registrar_impresion(uuid) to authenticated;
