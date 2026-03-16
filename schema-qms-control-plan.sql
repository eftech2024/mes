-- ============================================================
-- QMS 관리계획서 (Control Plan) 스키마 확장
-- schema-app01.sql 실행 후 적용하세요.
-- ============================================================

-- ── 1. 공정 라우트 ──────────────────────────────────────
-- 연질/경질 등 공정 유형별 라우팅 정의
create table if not exists mdm.process_routes (
  route_id          uuid primary key default gen_random_uuid(),
  route_code        text not null unique,         -- 예: 'SOFT-ANO', 'HARD-ANO'
  route_name        text not null,                -- 예: '연질 아노다이징', '경질 아노다이징'
  process_type_code text not null references mdm.process_types(process_type_code),
  description       text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── 2. 공정 단계 ──────────────────────────────────────
-- 라우트 내 개별 공정 단계 (#00 ~ #150)
create table if not exists mdm.process_steps (
  step_id           uuid primary key default gen_random_uuid(),
  route_id          uuid not null references mdm.process_routes(route_id) on delete cascade,
  step_no           text not null,                -- '#00', '#10', '#20' ...
  step_name         text not null,                -- '입고검사', '탈지', '수세1' ...
  step_category     text not null default 'PROCESS'
                      check (step_category in ('INSPECTION','PROCESS','WASH','DRY','OTHER')),
  sort_order        integer not null default 0,
  description       text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  unique(route_id, step_no)
);

-- ── 3. 관리계획서 헤더 ──────────────────────────────────
create table if not exists mdm.control_plans (
  plan_id           uuid primary key default gen_random_uuid(),
  plan_code         text not null unique,         -- 'CP-SOFT-ANO-001'
  plan_name         text not null,                -- '연질 아노다이징 관리계획서'
  route_id          uuid not null references mdm.process_routes(route_id),
  revision          integer not null default 1,   -- 현재 리비전
  effective_date    date not null default current_date,
  status            text not null default 'DRAFT'
                      check (status in ('DRAFT','ACTIVE','SUPERSEDED','ARCHIVED')),
  approved_by       uuid references sys.users(user_id),
  approved_at       timestamptz,
  created_by        uuid references sys.users(user_id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── 4. 관리계획서 항목 ──────────────────────────────────
-- 각 공정 단계별 관리항목/사양/측정방법/주기/이상조치
create table if not exists mdm.control_plan_items (
  item_id           uuid primary key default gen_random_uuid(),
  plan_id           uuid not null references mdm.control_plans(plan_id) on delete cascade,
  step_id           uuid not null references mdm.process_steps(step_id),
  control_item      text not null,                -- 관리항목 (온도, 농도, pH 등)
  spec_standard     text,                         -- 관리사양 (예: '18~22℃')
  spec_upper        numeric(18,4),                -- 수치 상한
  spec_lower        numeric(18,4),                -- 수치 하한
  spec_unit         text,                         -- 단위 (℃, g/L, μm 등)
  measurement_method text,                        -- 측정방법 (온도계, pH미터 등)
  control_frequency  text,                        -- 관리주기 (매일, 매LOT 등)
  abnormality_action text,                        -- 이상 시 조치사항
  is_critical       boolean not null default false, -- 중점관리항목 여부
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── 5. 관리계획서 개정 이력 ─────────────────────────────
create table if not exists mdm.control_plan_revisions (
  revision_id       uuid primary key default gen_random_uuid(),
  plan_id           uuid not null references mdm.control_plans(plan_id) on delete cascade,
  revision          integer not null,
  change_reason     text not null,                -- 개정 사유
  change_details    text,                         -- 변경 내용 상세
  changed_by        uuid references sys.users(user_id),
  changed_at        timestamptz not null default now(),
  snapshot_json     jsonb,                        -- 해당 리비전 시점의 항목 스냅샷
  unique(plan_id, revision)
);

-- ── 6. 공정관리 실적 기록 ──────────────────────────────
-- 실제 생산 시 관리계획서 항목별 측정값 기록
create table if not exists qms.process_control_records (
  record_id         uuid primary key default gen_random_uuid(),
  lot_id            uuid not null references mes.lot_master(lot_id),
  run_id            uuid references mes.process_runs(run_id),
  plan_item_id      uuid not null references mdm.control_plan_items(item_id),
  measured_value    numeric(18,4),
  text_value        text,
  judgement         text check (judgement in ('OK','NG','N/A')),
  measured_by       uuid references sys.users(user_id),
  measured_at       timestamptz not null default now(),
  remarks           text
);

-- ── 7. 이상 조치 기록 ──────────────────────────────────
create table if not exists qms.abnormality_actions (
  action_id         uuid primary key default gen_random_uuid(),
  record_id         uuid not null references qms.process_control_records(record_id),
  lot_id            uuid not null references mes.lot_master(lot_id),
  plan_item_id      uuid not null references mdm.control_plan_items(item_id),
  abnormality_desc  text not null,                -- 이상 내용
  action_taken      text not null,                -- 조치 내용
  action_result     text,                         -- 조치 결과
  action_by         uuid references sys.users(user_id),
  action_at         timestamptz not null default now(),
  status            text not null default 'OPEN'
                      check (status in ('OPEN','IN_PROGRESS','CLOSED'))
);

-- ── 8. 품목-라우트 연결 (mdm.products 확장) ────────────
-- products 테이블에 route_id FK 추가
alter table mdm.products
  add column if not exists route_id uuid references mdm.process_routes(route_id);

-- ── 인덱스 ──────────────────────────────────────────────
create index if not exists idx_process_steps_route     on mdm.process_steps(route_id);
create index if not exists idx_control_plans_route     on mdm.control_plans(route_id);
create index if not exists idx_control_plan_items_plan on mdm.control_plan_items(plan_id);
create index if not exists idx_control_plan_items_step on mdm.control_plan_items(step_id);
create index if not exists idx_control_plan_revisions  on mdm.control_plan_revisions(plan_id);
create index if not exists idx_pcr_lot                 on qms.process_control_records(lot_id);
create index if not exists idx_pcr_plan_item           on qms.process_control_records(plan_item_id);
create index if not exists idx_abnormality_lot         on qms.abnormality_actions(lot_id);

-- ── RLS ─────────────────────────────────────────────────
alter table mdm.process_routes enable row level security;
alter table mdm.process_steps enable row level security;
alter table mdm.control_plans enable row level security;
alter table mdm.control_plan_items enable row level security;
alter table mdm.control_plan_revisions enable row level security;
alter table qms.process_control_records enable row level security;
alter table qms.abnormality_actions enable row level security;

create policy "process_routes_auth" on mdm.process_routes for all using (auth.role() = 'authenticated');
create policy "process_steps_auth"  on mdm.process_steps  for all using (auth.role() = 'authenticated');
create policy "control_plans_auth"  on mdm.control_plans  for all using (auth.role() = 'authenticated');
create policy "control_plan_items_auth" on mdm.control_plan_items for all using (auth.role() = 'authenticated');
create policy "control_plan_revisions_auth" on mdm.control_plan_revisions for all using (auth.role() = 'authenticated');
create policy "pcr_auth" on qms.process_control_records for all using (auth.role() = 'authenticated');
create policy "abnormality_actions_auth" on qms.abnormality_actions for all using (auth.role() = 'authenticated');

-- ── 초기 데이터: 연질 / 경질 라우트 ────────────────────
insert into mdm.process_routes (route_code, route_name, process_type_code, description) values
  ('SOFT-ANO', '연질 아노다이징', 'ANODIZING', '일반 연질 아노다이징 공정 라우트'),
  ('HARD-ANO', '경질 아노다이징', 'ANODIZING', '하드 경질 아노다이징 공정 라우트')
on conflict do nothing;

-- ── 초기 데이터: 연질 공정 단계 ─────────────────────────
do $$
declare
  v_route_id uuid;
begin
  select route_id into v_route_id from mdm.process_routes where route_code = 'SOFT-ANO';
  if v_route_id is not null then
    insert into mdm.process_steps (route_id, step_no, step_name, step_category, sort_order) values
      (v_route_id, '#00',  '입고검사',   'INSPECTION', 0),
      (v_route_id, '#10',  '탈지',       'PROCESS',    10),
      (v_route_id, '#20',  '수세1',      'WASH',       20),
      (v_route_id, '#30',  '에칭',       'PROCESS',    30),
      (v_route_id, '#40',  '수세2',      'WASH',       40),
      (v_route_id, '#50',  '수세3',      'WASH',       50),
      (v_route_id, '#60',  '중화',       'PROCESS',    60),
      (v_route_id, '#70',  '수세4',      'WASH',       70),
      (v_route_id, '#80',  '양극산화',   'PROCESS',    80),
      (v_route_id, '#90',  '수세5',      'WASH',       90),
      (v_route_id, '#100', '착색',       'PROCESS',    100),
      (v_route_id, '#110', '수세6',      'WASH',       110),
      (v_route_id, '#120', '봉공',       'PROCESS',    120),
      (v_route_id, '#130', '수세7',      'WASH',       130),
      (v_route_id, '#140', '건조',       'DRY',        140),
      (v_route_id, '#150', '출하검사',   'INSPECTION', 150)
    on conflict do nothing;
  end if;
end $$;

-- ── 초기 데이터: 경질 공정 단계 ─────────────────────────
do $$
declare
  v_route_id uuid;
begin
  select route_id into v_route_id from mdm.process_routes where route_code = 'HARD-ANO';
  if v_route_id is not null then
    insert into mdm.process_steps (route_id, step_no, step_name, step_category, sort_order) values
      (v_route_id, '#00',  '입고검사',   'INSPECTION', 0),
      (v_route_id, '#10',  '탈지',       'PROCESS',    10),
      (v_route_id, '#20',  '수세1',      'WASH',       20),
      (v_route_id, '#30',  '에칭',       'PROCESS',    30),
      (v_route_id, '#40',  '수세2',      'WASH',       40),
      (v_route_id, '#50',  '수세3',      'WASH',       50),
      (v_route_id, '#60',  '중화',       'PROCESS',    60),
      (v_route_id, '#70',  '수세4',      'WASH',       70),
      (v_route_id, '#80',  '양극산화',   'PROCESS',    80),
      (v_route_id, '#90',  '수세5',      'WASH',       90),
      (v_route_id, '#100', '봉공',       'PROCESS',    100),
      (v_route_id, '#110', '수세5',      'WASH',       110),
      (v_route_id, '#120', '건조',       'DRY',        120),
      (v_route_id, '#130', '출하검사',   'INSPECTION', 130)
    on conflict do nothing;
  end if;
end $$;
