-- ─────────────────────────────────────────────────────────────
-- torba — 0019: one currency of account, supplier rates only
--
-- Three kinds of rate used to live side by side: a market rate per company
-- (`currencies.usd_rate`, typed in by the user and used to show any amount
-- in any currency), the base currency the books are kept in, and a single
-- supplier rate per brand for the one currency it priced in.
--
-- That is now one idea. The company keeps its books in its base currency,
-- and every amount the app shows or stores is in it. The only rates are the
-- suppliers': for each supplier, how much of the base one unit of each
-- currency the company uses is worth. It is a matrix because a supplier may
-- price in dollars and euros both, and two suppliers rarely agree on a rate.
-- Changing one reprices that supplier's goods and nothing else.
--
--   1. platform_currencies — the list a company may choose from. Kept by
--      the platform operator; the app can only read it.
--   2. orders             — always in the base currency. Orders sold in
--      another one are converted with the last market rates the app had,
--      before those rates are dropped.
--   3. rate_history       — gains the currency the rate is for.
--   4. supplier_rates     — the matrix. brands.supplier_rate carries over.
--   5. products.retail    — follows the supplier: a retail price an import
--      froze into the base goes back into the supplier's currency, so it
--      moves with the supplier's rate the way cost does.
--   6. currencies         — which platform currencies a company uses
--      besides its base. No rate any more.
--   7. brands             — lose the single rate the matrix replaces.
--   8. every currency column points at the platform list.
--   9. triggers: rate history, orders in the base, and a base currency
--      that only changes while there are no orders — resetting the
--      supplier rates when it does, since they are all "per old base".
-- ─────────────────────────────────────────────────────────────


-- ── 1. the platform's currency list ──────────────────────────

create table if not exists public.platform_currencies (
  code        text primary key check (code ~ '^[A-Z]{3}$'),
  symbol      text not null,
  sort        integer not null default 100,
  created_at  timestamptz not null default now()
);

alter table public.platform_currencies enable row level security;

drop policy if exists platform_currencies_read on public.platform_currencies;
create policy platform_currencies_read on public.platform_currencies
  for select to authenticated using (true);
-- No write policy, on purpose: the list is kept by the platform operator
-- from the SQL editor or with the service role, never from the app.

insert into public.platform_currencies (code, symbol, sort) values
  ('UAH', '₴', 10),
  ('USD', '$', 20),
  ('EUR', '€', 30)
on conflict (code) do nothing;

-- The app always wrote codes upper-case; make sure of it before they start
-- pointing at the list.
update public.companies set base_currency = upper(base_currency)
  where base_currency <> upper(base_currency);
update public.brands set catalog_currency = upper(catalog_currency)
  where catalog_currency <> upper(catalog_currency);
update public.products set cost_currency = upper(cost_currency)
  where cost_currency <> upper(cost_currency);
update public.products set retail_currency = upper(retail_currency)
  where retail_currency <> upper(retail_currency);
update public.batches set cost_currency = upper(cost_currency)
  where cost_currency <> upper(cost_currency);
update public.batches set retail_currency = upper(retail_currency)
  where retail_currency <> upper(retail_currency);

-- Any other code a price is already in joins the list, so nothing is left
-- pointing at a currency that does not exist — under the symbol the company
-- gave it, where it gave one.
insert into public.platform_currencies (code, symbol)
select used.code, coalesce(
  (select nullif(c.symbol, '') from public.currencies c where upper(c.code) = used.code limit 1),
  used.code
)
from (
  select base_currency as code from public.companies
  union select catalog_currency from public.brands
  union select cost_currency from public.products
  union select retail_currency from public.products
  union select cost_currency from public.batches where cost_currency is not null
  union select retail_currency from public.batches where retail_currency is not null
) used
where used.code ~ '^[A-Z]{3}$'
on conflict (code) do nothing;


-- ── 2. orders into the base currency ─────────────────────────
-- The last thing the market rates are good for. A market rate is "units per
-- 1 USD": a stored one wins, and failing that the defaults the app itself
-- fell back on (UAH 41, EUR 0.92) — so a converted order lands on exactly
-- the number the app was already showing for it.

