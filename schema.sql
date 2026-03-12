-- ============================================================
-- 아노다이징 생산관리 시스템 - 전체 스키마
-- Supabase SQL Editor에서 실행 (기존 테이블 있으면 DROP 후 재생성)
-- ============================================================

-- ① 업체 (고객 / 협력사 마스터)
CREATE TABLE IF NOT EXISTS 업체 (
  고객ID     TEXT PRIMARY KEY,          -- 기존 C-1, C-2 형식 유지
  구분       TEXT NOT NULL DEFAULT '고객', -- '고객' | '협력사' | '고객,협력사'
  업체명     TEXT NOT NULL,
  이니셜     TEXT,
  업체코드   TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ② 품목 (제품 마스터)
CREATE TABLE IF NOT EXISTS 품목 (
  품목ID     TEXT PRIMARY KEY,          -- 기존 P-1, P-2 형식 유지
  고객ID     TEXT REFERENCES 업체(고객ID) ON DELETE SET NULL,
  납품고객ID TEXT REFERENCES 업체(고객ID) ON DELETE SET NULL,
  품명       TEXT NOT NULL,
  품번       TEXT,
  차종       TEXT,
  공정       TEXT NOT NULL DEFAULT '연질', -- '연질' | '경질' | '본딩'
  장입량     INTEGER,
  단가       INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ③ 판매계획 (고객사 납품 요청)
CREATE TABLE IF NOT EXISTS 판매계획 (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  고객ID       TEXT REFERENCES 업체(고객ID) ON DELETE SET NULL,
  품목ID       TEXT REFERENCES 품목(품목ID) ON DELETE SET NULL,
  납품요청일   DATE NOT NULL,
  입고예정수량 INTEGER NOT NULL CHECK (입고예정수량 > 0),
  긴급여부     BOOLEAN NOT NULL DEFAULT FALSE,
  메모         TEXT,
  상태         TEXT NOT NULL DEFAULT '대기', -- '대기' | '진행중' | '완료'
  등록일       TIMESTAMPTZ DEFAULT NOW()
);

-- ④ 재고 (품목별 현재 재고 — 수동 조정 가능, 작업지시 완료 시 자동 증가)
CREATE TABLE IF NOT EXISTS 재고 (
  품목ID     TEXT PRIMARY KEY REFERENCES 품목(품목ID) ON DELETE CASCADE,
  현재재고   INTEGER NOT NULL DEFAULT 0 CHECK (현재재고 >= 0),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ⑤ 작업지시서
CREATE TABLE IF NOT EXISTS 작업지시서 (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  판매계획ID   UUID REFERENCES 판매계획(id) ON DELETE SET NULL,
  고객ID       TEXT REFERENCES 업체(고객ID) ON DELETE SET NULL,
  품목ID       TEXT REFERENCES 품목(품목ID) ON DELETE SET NULL,
  공정구분     TEXT NOT NULL,           -- '연질' | '경질' | '본딩'
  우선순위     TEXT NOT NULL DEFAULT '보통', -- '긴급' | '보통' | '낮음'
  로트수량     INTEGER NOT NULL CHECK (로트수량 > 0),
  납기예정일   DATE NOT NULL,
  상태         TEXT NOT NULL DEFAULT '대기', -- '대기' | '진행중' | '완료'
  완료일       DATE,
  메모         TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 인덱스 ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_품목_고객ID      ON 품목 (고객ID);
CREATE INDEX IF NOT EXISTS idx_판매계획_고객ID   ON 판매계획 (고객ID);
CREATE INDEX IF NOT EXISTS idx_판매계획_품목ID   ON 판매계획 (품목ID);
CREATE INDEX IF NOT EXISTS idx_판매계획_납품요청일 ON 판매계획 (납품요청일);
CREATE INDEX IF NOT EXISTS idx_작업지시서_품목ID  ON 작업지시서 (품목ID);
CREATE INDEX IF NOT EXISTS idx_작업지시서_상태    ON 작업지시서 (상태);

-- ─── RLS (anon 키로 전체 허용 — 내부 전용 앱) ──────────────
ALTER TABLE 업체       ENABLE ROW LEVEL SECURITY;
ALTER TABLE 품목       ENABLE ROW LEVEL SECURITY;
ALTER TABLE 판매계획   ENABLE ROW LEVEL SECURITY;
ALTER TABLE 재고       ENABLE ROW LEVEL SECURITY;
ALTER TABLE 작업지시서 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "all_업체"       ON 업체;
DROP POLICY IF EXISTS "all_품목"       ON 품목;
DROP POLICY IF EXISTS "all_판매계획"   ON 판매계획;
DROP POLICY IF EXISTS "all_재고"       ON 재고;
DROP POLICY IF EXISTS "all_작업지시서" ON 작업지시서;

CREATE POLICY "all_업체"       ON 업체       FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_품목"       ON 품목       FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_판매계획"   ON 판매계획   FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_재고"       ON 재고       FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_작업지시서" ON 작업지시서 FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ─── Realtime ──────────────────────────────────────────────
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE 판매계획;   EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE 작업지시서; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE 재고;       EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 샘플 마스터 데이터 (기존 데이터 마이그레이션 호환) ────
INSERT INTO 업체 (고객ID, 구분, 업체명, 이니셜, 업체코드) VALUES
  ('C-1',  '고객',       '일진 하이솔루스', 'IJ', '0910'),
  ('C-2',  '고객',       '진성정밀',        'JS', '1019'),
  ('C-3',  '고객',       '진합',            'JH', '1008'),
  ('C-14', '고객,협력사','네오테크',        'NT', '1420')
ON CONFLICT (고객ID) DO NOTHING;

INSERT INTO 품목 (품목ID, 고객ID, 납품고객ID, 품명, 품번, 차종, 공정, 장입량, 단가) VALUES
  ('P-1',  'C-2', 'C-2', 'M300',              '02014-36830', 'BD', '연질', 800,  190),
  ('P-2',  'C-1', 'C-1', 'NOZZLE 805NN',      '35820-LM001', 'LM', '본딩', NULL, 2500),
  ('P-3',  'C-1', 'C-1', 'NOZZLE 805NS',      '35820-LM002', 'LM', '본딩', NULL, 2500),
  ('P-26', 'C-3', 'C-3', 'NOZZLE 805J BLIND', NULL,          'FE', '연질', 72,   4500),
  ('P-27', 'C-3', 'C-3', 'NOZZLE 805J FE',    NULL,          'FE', '연질', 72,   4500)
ON CONFLICT (품목ID) DO NOTHING;

INSERT INTO 재고 (품목ID, 현재재고) VALUES
  ('P-1',  0),
  ('P-2',  0),
  ('P-3',  0),
  ('P-26', 0),
  ('P-27', 0)
ON CONFLICT (품목ID) DO NOTHING;
