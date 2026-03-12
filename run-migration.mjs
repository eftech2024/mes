import pg from 'pg'
const { Client } = pg

function requireEnv(name) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env: ${name}`)
  return v
}

// Supabase 풀러 경유 (Session mode, port 5432)
// user 형식: postgres.{project_ref}
const client = new Client({
  host: process.env.SUPABASE_DB_HOST || 'aws-0-ap-northeast-2.pooler.supabase.com',
  port: Number(process.env.SUPABASE_DB_PORT || '5432'),
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  user: requireEnv('SUPABASE_DB_USER'),
  password: requireEnv('SUPABASE_DB_PASSWORD'),
  ssl: { rejectUnauthorized: false },
})

const SQL = `
-- ① 공정 단계별 타임스탬프 컬럼 추가 (없는 경우에만)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='바코드' AND column_name='수입검사일시') THEN
    ALTER TABLE 바코드 ADD COLUMN 수입검사일시 TIMESTAMPTZ;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='바코드' AND column_name='공정진행일시') THEN
    ALTER TABLE 바코드 ADD COLUMN 공정진행일시 TIMESTAMPTZ;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='바코드' AND column_name='공정검사일시') THEN
    ALTER TABLE 바코드 ADD COLUMN 공정검사일시 TIMESTAMPTZ;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='바코드' AND column_name='출하검사일시') THEN
    ALTER TABLE 바코드 ADD COLUMN 출하검사일시 TIMESTAMPTZ;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='바코드' AND column_name='출고완료일시') THEN
    ALTER TABLE 바코드 ADD COLUMN 출고완료일시 TIMESTAMPTZ;
  END IF;
END $$;

-- ② 공정별 검사 데이터 컬럼 추가 (JSON 문자열)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='바코드' AND column_name='수입검사데이터') THEN
    ALTER TABLE 바코드 ADD COLUMN 수입검사데이터 TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='바코드' AND column_name='공정진행데이터') THEN
    ALTER TABLE 바코드 ADD COLUMN 공정진행데이터 TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='바코드' AND column_name='공정검사데이터') THEN
    ALTER TABLE 바코드 ADD COLUMN 공정검사데이터 TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='바코드' AND column_name='출하검사데이터') THEN
    ALTER TABLE 바코드 ADD COLUMN 출하검사데이터 TEXT;
  END IF;
END $$;

-- ③ 출고 정보 컬럼 추가
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='바코드' AND column_name='출고일자') THEN
    ALTER TABLE 바코드 ADD COLUMN 출고일자 TEXT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='바코드' AND column_name='출고수량') THEN
    ALTER TABLE 바코드 ADD COLUMN 출고수량 INTEGER;
  END IF;
END $$;
`

try {
  await client.connect()
  console.log('DB 연결 성공')
  await client.query(SQL)
  console.log('✓ 타임스탬프 컬럼 추가 완료')

  // 결과 확인
  const { rows: cols } = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='바코드' AND column_name IN ('수입검사일시','공정진행일시','공정검사일시','출하검사일시','출고완료일시','수입검사데이터','공정진행데이터','공정검사데이터','출하검사데이터','출고일자','출고수량') ORDER BY column_name`
  )
  console.log('추가된 컬럼:', cols.map(r => r.column_name).join(', '))
} catch (err) {
  console.error('오류:', err.message)
} finally {
  await client.end()
}
