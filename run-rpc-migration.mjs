/**
 * run-rpc-migration.mjs
 *
 * 1) public 스키마 RPC 래퍼 함수 생성 (schema-patch-rpc.sql 실행)
 * 2) Supabase Management API로 커스텀 스키마 PostgREST 노출
 *    - 필요: SUPABASE_ACCESS_TOKEN 환경변수 OR 인자로 전달
 *    - 발급: https://supabase.com/dashboard/account/tokens
 *
 * Usage:
 *   node run-rpc-migration.mjs [PAT]
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_REGIONS = ['aws-0-ap-northeast-2', 'aws-0-ap-northeast-1', 'aws-0-ap-southeast-1'];
const PROJECT_REF = 'ylyjkwqopvmaybtjydya';
const EXPOSE_SCHEMAS = 'public,sys,core,mdm,mes,qms,dms';

const PAT = process.argv[2] || process.env.SUPABASE_ACCESS_TOKEN || null;

// ── DB 연결 ─────────────────────────────────────────────────
async function connectDB() {
  for (const region of DB_REGIONS) {
    const host = `${region}.pooler.supabase.com`;
    const cs = `postgresql://postgres.${PROJECT_REF}:%40A134811b2024@${host}:5432/postgres`;
    const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
    try {
      await client.connect();
      console.log(`✅ DB connected via ${region}`);
      return client;
    } catch (e) {
      console.log(`  ✗ ${region}: ${e.message}`);
      await client.end().catch(() => {});
    }
  }
  throw new Error('All DB connections failed');
}

// ── Step 1: RPC 함수 생성 ────────────────────────────────────
async function runRPCMigration() {
  const sql = readFileSync(join(__dirname, 'schema-patch-rpc.sql'), 'utf8');
  const client = await connectDB();
  try {
    await client.query(sql);
    console.log('✅ RPC 함수 생성 완료 (public.get_my_profile 등)');
  } finally {
    await client.end();
  }
}

// ── Step 2: PostgREST 스키마 노출 ───────────────────────────
async function exposeSchemas() {
  if (!PAT) {
    console.log('');
    console.log('⚠️  커스텀 스키마(sys/core/mdm/mes/qms/dms) PostgREST 노출은 Personal Access Token이 필요합니다.');
    console.log('');
    console.log('  방법 1 (스크립트): PAT 발급 후 다시 실행');
    console.log('    1) https://supabase.com/dashboard/account/tokens 에서 토큰 발급');
    console.log('    2) node run-rpc-migration.mjs <YOUR_PAT>');
    console.log('');
    console.log('  방법 2 (Dashboard UI — 더 간단):');
    console.log('    1) https://supabase.com/dashboard/project/ylyjkwqopvmaybtjydya/settings/api');
    console.log('    2) "Extra schemas to expose in your Supabase API" 입력란에 아래 추가:');
    console.log('       sys, core, mdm, mes, qms, dms');
    console.log('    3) Save 클릭');
    console.log('');
    return false;
  }

  console.log('Exposing schemas via Management API...');
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/postgrest`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${PAT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ db_schema: EXPOSE_SCHEMAS }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`❌ Schema expose failed (${res.status}): ${text}`);
    return false;
  }

  console.log(`✅ 스키마 노출 완료: ${EXPOSE_SCHEMAS}`);
  return true;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('=== Supabase RPC Migration ===\n');

  await runRPCMigration();
  const exposed = await exposeSchemas();

  console.log('');
  console.log('=== 완료 ===');
  if (!exposed) {
    console.log('⚠️  스키마 노출 미완료 — 위 방법 중 하나를 실행하면 모든 페이지가 정상 작동합니다.');
  } else {
    console.log('🎉 모든 준비 완료!');
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
