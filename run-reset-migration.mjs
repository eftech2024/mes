import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const sql = readFileSync(join(__dirname, 'schema-reset-mes.sql'), 'utf8');

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
    console.log(`  X ${host} — ${e.message}`);
    return null;
  }
}

async function run() {
  let client = null;
  for (const region of REGIONS) {
    console.log(`Trying ${region}...`);
    client = await tryConnect(region);
    if (client) { console.log(`Connected via ${region}`); break; }
  }
  if (!client) {
    console.error('All pooler connections failed.');
    process.exit(1);
  }
  try {
    await client.query(sql);
    console.log('Schema reset complete — work_orders table recreated with id PK');
  } catch (err) {
    console.error('SQL error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
