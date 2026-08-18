import { PostgrestClient } from '@supabase/postgrest-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY 환경변수가 필요해요.');
}

// createClient(@supabase/supabase-js)는 이 앱이 쓰지 않는 Auth/Realtime/Storage/Functions
// 클라이언트까지 전부 번들에 포함시켜 gzip 기준 ~100KB를 그냥 버린다. 우리는 테이블 읽기
// (postgrest)만 쓰므로 PostgrestClient를 직접 생성한다 — 헤더는 createClient가 내부적으로
// 설정하는 것과 동일하게(Authorization/apikey 둘 다) 맞춰준다.
export const supabase = new PostgrestClient(`${supabaseUrl}/rest/v1`, {
  headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
});
