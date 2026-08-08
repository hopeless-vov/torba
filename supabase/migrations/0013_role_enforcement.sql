-- ─────────────────────────────────────────────────────────────
-- torba — 0013: roles start meaning something
--
-- 0011 put every member on one `for all using (is_member(company_id))`
-- policy, so an invited viewer had exactly the same power as the owner.
-- That was deliberate: granting access and restricting it are separate,
-- separately reversible steps, and this is the restricting one.
--
-- Reading is for any member. Writing splits three ways:
--
--   member+  day-to-day trade — products, batches, clients, orders
--   admin+   the setup behind it — brands, categories, links, payment
--            methods, currencies and rates
--   owner    the company row itself (name, functional currency)
--
-- A viewer writes nothing anywhere.
--
-- Rates and currencies sit at admin, not member, because they silently
-- re-price the whole catalogue: changing a supplier rate rewrites every
-- margin in the company without touching a single product.
--
-- This is the migration that can take access away from someone who has
-- it today. Everyone currently in the system is an `owner` of their own
-- company (0011 backfilled it that way), so nobody loses anything on
-- apply — but anyone invited between 0012 and this file will drop from
-- owner-equivalent to whatever role they were actually given.
-- ─────────────────────────────────────────────────────────────

-- ── day-to-day trade: member and up ──────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array['products', 'batches', 'clients', 'orders', 'order_items']
  loop
    execute format('drop policy if exists %I_company on public.%I;', t, t);

    execute format(
      'create policy %I_read on public.%I for select
         using (public.is_member(company_id));',
      t, t
    );
    execute format(
      'create policy %I_write on public.%I for insert
         with check (public.has_min_role(company_id, ''member''));',
      t, t
    );
    execute format(
      'create policy %I_modify on public.%I for update
         using (public.has_min_role(company_id, ''member''))
         with check (public.has_min_role(company_id, ''member''));',
      t, t
    );
    execute format(
      'create policy %I_remove on public.%I for delete
         using (public.has_min_role(company_id, ''member''));',
      t, t
    );
  end loop;
end;
$$;

-- ── setup and pricing: admin and up ──────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'brands', 'rate_history', 'categories', 'brand_categories',
    'payment_methods', 'currencies'
  ]
  loop
    execute format('drop policy if exists %I_company on public.%I;', t, t);

    execute format(
      'create policy %I_read on public.%I for select
         using (public.is_member(company_id));',
      t, t
    );
    execute format(
      'create policy %I_write on public.%I for insert
         with check (public.has_min_role(company_id, ''admin''));',
      t, t
    );
    execute format(
      'create policy %I_modify on public.%I for update
         using (public.has_min_role(company_id, ''admin''))
         with check (public.has_min_role(company_id, ''admin''));',
      t, t
    );
    execute format(
      'create policy %I_remove on public.%I for delete
         using (public.has_min_role(company_id, ''admin''));',
      t, t
    );
  end loop;
end;
$$;

-- companies_update is already owner-only from 0011.

-- ── the order RPCs check the role, not just membership ───────
-- They are SECURITY DEFINER, so the policies above do not apply inside
-- them: without this a viewer could place and delete orders through the
-- functions while being unable to touch the tables directly.

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
