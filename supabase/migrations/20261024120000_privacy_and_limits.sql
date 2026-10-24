-- Privacy and limits (2026-10-24 review, second block).
--
-- 1. usage_events: server-side counter for AI usage caps and the public RSVP
--    rate limit. Written only with the service key (RLS on, no policies).
-- 2. Floor plans and menus become private. Files are opened through
--    short-lived signed links, which need read rules: event members can read
--    their event's files, and users can read their own locations' files.

-- 1. Usage counter.
create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  subject text not null,      -- user id, or a hashed visitor id for RSVP pages
  kind text not null,         -- 'assistant' | 'analysis' | 'rsvp'
  created_at timestamptz not null default now()
);
create index if not exists usage_events_subject_kind_created_idx
  on public.usage_events (subject, kind, created_at desc);
alter table public.usage_events enable row level security;

-- 2. Private buckets + read rules.
update storage.buckets set public = false where id in ('floor-plans', 'menus');

drop policy if exists "Read own floor plans" on storage.objects;
create policy "Read own floor plans" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'floor-plans' and (
      ((storage.foldername(name))[1] = 'locations' and (storage.foldername(name))[2] = (auth.uid())::text)
      or (
        (storage.foldername(name))[1] = 'events'
        and (
          public.is_event_owner(((storage.foldername(name))[2])::uuid)
          or public.is_event_member(((storage.foldername(name))[2])::uuid)
        )
      )
    )
  );

drop policy if exists "Read own menus" on storage.objects;
create policy "Read own menus" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'menus'
    and (storage.foldername(name))[1] = 'events'
    and (
      public.is_event_owner(((storage.foldername(name))[2])::uuid)
      or public.is_event_member(((storage.foldername(name))[2])::uuid)
    )
  );
