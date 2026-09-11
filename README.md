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
functions, per-client discounts, per-order delivery addresses, order-level and
per-line discounts, the platform currency list and the supplier × currency rate
matrix, per-product price currencies, per-batch purchase and selling prices, and
the brand↔category links) lives in
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
  `0014_invitation_preview.sql`, `0015_order_item_discount.sql`,
  `0017_batch_cost.sql`, `0018_batch_retail.sql`, `0019_supplier_rates.sql`.

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

**`0019` makes the base the only currency of account.** The market rates the user
typed in (`currencies.usd_rate`) and the single rate on each brand are gone. What
is left: a **platform currency list** (`platform_currencies`, kept by the platform
operator, read-only from the app), the currencies a company uses from it
(`currencies`, no rate), and a **supplier × currency matrix** (`supplier_rates`)
that the old brand rates carry over into, with a trigger keeping each cell's
history. Orders sold in another currency are converted with the last market rates
there were, and a trigger files every order under the base from then on. Retail
that an import had frozen into the base goes back into the supplier's currency —
the same number at today's rate, moving with the rate from now on. The base only
changes while a company has no orders, and changing it resets the supplier rates,
which are all "per old base". Every currency column points at the platform list.

**`0018` does the same for the selling price.** A delivery bought on promotion is
usually passed on cheaper, and an older delivery keeps the price it went on the
shelf at while the next one arrives dearer. `batches.retail_amount` +
`retail_currency` mirror the product's pair and, since `0019`, go through the
supplier's rate exactly like cost.
Nullable, so null still means the catalogue price, and `order_items.unit_price`
stays snapshotted at checkout.

**`0017` puts the purchase price on the batch.** Cost lived on the product: one
price for every delivery of it, ever. Real buying does not work that way — the same
refill arrives at 1500 ₴ one month and at 1192 ₴ on a promotion the next, and both
sit on the shelf together. `batches.cost_amount` + `cost_currency` mirror the
product's pair, including the supplier-rate resolution, and are **nullable**: null
means "the product's catalogue price", so every existing batch reports exactly what
it reported before. Nothing already sold moves — `order_items.unit_cost` is
snapshotted at checkout.

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

**One currency of account.** The company keeps its books in its **base currency**
(`company.base_currency`, ₴ by default), and every amount the app shows, sums or
stores is in it — orders included: a trigger files every order under the base,
whatever the caller passed (`0019`). There is nothing to switch, so the top bar shows
the base as a badge that leads to **/rates**, where it is set.

**The only rates are the suppliers'.** A price is entered in whatever currency its
supplier quotes, and every supplier has its own rate for every currency the company
uses — *how many units of the base one unit is worth to them*. That makes a matrix
(`supplier_rates`: supplier × currency), because a supplier may quote in dollars and
euros both and two suppliers rarely agree on a rate: the same dollar can be ₴41.50 to
one and ₴42 to another. Changing a cell reprices **that supplier's** cost and retail
in that currency across the app — catalog, warehouse, cart, stock value — and
nothing else. The database keeps each cell's history.

**A rate nobody entered is never guessed.** [`use-currency`](src/composables/use-currency.ts)
converts through `rateFor(brand, currency)`; without a rate the result is `null`,
the screen shows *"—"*, and margins and stock value leave that price out instead of
counting it at an invented number. `missingRate` names the currency a price is still
waiting for, and wherever one turns up — a catalogue or warehouse row, a cart line,
the product and batch forms — the price is replaced by **«Додати курс для
постачальника»**, a link to /rates that picks that supplier out. The dashboard's
stock value says how many batches it had to leave out; a cart line says that it
would go on record at a cost of 0.

**/rates** has three parts:

- **Base currency** — changed by the owner, and only while the company has **no
  orders**: orders are kept in the base, and once the supplier rates are reset nothing
  could convert them into a new one. Changing it **resets every supplier rate** (they
  are all "per old base"). Both rules are the database's, and the page asks first. The
  old base stays in use as an ordinary currency.
- **Company currencies** — picked from the **platform list**, never typed in. Adding one
  opens a column in the matrix; a currency still used by a price, or by a supplier as
  its default, cannot be removed, since that price would be left with nothing to be
  converted by.
- **Supplier rates** — the matrix, with each supplier's default quoting currency
  (*"Ціни у"* — used for its new products and its price lists) alongside. An empty
  cell reads *"rate needed"* and opens straight into editing.

**What is stored where.** Every product price carries **its own currency**:
`cost_amount` + `cost_currency` and `retail_amount` + `retail_currency`. Both go
through the supplier's rate — retail follows the supplier exactly like cost, so *"you
buy at 55, you sell at 80"* is what the catalogue stores, and a new rate reprices both.
A price in the base needs no rate at all. The catalog shows each price in the base,
with the supplier's own amount underneath when it is in another currency.

