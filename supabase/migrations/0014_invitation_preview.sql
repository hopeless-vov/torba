-- ─────────────────────────────────────────────────────────────
-- torba — 0014: let the recipient see which invitation they hold
--
-- 0012 merged every redemption failure into one INVALID_INVITATION so a
-- token could not be probed. That also left a legitimate recipient at a
-- dead end: sign in (or register) with the wrong address and all they get
-- back is "invalid", with no hint that the address was the problem.
--
-- Someone who holds the (unguessable, 24-byte) token is not the anonymous
-- prober that rule was defending against, so we let them preview what the
-- link is for — the company, a masked hint of the invited address, and
-- whether the account they are signed in as can actually accept it. The
-- full address is never returned, so a leaked link still cannot reveal
-- exactly who was invited.
-- ─────────────────────────────────────────────────────────────

-- j***@example.com — enough for a recipient to recognise their own address
-- without disclosing it to a mere link-holder.
create or replace function public.mask_email(p_email text)
returns text
language sql
immutable
as $$
  select case
    when p_email is null or position('@' in p_email) = 0 then null
    else left(split_part(p_email, '@', 1), 1) || '***@' || split_part(p_email, '@', 2)
  end;
$$;

create or replace function public.invitation_preview(p_token text)
returns table (
  company_name text,
  email_hint text,
  status text,
  matches_current boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.invitations;
  v_email text;
begin
  select * into v_inv from public.invitations where token = p_token;

  -- Unknown token: reveal nothing but that it is not usable.
  if v_inv.id is null then
    return query select null::text, null::text, 'invalid'::text, false;
    return;
  end if;

  select lower(email) into v_email from auth.users where id = auth.uid();

  return query
  select
    (select name from public.companies where id = v_inv.company_id),
    public.mask_email(v_inv.email),
    case
      when v_inv.revoked_at is not null then 'revoked'
      when v_inv.accepted_at is not null then 'accepted'
      when v_inv.expires_at < now() then 'expired'
      else 'pending'
    end,
    v_email is not null and v_email = lower(v_inv.email);
end;
$$;

-- The invite landing page is public: an unauthenticated recipient must be
-- able to see who the link is for before they sign in or register.
grant execute on function public.invitation_preview(text) to anon, authenticated;
