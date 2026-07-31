-- ─────────────────────────────────────────────────────────────
-- torba — 0004: delivery addresses, custom display currencies,
--               backorders and safe order deletion
--
-- 1. orders.delivery_address — where this particular parcel goes.
--    Prefilled from the client but editable, because the same client
--    can order to a different city.
-- 2. public.currencies — extra display currencies the owner can add
--    (EUR, PLN, …) on top of the built-in USD base and UAH brand rates.
-- 3. create_order no longer refuses to sell what is not in stock: it
--    draws down whatever exists and lets the rest go out as a
--    backorder, so a product can always be put in the cart.
-- 4. delete_orders returns the drawn-down stock to its batches before
--    removing the orders (order_items cascade).
-- ─────────────────────────────────────────────────────────────

-- ── 1. where the parcel goes ─────────────────────────────────
alter table public.orders
  add column if not exists delivery_address text;

-- ── 2. user-defined display currencies ───────────────────────
-- USD is the stored base and UAH is derived from each brand's own rate,
-- so both stay built in. Anything added here converts with one flat
-- company-wide rate: `usd_rate` = units of this currency per 1 USD.
create table if not exists public.currencies (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  code        text not null,
  symbol      text not null default '',
  usd_rate    numeric(12, 4) not null default 0,
  created_at  timestamptz not null default now(),
  unique (company_id, code)
);

create index if not exists currencies_company_id_idx on public.currencies (company_id);

alter table public.currencies enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'currencies' and policyname = 'currencies_company'
  ) then
    create policy currencies_company on public.currencies for all
      using (company_id = public.current_company_id())
      with check (company_id = public.current_company_id());
  end if;
end;
$$;

-- ── 3. order creation, backorder-tolerant ────────────────────
-- p_items: jsonb array of
--   { product_id, batch_id, product_name, sku, qty, unit_price, unit_cost }
-- A line tied to a batch draws from that batch; a catalog line (no batch)
-- draws FIFO across the product's batches by expiry. Stock is still
-- row-locked and can never go negative — a line that exceeds what is on
-- hand simply ships short, and the order records the full quantity.
create or replace function public.create_order(
  p_client_id uuid,
  p_payment_method text,
  p_currency text,
  p_items jsonb,
  p_delivery_address text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_order_id uuid;
  v_number integer;
  v_address text := nullif(btrim(coalesce(p_delivery_address, '')), '');
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
    company_id, number, client_id, status, payment_method, currency, delivery_address
  )
  values (
    v_company, v_number, p_client_id, 'new', p_payment_method,
    coalesce(p_currency, 'UAH'), v_address
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

grant execute on function public.create_order(uuid, text, text, jsonb, text) to authenticated;

-- The 4-argument signature from 0002 would still resolve for older
-- clients; drop it so there is exactly one create_order.
drop function if exists public.create_order(uuid, text, text, jsonb);

-- ── 4. deleting orders puts the goods back on the shelf ──────
-- Only batch-tied lines can be restored precisely; a FIFO line has no
-- single batch to credit, so it is left alone (the order is still
-- removed). remaining_qty is capped at received_qty so a batch can
-- never end up holding more than it was delivered with.
create or replace function public.delete_orders(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.current_company_id();
  v_deleted integer;
begin
  if v_company is null then
    raise exception 'NO_COMPANY';
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

grant execute on function public.delete_orders(uuid[]) to authenticated;
