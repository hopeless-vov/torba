-- ─────────────────────────────────────────────────────────────
-- torba — 0006: supplier rates, market rates, and a freely chosen
--               functional (base) currency
--
-- Three exchange rates that the app used to conflate are now distinct:
--
--   • Supplier rate — each brand's own rate for the currency it prices
--     its goods in (e.g. €1 = ₴52). Suppliers bump this every couple of
--     months to compensate for the market, so it rarely matches the bank
--     rate. It drives COST. Lives on the brand (brands.supplier_rate).
--
--   • Market rate — the bank/reference rate, used only to DISPLAY amounts
--     in a chosen currency. Lives in public.currencies.usd_rate (a per-USD
--     numeraire) and is UNCHANGED by this migration.
--
--   • Functional currency — companies.base_currency, the currency the
--     books are kept in. It can be any currency, not just USD; every
--     screen shows values converted from it into the top-bar display
--     currency via the market rate.
--
-- Products now store COST in their brand's catalog currency and RETAIL in
-- the functional currency, replacing the single USD price.
-- ─────────────────────────────────────────────────────────────

-- ── brands: catalog currency + supplier rate ─────────────────
-- The currency a supplier prices its goods in (USD or EUR, typically).
alter table public.brands
  add column if not exists catalog_currency text not null default 'USD';

-- usd_rate was really "functional-currency units per 1 unit of the
-- supplier's currency" (historically ₴ per $). Rename it to say so; the
-- stored values are unchanged and stay valid for a USD catalog currency.
alter table public.brands rename column usd_rate to supplier_rate;

-- ── products: cost (catalog currency) + retail (functional) ──
-- price_usd held the supplier cost; with the default USD catalog currency
-- the number is unchanged, only its name and interpretation. retail
-- becomes the functional-currency retail price (backfilled below).
alter table public.products rename column price_usd to cost_amount;
alter table public.products rename column retail_price_usd to retail_amount;

-- ── functional currency ──────────────────────────────────────
-- The books have effectively been kept in hryvnia all along: brand rates
-- are ₴ per $ and every screen defaulted to showing ₴. Make UAH the
-- explicit functional currency for existing companies and new ones.
update public.companies set base_currency = 'UAH' where base_currency = 'USD';
alter table public.companies alter column base_currency set default 'UAH';

-- Retail was authored in USD; re-express it into the functional currency
-- (UAH) using each brand's own supplier rate, so seeded prices stay sane.
-- Cost needs no change — it now reads as an amount in the USD catalog
-- currency, which is the number that was already stored.
update public.products p
set retail_amount = round(p.retail_amount * b.supplier_rate, 2)
from public.brands b
where p.brand_id = b.id
  and b.supplier_rate > 0
  and p.retail_amount is not null;

-- public.currencies.usd_rate stays the per-USD market (bank) numeraire.
