# Auth email templates

Supabase renders auth emails from templates configured in the **dashboard**, not
from this repo — there is no migration for them. These files are the source of
truth; paste each into its matching template.

## Where to paste

Dashboard → **Authentication → Emails** (a.k.a. *Email Templates*). For each
template below, switch the editor to **HTML source** and paste the file's
contents. The plain-text subject sits in the field above the body.

| File | Template in the dashboard | Suggested subject |
| --- | --- | --- |
| `confirm-signup.html` | *Confirm signup* | Confirm your torba account |
| `reset-password.html` | *Reset password* | Reset your torba password |
| `invite.html` | *Invite user* | You've been invited to a torba workspace |
| `magic-link.html` | *Magic Link* | Your torba sign-in link |

## Redirect URLs (fixes the "redirects to localhost" problem)

The links in these emails resolve against **Authentication → URL Configuration**:

- **Site URL** — set to the deployed origin (e.g. `https://app.torba.example`).
  In local dev this stays `http://localhost:5173`. This is why a confirmation
  email opened in production still points at localhost until you change it.
- **Redirect URLs** — allow-list every origin the app is served from, plus the
  paths the app hands to Supabase: `.../login`, `.../reset-password`. The app
  passes `emailRedirectTo` at sign-up (`src/api/auth.ts`) and at password reset
  (`src/composables/use-auth.ts`); those targets must be on this list or Supabase
  silently falls back to the Site URL.

## Template variables

Supabase substitutes these at send time — do not hard-code URLs:

- `{{ .ConfirmationURL }}` — the action link (confirm / reset / invite / magic).
- `{{ .SiteURL }}` — your configured Site URL.
- `{{ .Email }}` — the recipient address.
- `{{ .Token }}` / `{{ .TokenHash }}` — the raw OTP, if you build your own link.
