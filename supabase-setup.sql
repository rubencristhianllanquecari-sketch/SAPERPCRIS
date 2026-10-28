-- Shared app state for the LLANQUE static website.
-- Run once in Supabase > SQL Editor. Rerunning is safe.
create table if not exists public.llanque_app_state (
  state_key text primary key check (state_key like 'llanque-demo-%'),
  state_value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.llanque_app_state enable row level security;
grant select, insert, update, delete on public.llanque_app_state to authenticated;

drop policy if exists "Authenticated users manage LLANQUE state" on public.llanque_app_state;
create policy "Authenticated users manage LLANQUE state"
on public.llanque_app_state
for all to authenticated
using (true)
with check (true);
