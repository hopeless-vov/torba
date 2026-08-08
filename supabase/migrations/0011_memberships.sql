-- ─────────────────────────────────────────────────────────────
-- torba — 0011: memberships (a user can belong to several companies)
--
-- Until now `profiles` was 1:1 with auth.users and carried exactly one
-- `company_id NOT NULL`, so a user *was* their company. Every RLS policy
-- asked current_company_id(), which read that single column.
--
-- Membership moves to its own table, keyed (company_id, user_id), and the
-- policies ask `is_member(company_id)` instead. A user keeps their own
-- company and can be added to others; which one is *active* is a client
-- concern (it travels as an explicit company_id on every query), so two
-- browser tabs can sit in different organizations and nothing is written
-- to the database just to switch.
--
-- This migration is deliberately behaviour-preserving: every existing
-- user is backfilled as `owner` of the company they already had, and the
-- role column is not yet enforced anywhere. Roles gain teeth in a later
-- migration, so that granting access and restricting it are separate,
-- separately reversible steps.
--
-- `profiles.role` is left in place but is no longer the authority on what
-- anyone may do — memberships.role is. 0010 froze it against writes.
-- ─────────────────────────────────────────────────────────────

-- ── memberships ──────────────────────────────────────────────

create table public.memberships (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'member'
               check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

-- "which organizations am I in" is the switcher's hot path.
create index memberships_user_id_idx on public.memberships (user_id);

alter table public.memberships enable row level security;

-- Reads only. Membership is granted and revoked through SECURITY DEFINER
-- functions (invitations, role management) which run as the table owner
-- and bypass RLS; there is deliberately no write policy, so a user can
-- never insert themselves into a company.
revoke all on public.memberships from anon, authenticated;
grant select on public.memberships to authenticated;

-- ── membership helpers ───────────────────────────────────────
-- All SECURITY DEFINER: they read `memberships` from inside policies on
-- `memberships` itself, and a definer function bypasses RLS, which is
-- what stops the policy from recursing into itself.

create or replace function public.is_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where company_id = p_company_id and user_id = auth.uid()
  );
$$;

