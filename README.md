# torba

> **torba** (торба) — Ukrainian for *bag* or *sack*. Like the rest of my projects, it carries a Ukrainian name — a small way to bring a piece of my culture along for the ride.

An internal inventory & sales tracker for a small cosmetics distributor: catalog with CSV price-list import, warehouse batches with expiry tracking, clients (add / edit / remove), orders with live profit/margin, and separate per-brand supplier and market exchange rates. Built with Vue 3, TypeScript, Tailwind CSS v4 and Supabase.

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
trigger, the profile-identity lockdown, a self-heal bootstrap RPC, the atomic
`create_order` / `delete_orders`
functions, per-client discounts, per-order delivery addresses, user-defined
currencies, order-level and per-line discounts, the supplier/market rate split,
per-product price currencies, and the brand↔category links) lives in
[`supabase/migrations/`](supabase/migrations).
Apply **all files, in order**:

- **Supabase CLI:** `supabase db push`, or
- **Dashboard:** run each file in the SQL Editor —
  `0001_init.sql`, `0002_bootstrap_and_orders.sql`, `0003_client_discount.sql`,
  `0004_addresses_currencies_backorder.sql`, `0005_order_discount.sql`,
  `0006_supplier_rates_functional_currency.sql`, `0007_brand_categories.sql`,
  `0008_product_currency.sql`, `0009_drop_paid_status.sql`,
  `0010_lock_profile_identity.sql`, `0011_memberships.sql`,
  `0012_invitations.sql`, `0013_role_enforcement.sql`,
  `0014_invitation_preview.sql`, `0015_order_item_discount.sql`.

**`0010` is a security fix — apply it before letting anyone else sign up.**
Tenant isolation resolves through `current_company_id()`, which reads
`profiles.company_id`; the original `profiles_update` policy pinned only the row
id, so a user could repoint their own profile at another company and inherit
full access to it (and grant themselves `role = 'owner'` the same way). The
identity columns are now immutable from the API — `authenticated` holds
`UPDATE (full_name)` only, with a trigger backstop — and `next_order_number`
lost its default `PUBLIC` execute grant, which had leaked any company's order
volume to any signed-in user.

**`0011` makes a user able to belong to several companies.** Membership moved
out of `profiles.company_id` into its own `memberships (company_id, user_id,
role)` table, and every policy now asks `is_member(company_id)` instead of
comparing against the caller's single company. Existing users are backfilled as
`owner` of the company they already had, so nothing changes for them. Which
organization is *active* is a client concern — it travels as an explicit
`company_id` on every query rather than being stored — so two browser tabs can
sit in different organizations and switching writes nothing to the database.
Roles (`owner` > `admin` > `member` > `viewer`, compared with `has_min_role()`)
are recorded but **not yet enforced**; granting access and restricting it are
separate migrations so they can be rolled back separately.

**`0012` adds invitations, on the **Members** page (**/members**).** Supabase's
own `inviteUserByEmail()` needs the `service_role` key, which cannot live in a
browser bundle, so invitations are a table plus an opaque token: an owner or
admin creates one for an email address and a role, copies the link
(`/invite/<token>`) and sends it through whatever channel they already use —
**the app sends no email**. The link is valid for 14 days and only works for
the address it was issued to, checked against the recipient's verified email,
so a leaked link is useless to anyone else. Accepting adds the membership and
drops the user straight into that organization; they keep their own company and
switch between the two from the sidebar. `/invite/:token` is a public route
because the recipient may still need to sign up.

Membership is never writable from the client. The `memberships` and
`invitations` tables grant no `INSERT`/`UPDATE`/`DELETE` at all — creating,
accepting, revoking, re-roling and removing all go through `SECURITY DEFINER`
functions that re-check the caller's role, so a client that talked to PostgREST
directly could not invite or promote itself. Only an owner can create another
owner, and the last owner of a company cannot be demoted or removed.

