import pg from 'pg'
const { Client } = pg
const c = new Client({
  connectionString: 'postgresql://postgres.ylyjkwqopvmaybtjydya:%40A134811b2024@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()

// 1. product_code unique constraint 제거 (차종이 같으면 코드 겹칠 수 있음)
try {
  await c.query(`ALTER TABLE mdm.products DROP CONSTRAINT IF EXISTS products_product_code_key`)
  console.log('OK: product_code unique constraint dropped')
} catch (e) { console.log('Skip:', e.message) }

// 2. mass_production_qty → annual_qty 이름 변경
try {
  await c.query(`ALTER TABLE mdm.products RENAME COLUMN mass_production_qty TO annual_qty`)
  console.log('OK: mass_production_qty → annual_qty')
} catch (e) { console.log('Skip (already renamed?):', e.message) }

// 3. monthly_qty 추가 (월간 소요량, 주간생산량은 monthly_qty/4.3으로 프론트에서 계산)
await c.query(`ALTER TABLE mdm.products ADD COLUMN IF NOT EXISTS monthly_qty integer`)
console.log('OK: monthly_qty added')

// 4. weekly_production_qty 제거 (프론트 자동계산으로 대체)
try {
  await c.query(`ALTER TABLE mdm.products DROP COLUMN IF EXISTS weekly_production_qty`)
  console.log('OK: weekly_production_qty dropped')
} catch (e) { console.log('Skip:', e.message) }

await c.end()
console.log('Migration complete.')
