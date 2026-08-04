# torba

> **torba** (торба) — Ukrainian for *bag* or *sack*. Like the rest of my projects, it carries a Ukrainian name — a small way to bring a piece of my culture along for the ride.

An internal inventory & sales tracker for a small cosmetics distributor: catalog with CSV price-list import, warehouse batches with expiry tracking, clients, orders with live profit/margin, and per-brand USD→UAH exchange rates. Built with Vue 3, TypeScript, Tailwind CSS v4 and Supabase.

Dark/light, Supabase-styled, Ukrainian-first (uk) with English (en) available.

---

## Requirements

| Tool    | Version  |
|---------|----------|
| Node.js | >= 22    |
| npm     | >= 10    |

---

## Getting Started

```bash
# 1. Copy environment variables and fill in your Supabase project
cp .env.example .env

# 2. Install dependencies
npm install

# 3. Start the dev server (http://localhost:5173)
npm run dev
```

### Environment variables

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Both come from your Supabase project → **Project Settings → API**.

### Database schema

The schema (tables, relationships, Row Level Security, the new-user bootstrap
trigger, a self-heal bootstrap RPC, the atomic `create_order` / `delete_orders`
functions, per-client discounts, per-order delivery addresses and user-defined
currencies) lives in [`supabase/migrations/`](supabase/migrations).
Apply **all files, in order**:

- **Supabase CLI:** `supabase db push`, or
- **Dashboard:** run each file in the SQL Editor —
  `0001_init.sql`, `0002_bootstrap_and_orders.sql`, `0003_client_discount.sql`,
  `0004_addresses_currencies_backorder.sql`.

On first sign-up a company + owner profile are created automatically, along with
default categories and payment methods. If the sign-up trigger ever fails to run,
the app self-heals on first load by calling `bootstrap_current_user()`; `0002` also
backfills any already-registered user that is missing a profile. Today there is one
owner (admin) per company; the schema carries `company_id` + `role` everywhere so
extra members can be added later without a data migration.

### Supabase Auth setting

This is an internal, invite-by-owner tool, so disable email confirmation:
**Authentication → Providers → Email → turn off "Confirm email"**. Otherwise
`signUp` returns no session (and no confirmation email is sent without SMTP), so
new users can't proceed. With it off, sign-up logs the user straight in.

---

## Scripts

| Script                   | What it does                                  |
|--------------------------|-----------------------------------------------|
| `npm run dev`            | Start Vite dev server                         |
| `npm run build`          | Unit tests → type-check → production build     |
| `npm run preview`        | Preview the production build                   |
| `npm run test:unit`      | Vitest (watch)                                 |
| `npm run test:unit:run`  | Vitest (single run)                            |
| `npm run test:e2e`       | Playwright end-to-end tests                    |
| `npm run lint`           | ESLint                                         |
| `npm run lint:fix`       | ESLint with auto-fix                           |

---

## Tech Stack