create temporary table order_fx as
with rates as (
  select co.id as company_id, x.code,
    case
      when x.code = 'USD' then 1::numeric
      else coalesce(
        (select nullif(cu.usd_rate, 0) from public.currencies cu
          where cu.company_id = co.id and upper(cu.code) = x.code limit 1),
        case x.code when 'UAH' then 41::numeric when 'EUR' then 0.92::numeric end
      )
    end as usd_rate
  from public.companies co
  cross join (
    select distinct upper(currency) as code from public.orders
    union select distinct base_currency from public.companies
  ) x
)
select o.id as order_id, rb.usd_rate / nullif(ro.usd_rate, 0) as factor
from public.orders o
join public.companies co on co.id = o.company_id
join rates rb on rb.company_id = o.company_id and rb.code = co.base_currency
join rates ro on ro.company_id = o.company_id and ro.code = upper(o.currency)
where upper(o.currency) <> co.base_currency;

update public.order_items i
set unit_price = round(i.unit_price * f.factor, 2),
    unit_cost  = round(i.unit_cost * f.factor, 2)
from order_fx f
where i.order_id = f.order_id and f.factor is not null;

update public.orders o
set delivery_cost  = round(o.delivery_cost * f.factor, 2),
    packaging_cost = round(o.packaging_cost * f.factor, 2),
    currency       = co.base_currency
from order_fx f, public.companies co
where o.id = f.order_id and f.factor is not null and co.id = o.company_id;

-- An order in a currency nothing ever gave a rate for cannot be reckoned in
-- the base either. No real account has one; if one did, it would go rather
-- than skew every total it is summed into.
delete from public.orders o
using public.companies co
where co.id = o.company_id and upper(o.currency) <> co.base_currency;

-- Orders already in the base may still carry it in lower case.
update public.orders o set currency = co.base_currency
from public.companies co
where co.id = o.company_id and o.currency <> co.base_currency;

drop table order_fx;


-- ── 3. rate history names its currency ───────────────────────

alter table public.rate_history add column if not exists currency text;

update public.rate_history h set currency = b.catalog_currency
from public.brands b
where b.id = h.brand_id and h.currency is null;

alter table public.rate_history alter column currency set not null;
alter table public.rate_history alter column rate type numeric(14, 6);

create index if not exists rate_history_brand_currency_idx
  on public.rate_history (brand_id, currency, created_at desc);


-- ── 4. supplier rates: supplier × currency ───────────────────

-- A rate belongs to a supplier of the same company. The pair is what the
-- foreign key checks, so a row can never point at another company's brand.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'brands_id_company_key') then
    alter table public.brands add constraint brands_id_company_key unique (id, company_id);
  end if;
end;
$$;

create table if not exists public.supplier_rates (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  brand_id    uuid not null,
  currency    text not null references public.platform_currencies (code),
  -- Base-currency units per 1 unit of `currency`, as this supplier reckons it.
  rate        numeric(14, 6) not null check (rate > 0),
  updated_at  timestamptz not null default now(),
  unique (brand_id, currency),
  foreign key (brand_id, company_id) references public.brands (id, company_id) on delete cascade
);

create index if not exists supplier_rates_company_id_idx on public.supplier_rates (company_id);

alter table public.supplier_rates enable row level security;

-- Pricing is configuration, so it follows the brands it belongs to: every
-- member reads it, admins and up change it (see 0013).
drop policy if exists supplier_rates_read on public.supplier_rates;
create policy supplier_rates_read on public.supplier_rates for select
  using (public.is_member(company_id));

drop policy if exists supplier_rates_write on public.supplier_rates;
create policy supplier_rates_write on public.supplier_rates for insert
  with check (public.has_min_role(company_id, 'admin'));

drop policy if exists supplier_rates_modify on public.supplier_rates;
create policy supplier_rates_modify on public.supplier_rates for update
  using (public.has_min_role(company_id, 'admin'))
  with check (public.has_min_role(company_id, 'admin'));

drop policy if exists supplier_rates_remove on public.supplier_rates;
create policy supplier_rates_remove on public.supplier_rates for delete
  using (public.has_min_role(company_id, 'admin'));

-- The one rate each brand had, for the one currency it priced in.
insert into public.supplier_rates (company_id, brand_id, currency, rate, updated_at)
select b.company_id, b.id, b.catalog_currency, b.supplier_rate, coalesce(b.rate_updated_at, now())
from public.brands b
join public.companies co on co.id = b.company_id
where b.supplier_rate > 0 and b.catalog_currency <> co.base_currency
on conflict (brand_id, currency) do nothing;


-- ── 5. retail follows the supplier ───────────────────────────
-- Imports used to multiply the supplier's recommended price by the rate of
-- the day and store the result in the base, where it then sat still while
-- the rate moved. Put it back into the supplier's currency. At today's rate
-- the number shown is exactly the same; from now on it moves with the rate.

update public.products p
set retail_amount   = round(p.retail_amount / r.rate, 2),
    retail_currency = p.cost_currency