**`0014` lets the recipient see which invitation they hold.** Because the
invited address is checked on redemption, registering or signing in with a
*different* email fails — and `0012` returned the same opaque `INVALID_INVITATION`
for that as for a bad token, leaving a legitimate recipient with no clue what
went wrong. `invitation_preview(token)` lets a holder of the (unguessable) token
see the company, a **masked** hint of the invited address (`j***@example.com`)
and whether the account they are signed in as can accept it. The full address is
never returned, so a leaked link still cannot reveal exactly who was invited. The
`/invite` page uses it to show who the link is for and, when the wrong account is
signed in, to offer signing out instead of failing blankly.

**`0013` makes the roles bite.** Until it is applied every member can do
everything, which is why it is a separate, separately reversible step. Reading
is for any member; writing splits three ways:

| | owner | admin | member | viewer |
|---|:---:|:---:|:---:|:---:|
| See everything (dashboard, catalog, warehouse, orders, clients, rates) | ✓ | ✓ | ✓ | ✓ |
| Products, batches, clients, orders — create, edit, delete | ✓ | ✓ | ✓ | — |
| Brands, categories, links, payment methods, currencies and rates | ✓ | ✓ | — | — |
| Invite people, change roles, remove members | ✓ | ✓¹ | — | — |
| Company settings (name, functional currency) | ✓ | — | — | — |

¹ An `admin` manages `member` and `viewer`; only an `owner` touches owners and
admins, or hands out `owner`.

Rates and currencies sit at `admin`, not `member`, because they silently
re-price the whole catalogue: changing a supplier rate rewrites every margin in
the company without touching a single product.

`create_order` and `delete_orders` check the role themselves. They are
`SECURITY DEFINER`, so the table policies do not apply inside them — without
the check a viewer could place and delete orders through the functions while
being unable to touch the tables directly.

**`0015` gives a single line its own discount.** `0005` discounts the order as
a whole, which covers "this client gets 10% off everything" but not a clearance
line, a damaged box or a sweetener on one position. `order_items.discount` is a
percentage off that line; the two compose rather than compete — the line
discount reduces the line, the order discount then reduces the total, so a line
at 20% inside an order at 10% sells at 72% of list and both numbers stay
literally true. `unit_price` remains the gross list price, so what a line was
sold *against* is never lost, and the order details screen shows the list
price struck through next to what it actually went out at.

On the client, `use-permissions` mirrors the same matrix (`canTrade`,
`canConfigure`, `canManageMembers`, `canAdministerCompany`) and hides controls
that would fail anyway — an add/edit/delete button, a status menu, a row action
— so a role that cannot do a thing never sees the control for it. Whole screens
are gated too: a route may carry `meta.minRole` (the router guard bounces a
lower role to the dashboard) and the sidebar drops any link that role could not
use — the **Members** screen is `admin`-only on both counts. It is a courtesy,
not a control: **the database is what actually decides**, and nothing in the
interface is load-bearing for security.

**Categories depend on brands.** `brand_categories` is a many-to-many link: each
brand exposes its own set of categories, so the product form and the catalog filter
only offer the categories linked to the chosen brand (the category picker stays
disabled until a brand is selected). A product still stores a single `category_id`;
the link table only decides what the pickers show. Manage everything on the dedicated
**Links** page (**/links**): a two-panel editor — brands on the left, the selected
brand's categories as toggle-cards on the right — where you add and delete brands and
categories, tick the links (with *select all* / *clear*), and each change saves at
once. Both lists scroll when they grow. Profile keeps only the account card and
payment methods. `0007` backfills the links from how existing products already pair
brands and categories.

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

If you *do* keep confirmation on (or use password reset / invites), the email
links resolve against **Authentication → URL Configuration**: set **Site URL**
to the deployed origin and add every app origin plus `.../login` and
`.../reset-password` to **Redirect URLs** — otherwise links fall back to
localhost. Ready-to-paste HTML for the confirmation, reset, invite and
magic-link emails lives in [`supabase/email-templates/`](supabase/email-templates)
(see its README for where each one goes). The app hands Supabase an explicit
`emailRedirectTo` on sign-up and password reset so links return to whatever
origin served the app.

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

