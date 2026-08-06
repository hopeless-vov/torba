-- ─────────────────────────────────────────────────────────────
-- torba — 0007: categories depend on brands (many-to-many)
--
-- A category used to be a flat, company-wide lookup. Now each brand
-- exposes its own set of categories: the product form and catalog
-- filter only offer the categories linked to the chosen brand. The
-- link is many-to-many, so one category (e.g. "Сироватки") can belong
-- to several brands.
--
-- Products still carry a single category_id — the join table only
-- decides which categories are *offered* for a brand, it does not
-- change the product shape.
-- ─────────────────────────────────────────────────────────────

create table public.brand_categories (
  company_id  uuid not null references public.companies (id) on delete cascade,
  brand_id    uuid not null references public.brands (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (brand_id, category_id)
);

create index brand_categories_company_id_idx on public.brand_categories (company_id);
create index brand_categories_category_id_idx on public.brand_categories (category_id);

alter table public.brand_categories enable row level security;

create policy brand_categories_company on public.brand_categories
  for all
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- Backfill from how brands and categories are already paired on existing
-- products, so nothing a company already uses disappears from its pickers.
-- Categories never yet used with a brand start unlinked and are attached
-- from the UI going forward.
insert into public.brand_categories (company_id, brand_id, category_id)
select distinct p.company_id, p.brand_id, p.category_id
from public.products p
where p.brand_id is not null
  and p.category_id is not null
on conflict do nothing;
