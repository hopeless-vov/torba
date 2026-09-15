-- ─────────────────────────────────────────────────────────────
-- torba — 0023: goods to order
--
--   1. order_items remember what they shipped short. create_order already
--      took only what the shelf held; now the missing quantity is kept on the
--      line (`backorder_qty`) with where getting it stands
--      (`procurement_status`: to_order → ordered → delivered).
--   2. delete_orders puts back only what a line actually took from its
--      batch, not the part that was never on the shelf.
--
-- Orders placed before this have no record of what they lacked, so they
-- start with nothing to order.
--
-- Safe to run again, and runnable from the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────


-- ── 1. what a line shipped short ─────────────────────────────

alter table public.order_items add column if not exists backorder_qty integer not null default 0;
alter table public.order_items add column if not exists procurement_status text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'order_items_backorder_qty_check') then
    alter table public.order_items
      add constraint order_items_backorder_qty_check check (backorder_qty >= 0 and backorder_qty <= qty);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'order_items_procurement_status_check') then
    alter table public.order_items
      add constraint order_items_procurement_status_check
      check (procurement_status in ('to_order', 'ordered', 'delivered'));
  end if;
end;
$$;

create index if not exists order_items_backorder_idx
  on public.order_items (company_id)
  where backorder_qty > 0;

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
  v_line_discount numeric;
  v_available integer;
  v_need integer;
  v_take integer;
  v_short integer;
  b record;
begin
  if v_company is null then
    raise exception 'NO_COMPANY';
  end if;

  if not public.has_min_role(v_company, 'member') then
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
    v_line_discount := least(100, greatest(0, coalesce((item ->> 'discount')::numeric, 0)));
    v_short := 0;

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
      v_short := greatest(v_qty - v_take, 0);

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
      v_short := greatest(v_need, 0);
    end if;

    insert into public.order_items (
      company_id, order_id, product_id, batch_id, product_name, sku,
      qty, unit_price, unit_cost, discount, backorder_qty, procurement_status
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
      coalesce((item ->> 'unit_cost')::numeric, 0),
      v_line_discount,
      v_short,
      case when v_short > 0 then 'to_order' end
    );
  end loop;

  return v_order_id;
end;
$$;

grant execute on function public.create_order(uuid, text, text, jsonb, text, numeric, uuid) to authenticated;


-- ── 2. deleting puts back only what was taken ────────────────

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

  if not public.has_min_role(v_company, 'member') then
    raise exception 'FORBIDDEN';
  end if;

  update public.batches b
  set remaining_qty = least(b.received_qty, b.remaining_qty + restored.qty)
  from (
    select i.batch_id, sum(i.qty - i.backorder_qty)::integer as qty
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
