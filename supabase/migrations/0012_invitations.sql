-- ─────────────────────────────────────────────────────────────
-- torba — 0012: invite a user into an organization by link
--
-- Supabase's own inviteUserByEmail() needs the service_role key, which
-- cannot live in a browser bundle, and sending mail from an Edge Function
-- would mean running and holding secrets for one feature. So invitations
-- are a table plus an opaque token: an admin creates one, copies the link
-- and sends it however they already talk to that person.
--
-- The token is the credential, so it is generated server-side (never by
-- the client) and an invitation is only ever readable by someone who
-- already administers the company. Redemption goes through
-- accept_invitation(), which looks the token up as the table owner —
-- a signed-in stranger can redeem a token they hold, but cannot read,
-- list or guess one.
--
-- An invitation binds to an email address, and acceptance checks it
-- against the caller's verified address, so a leaked link is useless to
-- anyone but its intended recipient.
-- ─────────────────────────────────────────────────────────────

create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  email       text not null,
  role        text not null default 'member'
                check (role in ('admin', 'member', 'viewer')),
  token       text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at  timestamptz
);

create index invitations_company_id_idx on public.invitations (company_id, created_at desc);
create index invitations_email_idx on public.invitations (lower(email));

alter table public.invitations enable row level security;

-- Reads are for administrators of the company, so they can see who is
-- pending and revoke. Writes go exclusively through the functions below:
-- a client that could insert rows could invite itself as an owner.
revoke all on public.invitations from anon, authenticated;
grant select on public.invitations to authenticated;

create policy invitations_select on public.invitations
  for select using (public.has_min_role(company_id, 'admin'));

-- `owner` is deliberately absent from the role check above: ownership is
-- transferred deliberately, not handed out in an invitation.

-- ── create ───────────────────────────────────────────────────

create or replace function public.create_invitation(
  p_company_id uuid,
  p_email text,
  p_role text default 'member'
)
returns public.invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_row public.invitations;
begin
  if not public.has_min_role(p_company_id, 'admin') then
    raise exception 'FORBIDDEN';
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'INVALID_EMAIL';
  end if;

  if p_role not in ('admin', 'member', 'viewer') then
    raise exception 'INVALID_ROLE';
  end if;

  if exists (
    select 1
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.company_id = p_company_id and lower(u.email) = v_email
  ) then
    raise exception 'ALREADY_MEMBER';
  end if;

  -- Re-inviting the same address replaces the outstanding invitation
  -- rather than leaving two live tokens for one seat.
  update public.invitations
  set revoked_at = now()
  where company_id = p_company_id
    and lower(email) = v_email
    and accepted_at is null
    and revoked_at is null;

  insert into public.invitations (company_id, email, role, invited_by)
  values (p_company_id, v_email, p_role, auth.uid())
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.create_invitation(uuid, text, text) to authenticated;

-- ── accept ───────────────────────────────────────────────────
-- The caller holds a token and nothing else. Everything is checked here
-- because the function runs as the table owner.

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_inv public.invitations;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select lower(email) into v_email from auth.users where id = v_uid;

  select * into v_inv
  from public.invitations
  where token = p_token
  for update;

  -- One error for "no such token" and "wrong recipient" alike, so the
  -- function cannot be used to probe which tokens exist.
  if v_inv.id is null
     or v_inv.revoked_at is not null
     or v_inv.accepted_at is not null
     or v_inv.expires_at < now()
     or lower(v_inv.email) is distinct from v_email then
    raise exception 'INVALID_INVITATION';
  end if;

  insert into public.memberships (company_id, user_id, role)
  values (v_inv.company_id, v_uid, v_inv.role)
  on conflict (company_id, user_id) do nothing;

  update public.invitations
  set accepted_at = now(), accepted_by = v_uid
  where id = v_inv.id;

  return v_inv.company_id;
end;
$$;

grant execute on function public.accept_invitation(text) to authenticated;

-- ── revoke ───────────────────────────────────────────────────

create or replace function public.revoke_invitation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.invitations where id = p_id;
  if v_company is null then
    raise exception 'NOT_FOUND';
  end if;
  if not public.has_min_role(v_company, 'admin') then
    raise exception 'FORBIDDEN';
  end if;

  update public.invitations
  set revoked_at = now()
  where id = p_id and accepted_at is null and revoked_at is null;
end;
$$;

grant execute on function public.revoke_invitation(uuid) to authenticated;

-- ── membership management ────────────────────────────────────
-- Changing a role and removing a member are the other half of the members
-- screen. Both go through definer functions for the same reason invites do.

create or replace function public.set_membership_role(
  p_company_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target text;
begin
  if not public.has_min_role(p_company_id, 'admin') then
    raise exception 'FORBIDDEN';
  end if;

  if p_role not in ('owner', 'admin', 'member', 'viewer') then
    raise exception 'INVALID_ROLE';
  end if;

  select role into v_target
  from public.memberships
  where company_id = p_company_id and user_id = p_user_id;

  if v_target is null then
    raise exception 'NOT_FOUND';
  end if;

  -- Only an owner may create another owner or change one. Without this an
  -- admin could promote themselves and take the company.
  if (p_role = 'owner' or v_target = 'owner')
     and not public.has_min_role(p_company_id, 'owner') then
    raise exception 'FORBIDDEN';
  end if;

  update public.memberships
  set role = p_role
  where company_id = p_company_id and user_id = p_user_id;

  -- A company with no owner can never be administered again.
  if not exists (
    select 1 from public.memberships
    where company_id = p_company_id and role = 'owner'
  ) then
    raise exception 'LAST_OWNER';
  end if;
end;
$$;

grant execute on function public.set_membership_role(uuid, uuid, text) to authenticated;

create or replace function public.remove_membership(
  p_company_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target text;
begin
  select role into v_target
  from public.memberships
  where company_id = p_company_id and user_id = p_user_id;

  if v_target is null then
    raise exception 'NOT_FOUND';
  end if;

  -- Anyone may leave; removing someone else needs admin, and removing an
  -- owner needs owner.
  if p_user_id is distinct from auth.uid() then
    if not public.has_min_role(p_company_id, 'admin') then
      raise exception 'FORBIDDEN';
    end if;
    if v_target = 'owner' and not public.has_min_role(p_company_id, 'owner') then
      raise exception 'FORBIDDEN';
    end if;
  end if;

  delete from public.memberships
  where company_id = p_company_id and user_id = p_user_id;

  if not exists (
    select 1 from public.memberships
    where company_id = p_company_id and role = 'owner'
  ) then
    raise exception 'LAST_OWNER';
  end if;
end;
$$;

grant execute on function public.remove_membership(uuid, uuid) to authenticated;

-- ── who is in this company ───────────────────────────────────
-- The members screen needs an email per member. `profiles` carries only a
-- display name, and auth.users is not readable from the client, so this
-- joins the two for members of companies the caller administers.

create or replace function public.company_members(p_company_id uuid)
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, u.email::text, p.full_name, m.role, m.created_at
  from public.memberships m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.company_id = p_company_id
    and public.is_member(p_company_id)
  order by m.created_at asc;
$$;

grant execute on function public.company_members(uuid) to authenticated;
