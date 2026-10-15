-- ═══════════════════════════════════════════════════════════════
-- La tarjeta no va al cajón
--
-- El 15/10 apareció la «Tarjeta de credito» con «Entra al arqueo de
-- caja» tildado. Se sembró sin tildar; quedó así el 17/09 en el local,
-- en la misma edición que le cambió la lista y las cuotas, y la
-- auditoría no dice quién.
--
-- El cierre de caja espera en el cajón todo lo cobrado con un medio que
-- entra al arqueo. Con la tarjeta tildada, cada venta con tarjeta
-- agrandaba una diferencia que no existe: esa plata la liquida la
-- tarjeta, no está en el cajón. Lo mismo con el débito.
--
-- Se destilda, y la base no deja volver a tildarlo en una tarjeta, igual
-- que con el cheque desde el 30/09. Sin la regla, el error vuelve con la
-- próxima edición distraída.
--
-- El update cambia actualizado_en (lo pone el disparador), así que la
-- corrección baja sola a la copia local de cada PC.
-- ═══════════════════════════════════════════════════════════════

-- Todas, también las dadas de baja: la regla nueva las alcanza igual.
update public.medio_pago
   set afecta_caja = false
 where tipo in ('tarjeta_credito', 'tarjeta_debito')
   and afecta_caja;

alter table public.medio_pago add constraint medio_pago_tarjeta_no_va_al_cajon
  check (tipo not in ('tarjeta_credito', 'tarjeta_debito') or not afecta_caja);

comment on constraint medio_pago_tarjeta_no_va_al_cajon on public.medio_pago is
  'Lo cobrado con tarjeta lo liquida la tarjeta: no está en el cajón, y si entrara al arqueo el cierre de caja daría una diferencia que no existe.';
