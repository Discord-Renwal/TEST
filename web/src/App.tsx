import { Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { Loader2, PlugZap } from 'lucide-react';
import { Layout } from './components/Layout';
import { EmptyState } from './components/ui/Card';
import { Button } from './components/ui/Button';
import { ROUTES } from './routes';
import { useConfig, useStatus } from './lib/api';

export function App() {
  const config = useConfig();
  const status = useStatus();
  const stats = status.data?.stats ?? null;

  return (
    <Layout status={status.data}>
      {/* lazy 로 불러오는 동안 보여줄 자리 */}
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<Navigate to="/general" replace />} />

          {ROUTES.map((route) => (
            <Route
              key={route.path}
              path={`/${route.path}`}
              element={
                route.standalone ? (
                  // 설정이 필요 없는 화면은 곧바로 그립니다.
                  route.render({ config: undefined as never, stats })
                ) : (
                  <ConfigGate config={config}>
                    {(loaded) => route.render({ config: loaded, stats })}
                  </ConfigGate>
                )
              }
            />
          ))}

          <Route
            path="*"
            element={
              <EmptyState icon={<PlugZap className="size-5" />} title="없는 화면입니다">
                <p>주소를 확인해 주세요.</p>
                <Button variant="secondary" size="sm" className="mt-4" asChild>
                  <a href="/general">일반 화면으로</a>
                </Button>
              </EmptyState>
            }
          />
        </Routes>
      </Suspense>
    </Layout>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-24 text-[var(--surface-muted)]">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}

/**
 * 설정을 다 받은 뒤에 페이지를 그립니다.
 *
 * 페이지마다 "설정이 아직 없을 때" 를 따로 처리하면 같은 코드가 열 번 반복됩니다.
 * 한 곳에서 막고, 실패했을 때 무엇을 해야 하는지도 여기서만 안내합니다.
 */
function ConfigGate({
  config,
  children,
}: {
  config: ReturnType<typeof useConfig>;
  children: (config: NonNullable<ReturnType<typeof useConfig>['data']>) => ReactNode;
}) {
  if (config.isPending) return <Spinner />;

  if (config.isError || !config.data) {
    return (
      <EmptyState icon={<PlugZap className="size-5" />} title="설정을 불러오지 못했습니다">
        <p>{config.error?.message ?? '봇 서버에 연결할 수 없습니다.'}</p>
        <p className="mt-1">
          터미널에서 <code className="text-brand">pnpm bot</code> 이 실행 중인지 확인하세요.
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={() => void config.refetch()}
        >
          다시 시도
        </Button>
      </EmptyState>
    );
  }

  return <>{children(config.data)}</>;
}
