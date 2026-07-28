-- ─────────────────────────────────────────────────────────────
-- torba — 0002: resilient company/profile bootstrap + atomic orders
--
-- Adds a client-callable bootstrap so a company + owner profile are
-- guaranteed even if the auth.users trigger never fired, backfills any
-- existing user that is missing a profile, and moves order creation into
-- a single atomic function that decrements warehouse stock (row-locked,
-- FIFO by expiry) so we can never oversell.
-- ─────────────────────────────────────────────────────────────

-- ── bootstrap: create the caller's company + profile if missing ──
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

  select company_id into v_company from public.profiles where id = v_uid;
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
  );

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

grant execute on function public.bootstrap_current_user(text, text) to authenticated;

-- ── backfill: fix any already-registered user without a profile ──
do $$
declare
  u record;
  v_company uuid;
begin
  for u in
    select id, email, raw_user_meta_data
    from auth.users
    where id not in (select id from public.profiles)
  loop
    insert into public.companies (name, owner_id)
    values (coalesce(nullif(u.raw_user_meta_data ->> 'company_name', ''), 'Моя компанія'), u.id)
    returning id into v_company;

    insert into public.profiles (id, company_id, full_name, role)
    values (
      u.id,
      v_company,
      coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1)),
      'owner'
    );

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
  end loop;
end;
$$;

-- ── atomic order creation with stock decrement ───────────────────
-- p_items: jsonb array of
--   { product_id, batch_id, product_name, sku, qty, unit_price, unit_cost }
-- A line tied to a batch draws from that batch; a catalog line (no batch)
-- draws FIFO across the product's batches by expiry. Overselling raises
-- 'INSUFFICIENT_STOCK:<product name>'.
create or replace function public.create_order(
  p_client_id uuid,
  p_payment_method text,
  p_currency text,
  p_items jsonb
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

  v_number := public.next_order_number(v_company);

  insert into public.orders (company_id, number, client_id, status, payment_method, currency)
  values (v_company, v_number, p_client_id, 'new', p_payment_method, coalesce(p_currency, 'UAH'))
  returning id into v_order_id;

  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_product_id := nullif(item ->> 'product_id', '')::uuid;
    v_batch_id := nullif(item ->> 'batch_id', '')::uuid;
    v_qty := coalesce((item ->> 'qty')::integer, 0);

    if v_batch_id is not null then
      -- Specific batch: lock, check, decrement.
      select remaining_qty into v_available
      from public.batches
      where id = v_batch_id and company_id = v_company
      for update;

      if v_available is null then
        raise exception 'BATCH_NOT_FOUND';
      end if;
      if v_available < v_qty then
        raise exception 'INSUFFICIENT_STOCK:%', coalesce(item ->> 'product_name', '');
      end if;

      update public.batches
      set remaining_qty = remaining_qty - v_qty
      where id = v_batch_id and company_id = v_company;

    elsif v_product_id is not null then
      -- Catalog line: draw FIFO across the product's batches.
      select coalesce(sum(remaining_qty), 0) into v_available
      from public.batches
      where product_id = v_product_id and company_id = v_company;

      if v_available < v_qty then
        raise exception 'INSUFFICIENT_STOCK:%', coalesce(item ->> 'product_name', '');
      end if;

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

grant execute on function public.create_order(uuid, text, text, jsonb) to authenticated;
