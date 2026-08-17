import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // supabase/functions 아래 테스트는 Deno 런타임 전용(https:// import)이라
    // Vitest 기본 glob에서 제외한다. 실행은 `npm run test:functions`.
    exclude: [...configDefaults.exclude, 'supabase/**'],
  },
});
