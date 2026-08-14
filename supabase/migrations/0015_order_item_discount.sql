-- ─────────────────────────────────────────────────────────────
-- torba — 0015: per-line discount
--
-- 0005 put a discount on the order as a whole. That covers "this client
-- gets 10% off everything", but not "this one product goes out cheaper" —
-- a clearance line, a damaged box, a sweetener on a single position.
--
-- So a line now carries its own percentage. The two compose rather than
-- compete: the line discount reduces that line, the order discount then
-- reduces the resulting total. A line at 20% inside an order at 10%
-- therefore sells at 0.8 × 0.9 = 72% of list, and both numbers stay
-- literally true on the invoice.
--
-- `unit_price` stays gross, exactly as it did for the order discount, so
-- the list price a line was sold against is never lost. Existing rows
-- default to 0 and are unaffected.
-- ─────────────────────────────────────────────────────────────

alter table public.order_items
  add column if not exists discount numeric(5, 2) not null default 0;

-- create_order reads `discount` off each item; everything else matches 0013.
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
      company_id, order_id, product_id, batch_id, product_name, sku,
      qty, unit_price, unit_cost, discount
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
      v_line_discount
    );
  end loop;

  return v_order_id;
end;
$$;

grant execute on function public.create_order(uuid, text, text, jsonb, text, numeric, uuid) to authenticated;
