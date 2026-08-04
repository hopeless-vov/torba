# CLAUDE.md — Project rules for Claude Code

## README

**Always keep `README.md` up to date.**

Whenever you add, remove, or change a package, script, environment requirement, directory, or architectural convention, update `README.md` to reflect the change in the same response. Do not leave the README stale after making changes to the project.

## Architecture rules

1. **`components/ui/` must be presentational only.** No imports from `stores/`, `api/`, or `composables/`. Props in, events out.

2. **`views/` are route-level containers.** Each view maps 1:1 to a route. They compose components and connect them to stores/composables.

3. **Smart components in `components/` (root) can use stores and composables.** They wire up `ui/` components with application logic.

4. **No direct `api/` imports in components or views.** Always go through a composable or store. Components and views must never call API functions directly.

5. **No barrel exports.** Import directly from the file: `@/components/ui/TextInput.vue`, not from an `index.ts` re-export.

6. **All user-visible text must come from the locale files (`src/locales/uk.json`, `src/locales/en.json`).** `uk` is the default locale. Never hardcode text strings in templates or scripts. Always add the key to **both** locale files and reference it with `t('key')` via `useI18n()`.

7. **Use only the theme color tokens.** Colors come from the semantic tokens defined in `src/styles/main.css` (`bg`, `panel`, `surface`, `fg`, `muted`, `accent`, `danger`, `warn`, `info`, `line`, …) exposed as Tailwind utilities (`bg-surface`, `text-muted`, `border-line`). These flip automatically between light and dark via `data-theme` on `<html>`. Never use arbitrary color values (`text-[#fff]`, `bg-[rgb(...)]`, inline `style` colors) or raw palette colors that ignore the theme.

## Data / backend

8. **Supabase is the backend.** The typed data layer lives in `src/api/` (one file per resource, all going through `src/api/supabase.ts`). SQL schema + RLS live in `supabase/migrations/`. Components/views never touch Supabase directly — always through a composable or store.

9. **The functional currency is canonical; three rates stay separate.** The company's *functional* currency (`company.base_currency`, ₴ by default) is what the books are kept in — product retail and order amounts are stored in it. Product *cost* is stored in each brand's *catalog currency* and resolved to functional via the brand's *supplier rate* (`brand.supplier_rate`), which is the supplier's own rate and deliberately independent of the bank rate. USD is only a numeraire for the *market rate* table (`currencies.usd_rate` = units per 1 USD), not the base. The *display* currency (top-bar switch) is derived at render time from the market rate. Never persist a display-converted amount as the source of truth. All of this lives in `use-currency` — go through it, never reconvert by hand.

## Testing

10. **Everything in `api/`, `composables/`, `stores/`, and `utils/` is covered by unit tests** (Vitest, in `tests/unit/`). Supabase calls are mocked at the `api/` boundary.

## Animation

11. **Animations are subtle.** Use `motion-v` for small, quick, non-distracting transitions (page fades, list/stagger entrances, drawer/modal). Keep durations short (≤ ~0.3s) and easing gentle. Motion must never block interaction or draw attention to itself.
