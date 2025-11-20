-- Add a deterministic pair key for private chats to enforce one conversation per user pair
begin;

alter table public.chats add column if not exists pair_key text;

-- Enforce uniqueness only for private chats
create unique index if not exists chats_unique_private_pair
  on public.chats (pair_key)
  where type = 'private';

commit;
