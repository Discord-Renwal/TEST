import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { App } from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 대시보드는 로컬 서버를 보므로 실패해도 오래 매달릴 이유가 없습니다.
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('#root 엘리먼트를 찾을 수 없습니다.');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        position="bottom-center"
        theme="system"
        toastOptions={{
          style: {
            background: 'var(--surface-panel)',
            border: '1px solid var(--surface-border)',
            color: 'var(--surface-text)',
          },
        }}
      />
    </QueryClientProvider>
  </StrictMode>
);