| Layer         | Library / Tool                                                        |
|---------------|----------------------------------------------------------------------|
| Framework     | [Vue 3](https://vuejs.org/) (Composition API, `<script setup>`)      |
| Language      | [TypeScript](https://www.typescriptlang.org/)                        |
| Build tool    | [Vite](https://vite.dev/)                                            |
| Styling       | [Tailwind CSS v4](https://tailwindcss.com/)                          |
| State         | [Pinia](https://pinia.vuejs.org/)                                    |
| Routing       | [Vue Router](https://router.vuejs.org/)                             |
| Backend       | [Supabase](https://supabase.com/) (Postgres + Auth + RLS)           |
| Animation     | [motion-v](https://motion.dev/) — subtle transitions                |
| CSV parsing   | [PapaParse](https://www.papaparse.com/)                             |
| i18n          | [vue-i18n v11](https://vue-i18n.intlify.dev/) — `uk` (default) + `en`|
| Icons         | [Font Awesome 6 Free](https://fontawesome.com/)                     |
| Variants      | [tailwind-variants](https://www.tailwind-variants.org/)             |
| Utilities     | [VueUse](https://vueuse.org/)                                        |
| Unit tests    | [Vitest](https://vitest.dev/) + [happy-dom](https://github.com/capricorn86/happy-dom) |
| E2E tests     | [Playwright](https://playwright.dev/)                              |
| Linting       | ESLint + typescript-eslint + eslint-plugin-vue + vue-i18n           |
| Git hooks     | [Husky](https://typicode.github.io/husky/) + lint-staged           |

---

## Design System

Supabase-inspired: a green accent on near-black (dark) or near-white (light) surfaces.

### Fonts

| Usage      | Font                                                          |
|------------|--------------------------------------------------------------|
| UI / text  | [Inter](https://rsms.me/inter/) (variable, self-hosted)      |
| Numbers/codes | [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (tabular) |

### Theme tokens

Colors are semantic tokens defined in [`src/styles/main.css`](src/styles/main.css)
and exposed as Tailwind utilities (`bg-surface`, `text-muted`, `border-line`,
`bg-accent`, `text-danger`, …). They flip automatically between light and dark via
`data-theme` on `<html>`, controlled by the theme toggle
([`use-theme`](src/composables/use-theme.ts)). Never use arbitrary color values — always the tokens.

---

## Currency

USD is the **canonical** currency: product prices are stored in USD. Each **brand**
carries its own USD→UAH exchange rate. The **display currency** (₴ by default,
picked from the top-bar currency menu) is resolved at render time by
[`use-currency`](src/composables/use-currency.ts) — so updating a brand's rate
reprices its whole catalog, and the platform can switch display currency without
touching stored data.

Two currencies are built in: **USD** (the stored base) and **UAH** (converted
through each brand's own rate — i.e. the supplier's own exchange rate, which the
owner keeps up to date per brand and which need not match the official bank rate).
Any other currency is **added by the owner** in **Profile → Currencies** with a flat
company-wide rate (units per 1 USD) — so EUR, PLN or anything else can be displayed
without touching the schema. The top bar also carries a UK/EN language toggle.

Live, USD-based data (catalog and warehouse) reprices into the display currency at
render time. **Orders are different**: they snapshot the actually-transacted amounts
in the currency they were placed in (`order.currency`), so they are always shown in
*that* currency — the order list, its details, the client card and the per-client
spend never re-label a past amount just because the display currency later changed.
Aggregates that sum snapshots (the orders KPIs, a client's total spend) are shown in
the shared currency when the orders agree on one, and fall back to the display
currency otherwise. A client's agreed discount is applied to sale prices in the cart.

---

## CSV Import

The catalog imports the supplier price-list CSVs (Colorescience / iS Clinical /
Histolab). The parser in [`src/utils/csv.ts`](src/utils/csv.ts) handles their real
shape — title/warning rows, a `Курс:` rate cell, category section headers, quoted
multiline product names, `"2 269,50"`-style UAH numbers, and `—`/empty retail
prices. Import is a two-step wizard: pick a brand + file, then review (product count,
new categories to create, and an optional brand-rate update) and confirm. UAH columns
in the file are ignored — prices are recomputed from the brand rate.

---

## Warehouse

A **batch** is one delivery of one product, with its own expiry date. Three
quantities describe it: **Отримано** (how many arrived), **Залишок** (how many are
still on the shelf) and **Продано** (the difference — what already went to clients).
Batch numbers are **generated** from the product's SKU (`FRY-500-01`, `FRY-500-02`;
see [`utils/batch-number`](src/utils/batch-number.ts)), so nothing has to be typed.

The warehouse has two views. **За партіями** lists every delivery separately.
**За товаром** collapses them into one row per product with the total stock, which
expands to show how much sits under each expiry date — that is how you see both
"how much do I have" and "which of it expires when". Every batch row carries the
same **add-to-cart** button as the catalog, so stock can be sold straight from the
warehouse — the cart line is pinned to that exact batch (and its expiry date).

## Orders & stock

Placing an order goes through the `create_order` Postgres function (see
`supabase/migrations/0004`), which assigns the order number, inserts the line items,
and draws down warehouse stock in **one transaction** with row locks — a batch-tied
line draws from that batch, a catalog line draws FIFO across the product's batches
by expiry.

Anything in the catalog can be sold, in stock or not. Stock can never go negative:
a line that exceeds what is on hand ships short and the remainder stays a
**backorder**, which the cart flags per line before checkout. Each cart line names
the batch (and therefore the expiry date) it draws from and can be switched to
another one, so two deliveries of the same product are never confused.

Deleting an order goes through `delete_orders`, which **returns the goods to their
batches** before removing it (capped at what each batch was delivered with). Every
action — save, delete, import, order placed, rate updated — surfaces a **toast**.

In an order's details, each line is a button: clicking it opens a **product-info
card** (`ProductInfoModal`) resolving the live catalog product behind the line —
brand, category, prices in the display currency and current stock — falling back to
the line's name/SKU snapshot when the product was since deleted.

## Project Structure

```
src/
  api/                   → Supabase data layer (one file per resource)
    supabase.ts          → typed client (reads VITE_SUPABASE_* env)
    auth.ts, profile.ts, brands.ts, categories.ts, payment-methods.ts,
    currencies.ts, products.ts, batches.ts, clients.ts, orders.ts
  assets/                → static assets
  components/
    ui/                  → presentational kit (props in, events out — no store/api/composable access)
    (root)               → smart components that wire ui/ to stores/composables
  composables/           → all app logic (use-auth, use-catalog, use-csv-import,
                           use-currency, use-currencies, use-cart, use-orders,
                           use-warehouse, use-clients, use-rates, use-selection,
                           use-personalization, use-dashboard, use-theme,
                           use-locale, use-toast)
  locales/               → uk.json (default) + en.json
  router/                → routes + auth guard
  stores/                → Pinia state (auth, reference, inventory, clients,
                           orders, cart, currency, ui, toast)
  styles/main.css        → Tailwind + theme tokens
  types/                 → database (row shapes) + models (derived views)
  utils/                 → pure helpers (pricing, batch-status, batch-number, orders,
                           format, csv, storage)
  views/                 → one component per route
supabase/migrations/     → SQL schema + RLS
tests/
  unit/                  → Vitest (utils, stores, api, composables)
  e2e/                   → Playwright
```

### Architecture rules

See [`CLAUDE.md`](CLAUDE.md) for the full list. In short:

1. `components/ui/` is presentational only — no `stores/`, `api/`, or `composables/` imports.
2. `views/` are route-level containers (1:1 with routes).
3. Smart components in `components/` wire `ui/` to stores/composables.
4. Components and views never import from `api/` directly — always via a composable or store.
5. No barrel exports — import directly from the file.
6. All user-visible text comes from `src/locales/*.json` (both `uk` and `en`).
7. Only theme color tokens — no arbitrary color values.

---

## The UI Kit

Reusable presentational components in [`src/components/ui/`](src/components/ui),
composed across every screen: `Button`, `TextInput`, `NumberInput`, `Select`,
`Combobox`, `Checkbox`, `Tabs`, `Badge`, `Tag`, `Card`, `StatCard`, `DataTable`,
`Modal`, `ConfirmDialog`, `Drawer`, `DropdownMenu`, `Avatar`, `EmptyState`,
`Spinner`, `Toast`, `Icon`.

Two of them carry most of the interaction weight:

- **`Combobox`** — a `Select` with a filter box and keyboard navigation, and the same
  `v-model` contract, so the two are interchangeable. Every dropdown fed by
  user-defined data (clients, brands, categories, products, payment methods) uses it;
  plain `Select` is left for short fixed lists like order status. Passing an
  `addLabel` adds a footer button that emits `add` — the forms use it to drop a
  `QuickAddModal` in place so a missing **Personalization** item (brand, category or
  payment method) can be created inline and auto-selected, without a trip to Profile.
- **`EmptyState`** — the icon + title + hint shown when a table has no rows. Its
  default slot takes **action buttons**, so every empty screen offers the obvious next
  step: import/new-product on the catalog, new-batch on the warehouse, new-client on
  clients, open-the-cart on orders (or clear-range when a date filter emptied it).
- **`DataTable`** — columns in, rows in, one slot per cell. `selectable` adds a
  leading checkbox column with a select-all header (wired to
  [`use-selection`](src/composables/use-selection.ts) and a bulk delete bar),
  `expandable` adds a chevron that reveals an `#expanded` row, and a column's
  `hint` renders an info tooltip explaining what it means.

Search is **per page**, in each toolbar next to that page's filters, with a
placeholder naming what it matches (orders, for instance, search by number, client,
waybill or address). There is deliberately no single global search box — it could
never say what it was searching. The query is held in the `ui` store and cleared on
navigation. The orders toolbar also carries a **date-range filter** (inclusive
from/to, either side optional) that narrows the list — and the KPI cards — to the
selected period; when nothing falls in the range the table says so.

---

## Testing

Unit tests live in `tests/unit/` and cover the pure utilities (pricing, batch
status and FIFO ordering, batch numbering, order totals, formatting, **CSV
parsing**), Pinia stores (cart — including backorders and switching a line's
batch — and currency), the composable logic (`useCatalog`, `useWarehouse`
grouping, `useCurrency` conversion, `useSelection`), and the API layer (mocked
Supabase client). `views.test.ts` mounts Catalog, Warehouse, Orders and the cart
drawer against seeded stores, so a broken template or missing slot fails in CI
rather than in the browser. A Playwright smoke test in `tests/e2e/` verifies the
auth gate.

```bash
npm run test:unit:run   # unit
npm run test:e2e        # e2e (first run: npx playwright install chromium)
```

---

## Deployment

SPA deployable to any static host. [`vercel.json`](vercel.json) rewrites all routes
to `index.html` so client-side routing works on refresh. Set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` in the host's environment variables.

---

## License

[MIT](LICENSE)
