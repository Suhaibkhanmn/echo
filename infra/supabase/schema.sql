-- Run this ONCE in the Supabase SQL editor:
--   Supabase dashboard -> SQL editor -> paste this whole file -> Run.
-- Creates an append-only table for encrypted sync events.
-- Server never sees plaintext: payload is AES-GCM ciphertext encoded as base64.

create extension if not exists pgcrypto;

create table if not exists public.sync_events (
  id           bigserial primary key,
  pair_id      text      not null,
  device       text      not null,
  event_type   text      not null,
  payload      text      not null,
  created_at   timestamptz not null default now()
);

create index if not exists sync_events_pair_id_id_idx
  on public.sync_events (pair_id, id);

alter table public.sync_events enable row level security;

-- Authenticated users can only read/append encrypted events for their own
-- Supabase user id. Content is still client-side encrypted, but RLS should
-- also prevent users from fetching each other's ciphertext and metadata.
drop policy if exists sync_events_select on public.sync_events;
create policy sync_events_select
  on public.sync_events for select
  to authenticated
  using (pair_id = auth.uid()::text);

drop policy if exists sync_events_insert on public.sync_events;
create policy sync_events_insert
  on public.sync_events for insert
  to authenticated
  with check (pair_id = auth.uid()::text);
