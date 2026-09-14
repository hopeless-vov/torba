-- ─────────────────────────────────────────────────────────────
-- torba — 0021: no Russian rouble
--
-- RUB (and the pre-1998 RUR) are not offered anywhere. The app leaves them
-- out of every currency picker; this makes the database refuse them too:
--
--   1. ensure_platform_currency will not put them on the platform list.
--   2. change_base_currency will not make them a base.
--   3. a company cannot add them to its currencies.
--   4. the platform list drops them wherever nothing still refers to them.
--
-- Safe to run again, and runnable from the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────


-- ── 1. the platform list ─────────────────────────────────────

create or replace function public.ensure_platform_currency(p_code text, p_symbol text)
returns public.platform_currencies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code   text := upper(trim(coalesce(p_code, '')));
  v_symbol text := trim(coalesce(p_symbol, ''));
  v_row    public.platform_currencies;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_code !~ '^[A-Z]{3}$' or v_code in ('RUB', 'RUR') then
    raise exception 'invalid_currency_code' using errcode = '22023';
  end if;
  if v_symbol = '' or length(v_symbol) > 8 then
    v_symbol := v_code;
  end if;

  insert into public.platform_currencies (code, symbol)
  values (v_code, v_symbol)
  on conflict (code) do nothing;

  select * into v_row from public.platform_currencies where code = v_code;
  return v_row;
end;
$$;

revoke all on function public.ensure_platform_currency(text, text) from public;
grant execute on function public.ensure_platform_currency(text, text) to authenticated;


-- ── 2 & 3. a base or company currency ────────────────────────

create or replace function public.refuse_rouble()
returns trigger
language plpgsql
as $$
declare
  v_code text := case tg_table_name when 'companies' then new.base_currency else new.code end;
begin
  if upper(v_code) in ('RUB', 'RUR') then
    raise exception 'invalid_currency_code' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists currencies_refuse_rouble on public.currencies;
create trigger currencies_refuse_rouble
  before insert or update of code on public.currencies
  for each row execute function public.refuse_rouble();

drop trigger if exists companies_refuse_rouble on public.companies;
create trigger companies_refuse_rouble
  before insert or update of base_currency on public.companies
  for each row execute function public.refuse_rouble();


-- ── 4. off the list, where nothing uses it ───────────────────

delete from public.platform_currencies pc
where pc.code in ('RUB', 'RUR')
  and not exists (select 1 from public.companies where base_currency = pc.code)
  and not exists (select 1 from public.currencies where code = pc.code)
  and not exists (select 1 from public.brands where catalog_currency = pc.code)
  and not exists (select 1 from public.products where cost_currency = pc.code or retail_currency = pc.code)
  and not exists (select 1 from public.batches where cost_currency = pc.code or retail_currency = pc.code)
  and not exists (select 1 from public.orders where currency = pc.code)
  and not exists (select 1 from public.supplier_rates where currency = pc.code);
