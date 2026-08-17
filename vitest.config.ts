import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // supabase/functions 아래 테스트는 Deno 런타임 전용(https:// import)이라
    // Vitest 기본 glob에서 제외한다. 실행은 `npm run test:functions`.
    // .claude/** 제외: 이 하네스가 워크트리를 .claude/worktrees/ 아래 중첩시켜 만들 때가
    // 있는데, 그 안에 소스 트리 전체 사본이 들어있어 vitest가 테스트를 중복으로 잡아낸다.
    exclude: [...configDefaults.exclude, '**/supabase/**', '.claude/**'],
  },
});
