-- ============================================================
-- EF Tech MES/QMS App_01 — 전면 교체 스키마
-- Supabase SQL Editor 에서 실행하세요.
--
-- 실행 전 확인사항:
--   1) Supabase Dashboard > Settings > API > Exposed Schemas 에
--      core, mdm, mes, qms, sys, dms 를 추가해 주세요.
--   2) 기존 public.바코드, public.품목, public.업체 등은 삭제하지 않습니다.
--      새 스키마 테이블이 안정화된 후 수동으로 정리하세요.
-- ============================================================

create extension if not exists pgcrypto;

-- ── 스키마 생성 ────────────────────────────────────────────
create schema if not exists core;
create schema if not exists mdm;
create schema if not exists mes;
create schema if not exists qms;
create schema if not exists sys;
create schema if not exists dms;
create schema if not exists audit;

-- ============================================================
-- sys  — 사용자/권한
-- ============================================================
create table if not exists sys.users (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  user_code      text unique,          -- 사원 코드
  user_name      text not null,
  department     text,
  position_title text,
  phone          text,
  role_code      text not null default 'OPERATOR'
                   check (role_code in ('ADMIN','MANAGER','QC','OPERATOR','VIEWER')),
  is_active      boolean not null default false,  -- 관리자 승인 후 true
  approved_at    timestamptz,
  approved_by    uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ============================================================
-- core  — 거래처/연락처
-- ============================================================
create table if not exists core.parties (
  party_id   uuid primary key default gen_random_uuid(),
  party_type text not null check (party_type in ('CUSTOMER','SUPPLIER','INTERNAL')),
  party_name text not null,
  party_code text unique,
  initials   text,
  address    text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists core.contacts (
  contact_id   uuid primary key default gen_random_uuid(),
  party_id     uuid not null references core.parties(party_id) on delete cascade,
  contact_name text not null,
  department   text,
  phone        text,
  email        text,
  work_type    text,
  handled_item text,
  is_primary   boolean not null default false,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ============================================================
-- mdm  — 기준정보
-- ============================================================

-- 공정 타입 (ANODIZING / BONDING / OTHER_POST)
create table if not exists mdm.process_types (
  process_type_code text primary key,
  process_type_name text not null,
  sort_order        integer not null default 0
);
insert into mdm.process_types(process_type_code, process_type_name, sort_order)
values
  ('ANODIZING', '아노다이징', 1),
  ('BONDING',   '본딩',       2),
  ('OTHER_POST','기타 후처리', 3)
on conflict do nothing;

-- 품목 마스터
create table if not exists mdm.products (
  product_id        uuid primary key default gen_random_uuid(),
  legacy_product_id text unique,          -- 기존 P-1, P-2 형식
  customer_party_id uuid references core.parties(party_id),
  ship_to_party_id  uuid references core.parties(party_id),
  product_name      text not null,
  product_code      text,                 -- 품번
  vehicle_name      text,                 -- 차종명
  vehicle_code      text,                 -- 4자리 차종코드 (동적 생성)
  category          text,
  default_process_type text not null default 'ANODIZING'
                       references mdm.process_types(process_type_code),
  unit_price        numeric(18,2),
  is_active         boolean not null default true,
  remarks           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 품목 사양 (1:1)
create table if not exists mdm.product_specs (
  product_id              uuid primary key references mdm.products(product_id) on delete cascade,
  surface_area            numeric(18,4),        -- 표면적 (dm²)
  piece_weight            numeric(18,4),        -- 개당 중량 (g)
  drawing_no              text,
  rack_load_qty           integer,              -- 장입량
  immersion_seconds       integer,              -- 침적시간 (초)
  target_voltage          numeric(8,2),         -- 기준 전압 (V)
  target_current_per_pc   numeric(8,2),         -- 개당 기준 전류 (A)
  spec_upper              numeric(18,4),        -- 피막두께 상한
  spec_lower              numeric(18,4),        -- 피막두께 하한
  remarks                 text,
  updated_at              timestamptz not null default now()
);

-- 검사기준 마스터
create table if not exists mdm.inspection_spec_master (
  spec_id           uuid primary key default gen_random_uuid(),
  inspection_stage  text not null check (inspection_stage in ('INCOMING','PROCESS','FINAL')),
  process_type_code text references mdm.process_types(process_type_code),
  spec_name         text not null,
  check_item        text not null,
  measuring_tool    text,
  criteria_text     text,
  target_value      numeric(18,4),
  lower_limit       numeric(18,4),
  upper_limit       numeric(18,4),
  unit              text,
  sampling_rule     text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 품목별 검사기준 Ref
create table if not exists mdm.product_inspection_specs (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references mdm.products(product_id) on delete cascade,
  spec_id      uuid not null references mdm.inspection_spec_master(spec_id) on delete cascade,
  is_required  boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  unique(product_id, spec_id)
);

-- 차종코드 참조 테이블 (선택적, 직접 조회용)
create table if not exists mdm.vehicle_codes (
  vehicle_name text primary key,
  vehicle_code text not null,   -- 4자리: A=01..Z=26 기반
  customer_name text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- mes  — 생산/LOT 관리
-- ============================================================

-- 판매계획
create table if not exists mes.delivery_plans (
  plan_id             uuid primary key default gen_random_uuid(),
  legacy_plan_id      text unique,
  customer_party_id   uuid references core.parties(party_id),
  product_id          uuid references mdm.products(product_id),
  plan_date           date,
  inbound_due_date    date,
  delivery_due_date   date,
  planned_qty         numeric(18,4) not null,
  is_urgent           boolean not null default false,
  status              text not null default 'OPEN'
                        check (status in ('OPEN','IN_PROGRESS','COMPLETED','CLOSED')),
  memo                text,
  created_by          uuid references sys.users(user_id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- 작업지시서
create table if not exists mes.work_orders (
  work_order_id       uuid primary key default gen_random_uuid(),
  work_order_no       serial,            -- WO-0001 표시용
  plan_id             uuid references mes.delivery_plans(plan_id),
  product_id          uuid not null references mdm.products(product_id),
  customer_party_id   uuid references core.parties(party_id),
  process_type_code   text not null references mdm.process_types(process_type_code),
  planned_qty         numeric(18,4) not null,
  due_date            date,
  priority            text not null default 'NORMAL'
                        check (priority in ('URGENT','NORMAL','LOW')),
  status              text not null default 'OPEN'
                        check (status in ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')),
  memo                text,
  created_by          uuid references sys.users(user_id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- 글로벌 바코드 시퀀스
create sequence if not exists mes.global_barcode_seq start 1 no cycle;

-- LOT 마스터 (공통 LOT 체계)
create table if not exists mes.lot_master (
  lot_id            uuid primary key default gen_random_uuid(),
  lot_no            text not null unique,    -- 내부 LOT 번호 (L-YYMMDD-NNNN)
  work_order_id     uuid references mes.work_orders(work_order_id),
  product_id        uuid not null references mdm.products(product_id),
  customer_party_id uuid references core.parties(party_id),
  process_type_code text not null references mdm.process_types(process_type_code),
  receipt_type      text not null default 'GENERAL_IN'
                      check (receipt_type in ('GENERAL_IN','ANODIZING_IN','BONDING_IN','OTHER_POST_IN','REWORK_IN')),
  inbound_material_state text not null default 'MACHINED_PART'
                      check (inbound_material_state in ('MACHINED_PART','ANODIZED_PART','PRETREATED_PART','OTHER')),
  customer_trace_ref jsonb,              -- 고객사 추적 참조 (소재/단조/열처리 LOT 등)
  qty_in            numeric(18,4) not null,   -- 입고 원수량
  qty_available     numeric(18,4) not null,   -- 현재 가용수량
  qty_shipped       numeric(18,4) not null default 0,  -- 누적 출하수량
  unit_price        numeric(18,2),
  inbound_date      date,
  current_status    text not null default 'RECEIVED'
                      check (current_status in (
                        'RECEIVED',
                        'INCOMING_INSPECTION_WAIT',
                        'INCOMING_OK',
                        'INCOMING_NG',
                        'READY_FOR_PROCESS',
                        'IN_PROCESS',
                        'PROCESS_DONE',
                        'PROCESS_INSPECTION_WAIT',
                        'PROCESS_OK',
                        'PROCESS_NG',
                        'FINAL_INSPECTION_WAIT',
                        'FINAL_OK',
                        'HOLD',
                        'SHIPPED',
                        'CLOSED'
                      )),
  notes             text,
  created_by        uuid references sys.users(user_id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- LOT 바코드 (Main LOT 하위에 복수 등록 가능)
-- 형식: 순번(2) + YY(2) + MM(2) + DD(2) + 차종코드(4) = 12자리
create table if not exists mes.lot_barcodes (
  barcode_id     uuid primary key default gen_random_uuid(),
  lot_id         uuid not null references mes.lot_master(lot_id) on delete cascade,
  seq_no         integer not null,          -- 글로벌 시퀀스 번호
  barcode_value  text not null unique,      -- 12자리 바코드 문자열
  barcode_type   text not null default 'INTERNAL'
                   check (barcode_type in ('INTERNAL','CUSTOMER','LEGACY')),
  label          text,                      -- 표시용 레이블
  qty            numeric(18,4),             -- 해당 바코드의 수량 (null = lot 전체)
  is_primary     boolean not null default false,
  created_at     timestamptz not null default now()
);

-- 입고 내역
create table if not exists mes.inbound_receipts (
  receipt_id        uuid primary key default gen_random_uuid(),
  lot_id            uuid not null references mes.lot_master(lot_id),
  receipt_date      date not null,
  receipt_qty       numeric(18,4) not null,
  work_order_ref    text,
  source_doc_no     text,
  supplier_party_id uuid references core.parties(party_id),
  contact_id        uuid references core.contacts(contact_id),
  received_by       uuid references sys.users(user_id),
  remarks           text,
  created_at        timestamptz not null default now()
);

-- 작업실적 (POP — Process Execution)
create table if not exists mes.process_runs (
  run_id            uuid primary key default gen_random_uuid(),
  lot_id            uuid not null references mes.lot_master(lot_id),
  process_type_code text not null references mdm.process_types(process_type_code),
  input_qty         numeric(18,4),
  work_qty          numeric(18,4),
  remain_qty        numeric(18,4),
  started_at        timestamptz,
  completed_at      timestamptz,
  operator_id       uuid references sys.users(user_id),
  abnormal_yn       boolean not null default false,
  remarks           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 작업 파라미터 (유연한 Key-Value 구조)
create table if not exists mes.process_parameters (
  param_id       uuid primary key default gen_random_uuid(),
  run_id         uuid not null references mes.process_runs(run_id) on delete cascade,
  param_key      text not null,
  numeric_value  numeric(18,4),
  text_value     text,
  unit_name      text,
  created_at     timestamptz not null default now()
);

-- 출하 내역
create table if not exists mes.shipments (
  shipment_id       uuid primary key default gen_random_uuid(),
  lot_id            uuid not null references mes.lot_master(lot_id),
  product_id        uuid not null references mdm.products(product_id),
  customer_party_id uuid references core.parties(party_id),
  ship_to_party_id  uuid references core.parties(party_id),
  contact_id        uuid references core.contacts(contact_id),
  shipment_date     date not null,
  shipped_qty       numeric(18,4) not null,
  unit_price        numeric(18,2),
  is_partial        boolean not null default false,
  remarks           text,
  created_by        uuid references sys.users(user_id),
  created_at        timestamptz not null default now()
);

-- LOT 이벤트 로그 (불변 이력)
create table if not exists mes.lot_events (
  event_id          uuid primary key default gen_random_uuid(),
  lot_id            uuid not null references mes.lot_master(lot_id),
  event_type        text not null,      -- INBOUND, INSPECTION, PROCESS_START, PROCESS_DONE, SHIPMENT, STATUS_CHANGE, NOTE
  ref_table         text,
  ref_id            uuid,
  status_before     text,
  status_after      text,
  qty               numeric(18,4),
  actor_user_id     uuid references sys.users(user_id),
  notes             text,
  event_at          timestamptz not null default now()
);

-- ============================================================
-- qms  — 검사
-- ============================================================

-- 검사 헤더
create table if not exists qms.inspections (
  inspection_id     uuid primary key default gen_random_uuid(),
  lot_id            uuid not null references mes.lot_master(lot_id),
  product_id        uuid not null references mdm.products(product_id),
  process_type_code text not null references mdm.process_types(process_type_code),
  inspection_stage  text not null check (inspection_stage in ('INCOMING','PROCESS','FINAL')),
  sample_count      integer,
  inspected_on      date,
  inspector_id      uuid references sys.users(user_id),
  inspector_name    text,              -- 비로그인 검사자 이름 직접 입력용
  final_result      text check (final_result in ('PASS','FAIL','HOLD')),
  remarks           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 검사 결과 상세
create table if not exists qms.inspection_results (
  result_id         uuid primary key default gen_random_uuid(),
  inspection_id     uuid not null references qms.inspections(inspection_id) on delete cascade,
  spec_id           uuid references mdm.inspection_spec_master(spec_id),
  check_item        text not null,   -- 스펙에서 복사하거나 직접 입력
  sample_no         integer,
  measured_value    numeric(18,4),
  result_text       text,            -- 합격/불합격 or 측정값 텍스트
  judgement         text check (judgement in ('PASS','FAIL','N/A')),
  image_path        text,
  reason            text,
  follow_up         text,
  created_at        timestamptz not null default now()
);

-- 부적합 기록
create table if not exists qms.nonconformities (
  ncr_id            uuid primary key default gen_random_uuid(),
  lot_id            uuid not null references mes.lot_master(lot_id),
  inspection_id     uuid references qms.inspections(inspection_id),
  run_id            uuid references mes.process_runs(run_id),
  defect_type       text,
  defect_qty        numeric(18,4),
  status            text not null default 'OPEN'
                      check (status in ('OPEN','UNDER_REVIEW','CLOSED')),
  disposition       text,
  registered_by     uuid references sys.users(user_id),
  registered_at     timestamptz not null default now(),
  remarks           text
);

-- ============================================================
-- dms  — 첨부파일
-- ============================================================
create table if not exists dms.attachments (
  attachment_id  uuid primary key default gen_random_uuid(),
  bucket_name    text not null default 'mes-attachments',
  object_path    text not null,
  ref_table      text not null,
  ref_id         uuid not null,
  file_name      text,
  mime_type      text,
  file_purpose   text,    -- INSPECTION_IMAGE, WORK_ORDER_DOC, etc.
  uploaded_by    uuid references sys.users(user_id),
  uploaded_at    timestamptz not null default now()
);

-- ============================================================
-- audit  — 변경 로그
-- ============================================================
create table if not exists audit.change_logs (
  log_id        uuid primary key default gen_random_uuid(),
  schema_name   text not null,
  table_name    text not null,
  record_id     uuid,
  action_type   text not null,
  before_json   jsonb,
  after_json    jsonb,
  actor_user_id uuid,
  changed_at    timestamptz not null default now()
);

-- ============================================================
-- 인덱스
-- ============================================================
create index if not exists idx_lot_master_product      on mes.lot_master(product_id);
create index if not exists idx_lot_master_customer     on mes.lot_master(customer_party_id);
create index if not exists idx_lot_master_status       on mes.lot_master(current_status);
create index if not exists idx_lot_master_inbound_date on mes.lot_master(inbound_date);
create index if not exists idx_lot_master_work_order   on mes.lot_master(work_order_id);
create index if not exists idx_lot_barcodes_lot        on mes.lot_barcodes(lot_id);
create index if not exists idx_lot_barcodes_value      on mes.lot_barcodes(barcode_value);
create index if not exists idx_process_runs_lot        on mes.process_runs(lot_id);
create index if not exists idx_shipments_lot           on mes.shipments(lot_id);
create index if not exists idx_inspections_lot         on qms.inspections(lot_id);
create index if not exists idx_inspections_stage       on qms.inspections(inspection_stage);
create index if not exists idx_lot_events_lot          on mes.lot_events(lot_id);
create index if not exists idx_products_customer       on mdm.products(customer_party_id);
create index if not exists idx_work_orders_product     on mes.work_orders(product_id);
create index if not exists idx_delivery_plans_customer on mes.delivery_plans(customer_party_id);

-- ============================================================
-- 재고 요약 뷰 (실시간 집계)
-- ============================================================
create or replace view mes.inventory_summary as
select
  p.product_id,
  p.product_name,
  p.product_code,
  p.vehicle_name,
  par.party_name                                                    as customer_name,
  par.party_id                                                      as customer_party_id,
  count(l.lot_id)                                                   as lot_count,
  coalesce(sum(l.qty_available), 0)                                 as qty_available,
  coalesce(sum(l.qty_shipped), 0)                                   as qty_shipped,
  coalesce(sum(l.qty_in), 0)                                        as qty_in_total,
  coalesce(sum(case when l.current_status = 'RECEIVED'              then l.qty_available else 0 end), 0) as qty_received,
  coalesce(sum(case when l.current_status in ('IN_PROCESS','PROCESS_DONE') then l.qty_available else 0 end), 0) as qty_in_process,
  coalesce(sum(case when l.current_status = 'FINAL_OK'              then l.qty_available else 0 end), 0) as qty_ready_ship
from mdm.products p
  left join core.parties par on p.customer_party_id = par.party_id
  left join mes.lot_master l on p.product_id = l.product_id
    and l.current_status not in ('SHIPPED','CLOSED')
group by p.product_id, p.product_name, p.product_code, p.vehicle_name,
         par.party_name, par.party_id;

-- ============================================================
-- LOT 타임라인 뷰 (이력 조회용)
-- ============================================================
create or replace view mes.lot_timeline as
select
  e.lot_id,
  e.event_id,
  e.event_type,
  e.event_at,
  e.status_before,
  e.status_after,
  e.qty,
  e.notes,
  u.user_name   as actor_name,
  e.ref_table,
  e.ref_id
from mes.lot_events e
  left join sys.users u on e.actor_user_id = u.user_id
order by e.lot_id, e.event_at;

-- ============================================================
-- RLS (Row Level Security) — 인증된 사용자만 접근
-- ============================================================
-- sys.users
alter table sys.users enable row level security;
create policy "users_self_read"   on sys.users for select using (auth.uid() = user_id or auth.role() = 'authenticated');
create policy "users_self_update" on sys.users for update using (auth.uid() = user_id);

-- core.*
alter table core.parties  enable row level security;
alter table core.contacts enable row level security;
create policy "parties_all_auth"  on core.parties  for all using (auth.role() = 'authenticated');
create policy "contacts_all_auth" on core.contacts for all using (auth.role() = 'authenticated');

-- mdm.*
alter table mdm.products                  enable row level security;
alter table mdm.product_specs             enable row level security;
alter table mdm.process_types             enable row level security;
alter table mdm.inspection_spec_master    enable row level security;
alter table mdm.product_inspection_specs  enable row level security;
alter table mdm.vehicle_codes             enable row level security;
create policy "mdm_products_auth"     on mdm.products                  for all using (auth.role() = 'authenticated');
create policy "mdm_pspecs_auth"       on mdm.product_specs             for all using (auth.role() = 'authenticated');
create policy "mdm_ptypes_read"       on mdm.process_types             for select using (true);
create policy "mdm_ispec_auth"        on mdm.inspection_spec_master    for all using (auth.role() = 'authenticated');
create policy "mdm_pispec_auth"       on mdm.product_inspection_specs  for all using (auth.role() = 'authenticated');
create policy "mdm_vcodes_read"       on mdm.vehicle_codes             for select using (true);

-- mes.*
alter table mes.delivery_plans   enable row level security;
alter table mes.work_orders      enable row level security;
alter table mes.lot_master       enable row level security;
alter table mes.lot_barcodes     enable row level security;
alter table mes.inbound_receipts enable row level security;
alter table mes.process_runs     enable row level security;
alter table mes.process_parameters enable row level security;
alter table mes.shipments        enable row level security;
alter table mes.lot_events       enable row level security;
create policy "mes_dplan_auth"   on mes.delivery_plans   for all using (auth.role() = 'authenticated');
create policy "mes_wo_auth"      on mes.work_orders      for all using (auth.role() = 'authenticated');
create policy "mes_lot_auth"     on mes.lot_master       for all using (auth.role() = 'authenticated');
create policy "mes_barcode_auth" on mes.lot_barcodes     for all using (auth.role() = 'authenticated');
create policy "mes_inbound_auth" on mes.inbound_receipts for all using (auth.role() = 'authenticated');
create policy "mes_prun_auth"    on mes.process_runs     for all using (auth.role() = 'authenticated');
create policy "mes_pparam_auth"  on mes.process_parameters for all using (auth.role() = 'authenticated');
create policy "mes_ship_auth"    on mes.shipments        for all using (auth.role() = 'authenticated');
create policy "mes_event_auth"   on mes.lot_events       for all using (auth.role() = 'authenticated');

-- qms.*
alter table qms.inspections       enable row level security;
alter table qms.inspection_results enable row level security;
alter table qms.nonconformities   enable row level security;
create policy "qms_insp_auth"    on qms.inspections        for all using (auth.role() = 'authenticated');
create policy "qms_iresult_auth" on qms.inspection_results for all using (auth.role() = 'authenticated');
create policy "qms_ncr_auth"     on qms.nonconformities    for all using (auth.role() = 'authenticated');

-- dms.*
alter table dms.attachments enable row level security;
create policy "dms_attach_auth" on dms.attachments for all using (auth.role() = 'authenticated');

-- ============================================================
-- 트리거: lot_master.updated_at 자동 갱신
-- ============================================================
create or replace function mes.update_lot_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

create trigger lot_master_updated_at
  before update on mes.lot_master
  for each row execute function mes.update_lot_updated_at();

-- ============================================================
-- 함수: LOT 상태 변경 + 이벤트 기록
-- ============================================================
create or replace function mes.transition_lot_status(
  p_lot_id      uuid,
  p_new_status  text,
  p_actor_id    uuid default null,
  p_notes       text default null
) returns void language plpgsql security definer as $$
declare
  v_old_status text;
begin
  select current_status into v_old_status from mes.lot_master where lot_id = p_lot_id;

  update mes.lot_master
    set current_status = p_new_status, updated_at = now()
    where lot_id = p_lot_id;

  insert into mes.lot_events(lot_id, event_type, status_before, status_after, actor_user_id, notes)
    values(p_lot_id, 'STATUS_CHANGE', v_old_status, p_new_status, p_actor_id, p_notes);
end; $$;

-- ============================================================
-- 함수: 다음 바코드 시퀀스 번호 반환
-- ============================================================
create or replace function mes.next_barcode_seq()
returns integer language sql security definer as $$
  select cast(nextval('mes.global_barcode_seq') as integer);
$$;

-- ============================================================
-- Storage 버킷 (Supabase Dashboard에서 생성 필요)
-- ============================================================
-- 버킷명: mes-attachments (public: false, 5MB limit)
-- insert into storage.buckets(id, name, public) values('mes-attachments', 'mes-attachments', false)
-- on conflict do nothing;

-- ============================================================
-- 마이그레이션 스키마 (기존 데이터 → 신규)
-- ============================================================
create schema if not exists mig;

create table if not exists mig.sheet_rows_raw (
  raw_id       uuid primary key default gen_random_uuid(),
  source_sheet text not null,
  source_row   integer,
  row_json     jsonb not null,
  batch_id     text not null,
  imported_at  timestamptz not null default now()
);

create table if not exists mig.migration_log (
  log_id       uuid primary key default gen_random_uuid(),
  source_sheet text not null,
  source_row   integer,
  target_table text,
  target_id    uuid,
  status       text not null default 'PENDING', -- PENDING, DONE, ERROR
  error_msg    text,
  batch_id     text,
  created_at   timestamptz not null default now()
);
