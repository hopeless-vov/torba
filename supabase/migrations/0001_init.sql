-- ─────────────────────────────────────────────────────────────
-- torba — initial schema
--
-- Multi-tenant by company. Today one owner (admin) per company;
-- the model already carries company_id + role everywhere so extra
-- members can be added later without a migration of the data shape.
--
-- Canonical currency is USD: product prices are stored in USD and
-- converted for display via each brand's exchange rate. Orders store
-- the actually-transacted amounts (UAH by default) as snapshots.
-- ─────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ── helpers ──────────────────────────────────────────────────
-- Note: current_company_id() is defined further down, right after the
-- `profiles` table, because its body references that table and Postgres
-- validates SQL function bodies at creation time.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── companies ────────────────────────────────────────────────

create table public.companies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  owner_id        uuid not null references auth.users (id) on delete cascade,
  base_currency   text not null default 'USD',
  display_currency text not null default 'UAH',
  created_at      timestamptz not null default now()
);

-- ── profiles (1:1 with auth.users) ───────────────────────────

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  company_id  uuid not null references public.companies (id) on delete cascade,
  full_name   text,
  role        text not null default 'owner' check (role in ('owner', 'member')),
  created_at  timestamptz not null default now()
);

create index profiles_company_id_idx on public.profiles (company_id);

-- company_id of the currently authenticated user (used by every RLS policy).
-- Defined here — after `profiles` — so its body validates against a table
-- that already exists.
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid();
$$;

-- ── brands (each carries its own USD→display rate) ───────────

create table public.brands (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies (id) on delete cascade,
  name            text not null,
  usd_rate        numeric(12, 4) not null default 0,
  rate_updated_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (company_id, name)
);

create index brands_company_id_idx on public.brands (company_id);

-- ── rate history (per brand) ─────────────────────────────────

create table public.rate_history (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  brand_id    uuid not null references public.brands (id) on delete cascade,
  rate        numeric(12, 4) not null,
  created_at  timestamptz not null default now()
);

create index rate_history_brand_id_idx on public.rate_history (brand_id, created_at desc);

-- ── categories (user-defined lookup) ─────────────────────────

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (company_id, name)
);

create index categories_company_id_idx on public.categories (company_id);

-- ── payment methods (user-defined lookup) ────────────────────

create table public.payment_methods (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (company_id, name)
);

create index payment_methods_company_id_idx on public.payment_methods (company_id);

-- ── products (catalogue) ─────────────────────────────────────

create table public.products (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies (id) on delete cascade,
  brand_id          uuid references public.brands (id) on delete set null,
  category_id       uuid references public.categories (id) on delete set null,
  sku               text not null,
  name              text not null,
  volume            text,
  price_usd         numeric(12, 2) not null default 0,       -- purchase price, USD
  retail_price_usd  numeric(12, 2),                          -- recommended retail, USD (nullable)
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (company_id, sku)
);

create index products_company_id_idx on public.products (company_id);
create index products_brand_id_idx on public.products (brand_id);
create index products_category_id_idx on public.products (category_id);

create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

-- ── batches (warehouse stock with expiry) ────────────────────

create table public.batches (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  product_id    uuid not null references public.products (id) on delete cascade,
  batch_number  text,
  delivery_date date,
  expiry_date   date,
  received_qty  integer not null default 0,
  remaining_qty integer not null default 0,
  created_at    timestamptz not null default now()
);

create index batches_company_id_idx on public.batches (company_id);
create index batches_product_id_idx on public.batches (product_id);
create index batches_expiry_idx on public.batches (expiry_date);

-- ── clients ──────────────────────────────────────────────────

create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  name        text not null,
  phone       text,
  city        text,
  delivery    text,
  note        text,
  created_at  timestamptz not null default now()
);

create index clients_company_id_idx on public.clients (company_id);

-- ── orders ───────────────────────────────────────────────────

create table public.orders (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies (id) on delete cascade,
  number          integer not null,
  client_id       uuid references public.clients (id) on delete set null,
  status          text not null default 'new'
                    check (status in ('new', 'paid', 'sent', 'done')),
  payment_method  text,
  currency        text not null default 'UAH',
  tracking_number text,
  delivery_cost   numeric(12, 2) not null default 0,
  packaging_cost  numeric(12, 2) not null default 0,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (company_id, number)
);

create index orders_company_id_idx on public.orders (company_id, created_at desc);
create index orders_client_id_idx on public.orders (client_id);

create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();

-- next order number, per company (called from the app on create)
create or replace function public.next_order_number(p_company_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(number), 2040) + 1
  from public.orders
  where company_id = p_company_id;
$$;

-- ── order items (line snapshots in transacted currency) ──────

create table public.order_items (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  order_id      uuid not null references public.orders (id) on delete cascade,
  product_id    uuid references public.products (id) on delete set null,
  batch_id      uuid references public.batches (id) on delete set null,
  product_name  text not null,
  sku           text,
  qty           integer not null default 1,
  unit_price    numeric(12, 2) not null default 0,   -- sale price / unit, order currency
  unit_cost     numeric(12, 2) not null default 0,   -- purchase cost / unit, order currency
  created_at    timestamptz not null default now()
);

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_company_id_idx on public.order_items (company_id);

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────

alter table public.companies       enable row level security;
alter table public.profiles        enable row level security;
alter table public.brands          enable row level security;
alter table public.rate_history    enable row level security;
alter table public.categories      enable row level security;
alter table public.payment_methods enable row level security;
alter table public.products        enable row level security;
alter table public.batches         enable row level security;
alter table public.clients         enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;

-- companies: read your own, owner can update
create policy companies_select on public.companies
  for select using (id = public.current_company_id());
create policy companies_update on public.companies
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- profiles: read/update only your own row
create policy profiles_select on public.profiles
  for select using (id = auth.uid());
create policy profiles_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- every other table: full access within your company
do $$
declare
  t text;
begin
  foreach t in array array[
    'brands', 'rate_history', 'categories', 'payment_methods',
    'products', 'batches', 'clients', 'orders', 'order_items'
  ]
  loop
    execute format(
      'create policy %I_company on public.%I for all
         using (company_id = public.current_company_id())
         with check (company_id = public.current_company_id());',
      t, t
    );
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- New-user bootstrap: create a company + owner profile and seed
-- sensible default categories / payment methods.
-- ─────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
begin
  insert into public.companies (name, owner_id)
  values (
    coalesce(nullif(new.raw_user_meta_data ->> 'company_name', ''), 'Моя компанія'),
    new.id
  )
  returning id into new_company_id;

  insert into public.profiles (id, company_id, full_name, role)
  values (
    new.id,
    new_company_id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    'owner'
  );

  insert into public.categories (company_id, name)
  select new_company_id, name
  from (values
    ('Сонцезахист'), ('Догляд'), ('Тон'), ('Сироватки'),
    ('Очищення'), ('Пілінги'), ('Маски'), ('Набори'), ('Семпли')
  ) as seed(name);

  insert into public.payment_methods (company_id, name)
  select new_company_id, name
  from (values ('Готівка'), ('Накладний платіж'), ('Рахунок')) as seed(name);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
