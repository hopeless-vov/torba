-- ─────────────────────────────────────────────────────────────
-- torba — 0008: every product price carries its own currency
--
-- Prices used to be stored against an implicit currency: cost in the
-- brand's catalog currency, retail in the company's functional currency.
-- That implicitness is what made the currency flow hard to follow. Now
-- each amount stores the currency it was entered in, and everything is
-- converted for display through the shared rate table (public.currencies).
--
-- The base currency (companies.base_currency) becomes the default display
-- currency and the anchor rates are entered against — it no longer decides
-- how a stored amount is interpreted, so switching it is a display concern
-- (brand supplier rates, which are still kept per brand, are re-expressed
-- into the new base by the app when it changes).
-- ─────────────────────────────────────────────────────────────

alter table public.products
  add column if not exists cost_currency   text not null default 'USD',
  add column if not exists retail_currency text not null default 'UAH';

-- Backfill from the old implicit currencies: cost was in the brand's catalog
-- currency, retail in the company's functional (base) currency.
update public.products p
set cost_currency = coalesce(b.catalog_currency, 'USD')
from public.brands b
where p.brand_id = b.id;

update public.products p
set retail_currency = coalesce(c.base_currency, 'UAH')
from public.companies c
where p.company_id = c.id;
