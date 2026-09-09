-- 은혜의말씀 — Home 1번 카드 좋아요·댓글
-- 적용: Supabase 대시보드 → SQL Editor에서 이 파일 전체를 실행한다.
-- 브라우저(anon/authenticated)가 RLS 아래에서만 읽고 쓴다. service role 키는 쓰지 않는다.
-- 좋아요 unique: (user_id, verse_id). 댓글은 실제 row만 count한다.

create table if not exists public.gomna_daily_likes (
  verse_id   text        not null,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, verse_id)
);

create index if not exists gomna_daily_likes_verse_idx
  on public.gomna_daily_likes (verse_id);

create table if not exists public.gomna_daily_comments (
  id         uuid        primary key default gen_random_uuid(),
  verse_id   text        not null,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  content    text        not null,
  created_at timestamptz not null default now(),
  constraint gomna_daily_comments_content_len
    check (char_length(btrim(content)) between 1 and 200)
);

create index if not exists gomna_daily_comments_verse_idx
  on public.gomna_daily_comments (verse_id, created_at);

alter table public.gomna_daily_likes enable row level security;
alter table public.gomna_daily_comments enable row level security;

drop policy if exists "gomna_daily_likes_select" on public.gomna_daily_likes;
create policy "gomna_daily_likes_select"
  on public.gomna_daily_likes for select
  using (true);

drop policy if exists "gomna_daily_likes_insert_own" on public.gomna_daily_likes;
create policy "gomna_daily_likes_insert_own"
  on public.gomna_daily_likes for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "gomna_daily_likes_delete_own" on public.gomna_daily_likes;
create policy "gomna_daily_likes_delete_own"
  on public.gomna_daily_likes for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "gomna_daily_comments_select" on public.gomna_daily_comments;
create policy "gomna_daily_comments_select"
  on public.gomna_daily_comments for select
  using (true);

drop policy if exists "gomna_daily_comments_insert_own" on public.gomna_daily_comments;
create policy "gomna_daily_comments_insert_own"
  on public.gomna_daily_comments for insert
  to authenticated
  with check (auth.uid() = user_id and char_length(btrim(content)) between 1 and 200);

drop policy if exists "gomna_daily_comments_delete_own" on public.gomna_daily_comments;
create policy "gomna_daily_comments_delete_own"
  on public.gomna_daily_comments for delete
  to authenticated
  using (auth.uid() = user_id);

grant select on public.gomna_daily_likes to anon, authenticated;
grant insert, delete on public.gomna_daily_likes to authenticated;
grant select on public.gomna_daily_comments to anon, authenticated;
grant insert, delete on public.gomna_daily_comments to authenticated;

create or replace function public.gomna_daily_social_summary(p_verse_id text)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  select json_build_object(
    'like_count', (select count(*)::int from public.gomna_daily_likes where verse_id = p_verse_id),
    'liked', (select exists(
      select 1 from public.gomna_daily_likes
      where verse_id = p_verse_id and user_id = auth.uid()
    )),
    'comment_count', (select count(*)::int from public.gomna_daily_comments where verse_id = p_verse_id)
  );
$$;

create or replace function public.gomna_toggle_daily_like(p_verse_id text)
returns json
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  liked boolean;
  cnt int;
begin
  if uid is null then
    raise exception 'not-authenticated' using errcode = '28000';
  end if;
  if p_verse_id is null or btrim(p_verse_id) = '' then
    raise exception 'invalid-verse' using errcode = '22023';
  end if;
  if exists (select 1 from public.gomna_daily_likes where user_id = uid and verse_id = p_verse_id) then
    delete from public.gomna_daily_likes where user_id = uid and verse_id = p_verse_id;
    liked := false;
  else
    insert into public.gomna_daily_likes (user_id, verse_id) values (uid, p_verse_id)
    on conflict (user_id, verse_id) do nothing;
    liked := true;
  end if;
  select count(*)::int into cnt from public.gomna_daily_likes where verse_id = p_verse_id;
  return json_build_object('liked', liked, 'like_count', greatest(cnt, 0));
end;
$$;

grant execute on function public.gomna_daily_social_summary(text) to anon, authenticated;
grant execute on function public.gomna_toggle_daily_like(text) to authenticated;
