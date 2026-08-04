-- ─────────────────────────────────────────────────────────────
-- torba — 0005: order-level discount
--
-- A discount percentage lives on the order itself, not baked into each
-- line price. Line prices stay gross; the sale total is reduced by
-- `discount`%. This keeps the discount visible and editable after the
-- sale (cart and order-edit both write it). Existing orders default to 0,
-- so their already-net line prices are unaffected.
-- ─────────────────────────────────────────────────────────────

alter table public.orders
  add column if not exists discount numeric(5, 2) not null default 0;

-- create_order gains p_discount; everything else matches 0004.
create or replace function public.create_order(
  p_client_id uuid,
  p_payment_method text,
  p_currency text,
  p_items jsonb,
  p_delivery_address text default null,
  p_discount numeric default 0
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

grant execute on function public.create_order(uuid, text, text, jsonb, text, numeric) to authenticated;

-- Replace the 5-argument signature from 0004 so there is exactly one
-- create_order to resolve against.
drop function if exists public.create_order(uuid, text, text, jsonb, text);
