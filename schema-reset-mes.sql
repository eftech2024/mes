-- ============================================================
-- MES 스키마 리셋 마이그레이션
-- 이전 schema-app01 구조 → schema-final 구조 전환
-- Supabase SQL Editor에서 실행
-- ============================================================

-- ─── 1) 의존 테이블부터 역순으로 DROP ────────────────────────
drop table if exists dms.attachments cascade;
drop table if exists qms.inspection_results cascade;
drop table if exists qms.inspections cascade;
drop table if exists mes.shipments cascade;
drop table if exists mes.lot_events cascade;
drop table if exists mes.process_parameters cascade;
drop table if exists mes.process_runs cascade;
drop table if exists mes.inbound_receipts cascade;
drop table if exists mes.lot_barcodes cascade;
drop table if exists mes.lot_master cascade;
drop table if exists mes.work_orders cascade;
drop table if exists mes.delivery_plans cascade;
drop table if exists mdm.product_inspection_specs cascade;
drop table if exists mdm.inspection_spec_master cascade;
drop table if exists mdm.defect_types cascade;
drop table if exists mdm.measurement_tools cascade;
drop table if exists mdm.product_specs cascade;
drop table if exists mdm.products cascade;
drop table if exists core.contacts cascade;
drop table if exists core.parties cascade;

-- 이전 한글 테이블도 정리
drop table if exists public.검사항목마스터 cascade;
drop table if exists public.사원 cascade;
drop table if exists public.바코드 cascade;
drop table if exists public.작업지시서 cascade;
drop table if exists public.재고 cascade;
drop table if exists public.품목 cascade;
drop table if exists public.업체 cascade;

-- 이전 시퀀스 정리
drop sequence if exists mes.global_barcode_seq;

-- 이전 RPC 정리
drop function if exists mes.transition_lot_status(uuid, text, uuid, text);

-- ─── 2) schema-final.sql 테이블 재생성 ──────────────────────

-- sys.users는 DROP하지 않음 (기존 사용자 데이터 보존)

