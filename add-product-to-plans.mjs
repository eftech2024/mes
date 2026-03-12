import pg from 'pg'
const { Client } = pg

const client = new Client({
  connectionString: 'postgresql://postgres.ylyjkwqopvmaybtjydya:%40A134811b2024@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

const sql = `
-- delivery_plans 에 product_id 컬럼 추가
ALTER TABLE mes.delivery_plans
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES mdm.products(id) ON DELETE SET NULL;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_delivery_plans_product ON mes.delivery_plans(product_id);
`

await client.connect()
console.log('Connected.')
try {
  await client.query(sql)
  console.log('Migration OK: product_id added to mes.delivery_plans')
} catch (e) {
  console.error('Migration error:', e.message)
} finally {
  await client.end()
}
