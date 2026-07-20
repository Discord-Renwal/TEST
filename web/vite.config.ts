import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * 대시보드 프런트엔드.
 *
 * 개발 중에는 Vite 개발 서버(5173)가 HMR 을 제공하고 `/api` 만 봇 서버로 프록시합니다.
 * 배포 시에는 `web/dist` 로 빌드해 봇 서버가 정적 파일로 직접 서빙합니다.
 */
export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // localhost 에서 한 번 받으면 끝인 대시보드라 청크 분할로 얻을 게 없습니다.
    // 기본 경고선(500KB)만 현실에 맞게 올려둡니다.
    chunkSizeWarningLimit: 800,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.DASHBOARD_PORT ?? 4700}`,
        changeOrigin: true,
      },
    },
  },
});
