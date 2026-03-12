-- ============================================================
-- schema-patch-columns.sql
-- 앱 코드와 DB 스키마 컬럼 불일치 수정
-- Supabase SQL Editor 또는 node run 으로 실행
-- ============================================================

-- ─── 1) mdm.products — annual_qty, monthly_qty 컬럼 추가 ────
ALTER TABLE mdm.products ADD COLUMN IF NOT EXISTS annual_qty integer;
ALTER TABLE mdm.products ADD COLUMN IF NOT EXISTS monthly_qty integer;

-- ─── 2) mes.delivery_plans — product_id 컬럼 추가 ──────────
ALTER TABLE mes.delivery_plans ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES mdm.products(id) ON DELETE SET NULL;

-- ─── 3) mes.lot_barcodes — is_primary 컬럼 추가 ────────────
ALTER TABLE mes.lot_barcodes ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

-- ─── 4) mes.shipments — 컬럼 추가/수정 ─────────────────────
-- 코드에서 shipped_by, shipped_date, party_id 사용
ALTER TABLE mes.shipments ADD COLUMN IF NOT EXISTS shipped_by uuid REFERENCES sys.users(user_id) ON DELETE SET NULL;
ALTER TABLE mes.shipments ADD COLUMN IF NOT EXISTS shipped_date date;

-- party_id 컬럼 없으면 추가 (코드에서 party_id로 참조)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'mes' AND table_name = 'shipments' AND column_name = 'party_id'
  ) THEN
    ALTER TABLE mes.shipments ADD COLUMN party_id uuid REFERENCES core.parties(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── 5) mes.lot_master status CHECK — AVAILABLE 추가 ───────
-- 기존 CHECK 제약조건을 DROP 후 재생성 (AVAILABLE 추가)
DO $$ BEGIN
  ALTER TABLE mes.lot_master DROP CONSTRAINT IF EXISTS lot_master_status_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE mes.lot_master ADD CONSTRAINT lot_master_status_check
  CHECK (status IN (
    'RECEIVED','INCOMING_INSPECTION_WAIT','INCOMING_OK','INCOMING_NG',
    'READY_FOR_PROCESS','IN_PROCESS','PROCESS_DONE',
    'PROCESS_INSPECTION_WAIT','FINAL_INSPECTION_WAIT',
    'FINAL_OK','HOLD','SHIPPED','CLOSED',
    'AVAILABLE'
  ));

-- ─── 6) 레거시 한글 테이블 정리 ────────────────────────────
-- 이전 public 스키마 레거시 테이블 삭제
DROP TABLE IF EXISTS public.검사항목마스터 CASCADE;
DROP TABLE IF EXISTS public.바코드 CASCADE;
DROP TABLE IF EXISTS public.작업지시서 CASCADE;
DROP TABLE IF EXISTS public.판매계획 CASCADE;
DROP TABLE IF EXISTS public.재고 CASCADE;
DROP TABLE IF EXISTS public.사원 CASCADE;
DROP TABLE IF EXISTS public.품목 CASCADE;
DROP TABLE IF EXISTS public.업체 CASCADE;

-- 레거시 시퀀스 정리
DROP SEQUENCE IF EXISTS mes.global_barcode_seq;

-- ─── 7) 인덱스 추가 ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_delivery_plans_product ON mes.delivery_plans(product_id);
CREATE INDEX IF NOT EXISTS idx_lot_barcodes_primary   ON mes.lot_barcodes(is_primary) WHERE is_primary = true;

-- ─── 8) PostgREST 캐시 리로드 ──────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ✅ 완료
