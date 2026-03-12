import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const sql = readFileSync(join(__dirname, 'schema-final.sql'), 'utf8');

// Supabase Supavisor session pooler (IPv4 capable, DDL-safe)
// 비밀번호의 @ 문자 → %40 URL 인코딩
const REGIONS = [
  'aws-0-ap-northeast-1',
  'aws-0-ap-northeast-2',
  'aws-0-ap-southeast-1',
];

async function tryConnect(region) {
  const host = `${region}.pooler.supabase.com`;
  const cs = `postgresql://postgres.ylyjkwqopvmaybtjydya:%40A134811b2024@${host}:5432/postgres`;
  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
  try {
    await client.connect();
    return client;
  } catch (e) {
    await client.end().catch(() => {});
    console.log(`  ✗ ${host} — ${e.message}`);
    return null;
  }
}

async function run() {
  let client = null;
  for (const region of REGIONS) {
    console.log(`Trying ${region}...`);
    client = await tryConnect(region);
    if (client) { console.log(`✅ Connected via ${region}`); break; }
  }
  if (!client) {
    console.error('❌ All pooler connections failed. Run schema-final.sql manually in Supabase Dashboard SQL Editor.');
    process.exit(1);
  }
  try {
    await client.query(sql);
    console.log('✅ Migration complete — all schemas, tables, RLS, and RPC functions created');
  } catch (err) {
    console.error('❌ SQL execution error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
