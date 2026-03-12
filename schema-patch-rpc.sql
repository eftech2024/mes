-- ============================================================
-- schema-patch-rpc.sql
-- public 스키마 RPC 래퍼 함수 + 커스텀 스키마 노출
-- Supabase SQL Editor 또는 node run-rpc-migration.mjs 로 실행
-- ============================================================

-- ─── 현재 로그인 사용자의 프로파일 조회 ──────────────────────
create or replace function public.get_my_profile()
returns json
language plpgsql
security definer
set search_path = public, sys, auth
as $$
declare
  result json;
begin
  select to_json(u.*) into result
    from sys.users u
   where u.user_id = auth.uid();
  return result;
end;
$$;
grant execute on function public.get_my_profile() to anon, authenticated;

-- ─── 회원가입 후 부서 정보 업데이트 (트리거 이후 호출) ───────
create or replace function public.update_signup_profile(
  p_user_id  uuid,
  p_user_name text,
  p_department text default null
)
returns void
language plpgsql
security definer
set search_path = public, sys
as $$
begin
  update sys.users
     set user_name   = p_user_name,
         department  = p_department
   where user_id = p_user_id;
end;
$$;
grant execute on function public.update_signup_profile(uuid, text, text) to anon, authenticated;

-- ─── 관리자: 사용자 승인 ─────────────────────────────────────
create or replace function public.admin_approve_user(p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, sys
as $$
begin
  if (select role_code from sys.users where user_id = auth.uid()) <> 'ADMIN' then
    raise exception 'Unauthorized — ADMIN role required';
  end if;
  update sys.users
     set is_active    = true,
         approved_at  = now()
   where user_id = p_target_user_id;
end;
$$;
grant execute on function public.admin_approve_user(uuid) to authenticated;

-- ─── 관리자: 역할 변경 ──────────────────────────────────────
create or replace function public.admin_set_role(
  p_target_user_id uuid,
  p_role_code      text
)
returns void
language plpgsql
security definer
set search_path = public, sys
as $$
begin
  if (select role_code from sys.users where user_id = auth.uid()) <> 'ADMIN' then
    raise exception 'Unauthorized — ADMIN role required';
  end if;
  if p_role_code not in ('ADMIN','MANAGER','QC','OPERATOR','VIEWER') then
    raise exception 'Invalid role_code: %', p_role_code;
  end if;
  update sys.users set role_code = p_role_code where user_id = p_target_user_id;
end;
$$;
grant execute on function public.admin_set_role(uuid, text) to authenticated;

-- ─── 미승인 사용자 목록 (관리자 전용) ────────────────────────
create or replace function public.admin_list_pending_users()
returns json
language plpgsql
security definer
set search_path = public, sys
as $$
declare result json;
begin
  if (select role_code from sys.users where user_id = auth.uid()) <> 'ADMIN' then
    raise exception 'Unauthorized';
  end if;
  select json_agg(u order by u.created_at) into result
    from sys.users u
   where u.is_active = false;
  return coalesce(result, '[]'::json);
end;
$$;
grant execute on function public.admin_list_pending_users() to authenticated;
