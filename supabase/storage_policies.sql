-- Storage bucket policies for avatars and mmp-files

-- Create buckets if they don't exist
insert into storage.buckets (id, name, public)
values 
  ('avatars', 'avatars', false),
  ('mmp-files', 'mmp-files', false)
on conflict (id) do nothing;

-- Drop existing policies if they exist (to avoid conflicts)
drop policy if exists "avatar_insert_auth" on storage.objects;
drop policy if exists "avatar_select_auth" on storage.objects;
drop policy if exists "avatar_update_own" on storage.objects;
drop policy if exists "avatar_delete_own" on storage.objects;
drop policy if exists "mmp_insert_auth" on storage.objects;
drop policy if exists "mmp_select_auth" on storage.objects;
drop policy if exists "mmp_update_auth" on storage.objects;
drop policy if exists "mmp_delete_auth" on storage.objects;

-- Policies for avatars bucket
create policy "avatar_insert_auth"
on storage.objects for insert to authenticated
with check (bucket_id = 'avatars');

create policy "avatar_select_auth"
on storage.objects for select to authenticated
using (bucket_id = 'avatars');

create policy "avatar_update_own"
on storage.objects for update to authenticated
using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1])
with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "avatar_delete_own"
on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- Policies for mmp-files bucket
create policy "mmp_insert_auth"
on storage.objects for insert to authenticated
with check (bucket_id = 'mmp-files');

create policy "mmp_select_auth"
on storage.objects for select to authenticated
using (bucket_id = 'mmp-files');

create policy "mmp_update_auth"
on storage.objects for update to authenticated
using (bucket_id = 'mmp-files')
with check (bucket_id = 'mmp-files');

create policy "mmp_delete_auth"
on storage.objects for delete to authenticated
using (bucket_id = 'mmp-files');
