-- ─────────────────────────────────────────────────────────────
-- torba — 0018: what a batch sells for
--
-- 0017 gave a delivery its own purchase price, because two deliveries of
-- one product rarely cost the same. The selling side has the same shape:
-- a batch bought on promotion is often passed on cheaper, and an older
-- delivery keeps the price it was put on the shelf at while the next one
-- arrives dearer.
--
-- So a batch may carry its own retail price too, mirroring the product's
-- pair exactly — `retail_amount` in `retail_currency`, resolved through
-- the market table like every other sale amount (never the supplier rate,
-- which drives cost alone).
--
-- Both columns are nullable, and null means "the product's catalogue
-- price", so every existing batch sells for precisely what it sold for
-- before this migration. Nothing already sold moves either:
-- `order_items.unit_price` is snapshotted at checkout.
-- ─────────────────────────────────────────────────────────────

alter table public.batches
  add column if not exists retail_amount   numeric(12, 2),
  add column if not exists retail_currency text;
