-- Soft delete for events: deleting an event now sets deleted_at instead of removing
-- the row, so the seating plan, guest list, collaborators (event_members) and logs
-- (all ON DELETE CASCADE) survive and the event can be restored from "Recently deleted".
alter table public.events add column if not exists deleted_at timestamptz;

create index if not exists events_owner_deleted_idx
  on public.events (owner_id, deleted_at)
  where deleted_at is not null;

-- updated_at is the planner's concurrency token: it only saves if the row still has
-- the updated_at it last saw, so a stale tab (or a guest's RSVP landing mid-edit)
-- can't silently overwrite newer data. That only works if *every* write bumps it,
-- including the RSVP endpoint, so the database sets it rather than each caller.
create or replace function public.touch_events_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists events_touch_updated_at on public.events;
create trigger events_touch_updated_at
  before update on public.events
  for each row execute function public.touch_events_updated_at();
