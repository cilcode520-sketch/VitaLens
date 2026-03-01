-- ============================================================
-- Supabase Storage Setup
-- Run this in the Supabase SQL Editor after creating buckets
-- ============================================================

-- Create the intake-images bucket (private, 10MB limit per file)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'intake-images',
  'intake-images',
  false,             -- private bucket
  10485760,          -- 10MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Allow authenticated users to upload their own images
create policy "Users can upload own intake images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'intake-images' AND
    -- Path format: {profile_id}/{timestamp}.jpg
    -- Verify the profile belongs to the user (join via profiles table)
    auth.uid() = (
      select user_id from public.profiles
      where id::text = (string_to_array(name, '/'))[1]
      limit 1
    )
  );

-- Allow users to read their own images
create policy "Users can read own intake images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'intake-images' AND
    auth.uid() = (
      select user_id from public.profiles
      where id::text = (string_to_array(name, '/'))[1]
      limit 1
    )
  );

-- Allow users to delete their own images
create policy "Users can delete own intake images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'intake-images' AND
    auth.uid() = (
      select user_id from public.profiles
      where id::text = (string_to_array(name, '/'))[1]
      limit 1
    )
  );