The app keeps **three exchange rates deliberately separate**, because real
distribution needs all three:

- **Supplier rate** — each brand's own rate for the currency it prices its goods in
  (e.g. €1 = ₴52). Suppliers bump it every couple of months to compensate for the
  market, so it rarely matches the bank rate, and it drives **cost**. Lives on the
  brand (`brand.supplier_rate` + `brand.catalog_currency`), edited on **/rates** and
  shown in the base currency (*"₴n per 1 {catalog}"*). When a supplier prices in the
  base currency itself there is nothing to convert, so the rate is pinned to 1 and the
  card reads *"priced in base currency"* instead of a meaningless *"per 1 ₴"*.
- **Market rate** — the bank/reference rate, used only to **display** amounts in a
  chosen currency. Stored per company in `currencies.usd_rate` as a per-USD numeraire
  (units of the currency per 1 USD). USD is only that stored numeraire — it is never
  shown as a unit: **/rates** presents every rate as *"1 {code} = n {base}"* and takes
  edits that way too, converting to the stored per-USD value on save.
- **Base currency** — `company.base_currency` (₴ by default): the default display
  currency and the anchor rates are entered against. Since every stored amount carries
  its own currency, switching the base is a display concern and never rewrites data —
  it only re-expresses each **brand supplier rate** into the new base (so costs stay
  the same amount of money). Change it with **"Make base"** on **/rates** (confirmed).

