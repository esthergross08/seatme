-- Security fixes from the 2026-10-24 review.
--
-- 1. event_role(eid): one place that answers "what's my role on this event?".
--    Needed because event_members is only readable by the owner under RLS, so
--    the app couldn't see an invited editor's row and treated them as a viewer.
-- 2. Email matching for members is case-insensitive everywhere.
-- 3. pinterest_connections: no client access at all. Tokens are read and
--    written only server-side with the service-role key, after a role check.
-- 4. Helper functions are no longer callable by signed-out visitors.

-- 1. Caller's role on an event: 'owner' | 'editor' | 'viewer' | null.
create or replace function public.event_role(eid uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when exists (select 1 from events where id = eid and owner_id = auth.uid()) then 'owner'
    else (
      select role from event_members
      where event_id = eid and lower(email) = lower(auth.jwt() ->> 'email')
      limit 1
    )
  end;
$$;

-- 2. Case-insensitive member checks (same logic as before otherwise).
create or replace function public.is_event_member(eid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from event_members
    where event_id = eid and lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

create or replace function public.is_event_editor(eid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from event_members
    where event_id = eid and lower(email) = lower(auth.jwt() ->> 'email') and role = 'editor'
  );
$$;

-- 3. Pinterest tokens: server-side only. RLS stays enabled with no policies,
--    so signed-in and signed-out clients can't read or change any row.
drop policy if exists "members can access" on public.pinterest_connections;

-- 4. Signed-out visitors can't call the helpers; signed-in users still can,
--    because RLS policies evaluate them as the signed-in user.
revoke execute on function public.event_role(uuid) from public, anon;
revoke execute on function public.is_event_member(uuid) from public, anon;
revoke execute on function public.is_event_editor(uuid) from public, anon;
revoke execute on function public.is_event_owner(uuid) from public, anon;
grant execute on function public.event_role(uuid) to authenticated;
grant execute on function public.is_event_member(uuid) to authenticated;
grant execute on function public.is_event_editor(uuid) to authenticated;
grant execute on function public.is_event_owner(uuid) to authenticated;

-- rls_auto_enable runs as an event trigger, never via the API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