from public.companies co, public.supplier_rates r
where co.id = p.company_id
  and p.retail_amount is not null
  and p.retail_currency = co.base_currency
  and p.cost_currency <> co.base_currency
  and r.brand_id = p.brand_id
  and r.currency = p.cost_currency;


-- ── 6. the currencies a company uses ─────────────────────────
-- What it had added that the platform knows, plus whatever its prices are
-- already in — minus the base, which is always in use and needs no rate.

delete from public.currencies c
where c.code <> upper(c.code)
  and exists (
    select 1 from public.currencies d
    where d.company_id = c.company_id and d.code = upper(c.code)
  );
update public.currencies set code = upper(code) where code <> upper(code);

insert into public.currencies (company_id, code)
select used.company_id, used.code
from (
  select company_id, catalog_currency as code from public.brands
  union select company_id, cost_currency from public.products
  union select company_id, retail_currency from public.products
  union select company_id, cost_currency from public.batches where cost_currency is not null
  union select company_id, retail_currency from public.batches where retail_currency is not null
) used
join public.companies co on co.id = used.company_id
where used.code <> co.base_currency
on conflict (company_id, code) do nothing;

delete from public.currencies c
where not exists (select 1 from public.platform_currencies pc where pc.code = c.code)
   or exists (
     select 1 from public.companies co
     where co.id = c.company_id and co.base_currency = c.code
   );

alter table public.currencies drop column if exists usd_rate;
alter table public.currencies drop column if exists symbol;


-- ── 7. brands lose the single rate ───────────────────────────

alter table public.brands drop column if exists supplier_rate;
alter table public.brands drop column if exists rate_updated_at;


-- ── 8. every currency column points at the platform list ─────

do $$
declare
  fk record;
begin
  for fk in
    select * from (values
      ('companies', 'base_currency'),
      ('currencies', 'code'),
      ('brands', 'catalog_currency'),
      ('products', 'cost_currency'),
      ('products', 'retail_currency'),
      ('batches', 'cost_currency'),
      ('batches', 'retail_currency'),
      ('orders', 'currency')
    ) as t(tbl, col)
  loop
    if not exists (
      select 1 from pg_constraint where conname = fk.tbl || '_' || fk.col || '_platform_fkey'
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (%I) references public.platform_currencies (code)',
        fk.tbl, fk.tbl || '_' || fk.col || '_platform_fkey', fk.col
      );
    end if;
  end loop;
end;
$$;


-- ── 9. triggers ──────────────────────────────────────────────

-- A rate row keeps an honest timestamp, and every change goes on record.
create or replace function public.touch_supplier_rate()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists supplier_rates_touch on public.supplier_rates;
create trigger supplier_rates_touch
  before update on public.supplier_rates
  for each row execute function public.touch_supplier_rate();

create or replace function public.record_supplier_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.rate is distinct from old.rate then
    insert into public.rate_history (company_id, brand_id, currency, rate)
    values (new.company_id, new.brand_id, new.currency, new.rate);
  end if;
  return new;
end;
$$;

drop trigger if exists supplier_rates_history on public.supplier_rates;
create trigger supplier_rates_history
  after insert or update on public.supplier_rates
  for each row execute function public.record_supplier_rate();

-- A currency the company stops using takes its supplier rates with it.
create or replace function public.drop_currency_rates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.supplier_rates
  where company_id = old.company_id and currency = old.code;
  return old;
end;
$$;

drop trigger if exists currencies_drop_rates on public.currencies;
create trigger currencies_drop_rates
  after delete on public.currencies
  for each row execute function public.drop_currency_rates();

-- An order is always in the base currency, whatever the caller passed. The
-- create_order RPC still takes a currency argument; this is what makes it
-- irrelevant, without having to redefine the function.
create or replace function public.orders_in_base_currency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select base_currency into new.currency from public.companies where id = new.company_id;
  return new;
end;
$$;

drop trigger if exists orders_base_currency on public.orders;
create trigger orders_base_currency
  before insert or update of currency on public.orders
  for each row execute function public.orders_in_base_currency();

-- Changing the base. Orders are kept in the base, and once the supplier
-- rates are reset nothing could convert them into a new one — so the base
-- only moves while there are no orders. Every supplier rate is "base per
-- unit" and means nothing against a new base, so they all go and are
-- entered afresh. The old base stays in use as an ordinary currency; the
-- new one stops being listed, being the base now.
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

  if exists (select 1 from public.orders where company_id = new.id) then
    raise exception 'base_currency_locked'
      using errcode = 'P0001',
            hint = 'The base currency can only change while the company has no orders.';
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
