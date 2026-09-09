-- 은혜의말씀 — 비로그인 좋아요·댓글
-- 적용: Supabase SQL Editor에서 이 파일 전체를 실행한다.
-- 로그인: auth.uid() / 비로그인: 기기 키(sha256) + verse_id. 1기기 1좋아요.
-- 댓글은 RPC로만 쓰고, guest_key는 select 하지 않는다.

create extension if not exists pgcrypto with schema extensions;

alter table public.gomna_daily_likes
  add column if not exists guest_key text;

alter table public.gomna_daily_likes
  drop constraint if exists gomna_daily_likes_pkey;

alter table public.gomna_daily_likes
  alter column user_id drop not null;

alter table public.gomna_daily_likes
  drop constraint if exists gomna_daily_likes_actor_chk;
alter table public.gomna_daily_likes
  add constraint gomna_daily_likes_actor_chk
  check (
    (user_id is not null and guest_key is null)
    or (user_id is null and guest_key is not null)
  );

create unique index if not exists gomna_daily_likes_user_verse_uidx
  on public.gomna_daily_likes (user_id, verse_id)
  where user_id is not null;

create unique index if not exists gomna_daily_likes_guest_verse_uidx
  on public.gomna_daily_likes (guest_key, verse_id)
  where guest_key is not null;

alter table public.gomna_daily_comments
  add column if not exists guest_key text;

alter table public.gomna_daily_comments
  add column if not exists display_name text;

update public.gomna_daily_comments
  set display_name = '익명'
  where display_name is null or btrim(display_name) = '';

alter table public.gomna_daily_comments
  alter column display_name set default '익명';

alter table public.gomna_daily_comments
  alter column display_name set not null;

alter table public.gomna_daily_comments
  alter column user_id drop not null;

alter table public.gomna_daily_comments
  drop constraint if exists gomna_daily_comments_actor_chk;
alter table public.gomna_daily_comments
  add constraint gomna_daily_comments_actor_chk
  check (
    (user_id is not null and guest_key is null)
    or (user_id is null and guest_key is not null)
  );

alter table public.gomna_daily_comments
  drop constraint if exists gomna_daily_comments_name_len;
alter table public.gomna_daily_comments
  add constraint gomna_daily_comments_name_len
  check (char_length(btrim(display_name)) between 1 and 16);

create index if not exists gomna_daily_comments_guest_idx
  on public.gomna_daily_comments (guest_key, verse_id, created_at);

create or replace function public.gomna_guest_hash(p_key text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select case
    when p_key is null or btrim(p_key) = '' then ''
    else encode(extensions.digest(convert_to(btrim(p_key), 'utf8'), 'sha256'), 'hex')
  end;
$$;

create or replace function public.gomna_guest_key_ok(p_key text)
returns boolean
language sql
immutable
as $$
  select p_key is not null and p_key ~ '^[A-Za-z0-9_-]{16,64}$';
$$;

create or replace function public.gomna_social_label(p_name text)
returns text
language sql
immutable
as $$
  select left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 16);
$$;

drop function if exists public.gomna_daily_social_summary(text);
drop function if exists public.gomna_toggle_daily_like(text);

create or replace function public.gomna_daily_social_summary(p_verse_id text, p_guest_key text default '')
returns json
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
  gkey text := public.gomna_guest_hash(p_guest_key);
  liked boolean := false;
begin
  if p_verse_id is null or btrim(p_verse_id) = '' then
    return json_build_object('like_count', 0, 'liked', false, 'comment_count', 0);
  end if;
  if uid is not null then
    liked := exists(
      select 1 from public.gomna_daily_likes
      where verse_id = p_verse_id and user_id = uid
    );
  elsif public.gomna_guest_key_ok(p_guest_key) then
    liked := exists(
      select 1 from public.gomna_daily_likes
      where verse_id = p_verse_id and guest_key = gkey
    );
  end if;
  return json_build_object(
    'like_count', (select count(*)::int from public.gomna_daily_likes where verse_id = p_verse_id),
    'liked', liked,
    'comment_count', (select count(*)::int from public.gomna_daily_comments where verse_id = p_verse_id)
  );
end;
$$;

create or replace function public.gomna_toggle_daily_like(p_verse_id text, p_guest_key text default '')
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
  gkey text;
  liked boolean;
  cnt int;
begin
  if p_verse_id is null or btrim(p_verse_id) = '' then
    raise exception 'invalid-verse' using errcode = '22023';
  end if;
  if uid is not null then
    if exists (select 1 from public.gomna_daily_likes where user_id = uid and verse_id = p_verse_id) then
      delete from public.gomna_daily_likes where user_id = uid and verse_id = p_verse_id;
      liked := false;
    else
      insert into public.gomna_daily_likes (user_id, verse_id, guest_key)
      values (uid, p_verse_id, null)
      on conflict do nothing;
      liked := true;
    end if;
  else
    if not public.gomna_guest_key_ok(p_guest_key) then
      raise exception 'invalid-guest' using errcode = '22023';
    end if;
    gkey := public.gomna_guest_hash(p_guest_key);
    if exists (select 1 from public.gomna_daily_likes where guest_key = gkey and verse_id = p_verse_id) then
      delete from public.gomna_daily_likes where guest_key = gkey and verse_id = p_verse_id;
      liked := false;
    else
      insert into public.gomna_daily_likes (user_id, verse_id, guest_key)
      values (null, p_verse_id, gkey)
      on conflict do nothing;
      liked := true;
    end if;
  end if;
  select count(*)::int into cnt from public.gomna_daily_likes where verse_id = p_verse_id;
  return json_build_object('liked', liked, 'like_count', greatest(cnt, 0));
