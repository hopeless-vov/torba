-- ─────────────────────────────────────────────────────────────
-- torba — 0017: what a batch actually cost
--
-- Cost lived on the product: one purchase price for every delivery of it,
-- ever. Real buying does not work that way. The same cushion refill comes
-- in at 1500 ₴ one month and at 1192 ₴ on a promotion the next, and both
-- sit on the shelf at the same time. With one price on the product, the
-- cheaper delivery silently reported the dearer one's margin — and there
-- was no way to answer "how much stock do I still have at which cost".
--
-- So a batch may carry its own purchase price. `cost_currency` mirrors the
-- product's: an amount is stored in the currency it was paid in, and a
-- batch priced in the brand's catalog currency still resolves through that
-- brand's supplier rate, exactly as the product's does.
--
-- Both columns are nullable, and null means "the product's catalogue
-- price" — so every existing batch keeps reporting precisely what it
-- reported before this migration. New batches are prefilled from the
-- product in the form, so the value is explicit from here on.
--
-- Nothing already sold changes: `order_items.unit_cost` is snapshotted at
-- checkout, so past orders keep the cost they were actually sold against.
-- ─────────────────────────────────────────────────────────────

alter table public.batches
  add column if not exists cost_amount   numeric(12, 2),
  add column if not exists cost_currency text;
