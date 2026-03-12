-- ============================================================
-- 패치 SQL — Supabase SQL Editor에서 실행
-- 1) 작업지시서에 순번(작업번호) 컬럼 추가
-- 2) 바코드 테이블 생성
-- ============================================================

-- ① 작업지시서 작업번호 컬럼 추가 (없는 경우에만)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = '작업지시서' AND column_name = '작업번호'
  ) THEN
    ALTER TABLE 작업지시서 ADD COLUMN 작업번호 SERIAL;
  END IF;
END $$;

-- ② 바코드 테이블
CREATE TABLE IF NOT EXISTS 바코드 (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  순번        INTEGER     NOT NULL,
  품목id      TEXT        REFERENCES 품목(품목id) ON DELETE SET NULL,
  고객id      TEXT        REFERENCES 업체(고객id) ON DELETE SET NULL,
  lot_no      TEXT,
  lot수량     INTEGER     NOT NULL DEFAULT 0,
  차종        TEXT,
  입고일      DATE        NOT NULL DEFAULT CURRENT_DATE,
  바코드      TEXT        UNIQUE,
  공정상태    TEXT        NOT NULL DEFAULT '입고대기'
                          CHECK (공정상태 IN ('입고대기','아노다이징등록','아노다이징완료','본딩등록','본딩완료','출고')),
  메모        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_바코드_고객id   ON 바코드(고객id);
CREATE INDEX IF NOT EXISTS idx_바코드_품목id   ON 바코드(품목id);
CREATE INDEX IF NOT EXISTS idx_바코드_공정상태  ON 바코드(공정상태);
CREATE INDEX IF NOT EXISTS idx_바코드_바코드값  ON 바코드(바코드);

-- RLS
ALTER TABLE 바코드 ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "바코드 all" ON 바코드
    FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE 바코드;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
