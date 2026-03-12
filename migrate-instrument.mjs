import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-0-ap-northeast-2.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.ylyjkwqopvmaybtjydya',
  password: '@A134811b2024',
  ssl: { rejectUnauthorized: false }
});
await c.connect();
console.log('Connected');

// 1. 양부→합부 변경
await c.query(`
  ALTER TABLE 검사항목마스터 DROP CONSTRAINT IF EXISTS 검사항목마스터_검사유형_check;
  ALTER TABLE 검사항목마스터 ADD CONSTRAINT 검사항목마스터_검사유형_check
    CHECK (검사유형 IN ('수치', '합부', '텍스트'));
  UPDATE 검사항목마스터 SET 검사유형 = '합부' WHERE 검사유형 = '양부';
`);
console.log('양부→합부 변경 완료');

// 2. 계측기관리 테이블 생성
await c.query(`
  CREATE TABLE IF NOT EXISTS 계측기관리 (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    계측기명    TEXT NOT NULL UNIQUE,
    관리번호    TEXT,
    교정주기    TEXT,
    최종교정일  DATE,
    차기교정일  DATE,
    상태        TEXT NOT NULL DEFAULT '사용중' CHECK (상태 IN ('사용중', '교정중', '폐기')),
    비고        TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );
  ALTER TABLE 계측기관리 ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "all_계측기관리" ON 계측기관리;
  CREATE POLICY "all_계측기관리" ON 계측기관리 FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
`);
console.log('계측기관리 테이블 생성 완료');

// 3. 기본 계측기 등록
await c.query(`
  INSERT INTO 계측기관리 (계측기명) VALUES
    ('막두께측정기'),
    ('경도계'),
    ('버니어캘리퍼스'),
    ('마이크로미터'),
    ('표면조도계'),
    ('절연저항계'),
    ('온도계'),
    ('pH미터')
  ON CONFLICT (계측기명) DO NOTHING;
`);
console.log('기본 계측기 등록 완료');

// Realtime
await c.query(`
  DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE 계측기관리; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`);

const r = await c.query('SELECT 계측기명, 상태 FROM 계측기관리 ORDER BY 계측기명');
console.log('계측기 목록:', r.rows.map(x => x.계측기명).join(', '));

await c.end();