end;
$$;

create or replace function public.gomna_list_daily_comments(p_verse_id text, p_guest_key text default '')
returns json
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(json_agg(row_to_json(x)), '[]'::json)
  from (
    select
      c.id,
      c.display_name,
      c.content,
      c.created_at,
      (
        (c.user_id is not null and c.user_id = auth.uid())
        or (
          c.guest_key is not null
          and public.gomna_guest_key_ok(p_guest_key)
          and c.guest_key = public.gomna_guest_hash(p_guest_key)
        )
      ) as mine
    from public.gomna_daily_comments c
    where c.verse_id = p_verse_id
    order by c.created_at asc
  ) x;
$$;

create or replace function public.gomna_add_daily_comment(p_verse_id text, p_content text, p_guest_key text default '', p_display_name text default '')
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
  gkey text := null;
  body text := btrim(coalesce(p_content, ''));
  label text := public.gomna_social_label(p_display_name);
  new_id uuid;
  cnt int;
begin
  if p_verse_id is null or btrim(p_verse_id) = '' then
    return json_build_object('ok', false, 'error', 'invalid');
  end if;
  if char_length(body) < 1 or char_length(body) > 200 then
    return json_build_object('ok', false, 'error', 'invalid');
  end if;
  if label = '' then label := '익명'; end if;
  if uid is null then
    if not public.gomna_guest_key_ok(p_guest_key) then
      return json_build_object('ok', false, 'error', 'invalid');
    end if;
    gkey := public.gomna_guest_hash(p_guest_key);
  end if;
  if exists (
    select 1 from public.gomna_daily_comments
    where verse_id = p_verse_id
      and created_at > now() - interval '3 seconds'
      and (
        (uid is not null and user_id = uid)
        or (gkey is not null and guest_key = gkey)
      )
  ) then
    return json_build_object('ok', false, 'error', 'rate');
  end if;
  if (
    select count(*) from public.gomna_daily_comments
    where verse_id = p_verse_id
      and created_at > now() - interval '1 hour'
      and (
        (uid is not null and user_id = uid)
        or (gkey is not null and guest_key = gkey)
      )
  ) >= 5 then
    return json_build_object('ok', false, 'error', 'rate');
  end if;
  if exists (
    select 1 from public.gomna_daily_comments
    where verse_id = p_verse_id
      and content = body
      and created_at > now() - interval '10 minutes'
      and (
        (uid is not null and user_id = uid)
        or (gkey is not null and guest_key = gkey)
      )
  ) then
    return json_build_object('ok', false, 'error', 'dup');
  end if;
  insert into public.gomna_daily_comments (verse_id, user_id, guest_key, content, display_name)
  values (p_verse_id, uid, gkey, body, label)
  returning id into new_id;
  select count(*)::int into cnt from public.gomna_daily_comments where verse_id = p_verse_id;
  return json_build_object('ok', true, 'id', new_id, 'comment_count', greatest(cnt, 0));
end;
$$;

create or replace function public.gomna_delete_daily_comment(p_id uuid, p_guest_key text default '')
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := auth.uid();
  gkey text := public.gomna_guest_hash(p_guest_key);
  vid text;
  cnt int;
begin
  if p_id is null then
    return json_build_object('ok', false, 'error', 'invalid');
  end if;
  select verse_id into vid
  from public.gomna_daily_comments
  where id = p_id
    and (
      (uid is not null and user_id = uid)
      or (public.gomna_guest_key_ok(p_guest_key) and guest_key = gkey)
    );
  if vid is null then
    return json_build_object('ok', false, 'error', 'denied');
  end if;
  delete from public.gomna_daily_comments where id = p_id;
  select count(*)::int into cnt from public.gomna_daily_comments where verse_id = vid;
  return json_build_object('ok', true, 'comment_count', greatest(cnt, 0));
end;
$$;

revoke insert, delete on public.gomna_daily_likes from anon, authenticated;
revoke insert, delete on public.gomna_daily_comments from anon, authenticated;
grant select on public.gomna_daily_likes to anon, authenticated;
grant select (id, verse_id, user_id, content, created_at, display_name) on public.gomna_daily_comments to anon, authenticated;

grant execute on function public.gomna_guest_hash(text) to anon, authenticated;
grant execute on function public.gomna_guest_key_ok(text) to anon, authenticated;
grant execute on function public.gomna_social_label(text) to anon, authenticated;
grant execute on function public.gomna_daily_social_summary(text, text) to anon, authenticated;
grant execute on function public.gomna_toggle_daily_like(text, text) to anon, authenticated;
grant execute on function public.gomna_list_daily_comments(text, text) to anon, authenticated;
grant execute on function public.gomna_add_daily_comment(text, text, text, text) to anon, authenticated;
grant execute on function public.gomna_delete_daily_comment(uuid, text) to anon, authenticated;