**What is stored where.** Every product price carries **its own currency**:
`cost_amount` + `cost_currency` and `retail_amount` + `retail_currency` (chosen in the
product form; cost defaults to the brand's catalog currency, retail to the base). A
cost in the brand's catalog currency is still resolved through the **supplier rate**
(`costToDisplay` → `functionalCost`), so bumping a supplier's rate reflows that brand's
cost; a cost in any other currency goes through the market table instead. **Order**
amounts snapshot in the order's currency. Nothing is stored in a display-converted
form, so switching the display or base currency never rewrites data.

Everything the user sees is each amount re-expressed from its own currency into the
**active display currency** (top-bar menu) through the market table, resolved at render
time by [`use-currency`](src/composables/use-currency.ts) (`convertBetween` /
`costToDisplay` / `formatFrom`) — so switching the display currency reprices the
**whole app** consistently (catalog, warehouse, orders, KPIs, dashboard, per-client
spend). The catalog shows each price in the active currency with the **raw entered
amount** underneath in muted type when the two currencies differ. Three currencies are
**built in** (UAH, USD, EUR) with sensible default market rates until one is set; the
owner can add more (PLN, …) on **/rates**.

**Orders** snapshot their amounts in the currency they were placed in
(`order.currency`) and are re-expressed into the active display currency via
`convertBetween`, so the order list, details, client card and KPI totals all read in
one currency. A client's agreed discount is applied to sale prices in the cart and can
be overridden per cart/order, and each cart line can additionally be **re-priced** and
given **its own discount** (see *Orders & stock*). The top bar also carries a UK/EN
language toggle.

---

## CSV Import

The catalog imports supplier price lists. Nothing about the file is assumed:
[`src/utils/csv.ts`](src/utils/csv.ts) sniffs the delimiter (comma, semicolon or
tab — a Ukrainian Excel writes semicolons), and `decodeCsv` reads the encoding off
the bytes, honouring a BOM and falling back to **windows-1251** when strict UTF-8
rejects them. Cyrillic in cp1251 is not valid UTF-8, so that failure is an answer
rather than another guess.

What cannot be known is which column means what, so it is **guessed and then
shown**. `readCsvTable` scores the first rows to find the header wherever the
supplier buried it under title and warning rows; `guessMapping` matches header
words to our fields (retail before cost, so "Рек. ціна" is not read as the purchase
price), and a file with no header falls back to the order every supplier has used
so far. `extractProducts` then turns rows into products through that mapping —
which means reading the UAH column instead of the USD one is a mapping away, not a
code change.

Import is a two-step wizard: pick a brand + file, then **correct the columns** —
six dropdowns, each column named by its header and a sample of what is under it —
with a live preview of the first rows beside the product count, new categories to
create and an optional brand-rate update. The preview is the point: an import
upserts by SKU, so a column read wrongly would overwrite the catalog. A mapping
that imported successfully is remembered per brand in local storage, so the next
price list from the same supplier needs no answering at all; if it stops finding
products, the headers are read afresh.

Still handled, because the real files need it: a `Курс:` rate cell, category
section headers (a row that is only a first cell, used when the file has no
category column), quoted multiline product names, `"2 269,50"`-style numbers and
`—`/empty retail prices. UAH columns are ignored by default — prices are
recomputed from the brand rate.

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

**A batch sold to the last unit leaves the shelf.** It stays in the books, but it
is a closed delivery, not stock: it raises no expiry warning in the sidebar badge,
takes no place in the dashboard's expiry table or stock mix, and is hidden from the
warehouse by default. The **Наявність** filter (in the filter sheet) switches
between *Є на складі* — the default — *Розпродані* and *Усі партії*, so the history
is always one choice away. The predicate itself is
[`isAtRisk`](src/utils/batch-status.ts), shared by the badge and the dashboard.

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

Every cart line also carries its **own price and its own discount**. The price
starts at the catalog retail and can be raised or lowered for this sale; the
original stays on the line so the override is visible and one click undoes it.
The line discount is a percentage off that product only and **stacks** with the
order-level one — 20% on the line inside a 10% order sells at 72% of list. Both
are stored as they were entered (`order_items.unit_price` gross,
`order_items.discount` as a percentage, migration `0015`), so the order details
screen can show the list price struck through beside what the line actually went
out at, and the totals stay recomputable rather than baked in.

**The cart is a page** (`/cart`), not a drawer. The `+` on a catalog or warehouse
row adds the line and **stays where it is** — a toast confirms what went in and
the counter in the top bar (and the sidebar link) carries the running total, so
picking ten products costs ten clicks and no navigation. Going to the cart is
the user's own move; the page then holds the whole job at once: the product
picker, the lines, the order settings (client, payment method, order discount)
and a summary that sticks beside the list on a wide screen. Placing the order
clears the cart and lands on the order list, where the new order is waiting.

Selling is a **member's** job upwards: a viewer has no cart link in either the
sidebar or the top bar, `/cart` bounces them to the dashboard, and the checkout
button is gated on `canTrade` in case a role changes mid-session.

Deleting an order goes through `delete_orders`, which **returns the goods to their
batches** before removing it (capped at what each batch was delivered with). Every
action — save, delete, import, order placed, rate updated — surfaces a **toast**.

In an order's details, each line is a button: clicking it opens a **product-info
card** (`ProductInfoModal`) resolving the live catalog product behind the line —
brand, category, prices in the display currency and current stock — falling back to
the line's name/SKU snapshot when the product was since deleted.

The order list itself carries a **Товари** column (first item, plus `+n` when
there are more) and each row **expands in place** to list every line with its
SKU, quantity, unit price and total — so "what was in this order" no longer
requires opening the details modal. Clicking the row still opens the full
details.

**Order statuses are `new → sent → done`.** "Paid" was removed (`0009`): payment
is recorded on `payment_method`, not as a workflow step, so an order could be
paid *and* shipped while a single status column could only say one of them. The
migration moves any leftover `paid` row back to `new` — the payment itself is
untouched — and tightens the check constraint to match.

## Project Structure

```
src/
  api/                   → Supabase data layer (one file per resource)
    supabase.ts          → typed client (reads VITE_SUPABASE_* env)
    auth.ts, profile.ts, memberships.ts, invitations.ts, brands.ts,
    categories.ts, payment-methods.ts, currencies.ts, products.ts,
    batches.ts, clients.ts, orders.ts
  assets/                → static assets
  components/
    ui/                  → presentational kit (props in, events out — no store/api/composable access)
    (root)               → smart components that wire ui/ to stores/composables
  composables/           → all app logic (use-auth, use-catalog, use-csv-import,
                           use-currency, use-currencies, use-cart, use-orders,
                           use-warehouse, use-clients, use-rates, use-selection,
                           use-personalization, use-dashboard, use-theme,
                           use-locale, use-toast, use-popover-position,
                           use-permissions, use-members, use-invite)
  locales/               → uk.json (default) + en.json
  router/                → routes + auth guard (meta.public, meta.minRole)
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
`Modal`, `ConfirmDialog`, `Drawer`, `DropdownMenu`, `FilterSheet`, `Avatar`,
`EmptyState`, `Spinner`, `Toast`, `Icon`, `TrendBars`, `CompositionBar`.

The two charts are plain HTML — stacked `div`s sized in percentages, coloured
from the theme tokens, so they flip with light/dark like everything else and
add no charting dependency. `TrendBars` stacks a period's series into one bar
(one scale, never a second axis); `CompositionBar` splits a single whole and
puts the numbers in the legend, so the colours never have to be told apart on
their own.

The revenue chart takes a **from/to date range**. The bucket width follows from
how wide the range is rather than being a second thing to choose: up to 45 days
a column is one day, up to two years one month, beyond that one year. Empty
periods stay in place so a gap in trade reads as a gap, and once there are more
columns than labels can fit, only every nth label is drawn — the rest are
reached by hovering the bar. Dates are compared as `YYYY-MM-DD` strings against
`created_at`, the same way the orders filter does it, so a timezone offset can
never move an order into the neighbouring bucket.

Under the chart, **Куди пішли гроші** opens up its cost segment for the same
period: what the goods themselves cost, what packaging cost and what delivery
cost, each as its own figure and its share of the total. Goods keep the chart's
neutral colour so the two read as the same quantity; packaging and delivery are
the outlay the company adds on top, and seeing them apart is the point — those
are the costs that can be worked on without touching supply. Both come off the
same `ordersInRange` list the chart uses, converted from each order's own
currency, so the chart and the split can never disagree about the period.

Two of them carry most of the interaction weight:

- **`Combobox`** — a `Select` with a filter box and keyboard navigation, and the same
  `v-model` contract, so the two are interchangeable. Every dropdown fed by
  user-defined data (clients, brands, categories, products, payment methods) uses it;
  plain `Select` is left for short fixed lists like order status. Passing an
  `addLabel` adds a footer button that emits `add` — the forms use it to drop a
  `QuickAddModal` in place so a missing brand, category or payment method can be
  created inline and auto-selected, without a trip to the Links page. Option
  labels **wrap rather than truncate** and an optional `hint` renders a second,
  muted line (the product picker puts the SKU there) — several products can open
  with the same long phrase, and a clipped one-line list made them
  indistinguishable. The hint is searchable along with the label.
- **`EmptyState`** — the icon + title + hint shown when a table has no rows. Its
  default slot takes **action buttons**, so every empty screen offers the obvious next
  step: import/new-product on the catalog, new-batch on the warehouse, new-client on
  clients, go-to-the-cart on orders.
- **`ListFallback`** — the other two reasons a list can be empty, neither of which
  is "nothing added yet" and neither of which may read like it. The **load failed**
  (the stores keep the failure, and the state offers a retry) or the **filters match
  nothing** (it offers to clear them). Views tell the three apart by the unfiltered
  count: `store.error` → error, `total > 0` → no matches, otherwise the view's own
  first-run state. On the warehouse, clearing also drops the default stock filter,
  which hides sold-out batches — otherwise a warehouse that has sold out reads as one
  that was never stocked.
- **`DataTable`** — columns in, rows in, one slot per cell. `selectable` adds a
  leading checkbox column with a select-all header (wired to
  [`use-selection`](src/composables/use-selection.ts) and a bulk delete bar),
  `expandable` adds a chevron that reveals an `#expanded` row, and a column's
  `hint` renders an info tooltip explaining what it means. Below `md` it renders
  as a card list instead of a table, reusing the exact same `cell-*` slots — no
  per-view duplication. One column opts into the card heading via `card: 'title'`
  (falls back to the first column); the conventional `actions` column moves into
  the card's header instead of listing as a row.

  `maxHeight` caps how tall it may grow: past that the rows scroll **inside** the
  table with the header stuck to the top (as a shadow, not a border — a collapsed
  table's border scrolls away with the cells), so the toolbar above and the pager
  below stay in place. `pageSize` pages the rows, and the pager appears only once
  there is more than one page: positions read as numerals (`1–25 / 120`, `2 / 5`),
  which need no translation, and only the two arrows carry words, passed in as
  `prevLabel` / `nextLabel`. Paging is the table's own state — no view holds a page
  number — and a narrower filter clamps it back rather than stranding the user on an
  empty page. **Select-all ticks the current page only**, so the bulk bar can never
  act on rows the user has not seen. Current sizes: 25 (catalog, warehouse), 20
  (orders), 8 (the dashboard's expiring-stock table).

Search is **per page**, in each toolbar next to that page's filters, with a
placeholder naming what it matches (orders, for instance, search by number, client,
waybill or address). There is deliberately no single global search box — it could
never say what it was searching. The query is held in the `ui` store and cleared on
navigation. The orders toolbar also carries a **date-range filter** (inclusive
from/to, either side optional) that narrows the list — and the KPI cards — to the
selected period; when nothing falls in the range the table says so.

---

## Responsive layout

Two breakpoints carry the whole app down to a phone:

- **`lg` (1024px)** — below it, `AppSidebar` becomes an off-canvas panel (built
  on plain Tailwind responsive classes + a CSS transform, not the `Drawer`
  component, since it needs to stay permanently mounted for the `lg:static`
  override to work) opened from a hamburger button in `AppTopbar`. Its open state
  is `ui.sidebarOpen` — the one piece of cross-page UI state both components
  share — and it closes on navigation, `Escape`, or a backdrop click.
- **`md` (768px)** — below it, every `DataTable` (Catalog, Orders, Warehouse,
  Dashboard) switches from the table to a card list (see the UI Kit section
  above). `ClientsView` was already a responsive card grid and needed nothing.

Below `md` a page's filters collapse behind one button that opens them in a
sheet (`FilterSheet`), badged with how many are actually narrowing the list;
search keeps its own full-width row, and add/import actions drop their labels
(the text stays as `title`, so the accessible name survives). `Tabs` scrolls
horizontally rather than clipping, so a long status strip never hides its last
option.

⚠️ Passing `hidden lg:*` **directly to a component whose root sets its own
display** (`Tabs`, `Button`) does not work: between two display utilities of
equal specificity CSS source order decides, and the component's own
`inline-flex` wins. Wrap it in a plain element instead — see `AppTopbar`'s
language strip.

Floating panels (`Combobox`, `DropdownMenu`) use
[`use-popover-position`](src/composables/use-popover-position.ts) to flip
upward when there isn't enough room below the trigger — otherwise a panel
opened near the bottom of a phone screen would render off-screen instead of
just opening the other way.

Two-column form modals (`ProductFormModal`, `OrderEditModal`, `BatchModal`,
`ClientModal`) stack to one column below `sm` (640px); `OrderDetailsModal` and
`LinksView`'s two-panel layout were already responsive.

---

## Testing

Unit tests live in `tests/unit/` and cover the pure utilities (pricing, batch
status and FIFO ordering, batch numbering, order totals, formatting, **CSV
parsing** — delimiters, encodings, header detection and column guessing), Pinia stores (cart — including backorders and switching a line's
batch — and currency), the composable logic (`useCatalog`, `useWarehouse`
grouping, `useCurrency` conversion, `useSelection`, `useCsvImport` column
mapping), and the API layer (mocked
Supabase client). `views.test.ts` mounts Catalog, Warehouse, Orders, Links and the
cart page against seeded stores, so a broken template or missing slot fails in CI
rather than in the browser, and `data-table.test.ts` covers paging and the height
cap on their own. A Playwright smoke test in `tests/e2e/` verifies the auth gate.

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