**A batch may override both prices.** The product's pair is the *catalogue* price —
what a delivery normally costs and normally sells for — and a batch that came in
cheaper, or goes out cheaper, carries its own `cost_amount` / `retail_amount` (each
with its currency). [`costOf` and `retailOf`](src/utils/pricing.ts) pick between batch
and product, `costInBase` / `retailInBase` convert, so one rule holds everywhere:
**a sale costs, and earns, what the delivery it ships from does.**

The cart prices a line from its batch and moves both figures when the line is handed
to another delivery — except a price the user typed, which stays: that is a decision,
and re-pricing over it would undo it silently (the *list* price still moves, so
"reset" offers the new batch's). The warehouse shows cost, retail and the margin
between them per delivery; the dashboard values stock at each batch's own cost. Since
`order_items` snapshots both `unit_cost` and `unit_price` at checkout, changing a
rate or a price later never rewrites a sale already made.

A client's agreed discount is applied to sale prices in the cart and can be overridden
per cart/order, and each cart line can additionally be **re-priced** and given **its
own discount** (see *Orders & stock*). The top bar also carries a UK/EN language
toggle.

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

A **batch** is one delivery of one product, with its own expiry date **and its own
purchase price**. Three quantities describe it: **Отримано** (how many arrived),
**Залишок** (how many are still on the shelf) and **Продано** (the difference — what
already went to clients). Batch numbers are **generated** from the product's SKU
(`FRY-500-01`, `FRY-500-02`; see [`utils/batch-number`](src/utils/batch-number.ts)),
so nothing has to be typed.

**Ціна закупки** and **Роздрібна ціна** are per delivery. The form prefills both from
the product's catalogue prices — most deliveries do come in and go out at them — and a
promotional one is typed over that; the cost field says underneath what it comes to in
the books' currency, and the retail field says what the pair earns. The batches table
carries all three (cost, retail, **Маржа**), the per-product view shows **Вартість
залишку** (what is left, each batch at its own cost), and the dashboard's stock value
follows the same rule.

The warehouse has two views. **За партіями** lists every delivery separately.
**За товаром** collapses them into one row per product with the total stock, which
expands to show how much sits under each expiry date — that is how you see both
"how much do I have" and "which of it expires when". Every batch row carries the
same **add-to-cart** button as the catalog, so stock can be sold straight from the
warehouse — the cart line is pinned to that exact batch (and its expiry date).

The batch a line ships from is also what it **cost and earns**: the picker in the cart
names each delivery by its expiry date, what is left of it, and what it cost against
what it sells for, and moving a line onto another delivery carries both figures with
it — otherwise the sale would report a margin it never made.

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
brand, category, prices in the base currency and current stock — falling back to
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
                           orders, cart, ui, toast)
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

### The app opens on a window, not on everything

An order carries its client and every line it sold, so the order list is the
heaviest read in the app — and it used to be fetched whole, on every app start
and after every sale. The store now holds a **window**: the last six months, the
same period the dashboard opens on (both come from `periodStart` in
[`utils/period`](src/utils/period.ts), so the chart's default range is always
covered by what was fetched).

Nothing is allowed to answer out of "whatever happens to be loaded". Screens that
can look further back ask for it first, through `ensureFrom(companyId, day)` —
`null` for the whole history — which widens the window and no-ops when it is
already wide enough:

- the **dashboard** watches its range, so pointing the chart at an older period
  fetches that period before it can draw the months as empty;
- the **orders list** watches its from-date, and says in a footer which day it is
  showing from, with one click to read the rest in;
- **clients** and **profile** ask for the whole history on mount, because every
  figure there — total spent, orders ever placed — is all-time by definition.

The dashboard's profit and order count now answer for the **chosen period** rather
than for all time, which is both what the rest of that screen does and the only
figure a window can honestly support.

### Saving one row does not reload the company

Every mutation used to end in a full `load()` — editing one batch refetched every
product and every batch the company owns. The API's `create`/`update` return the row
**with its joins**, exactly as the store holds it, and the stores put it back where a
fresh load would have left it: products newest first, batches ordered by expiry.
Deleting products drops their batches locally too, because the database cascades and
the shelf must not show stock of a product that no longer exists.

Two flows still read the warehouse back in full, and should: **placing an order** and
**deleting one** move stock across batches the RPC does not name (`create_order` /
`delete_orders`). Even there, only the warehouse is reloaded — the order list gains
or loses the one order involved.

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
batch — inventory, orders and the supplier rate lookup), the composable logic
(`useCatalog`, `useWarehouse` grouping, `useCurrency`'s supplier-rate conversion,
`useCurrencies`, `useRates`, `useSelection`, `useCsvImport` column mapping and
what an import writes), and the API layer (mocked Supabase client).
`views.test.ts` mounts Catalog, Warehouse, Orders, Links, Rates and the cart page
against seeded stores, so a broken template or missing slot fails in CI
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