-- core
create table if not exists core.parties (
  id          uuid primary key default gen_random_uuid(),
  party_type  text not null check (party_type in ('CUSTOMER','SUPPLIER','INTERNAL','BOTH')),
  party_name  text not null,
  party_code  text unique,
  initials    text,
  address     text,
  is_active   boolean not null default true,
  created_by  uuid references sys.users(user_id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists core.contacts (
  id           uuid primary key default gen_random_uuid(),
  party_id     uuid not null references core.parties(id) on delete cascade,
  contact_name text not null,
  department   text,
  phone        text,
  email        text,
  work_type    text,
  handled_item text,
  is_primary   boolean not null default false,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- mdm
create table if not exists mdm.products (
  id                   uuid primary key default gen_random_uuid(),
  legacy_product_id    text unique,
  product_code         text unique,
  product_name         text not null,
  vehicle_name         text,
  vehicle_code         text,
  category             text,
  customer_party_id    uuid references core.parties(id) on delete set null,
  ship_to_party_id     uuid references core.parties(id) on delete set null,
  default_process_type text not null default 'ANODIZING'
                         check (default_process_type in ('ANODIZING','BONDING','OTHER_POST')),
  unit_price           numeric(18,2),
  mass_production_qty  integer,
  weekly_production_qty integer,
  is_active            boolean not null default true,
  remarks              text,
  created_by           uuid references sys.users(user_id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists mdm.product_specs (
  product_id           uuid primary key references mdm.products(id) on delete cascade,
  surface_area         numeric(18,4),
  piece_weight         numeric(18,4),
  drawing_no           text,
  rack_load_qty        integer,
  immersion_seconds    integer,
  target_voltage       numeric(18,4),
  target_current_per_pc numeric(18,4),
  spec_upper           numeric(18,4),
  spec_lower           numeric(18,4),
  remarks              text,
  updated_at           timestamptz not null default now()
);

create table if not exists mdm.inspection_spec_master (
  id                uuid primary key default gen_random_uuid(),
  inspection_stage  text not null check (inspection_stage in ('INCOMING','PROCESS','FINAL')),
  process_type_code text,
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
  created_at        timestamptz not null default now()
);

create table if not exists mdm.product_inspection_specs (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references mdm.products(id) on delete cascade,
  spec_id     uuid not null references mdm.inspection_spec_master(id) on delete cascade,
  is_required boolean not null default true,
  sort_order  integer not null default 0,
  unique (product_id, spec_id)
);

create table if not exists mdm.defect_types (
  id                uuid primary key default gen_random_uuid(),
  defect_code       text unique not null,
  defect_name       text not null,
  process_type_code text,
  description       text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

create table if not exists mdm.measurement_tools (
  id                        uuid primary key default gen_random_uuid(),
  tool_code                 text unique not null,
  tool_name                 text not null,
  tool_type                 text,
  serial_no                 text,
  last_calibration_date     date,
  next_calibration_date     date,
  calibration_cycle_months  integer,
  status                    text not null default 'NORMAL'
                              check (status in ('NORMAL','EXPIRED','REPAIR','RETIRED')),
  remarks                   text,
  created_at                timestamptz not null default now()
);

-- mes
create table if not exists mes.delivery_plans (
  id                     uuid primary key default gen_random_uuid(),
  plan_no                text unique not null,
  party_id               uuid references core.parties(id) on delete set null,
  planned_delivery_date  date,
  total_qty              numeric(18,4) not null default 0,
  status                 text not null default 'OPEN'
                           check (status in ('OPEN','IN_PROGRESS','COMPLETED','CLOSED')),
  notes                  text,
  created_by             uuid references sys.users(user_id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table if not exists mes.work_orders (
  id                uuid primary key default gen_random_uuid(),
  work_order_no     text unique not null,
  delivery_plan_id  uuid references mes.delivery_plans(id) on delete set null,
  product_id        uuid not null references mdm.products(id) on delete restrict,
  qty_planned       numeric(18,4) not null default 0,
  qty_completed     numeric(18,4) not null default 0,
  planned_start     date,
  planned_end       date,
  status            text not null default 'RELEASED'
                      check (status in ('RELEASED','IN_PROGRESS','COMPLETED','CANCELLED')),
  created_by        uuid references sys.users(user_id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists mes.lot_master (
  id                  uuid primary key default gen_random_uuid(),
  lot_no              text unique not null,
  work_order_id       uuid references mes.work_orders(id) on delete set null,
  product_id          uuid references mdm.products(id) on delete restrict,
  customer_party_id   uuid references core.parties(id) on delete set null,
  qty_total           numeric(18,4) not null default 0,
  qty_available       numeric(18,4) not null default 0,
  status              text not null default 'INCOMING_INSPECTION_WAIT' check (status in (
                        'RECEIVED','INCOMING_INSPECTION_WAIT','INCOMING_OK','INCOMING_NG',
                        'READY_FOR_PROCESS','IN_PROCESS','PROCESS_DONE',
                        'PROCESS_INSPECTION_WAIT','FINAL_INSPECTION_WAIT',
                        'FINAL_OK','HOLD','SHIPPED','CLOSED')),
  inbound_date        date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists mes.lot_barcodes (
  id             uuid primary key default gen_random_uuid(),
  lot_id         uuid not null references mes.lot_master(id) on delete cascade,
  barcode_value  text unique not null,
  barcode_type   text not null default 'INTERNAL'
                   check (barcode_type in ('INTERNAL','CUSTOMER')),
  created_at     timestamptz not null default now()
);

create table if not exists mes.inbound_receipts (
  id             uuid primary key default gen_random_uuid(),
  lot_id         uuid not null references mes.lot_master(id) on delete cascade,
  work_order_id  uuid references mes.work_orders(id) on delete set null,
  received_qty   numeric(18,4) not null,
  received_by    uuid references sys.users(user_id) on delete set null,
  received_date  date not null,
  created_at     timestamptz not null default now()
);

create table if not exists mes.process_runs (
  id            uuid primary key default gen_random_uuid(),
  lot_id        uuid not null references mes.lot_master(id) on delete cascade,
  process_type  text not null,
  operator_id   uuid references sys.users(user_id) on delete set null,
  started_at    timestamptz,
  completed_at  timestamptz,
  status        text not null default 'COMPLETED'
                  check (status in ('RUNNING','COMPLETED','CANCELLED')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists mes.process_parameters (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references mes.process_runs(id) on delete cascade,
  param_name   text not null,
  param_value  numeric(18,4),
  created_at   timestamptz not null default now()
);

create table if not exists mes.lot_events (
  id           uuid primary key default gen_random_uuid(),
  lot_id       uuid not null references mes.lot_master(id) on delete cascade,
  event_type   text not null,
  from_status  text,
  to_status    text,
  actor_id     uuid references sys.users(user_id) on delete set null,
  note         text,
  created_at   timestamptz not null default now()
);

create table if not exists mes.shipments (
  id                  uuid primary key default gen_random_uuid(),
  lot_id              uuid not null references mes.lot_master(id) on delete restrict,
  product_id          uuid references mdm.products(id) on delete set null,
  customer_party_id   uuid references core.parties(id) on delete set null,
  shipped_qty         numeric(18,4) not null,
  shipment_date       date,
  notes               text,
  created_by          uuid references sys.users(user_id) on delete set null,
  created_at          timestamptz not null default now()
);

-- qms
create table if not exists qms.inspections (
  id               uuid primary key default gen_random_uuid(),
  lot_id           uuid not null references mes.lot_master(id) on delete cascade,
  inspection_type  text not null check (inspection_type in ('INCOMING','PROCESS','FINAL')),
  inspector_id     uuid references sys.users(user_id) on delete set null,
  overall_result   text check (overall_result in ('OK','NG','CONDITIONAL_OK')),
  notes            text,
  created_at       timestamptz not null default now()
);

create table if not exists qms.inspection_results (
  id             uuid primary key default gen_random_uuid(),
  inspection_id  uuid not null references qms.inspections(id) on delete cascade,
  check_item     text not null,
  measured_value text,
  result         text check (result in ('OK','NG')),
  created_at     timestamptz not null default now()
);

-- dms
create table if not exists dms.attachments (
  id           uuid primary key default gen_random_uuid(),
  bucket_name  text not null,
  object_path  text not null,
  ref_table    text,
  ref_id       uuid,
  file_name    text,
  mime_type    text,
  uploaded_by  uuid references sys.users(user_id) on delete set null,
  uploaded_at  timestamptz not null default now()
);

-- ─── 3) 인덱스 ──────────────────────────────────────────────
create index if not exists idx_parties_type          on core.parties(party_type);
create index if not exists idx_contacts_party        on core.contacts(party_id);
create index if not exists idx_products_customer     on mdm.products(customer_party_id);
create index if not exists idx_products_active       on mdm.products(is_active);
create index if not exists idx_insp_spec_stage       on mdm.inspection_spec_master(inspection_stage);
create index if not exists idx_prod_insp_product     on mdm.product_inspection_specs(product_id);
create index if not exists idx_delivery_plans_status on mes.delivery_plans(status);
create index if not exists idx_delivery_plans_party  on mes.delivery_plans(party_id);
create index if not exists idx_work_orders_product   on mes.work_orders(product_id);
create index if not exists idx_work_orders_plan      on mes.work_orders(delivery_plan_id);
create index if not exists idx_work_orders_status    on mes.work_orders(status);
create index if not exists idx_lot_master_status     on mes.lot_master(status);
create index if not exists idx_lot_master_product    on mes.lot_master(product_id);
create index if not exists idx_lot_master_workorder  on mes.lot_master(work_order_id);
create index if not exists idx_lot_barcodes_lot      on mes.lot_barcodes(lot_id);
create index if not exists idx_lot_barcodes_val      on mes.lot_barcodes(barcode_value);
create index if not exists idx_lot_events_lot        on mes.lot_events(lot_id);
create index if not exists idx_process_runs_lot      on mes.process_runs(lot_id);
create index if not exists idx_shipments_lot         on mes.shipments(lot_id);
create index if not exists idx_inspections_lot       on qms.inspections(lot_id);

-- ─── 4) RPC — lot 상태 전이 ─────────────────────────────────
create or replace function mes.transition_lot_status(
  p_lot_id    uuid,
  p_new_status text,
  p_actor_id  uuid default null,
  p_notes     text default null
) returns void language plpgsql security definer as $$
begin
  update mes.lot_master
     set status     = p_new_status,
         updated_at = now()
   where id = p_lot_id;
  insert into mes.lot_events (lot_id, event_type, to_status, actor_id, note)
  values (p_lot_id, 'STATUS_CHANGE', p_new_status, p_actor_id, p_notes);
end;
$$;

-- ─── 5) RLS — 전체 허용 (내부 전용 앱) ─────────────────────
do $$ declare
  t record;
begin
  for t in
    select schemaname, tablename
      from pg_tables
     where schemaname in ('core','mdm','mes','qms','sys','dms')
  loop
    execute format('alter table %I.%I enable row level security', t.schemaname, t.tablename);
    execute format(
      'drop policy if exists "allow_all_%s_%s" on %I.%I',
      t.schemaname, t.tablename, t.schemaname, t.tablename
    );
    execute format(
      'create policy "allow_all_%s_%s" on %I.%I for all to anon, authenticated using (true) with check (true)',
      t.schemaname, t.tablename, t.schemaname, t.tablename
    );
  end loop;
end $$;

-- ─── 6) GRANT — PostgREST 권한 ─────────────────────────────
grant usage on schema sys, core, mdm, mes, qms, dms to anon, authenticated;
grant select, insert, update, delete on all tables in schema sys  to anon, authenticated;
grant select, insert, update, delete on all tables in schema core to anon, authenticated;
grant select, insert, update, delete on all tables in schema mdm  to anon, authenticated;
grant select, insert, update, delete on all tables in schema mes  to anon, authenticated;
grant select, insert, update, delete on all tables in schema qms  to anon, authenticated;
grant select, insert, update, delete on all tables in schema dms  to anon, authenticated;
grant execute on all functions in schema mes to anon, authenticated;
alter default privileges in schema sys  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema core grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema mdm  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema mes  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema qms  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema dms  grant select, insert, update, delete on tables to anon, authenticated;

-- ─── 7) PostgREST 스키마 캐시 리로드 ───────────────────────
notify pgrst, 'reload schema';

-- ✅ 완료 — work_orders 테이블이 id PK로 재생성됨