create or replace function public.role_at(p_company_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.memberships
  where company_id = p_company_id and user_id = auth.uid();
$$;

-- viewer < member < admin < owner. Unknown roles rank 0 so a typo can
-- only ever deny, never grant.
create or replace function public.role_rank(p_role text)
returns integer
language sql
immutable
as $$
  select case p_role
    when 'viewer' then 1
    when 'member' then 2
    when 'admin'  then 3
    when 'owner'  then 4
    else 0
  end;
$$;

create or replace function public.has_min_role(p_company_id uuid, p_min text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.role_rank(public.role_at(p_company_id)) >= public.role_rank(p_min);
$$;

-- Do two users share any organization? Used by profiles_select so
-- co-members can see each other's names on the members screen.
create or replace function public.shares_company(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.company_id = mine.company_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_user_id
  );
$$;

grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.role_at(uuid) to authenticated;
grant execute on function public.has_min_role(uuid, text) to authenticated;

-- ── backfill ─────────────────────────────────────────────────
-- From both directions: every profile's company, and every company's
-- recorded owner. They agree today, but a company whose owner_id points
-- at a user whose profile drifted elsewhere would otherwise end up with
-- no owner at all — and an ownerless company cannot be administered.

insert into public.memberships (company_id, user_id, role)
select p.company_id, p.id, 'owner' from public.profiles p
union
select c.id, c.owner_id, 'owner' from public.companies c
on conflict (company_id, user_id) do nothing;

-- ── policies: company-scoped tables ──────────────────────────
-- Same shape as before, with is_member(company_id) replacing the
-- equality against the caller's single company.

do $$
declare
  t text;
begin
  foreach t in array array[
    'brands', 'rate_history', 'categories', 'payment_methods',
    'products', 'batches', 'clients', 'orders', 'order_items',
    'currencies', 'brand_categories'
  ]
  loop
    execute format('drop policy if exists %I_company on public.%I;', t, t);
    execute format(
      'create policy %I_company on public.%I for all
         using (public.is_member(company_id))
         with check (public.is_member(company_id));',
      t, t
    );
  end loop;
end;
$$;

-- ── policies: memberships ────────────────────────────────────

create policy memberships_select on public.memberships
  for select using (user_id = auth.uid() or public.is_member(company_id));

-- ── policies: companies ──────────────────────────────────────
-- Was `id = current_company_id()`, which returns exactly one row — the
-- organization switcher needs to list them all.

drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select using (public.is_member(id));

-- Equivalent to the old `owner_id = auth.uid()` now that every owner_id
-- is backfilled as an 'owner' membership, but it keeps working after
-- ownership is transferred, which owner_id alone would not.
drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies
  for update
  using (public.has_min_role(id, 'owner'))
  with check (public.has_min_role(id, 'owner'));

-- ── policies: profiles ───────────────────────────────────────
-- Was `id = auth.uid()`, which hid every co-member's name.

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.shares_company(id));

-- ── bootstrap paths also record membership ───────────────────

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

  insert into public.memberships (company_id, user_id, role)
  values (new_company_id, new.id, 'owner')
  on conflict (company_id, user_id) do nothing;

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

create or replace function public.bootstrap_current_user(
  p_company_name text default null,
  p_full_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_email text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Already a member of something? Then nothing needs provisioning —
  -- an invited user who has no company of their own is a valid state.
  select company_id into v_company
  from public.memberships
  where user_id = v_uid
  order by created_at asc
  limit 1;

  if v_company is not null then
    return v_company;
  end if;

  select email into v_email from auth.users where id = v_uid;

  insert into public.companies (name, owner_id)
  values (coalesce(nullif(p_company_name, ''), 'Моя компанія'), v_uid)
  returning id into v_company;

  insert into public.profiles (id, company_id, full_name, role)
  values (
    v_uid,
    v_company,
    coalesce(nullif(p_full_name, ''), split_part(coalesce(v_email, ''), '@', 1)),
    'owner'
  )
  on conflict (id) do nothing;

  insert into public.memberships (company_id, user_id, role)
  values (v_company, v_uid, 'owner')
  on conflict (company_id, user_id) do nothing;

  insert into public.categories (company_id, name)
  select v_company, name
  from (values
    ('Сонцезахист'), ('Догляд'), ('Тон'), ('Сироватки'),
    ('Очищення'), ('Пілінги'), ('Маски'), ('Набори'), ('Семпли')
  ) as seed(name)
  on conflict (company_id, name) do nothing;

  insert into public.payment_methods (company_id, name)
  select v_company, name
  from (values ('Готівка'), ('Накладний платіж'), ('Рахунок')) as seed(name)
  on conflict (company_id, name) do nothing;

  return v_company;
end;
$$;

-- ── RPCs take the company explicitly ─────────────────────────
-- These ran against current_company_id(), which no longer identifies
-- "the company the user is looking at". The parameter is optional and
-- falls back to the old behaviour, so the currently deployed client keeps
-- working until it is updated to pass it.

create or replace function public.next_order_number(p_company_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_member(p_company_id)
      then coalesce(max(number), 2040) + 1
  end
  from public.orders
  where company_id = p_company_id;
$$;

create or replace function public.create_order(
  p_client_id uuid,
  p_payment_method text,
  p_currency text,
  p_items jsonb,
  p_delivery_address text default null,
  p_discount numeric default 0,
  p_company_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := coalesce(p_company_id, public.current_company_id());
  v_order_id uuid;
  v_number integer;
  v_address text := nullif(btrim(coalesce(p_delivery_address, '')), '');
  v_discount numeric := least(100, greatest(0, coalesce(p_discount, 0)));
  item jsonb;
  v_product_id uuid;
  v_batch_id uuid;
  v_qty integer;
  v_available integer;
  v_need integer;
  v_take integer;
  b record;
begin
  if v_company is null then
    raise exception 'NO_COMPANY';
  end if;

  -- The function runs as the table owner, so RLS is not doing this check
  -- for us: an arbitrary company id would otherwise write into any tenant.
  if not public.is_member(v_company) then
    raise exception 'FORBIDDEN';
  end if;

  -- Fall back to the client's usual delivery details.
  if v_address is null and p_client_id is not null then
    select nullif(btrim(concat_ws(', ', nullif(btrim(coalesce(city, '')), ''),
                                        nullif(btrim(coalesce(delivery, '')), ''))), '')
      into v_address
    from public.clients
    where id = p_client_id and company_id = v_company;
  end if;

  v_number := public.next_order_number(v_company);

  insert into public.orders (
    company_id, number, client_id, status, payment_method, currency, discount, delivery_address
  )
  values (
    v_company, v_number, p_client_id, 'new', p_payment_method,
    coalesce(p_currency, 'UAH'), v_discount, v_address
  )
  returning id into v_order_id;

  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_product_id := nullif(item ->> 'product_id', '')::uuid;
    v_batch_id := nullif(item ->> 'batch_id', '')::uuid;
    v_qty := coalesce((item ->> 'qty')::integer, 0);

    if v_batch_id is not null then
      -- Specific batch: lock it and take as much as it holds.
      select remaining_qty into v_available
      from public.batches
      where id = v_batch_id and company_id = v_company
      for update;

      if v_available is null then
        raise exception 'BATCH_NOT_FOUND';
      end if;

      v_take := least(v_qty, greatest(v_available, 0));
      if v_take > 0 then
        update public.batches
        set remaining_qty = remaining_qty - v_take
        where id = v_batch_id and company_id = v_company;
      end if;

    elsif v_product_id is not null then
      -- Catalog line: draw FIFO across the product's batches, stopping
      -- when they run dry instead of failing the whole order.
      v_need := v_qty;
      for b in
        select id, remaining_qty
        from public.batches
        where product_id = v_product_id and company_id = v_company and remaining_qty > 0
        order by expiry_date asc nulls last, created_at asc
        for update
      loop
        exit when v_need <= 0;
        v_take := least(v_need, b.remaining_qty);
        update public.batches set remaining_qty = remaining_qty - v_take where id = b.id;
        v_need := v_need - v_take;
      end loop;
    end if;

    insert into public.order_items (
      company_id, order_id, product_id, batch_id, product_name, sku, qty, unit_price, unit_cost
    )
    values (
      v_company,
      v_order_id,
      v_product_id,
      v_batch_id,
      coalesce(item ->> 'product_name', ''),
      nullif(item ->> 'sku', ''),
      v_qty,
      coalesce((item ->> 'unit_price')::numeric, 0),
      coalesce((item ->> 'unit_cost')::numeric, 0)
    );
  end loop;

  return v_order_id;
end;
$$;

grant execute on function public.create_order(uuid, text, text, jsonb, text, numeric, uuid) to authenticated;

-- Replace the 6-argument signature from 0005 so there is exactly one
-- create_order to resolve against.
drop function if exists public.create_order(uuid, text, text, jsonb, text, numeric);

create or replace function public.delete_orders(
  p_ids uuid[],
  p_company_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := coalesce(p_company_id, public.current_company_id());
  v_deleted integer;
begin
  if v_company is null then
    raise exception 'NO_COMPANY';
  end if;

  if not public.is_member(v_company) then
    raise exception 'FORBIDDEN';
  end if;

  update public.batches b
  set remaining_qty = least(b.received_qty, b.remaining_qty + restored.qty)
  from (
    select i.batch_id, sum(i.qty)::integer as qty
    from public.order_items i
    join public.orders o on o.id = i.order_id
    where o.id = any (p_ids)
      and o.company_id = v_company
      and i.batch_id is not null
    group by i.batch_id
  ) as restored
  where b.id = restored.batch_id and b.company_id = v_company;

  delete from public.orders
  where id = any (p_ids) and company_id = v_company;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

grant execute on function public.delete_orders(uuid[], uuid) to authenticated;

drop function if exists public.delete_orders(uuid[]);

-- current_company_id() survives only as the "home company" fallback for
-- the two RPCs above while the client is still being taught to pass the
-- active company. Nothing in RLS depends on it any more.
comment on function public.current_company_id() is
  'Deprecated: the user''s home company. Authorization uses is_member()/has_min_role().';
