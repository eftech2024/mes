-- ============================================================
-- 출하 및 거래명세서 스키마
-- Supabase SQL Editor에서 실행
-- ============================================================

-- ① 거래명세서 (고객사별 그룹핑)
CREATE TABLE IF NOT EXISTS 거래명세서 (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  거래명세서번호 TEXT NOT NULL UNIQUE,   -- 자동 생성: INV-YYYYMMDD-NNN
  고객id       TEXT NOT NULL REFERENCES 업체(고객id) ON DELETE CASCADE,
  출하일       DATE NOT NULL DEFAULT CURRENT_DATE,
  총수량       INTEGER NOT NULL DEFAULT 0,
  총금액       NUMERIC NOT NULL DEFAULT 0,
  비고         TEXT,
  작성자id     TEXT REFERENCES 사원(사원id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_거래명세서_고객 ON 거래명세서(고객id);
CREATE INDEX IF NOT EXISTS idx_거래명세서_출하일 ON 거래명세서(출하일);
CREATE INDEX IF NOT EXISTS idx_거래명세서_번호 ON 거래명세서(거래명세서번호);

ALTER TABLE 거래명세서 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "all_거래명세서" ON 거래명세서;
CREATE POLICY "all_거래명세서" ON 거래명세서 FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ② 출하이력 (거래명세서 라인 — LOT 단위)
CREATE TABLE IF NOT EXISTS 출하이력 (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  거래명세서id   UUID REFERENCES 거래명세서(id) ON DELETE CASCADE,
  바코드id       TEXT NOT NULL REFERENCES 바코드(id) ON DELETE CASCADE,
  품목id         TEXT REFERENCES 품목(품목id) ON DELETE SET NULL,
  고객id         TEXT REFERENCES 업체(고객id) ON DELETE SET NULL,
  출고수량       INTEGER NOT NULL CHECK (출고수량 > 0),
  단가           NUMERIC,
  공급가액       NUMERIC,
  출하일         DATE NOT NULL DEFAULT CURRENT_DATE,
  비고           TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_출하이력_거래명세서 ON 출하이력(거래명세서id);
CREATE INDEX IF NOT EXISTS idx_출하이력_바코드 ON 출하이력(바코드id);
CREATE INDEX IF NOT EXISTS idx_출하이력_출하일 ON 출하이력(출하일);
CREATE INDEX IF NOT EXISTS idx_출하이력_고객 ON 출하이력(고객id);

ALTER TABLE 출하이력 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "all_출하이력" ON 출하이력;
CREATE POLICY "all_출하이력" ON 출하이력 FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ③ Realtime
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE 거래명세서; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE 출하이력; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
