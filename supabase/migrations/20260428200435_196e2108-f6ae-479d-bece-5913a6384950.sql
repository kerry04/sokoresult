-- Create the market-images bucket (public read)
insert into storage.buckets (id, name, public)
values ('market-images', 'market-images', true)
on conflict (id) do nothing;

-- Public can read
create policy "Market images are publicly readable"
on storage.objects for select
using (bucket_id = 'market-images');

-- Admins can insert
create policy "Admins can upload market images"
on storage.objects for insert
with check (
  bucket_id = 'market-images'
  and public.has_role(auth.uid(), 'admin')
);

-- Admins can update
create policy "Admins can update market images"
on storage.objects for update
using (
  bucket_id = 'market-images'
  and public.has_role(auth.uid(), 'admin')
);

-- Admins can delete
create policy "Admins can delete market images"
on storage.objects for delete
using (
  bucket_id = 'market-images'
  and public.has_role(auth.uid(), 'admin')
);