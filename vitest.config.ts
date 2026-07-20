import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      // 실행 스크립트와 예제는 진입점이라 단위 테스트 대상이 아닙니다.
      exclude: ['src/examples/**', 'src/scripts/**', 'src/index.ts'],
      /**
       * 지금 수치를 바닥으로 고정합니다. 목표치가 아니라 **후퇴 방지선**입니다.
       *
       * api/auth/session 계층은 대부분 네트워크 호출 래퍼라 의미 있는 단위 테스트가
       * 어렵고, 대신 실제 계정으로 확인했습니다. 로직이 실제로 들어 있는
       * store/features/core 는 70~80%대입니다.
       */
      thresholds: {
        statements: 40,
        branches: 33,
        functions: 42,
        lines: 41,
      },
    },
  },
});
