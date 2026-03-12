-- ============================================================
-- 아노다이징 생산관리 시스템 V2 - 스키마 업그레이드
-- 요구사항:
--   1. 작업지시 → 재고 자동 연동 (출고완료 시 재고차감)
--   2. 작업지시서 → 재고/바코드 자동 생성 (인터록)
--   3. 작업지시서 상태 바코드 기반 자동 전이 + 검사항목 마스터 기반
--   4. 바코드 테이블 검색/필터/추적성 강화
--   5. 사원 로그인 시스템
-- ============================================================

-- ─── ① 사원 테이블 (로그인/검사자 자동 기입) ────────────────
CREATE TABLE IF NOT EXISTS 사원 (
  사원id      TEXT PRIMARY KEY,
  사원명      TEXT NOT NULL,
  부서        TEXT,
  직위        TEXT,
  연락처      TEXT,
  이메일      TEXT,
  비밀번호    TEXT NOT NULL,   -- bcrypt 해시
  역할        TEXT NOT NULL DEFAULT '작업자',  -- '관리자' | '검사자' | '작업자'
  활성        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE 사원 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "all_사원" ON 사원;
CREATE POLICY "all_사원" ON 사원 FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ─── ② 품목 검사항목 마스터 테이블 ──────────────────────────
-- 품목별 + 검사공정별 검사항목을 정의
-- 시료수(x1~x30), 스펙 상한/하한, 공차유형 등
CREATE TABLE IF NOT EXISTS 검사항목마스터 (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  품목id        TEXT NOT NULL REFERENCES 품목(품목id) ON DELETE CASCADE,
  검사공정      TEXT NOT NULL,  -- '수입검사' | '공정진행' | '출하검사'
  항목명        TEXT NOT NULL,  -- 예: '피막두께', '외관', '경도' 등
  검사유형      TEXT NOT NULL DEFAULT '계량형' CHECK (검사유형 IN ('계량형', '계수형', '합부')),
  계측기        TEXT,           -- 예: 'Elcometer', '육안' 등
  시료수        INTEGER NOT NULL DEFAULT 1 CHECK (시료수 >= 1 AND 시료수 <= 30),
  공차유형      TEXT NOT NULL DEFAULT '양측',  -- '양측' | '단일하한' | '단일상한'
  스펙하한      NUMERIC,       -- 양측공차: 하한값, 단일하한: 최소값
  스펙상한      NUMERIC,       -- 양측공차: 상한값, 단일상한: NULL
  단위          TEXT,           -- 'μm', 'mm', 'A', '℃' 등
  정렬순서      INTEGER NOT NULL DEFAULT 0,
  활성          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(품목id, 검사공정, 항목명)
);

CREATE INDEX IF NOT EXISTS idx_검사항목마스터_품목 ON 검사항목마스터(품목id);
CREATE INDEX IF NOT EXISTS idx_검사항목마스터_공정 ON 검사항목마스터(검사공정);

ALTER TABLE 검사항목마스터 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "all_검사항목마스터" ON 검사항목마스터;
CREATE POLICY "all_검사항목마스터" ON 검사항목마스터 FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ─── ③ 재고 트랜잭션 원장 ───────────────────────────────────
-- 재고 변동을 이벤트 기반으로 기록. 재고 테이블은 이 원장에서 계산.
CREATE TABLE IF NOT EXISTS 재고원장 (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  품목id      TEXT NOT NULL REFERENCES 품목(품목id) ON DELETE CASCADE,
  변동유형    TEXT NOT NULL,  -- '입고' | '출고' | '조정'
  변동수량    INTEGER NOT NULL,  -- 양수=증가, 음수=감소
  참조id      TEXT,            -- 바코드id 또는 작업지시서id
  참조유형    TEXT,            -- '작업지시서' | '바코드' | '수동조정'
  사유        TEXT,
  작업자id    TEXT REFERENCES 사원(사원id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_재고원장_품목 ON 재고원장(품목id);
CREATE INDEX IF NOT EXISTS idx_재고원장_유형 ON 재고원장(변동유형);
CREATE INDEX IF NOT EXISTS idx_재고원장_참조 ON 재고원장(참조id);

ALTER TABLE 재고원장 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "all_재고원장" ON 재고원장;
CREATE POLICY "all_재고원장" ON 재고원장 FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ─── ④ 검사결과 테이블 ─────────────────────────────────────
-- 바코드별 + 검사공정별 검사 기록
CREATE TABLE IF NOT EXISTS 검사결과 (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  바코드id      TEXT NOT NULL REFERENCES 바코드(id) ON DELETE CASCADE,
  검사항목id    UUID NOT NULL REFERENCES 검사항목마스터(id) ON DELETE CASCADE,
  검사공정      TEXT NOT NULL,
  시료번호      INTEGER NOT NULL DEFAULT 1,
  측정값        TEXT,           -- 숫자/문자 모두 허용 (합격/불합격, 수치 등)
  판정          BOOLEAN,        -- true=합격, false=불합격
  검사자id      TEXT REFERENCES 사원(사원id) ON DELETE SET NULL,
  검사일시      TIMESTAMPTZ DEFAULT NOW(),
  비고          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_검사결과_바코드 ON 검사결과(바코드id);
CREATE INDEX IF NOT EXISTS idx_검사결과_항목 ON 검사결과(검사항목id);
CREATE INDEX IF NOT EXISTS idx_검사결과_공정 ON 검사결과(검사공정);

ALTER TABLE 검사결과 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "all_검사결과" ON 검사결과;
CREATE POLICY "all_검사결과" ON 검사결과 FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ─── ⑤ 작업지시서 확장: 바코드 FK 추가 ────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = '작업지시서' AND column_name = '바코드id'
  ) THEN
    ALTER TABLE 작업지시서 ADD COLUMN 바코드id TEXT REFERENCES 바코드(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── ⑥ 바코드 테이블 확장: 작업지시서id FK 추가 ────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = '바코드' AND column_name = '작업지시서id'
  ) THEN
    ALTER TABLE 바코드 ADD COLUMN 작업지시서id UUID REFERENCES 작업지시서(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_바코드_작업지시서 ON 바코드(작업지시서id);

-- ─── ⑦ 공정상태 CHECK 제약조건 변경 ────────────────────────
-- 기존: '입고대기','아노다이징등록','아노다이징완료','본딩등록','본딩완료','출고'
-- 신규: '입고대기','수입검사','공정진행','출하검사','출고완료'
-- 공정검사 탭 삭제
DO $$ BEGIN
  ALTER TABLE 바코드 DROP CONSTRAINT IF EXISTS 바코드_공정상태_check;
  ALTER TABLE 바코드 ADD CONSTRAINT 바코드_공정상태_check 
    CHECK (공정상태 IN ('입고대기','수입검사','공정진행','출하검사','출고완료'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─── ⑧ Realtime 추가 ──────────────────────────────────────
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE 사원; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE 검사항목마스터; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE 재고원장; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE 검사결과; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── ⑨ RPC: 작업지시서 생성 + 재고입고 + 바코드 자동 생성 ──
-- 작업지시서 생성 시 자동으로:
--   1. 작업지시서 insert
--   2. 바코드 insert (입고대기 상태)
--   3. 재고 자동 등록 (미등록일 경우)
--   4. 재고원장에 입고 기록
--   5. 재고 테이블 업데이트
CREATE OR REPLACE FUNCTION rpc_create_workorder_with_lot(
  p_판매계획id UUID DEFAULT NULL,
  p_고객id TEXT DEFAULT NULL,
  p_품목id TEXT DEFAULT NULL,
  p_공정구분 TEXT DEFAULT '연질',
  p_우선순위 TEXT DEFAULT '보통',
  p_로트수량 INTEGER DEFAULT 0,
  p_납기예정일 DATE DEFAULT CURRENT_DATE,
  p_메모 TEXT DEFAULT NULL,
  p_차종 TEXT DEFAULT NULL,
  p_바코드값 TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_wo_id UUID;
  v_bc_id TEXT;
  v_seq INTEGER;
  v_cur_qty INTEGER;
BEGIN
  -- 1. 작업지시서 생성
  INSERT INTO 작업지시서 (판매계획id, 고객id, 품목id, 공정구분, 우선순위, 로트수량, 납기예정일, 메모, 상태)
  VALUES (p_판매계획id, p_고객id, p_품목id, p_공정구분, p_우선순위, p_로트수량, p_납기예정일, p_메모, '대기')
  RETURNING id INTO v_wo_id;

  -- 2. 순번 계산
  SELECT COALESCE(MAX(순번), 0) + 1 INTO v_seq FROM 바코드;

  -- 3. 바코드 생성
  v_bc_id := gen_random_uuid()::text;
  INSERT INTO 바코드 (id, 순번, 품목id, 고객id, lot수량, 차종, 입고일, 바코드, 공정상태, 메모, 작업지시서id)
  VALUES (v_bc_id, v_seq, p_품목id, p_고객id, p_로트수량, p_차종, CURRENT_DATE, p_바코드값, '입고대기', p_메모, v_wo_id);

  -- 4. 작업지시서에 바코드id 연결
  UPDATE 작업지시서 SET 바코드id = v_bc_id WHERE id = v_wo_id;

  -- 5. 재고 자동 등록 (미등록 품목이면 자동 생성)
  INSERT INTO 재고 (품목id, 현재재고) VALUES (p_품목id, 0) ON CONFLICT (품목id) DO NOTHING;

  -- 6. 재고원장 기록 (입고 예정)
  INSERT INTO 재고원장 (품목id, 변동유형, 변동수량, 참조id, 참조유형, 사유)
  VALUES (p_품목id, '입고', p_로트수량, v_wo_id::text, '작업지시서', '작업지시서 생성에 의한 입고');

  -- 7. 재고 업데이트
  UPDATE 재고 SET 현재재고 = 현재재고 + p_로트수량, updated_at = NOW() WHERE 품목id = p_품목id;

  RETURN jsonb_build_object(
    'work_order_id', v_wo_id,
    'barcode_id', v_bc_id,
    'barcode', p_바코드값,
    'seq', v_seq
  );
END;
$$ LANGUAGE plpgsql;

-- ─── ⑩ RPC: 공정 상태 전이 (바코드 스캔 기반) ──────────────
-- 바코드 공정상태 변경 시 자동으로:
--   1. 공정상태 전이
--   2. 타임스탬프 기록
--   3. 연관 작업지시서 상태 동기화
--   4. 출고완료 시 재고 차감
CREATE OR REPLACE FUNCTION rpc_advance_process(
  p_바코드id TEXT,
  p_현재상태 TEXT,
  p_작업자id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_next TEXT;
  v_품목id TEXT;
  v_수량 INTEGER;
  v_wo_id UUID;
  v_ts_col TEXT;
BEGIN
  -- 상태 전이 맵
  v_next := CASE p_현재상태
    WHEN '입고대기' THEN '수입검사'
    WHEN '수입검사' THEN '공정진행'
    WHEN '공정진행' THEN '출하검사'
    WHEN '출하검사' THEN '출고완료'
    ELSE NULL
  END;

  IF v_next IS NULL THEN
    RETURN jsonb_build_object('error', '더 이상 전이할 수 없는 상태입니다: ' || p_현재상태);
  END IF;

  -- 바코드 정보 조회
  SELECT 품목id, lot수량, 작업지시서id INTO v_품목id, v_수량, v_wo_id
  FROM 바코드 WHERE id = p_바코드id;

  IF v_품목id IS NULL THEN
    RETURN jsonb_build_object('error', '바코드를 찾을 수 없습니다.');
  END IF;

  -- 타임스탬프 컬럼 결정
  v_ts_col := CASE v_next
    WHEN '수입검사' THEN '수입검사일시'
    WHEN '공정진행' THEN '공정진행일시'
    WHEN '출하검사' THEN '출하검사일시'
    WHEN '출고완료' THEN '출고완료일시'
    ELSE NULL
  END;

  -- 공정상태 업데이트
  EXECUTE format('UPDATE 바코드 SET 공정상태 = %L, %I = NOW() WHERE id = %L', v_next, v_ts_col, p_바코드id);

  -- 작업지시서 상태 동기화
  IF v_wo_id IS NOT NULL THEN
    UPDATE 작업지시서 SET
      상태 = CASE v_next
        WHEN '수입검사' THEN '진행중'
        WHEN '공정진행' THEN '진행중'
        WHEN '출하검사' THEN '진행중'
        WHEN '출고완료' THEN '완료'
        ELSE 상태
      END,
      완료일 = CASE WHEN v_next = '출고완료' THEN CURRENT_DATE ELSE 완료일 END
    WHERE id = v_wo_id;
  END IF;

  -- 출고완료 시 재고 차감
  IF v_next = '출고완료' AND v_품목id IS NOT NULL THEN
    -- 재고원장에 출고 기록
    INSERT INTO 재고원장 (품목id, 변동유형, 변동수량, 참조id, 참조유형, 사유, 작업자id)
    VALUES (v_품목id, '출고', -v_수량, p_바코드id, '바코드', '출고완료에 의한 재고 차감', p_작업자id);

    -- 재고 업데이트
    UPDATE 재고 SET 현재재고 = GREATEST(현재재고 - v_수량, 0), updated_at = NOW() WHERE 품목id = v_품목id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'next_status', v_next,
    'barcode_id', p_바코드id
  );
END;
$$ LANGUAGE plpgsql;

-- ─── ⑪ 바코드 상태로부터 작업지시서 상태 동기화 뷰 ─────────
-- 작업지시서의 상태를 바코드 공정상태에서 유도
CREATE OR REPLACE FUNCTION get_workorder_status_from_barcode(p_wo_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT 공정상태 INTO v_status FROM 바코드 WHERE 작업지시서id = p_wo_id LIMIT 1;
  IF v_status IS NULL THEN RETURN '대기'; END IF;
  RETURN CASE v_status
    WHEN '입고대기' THEN '대기'
    WHEN '수입검사' THEN '진행중'
    WHEN '공정진행' THEN '진행중'
    WHEN '출하검사' THEN '진행중'
    WHEN '출고완료' THEN '완료'
    ELSE '대기'
  END;
END;
$$ LANGUAGE plpgsql;
