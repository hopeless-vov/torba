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
trigger, a self-heal bootstrap RPC, the atomic `create_order` function, and a
per-client discount) lives in [`supabase/migrations/`](supabase/migrations).
Apply **all files, in order**:

- **Supabase CLI:** `supabase db push`, or
- **Dashboard:** run `0001_init.sql`, then `0002_bootstrap_and_orders.sql`, then `0003_client_discount.sql` in the SQL Editor.

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
switchable via the top-bar ₴/$ toggle) is resolved at render time by
[`use-currency`](src/composables/use-currency.ts) — so updating a brand's rate
reprices its whole catalog, and the platform can switch display currency without
touching stored data. The top bar also carries a UK/EN language toggle. Orders
snapshot the actually-transacted amounts, and a client's agreed discount is applied
to sale prices in the cart.

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

## Orders & stock

Placing an order goes through the `create_order` Postgres function (see
`supabase/migrations/0002`), which assigns the order number, inserts the line
items, and decrements warehouse stock in **one transaction** with row locks — a
batch-tied line draws from that batch, a catalog line draws FIFO across the
product's batches by expiry. Overselling is impossible: the function raises
`INSUFFICIENT_STOCK` and the whole order rolls back. The cart also caps each
line's quantity to what's in stock on the client, and every action (save, delete,
import, order placed, rate updated, out-of-stock) surfaces a **toast**.

## Project Structure

```
src/
  api/                   → Supabase data layer (one file per resource)
    supabase.ts          → typed client (reads VITE_SUPABASE_* env)
    auth.ts, profile.ts, brands.ts, categories.ts, payment-methods.ts,
    products.ts, batches.ts, clients.ts, orders.ts
  assets/                → static assets
  components/
    ui/                  → presentational kit (props in, events out — no store/api/composable access)
    (root)               → smart components that wire ui/ to stores/composables
  composables/           → all app logic (use-auth, use-catalog, use-csv-import,
                           use-currency, use-cart, use-orders, use-warehouse,
                           use-clients, use-rates, use-personalization, use-dashboard,
                           use-theme, use-locale, use-toast)
  locales/               → uk.json (default) + en.json
  router/                → routes + auth guard
  stores/                → Pinia state (auth, reference, inventory, clients,
                           orders, cart, currency, ui, toast)
  styles/main.css        → Tailwind + theme tokens
  types/                 → database (row shapes) + models (derived views)
  utils/                 → pure helpers (pricing, batch-status, orders, format, csv, storage)
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
`Checkbox`, `Tabs`, `Badge`, `Tag`, `Card`, `StatCard`, `DataTable`, `Modal`,
`Drawer`, `DropdownMenu`, `Avatar`, `EmptyState`, `Spinner`, `Toast`, `Icon`.

---

## Testing

Unit tests live in `tests/unit/` and cover the pure utilities (pricing, batch
status, order totals, formatting, **CSV parsing**), Pinia stores (cart, currency),
the composable logic (`useCatalog`), and the API layer (mocked Supabase client).
A Playwright smoke test in `tests/e2e/` verifies the auth gate.

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
