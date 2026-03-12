import pg from 'pg';
const { Client } = pg;
const c = new Client({
  connectionString: 'postgresql://postgres.ylyjkwqopvmaybtjydya:%40A134811b2024@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
const email = process.argv[2] || 'info@ef-tech.kr';
await c.connect();
const r = await c.query(
  `UPDATE auth.users SET email_confirmed_at = now() WHERE email = $1`,
  [email]
);
console.log(r.rowCount > 0 ? `✅ ${email} 이메일 인증 완료` : `❌ ${email} 계정 없음`);
await c.end();
