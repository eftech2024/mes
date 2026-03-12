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

// 1. 검사항목정의 마스터 테이블 생성
await c.query(`
  CREATE TABLE IF NOT EXISTS 검사항목정의 (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    항목명        TEXT NOT NULL UNIQUE,
    검사유형      TEXT NOT NULL DEFAULT '계량형' CHECK (검사유형 IN ('계량형', '계수형', '합부')),
    단위          TEXT,
    소수점자리    INTEGER NOT NULL DEFAULT 0,
    기본시료수    INTEGER NOT NULL DEFAULT 1 CHECK (기본시료수 >= 1 AND 기본시료수 <= 30),
    기본공차유형  TEXT NOT NULL DEFAULT '양측',
    기본스펙하한  NUMERIC,
    기본스펙상한  NUMERIC,
    기본계측기    TEXT,
    사용여부      BOOLEAN NOT NULL DEFAULT TRUE,
    비고          TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
  );
`);
console.log('검사항목정의 테이블 생성 완료');

// 2. RLS 정책 설정
await c.query(`
  ALTER TABLE 검사항목정의 ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "all_검사항목정의" ON 검사항목정의;
  CREATE POLICY "all_검사항목정의" ON 검사항목정의 FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
`);
console.log('RLS 정책 설정 완료');

// 3. 검사항목마스터에 검사항목정의id FK, 소수점자리 컬럼 추가
await c.query(`
  ALTER TABLE 검사항목마스터 ADD COLUMN IF NOT EXISTS 검사항목정의id UUID REFERENCES 검사항목정의(id) ON DELETE SET NULL;
  ALTER TABLE 검사항목마스터 ADD COLUMN IF NOT EXISTS 소수점자리 INTEGER NOT NULL DEFAULT 0;
`);
console.log('검사항목마스터에 컬럼 추가 완료');

// 4. 검사유형 CHECK 제약조건 변경: 수치→계량형, 텍스트→계수형
await c.query(`ALTER TABLE 검사항목마스터 DROP CONSTRAINT IF EXISTS 검사항목마스터_검사유형_check;`);
await c.query(`UPDATE 검사항목마스터 SET 검사유형 = '계량형' WHERE 검사유형 = '수치';`);
await c.query(`UPDATE 검사항목마스터 SET 검사유형 = '계수형' WHERE 검사유형 = '텍스트';`);
await c.query(`ALTER TABLE 검사항목마스터 ADD CONSTRAINT 검사항목마스터_검사유형_check CHECK (검사유형 IN ('계량형', '계수형', '합부'));`);
console.log('검사유형 수치→계량형, 텍스트→계수형 변경 완료');

// 5. 기본 검사항목정의 데이터 등록
const defs = [
  { 항목명: '피막두께', 검사유형: '계량형', 단위: 'μm', 소수점자리: 1, 기본시료수: 5, 기본공차유형: '양측', 기본계측기: '막두께측정기' },
  { 항목명: '경도', 검사유형: '계량형', 단위: 'HV', 소수점자리: 0, 기본시료수: 3, 기본공차유형: '단일하한', 기본계측기: '마이크로비커스경도계' },
  { 항목명: '외관', 검사유형: '합부', 단위: null, 소수점자리: 0, 기본시료수: 1, 기본공차유형: '양측', 기본계측기: null },
  { 항목명: '색상', 검사유형: '합부', 단위: null, 소수점자리: 0, 기본시료수: 1, 기본공차유형: '양측', 기본계측기: null },
  { 항목명: '절연저항', 검사유형: '계량형', 단위: 'MΩ', 소수점자리: 1, 기본시료수: 3, 기본공차유형: '단일하한', 기본계측기: '절연저항측정기' },
  { 항목명: '접착력', 검사유형: '합부', 단위: null, 소수점자리: 0, 기본시료수: 1, 기본공차유형: '양측', 기본계측기: null },
  { 항목명: '내식성', 검사유형: '계량형', 단위: 'h', 소수점자리: 0, 기본시료수: 1, 기본공차유형: '단일하한', 기본계측기: '염수분무시험기' },
  { 항목명: '표면조도', 검사유형: '계량형', 단위: 'Ra', 소수점자리: 2, 기본시료수: 3, 기본공차유형: '양측', 기본계측기: '표면조도계' },
  { 항목명: '치수', 검사유형: '계량형', 단위: 'mm', 소수점자리: 2, 기본시료수: 3, 기본공차유형: '양측', 기본계측기: '노기스' },
  { 항목명: '불량수량', 검사유형: '계수형', 단위: '개', 소수점자리: 0, 기본시료수: 1, 기본공차유형: '양측', 기본계측기: null },
];

for (const d of defs) {
  await c.query(`
    INSERT INTO 검사항목정의 (항목명, 검사유형, 단위, 소수점자리, 기본시료수, 기본공차유형, 기본계측기)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (항목명) DO NOTHING
  `, [d.항목명, d.검사유형, d.단위, d.소수점자리, d.기본시료수, d.기본공차유형, d.기본계측기]);
}
console.log('기본 검사항목정의 10건 등록 완료');

await c.end();
console.log('Done');
