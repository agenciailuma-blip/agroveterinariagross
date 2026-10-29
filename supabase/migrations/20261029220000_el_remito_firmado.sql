/*
  ─────────────────────────────────────────────────────────────
  La foto del remito firmado

  Fase 03, punto 1, ④: el remito vuelve firmado por el cliente y se le
  saca una foto —con el celular o desde la PC— que queda a la vista en
  el remito y en la cuenta corriente. Es la trazabilidad: quién firmó y
  cuándo. No va en el mail de la factura: la factura sale antes de que
  firmen.

  ─── PRIVADO ───

  A diferencia de las fotos de los productos, esto tiene firmas, nombres
  y a veces documentos: el depósito no es público. La pantalla pide un
  enlace que dura unos minutos, y sólo lo consigue quien puede ver los
  remitos o la cuenta corriente.

  ─── NO SE BORRA ───

  Si se sube otra foto del mismo remito —salió movida, faltaba una hoja—
  la anterior queda guardada y se muestra la última. Ni el archivo ni el
  registro se pueden borrar ni cambiar: para la trazabilidad sirve que
  esté todo.
  ─────────────────────────────────────────────────────────────
*/

-- ─── El depósito ───

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('remitos-firmados', 'remitos-firmados', false, 3145728, array['image/webp'])
on conflict (id) do nothing;

create policy remito_firmado_subir on storage.objects
  for insert to authenticated
  with check (bucket_id = 'remitos-firmados' and app.tiene_permiso('facturacion.no_fiscal_emitir'));

create policy remito_firmado_ver on storage.objects
  for select to authenticated
  using (bucket_id = 'remitos-firmados'
         and (app.tiene_permiso('facturacion.no_fiscal_ver') or app.tiene_permiso('cuentacorriente.ver')));

-- ─── Lo que se sabe de cada foto ───

create table public.remito_firma (
  id          uuid primary key default gen_random_uuid(),
  remito_id   uuid not null references public.comprobante_no_fiscal(id),
  ruta        text not null unique,
  -- Quién firmó, si se sabe: el cliente o alguien de su parte.
  firmo       text,
  firmado_el  date not null,
  subido_por  uuid references public.usuario(id),
  subido_en   timestamptz not null default now()
);

create index remito_firma_remito on public.remito_firma (remito_id, subido_en desc);

comment on table public.remito_firma is
  'Las fotos del remito firmado: quién firmó, cuándo, y quién subió la foto. No se borran; se muestra la última.';

alter table public.remito_firma enable row level security;

create policy remito_firma_ver on public.remito_firma
  for select to authenticated
  using (app.tiene_permiso('facturacion.no_fiscal_ver') or app.tiene_permiso('cuentacorriente.ver'));

revoke all on public.remito_firma from public, anon;
grant select on public.remito_firma to authenticated;

/*
  Se anota recién cuando el archivo está: una fila sin archivo sería una
  foto rota.
*/
create function public.registrar_remito_firmado(
  p_remito_id  uuid,
  p_ruta       text,
  p_firmo      text,
  p_firmado_el date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remito record;
  v_hoy    date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_id     uuid;
begin
  if not app.tiene_permiso('facturacion.no_fiscal_emitir') then
    raise exception 'No tenés permiso para cargar remitos firmados.';
  end if;

  select id, tipo_clave, estado, fecha into v_remito
  from public.comprobante_no_fiscal
  where id = p_remito_id;

  if v_remito.id is null or v_remito.tipo_clave <> 'remito' then
    raise exception 'No se encontró el remito.';
  end if;
  if v_remito.estado = 'anulado' then
    raise exception 'El remito está anulado.';
  end if;
  if p_ruta is null or p_ruta not like p_remito_id::text || '/%' then
    raise exception 'La foto tiene que estar en la carpeta del remito.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'remitos-firmados' and o.name = p_ruta) then
    raise exception 'La foto no llegó al almacenamiento. Probá subirla de nuevo.';
  end if;
  if p_firmado_el is null or p_firmado_el > v_hoy then
    raise exception 'La fecha en que firmaron no puede ser posterior a hoy.';
  end if;
  if p_firmado_el < v_remito.fecha then
    raise exception 'La fecha en que firmaron no puede ser anterior al remito (%).', to_char(v_remito.fecha, 'DD/MM/YYYY');
  end if;

  insert into public.remito_firma (remito_id, ruta, firmo, firmado_el, subido_por)
  values (p_remito_id, p_ruta, nullif(btrim(p_firmo), ''), p_firmado_el, app.usuario_actual_id())
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.registrar_remito_firmado(uuid, text, text, date) from public, anon;
grant execute on function public.registrar_remito_firmado(uuid, text, text, date) to authenticated;
