-- 은혜의말씀 — 계정 기록 동기화·프로필 저장 구조
-- 적용 위치: Supabase 대시보드 → SQL Editor에서 이 파일 전체를 실행한다.
-- 이 파일에는 비밀키가 들어 있지 않다. 브라우저는 공개용 키로 아래 표에만 접근하며,
-- 행 수준 보안(RLS)으로 각 사용자는 자기 행만 읽고 쓸 수 있다.

-- ─────────────────────────────────────────────────────────────
-- 1) 사용자 기록 표
--    kind 한 종류당 사용자마다 한 행만 둔다(upsert 대상).
--    kind 값: 'favorites' | 'resume_read' | 'resume_listen' | 'recent_books'
-- ─────────────────────────────────────────────────────────────
create table if not exists public.gomna_user_records (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  kind       text        not null,
  payload    jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind),
  constraint gomna_user_records_kind_check
    check (kind in ('favorites', 'resume_read', 'resume_listen', 'recent_books'))
);

alter table public.gomna_user_records enable row level security;

drop policy if exists "gomna_user_records_select_own" on public.gomna_user_records;
create policy "gomna_user_records_select_own"
  on public.gomna_user_records for select
  using (auth.uid() = user_id);

drop policy if exists "gomna_user_records_insert_own" on public.gomna_user_records;
create policy "gomna_user_records_insert_own"
  on public.gomna_user_records for insert
  with check (auth.uid() = user_id);

drop policy if exists "gomna_user_records_update_own" on public.gomna_user_records;
create policy "gomna_user_records_update_own"
  on public.gomna_user_records for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "gomna_user_records_delete_own" on public.gomna_user_records;
create policy "gomna_user_records_delete_own"
  on public.gomna_user_records for delete
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 2) 프로필 표 (표시 이름·프로필 사진 주소)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.gomna_profiles (
  user_id      uuid        primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  updated_at   timestamptz not null default now()
);

alter table public.gomna_profiles enable row level security;

drop policy if exists "gomna_profiles_select_own" on public.gomna_profiles;
create policy "gomna_profiles_select_own"
  on public.gomna_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "gomna_profiles_insert_own" on public.gomna_profiles;
create policy "gomna_profiles_insert_own"
  on public.gomna_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "gomna_profiles_update_own" on public.gomna_profiles;
create policy "gomna_profiles_update_own"
  on public.gomna_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 3) 프로필 사진 저장소(Storage) 버킷과 정책
--    사용자마다 자기 UUID 폴더 안에서만 올리고·고치고·지울 수 있다.
--    사진 표시는 공개 버킷의 공개 URL로 이루어지므로, 목록 조회 권한은 본인 폴더만 연다.
-- ─────────────────────────────────────────────────────────────
-- 형식·크기 제한은 서버(Storage)에서 막는다.
-- 이미 버킷이 있어도 아래 제한값이 반영되도록 do update로 갱신한다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gomna-avatars', 'gomna-avatars', true,
  5242880,                                              -- 5MB
  array['image/jpeg', 'image/png', 'image/webp']         -- JPG·PNG·WebP만 허용
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 버킷 전체를 누구나 조회할 수 있던 정책은 쓰지 않는다.
-- (다른 사용자의 UUID와 파일 목록이 드러날 수 있고, 공개 URL 표시에는 필요하지 않다)
drop policy if exists "gomna_avatars_read_all" on storage.objects;

-- 목록 조회는 로그인 사용자가 자기 폴더를 볼 때만 허용한다(이전 사진 정리에 필요).
drop policy if exists "gomna_avatars_select_own" on storage.objects;
create policy "gomna_avatars_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'gomna-avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "gomna_avatars_insert_own" on storage.objects;
create policy "gomna_avatars_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'gomna-avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- using과 with check를 함께 둬서, 고치기(이름 바꾸기)로 남의 UUID 폴더로 옮기는 것도 막는다.
drop policy if exists "gomna_avatars_update_own" on storage.objects;
create policy "gomna_avatars_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'gomna-avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'gomna-avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "gomna_avatars_delete_own" on storage.objects;
create policy "gomna_avatars_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'gomna-avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );
