-- ─────────────────────────────────────────────────────────────
-- torba — 0020: currencies a company can add itself, and a base that moves
--
-- 0019 made the currency list the platform's to keep and pinned the base
-- once the first order existed. In practice both got in the way:
--
--   1. ensure_platform_currency — a company adds any ISO currency itself.
--      The list stays shared and append-only: a code that is already there
--      is left exactly as it is, and nothing is ever removed or renamed from
--      the app.
--   2. change_base_currency — the owner moves the base even with orders on
--      the books. Orders are kept in the base, so they are converted with the
--      one rate the owner gives for it (new base per 1 unit of the old). The
--      supplier rates are still reset: they are "old base per unit" and are
--      entered afresh against the new one.
--   3. the base-change trigger lets a change through while orders exist only
--      from inside change_base_currency, which is what converts them. A plain
--      update of `companies.base_currency` with orders is still refused.
--
-- `brands.catalog_currency` stays as a column but the app no longer asks for
-- it: a supplier's usual currency is read off its products instead.
--
-- Safe to run again, and runnable from the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────


-- ── 1. adding a currency to the platform list ────────────────

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
  if v_code !~ '^[A-Z]{3}$' then
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


-- ── 3. the trigger: orders only through the function ─────────
-- (Defined before the function that relies on it.)

create or replace function public.on_base_currency_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.base_currency is not distinct from old.base_currency then
    return new;
  end if;

  if coalesce(current_setting('torba.base_change', true), '') <> 'converting'
     and exists (select 1 from public.orders where company_id = new.id) then
    raise exception 'base_currency_locked'
      using errcode = 'P0001',
            hint = 'With orders on the books, change the base through change_base_currency.';
  end if;

  delete from public.supplier_rates where company_id = new.id;

  insert into public.currencies (company_id, code)
  values (new.id, old.base_currency)
  on conflict (company_id, code) do nothing;

  delete from public.currencies where company_id = new.id and code = new.base_currency;

  return new;
end;
$$;

drop trigger if exists companies_base_currency_change on public.companies;
create trigger companies_base_currency_change
  before update of base_currency on public.companies
  for each row execute function public.on_base_currency_change();


-- ── 2. changing the base ─────────────────────────────────────

create or replace function public.change_base_currency(
  p_company_id uuid,
  p_code       text,
  p_rate       numeric default null
)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code  text := upper(trim(coalesce(p_code, '')));
  v_old   text;
  v_row   public.companies;
begin
  if not public.has_min_role(p_company_id, 'owner') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.platform_currencies where code = v_code) then
    raise exception 'invalid_currency_code' using errcode = '22023';
  end if;

  select base_currency into v_old from public.companies where id = p_company_id for update;
  if v_old = v_code then
    select * into v_row from public.companies where id = p_company_id;
    return v_row;
  end if;

  if exists (select 1 from public.orders where company_id = p_company_id) then
    if p_rate is null or p_rate <= 0 then
      raise exception 'base_currency_rate_required'
        using errcode = 'P0001',
              hint = 'Orders exist: pass how much of the new base one unit of the old base is worth.';
    end if;
  end if;

  perform set_config('torba.base_change', 'converting', true);
  update public.companies set base_currency = v_code where id = p_company_id;
  perform set_config('torba.base_change', '', true);

  -- Every stored order amount, old base → new. The orders trigger stamps the
  -- new base on each order as its currency changes.
  if p_rate is not null and p_rate > 0 then
    update public.order_items i
    set unit_price = round(i.unit_price * p_rate, 2),
        unit_cost  = round(i.unit_cost * p_rate, 2)
    from public.orders o
    where o.id = i.order_id and o.company_id = p_company_id;

    update public.orders
    set delivery_cost  = round(delivery_cost * p_rate, 2),
        packaging_cost = round(packaging_cost * p_rate, 2),
        currency       = v_code
    where company_id = p_company_id;
  end if;

  select * into v_row from public.companies where id = p_company_id;
  return v_row;
end;
$$;

revoke all on function public.change_base_currency(uuid, text, numeric) from public;
grant execute on function public.change_base_currency(uuid, text, numeric) to authenticated;
