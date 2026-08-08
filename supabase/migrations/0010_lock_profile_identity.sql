-- ─────────────────────────────────────────────────────────────
-- torba — 0010: close the profile pivot (security hotfix)
--
-- `profiles_update` only pinned the row id:
--
--   for update using (id = auth.uid()) with check (id = auth.uid())
--
-- but every other table's RLS resolves the tenant through
-- current_company_id(), which is just
--
--   select company_id from public.profiles where id = auth.uid()
--
-- So any authenticated user could point their own profile at another
-- company and inherit full read/write on that company's brands,
-- products, batches, clients, orders and rates. The same hole let a
-- user promote themselves by writing `role`.
--
-- Identity columns (company_id, role) are now immutable from the API:
-- column-level privileges keep them out of any UPDATE statement, and a
-- trigger backstops that in case a future policy or grant widens again.
-- Only full_name stays user-writable.
--
-- Membership changes belong in SECURITY DEFINER functions, which run as
-- the table owner and bypass both guards by design.
-- ─────────────────────────────────────────────────────────────

-- ── 1. column-level privileges ───────────────────────────────
-- Table-wide UPDATE would cover every column; replace it with a grant
-- that names the only column an end user may change.

revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- ── 2. trigger backstop ──────────────────────────────────────
-- auth.uid() is null for the service role, for migrations, and inside
-- SECURITY DEFINER functions invoked by the platform — those paths are
-- trusted and pass through. A PostgREST caller always carries a JWT
-- subject, so an end user can never take the early return.

create or replace function public.guard_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'PROFILE_ID_IMMUTABLE';
  end if;

  if new.company_id is distinct from old.company_id then
    raise exception 'PROFILE_COMPANY_IMMUTABLE';
  end if;

  if new.role is distinct from old.role then
    raise exception 'PROFILE_ROLE_IMMUTABLE';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_identity on public.profiles;

create trigger profiles_guard_identity
  before update on public.profiles
  for each row execute function public.guard_profile_identity();

-- ── 3. next_order_number is not a public read ────────────────
-- It is SECURITY DEFINER, takes the company as a parameter and checks
-- nothing, so with the default PUBLIC execute grant any authenticated
-- user could probe another company's latest order number — that is,
-- their order volume. Nothing calls it from the client: create_order
-- calls it internally and runs as the owner, so revoking the grant
-- costs us nothing.

revoke execute on function public.next_order_number(uuid) from public;
revoke execute on function public.next_order_number(uuid) from anon;
revoke execute on function public.next_order_number(uuid) from authenticated;
