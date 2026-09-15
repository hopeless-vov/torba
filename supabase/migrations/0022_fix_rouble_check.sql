-- ─────────────────────────────────────────────────────────────
-- torba — 0022: the rouble check, fixed
--
--   1. refuse_rouble read `new.code` and `new.base_currency` in one CASE (0021),
--      and PL/pgSQL resolves every field an expression names even in the
--      branch that is not taken — so a company's currency could not be added
--      ("record new has no field base_currency") and the base could not change
--      ("… no field code"). Each table now reads only its own column.
--   2. the currency functions are for signed-in users only; `revoke … from
--      public` left Supabase's own grant to `anon` in place.
--
-- Safe to run again, and runnable from the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────


-- ── 1. the rouble check ──────────────────────────────────────

create or replace function public.refuse_rouble()
returns trigger
language plpgsql
as $$
declare
  v_code text;
begin
  if tg_table_name = 'companies' then
    v_code := new.base_currency;
  else
    v_code := new.code;
  end if;
  if upper(v_code) in ('RUB', 'RUR') then
    raise exception 'invalid_currency_code' using errcode = '22023';
  end if;
  return new;
end;
$$;


-- ── 2. signed-in users only ──────────────────────────────────

revoke execute on function public.ensure_platform_currency(text, text) from anon;
revoke execute on function public.change_base_currency(uuid, text, numeric) from anon;
