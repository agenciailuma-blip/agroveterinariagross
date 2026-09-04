-- ═══════════════════════════════════════════════════════════════
-- 025 — CONSULTAR EL PROPIO PERMISO DESDE FUERA DE LA BASE
--
-- app.tiene_permiso() resuelve la autorización de todas las políticas
-- RLS, pero vive en el esquema 'app', que no se expone por la Data
-- API. Eso está bien para el navegador —el permiso lo aplica RLS, no
-- hace falta preguntarlo— pero deja un hueco en las Edge Functions.
--
-- EL HUECO CONCRETO: las funciones de facturación hablan con la base
-- usando la service role, que ignora RLS por diseño (necesitan
-- escribir el CAE en el comprobante sin depender de quién llamó).
-- Supabase solo verifica que el JWT sea válido, no que el usuario
-- tenga permiso. Sin esta función, cualquier usuario autenticado
-- —un vendedor, por ejemplo— podría invocar la Edge Function y
-- emitir un comprobante fiscal.
--
-- Con esto, la Edge Function abre un segundo cliente con el token del
-- usuario que llamó y pregunta si puede, antes de hacer nada.
--
-- Es SECURITY INVOKER: no agrega privilegios, solo expone una
-- pregunta que el usuario ya podía responder sobre sí mismo. Nunca
-- informa sobre los permisos de otro: app.tiene_permiso() siempre
-- resuelve contra auth.uid().
-- ═══════════════════════════════════════════════════════════════

create or replace function public.tiene_permiso(p_clave text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select app.tiene_permiso(p_clave)
$$;

comment on function public.tiene_permiso(text) is
  'Informa si el usuario autenticado tiene un permiso. Envoltorio de app.tiene_permiso() para que las Edge Functions puedan autorizar con el token de quien llama, ya que operan con service role y RLS no las alcanza.';

revoke all on function public.tiene_permiso(text) from public, anon;
grant execute on function public.tiene_permiso(text) to authenticated;
