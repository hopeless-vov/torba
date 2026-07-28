-- ─────────────────────────────────────────────────────────────
-- torba — 0003: per-client discount
--
-- An agreed discount (%) for a client, applied to sale prices in the
-- cart when that client is selected.
-- ─────────────────────────────────────────────────────────────

alter table public.clients
  add column if not exists discount numeric(5, 2) not null default 0;
