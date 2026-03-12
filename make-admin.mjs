/**
 * make-admin.mjs
 * 
 * 지정한 이메일 계정을 ADMIN으로 승인합니다.
 * 최초 1회 실행 후 이후 관리자 승인은 앱 내 /master/users 페이지에서 처리하세요.
 *
 * 사용법:
 *   node make-admin.mjs <email>
 *
 * 예시:
 *   node make-admin.mjs admin@ef-tech.kr
 */

import pg from 'pg';

const { Client } = pg;

const PROJECT_REF = 'ylyjkwqopvmaybtjydya';
const DB_REGIONS  = ['aws-0-ap-northeast-2', 'aws-0-ap-northeast-1', 'aws-0-ap-southeast-1'];

const email = process.argv[2];
if (!email) {
  console.error('❌ 이메일을 인수로 전달하세요: node make-admin.mjs admin@example.com');
  process.exit(1);
}

async function connectDB() {
  for (const region of DB_REGIONS) {
    const host = `${region}.pooler.supabase.com`;
    const cs = `postgresql://postgres.${PROJECT_REF}:%40A134811b2024@${host}:5432/postgres`;
    const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
    try {
      await client.connect();
      return client;
    } catch {
      await client.end().catch(() => {});
    }
  }
  throw new Error('DB 연결 실패');
}

async function main() {
  console.log(`대상 이메일: ${email}`);
  const client = await connectDB();

  try {
    // auth.users에서 user_id 조회
    const { rows: authRows } = await client.query(
      `SELECT id FROM auth.users WHERE email = $1 LIMIT 1`,
      [email]
    );
    if (authRows.length === 0) {
      console.error(`❌ '${email}' 계정이 존재하지 않습니다.`);
      console.log('   먼저 해당 이메일로 앱에서 회원가입을 완료하세요.');
      process.exit(1);
    }

    const userId = authRows[0].id;
    console.log(`사용자 ID: ${userId}`);

    // sys.users에 행이 있는지 확인
    const { rows: sysRows } = await client.query(
      `SELECT user_id, user_name, role_code, is_active FROM sys.users WHERE user_id = $1`,
      [userId]
    );

    if (sysRows.length === 0) {
      // 트리거가 아직 안 돌았을 경우 직접 생성
      await client.query(
        `INSERT INTO sys.users (user_id, user_name, role_code, is_active, approved_at)
         VALUES ($1, $2, 'ADMIN', true, now())
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, email.split('@')[0]]
      );
      console.log('✅ sys.users 행 생성 + ADMIN 설정 완료');
    } else {
      // 기존 행을 ADMIN으로 업데이트
      await client.query(
        `UPDATE sys.users
            SET role_code   = 'ADMIN',
                is_active   = true,
                approved_at = now()
          WHERE user_id = $1`,
        [userId]
      );
      const prev = sysRows[0];
      console.log(`✅ ${prev.user_name || email} → ADMIN 승인 완료`);
      if (prev.role_code !== 'ADMIN') console.log(`   (이전 역할: ${prev.role_code})`);
    }

    console.log('');
    console.log('이제 해당 계정으로 로그인하면 관리자 기능을 사용할 수 있습니다.');
    console.log('/master/users 페이지에서 다른 사용자를 승인하세요.');

  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('오류:', err.message);
  process.exit(1);
});
