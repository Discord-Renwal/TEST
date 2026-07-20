import { useState } from 'react';
import { Loader2, PlugZap } from 'lucide-react';
import { Layout, type TabId } from './components/Layout';
import { EmptyState } from './components/ui/Card';
import { Button } from './components/ui/Button';
import { GeneralPage } from './pages/GeneralPage';
import { EventsPage } from './pages/EventsPage';
import { CommandsPage } from './pages/CommandsPage';
import { AutoResponsesPage } from './pages/AutoResponsesPage';
import { TimersPage } from './pages/TimersPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { PointsPage } from './pages/PointsPage';
import { GamesPage } from './pages/GamesPage';
import { SongsPage } from './pages/SongsPage';
import { BannedWordsPage } from './pages/BannedWordsPage';
import { PermissionsPage } from './pages/PermissionsPage';
import { useConfig, useStatus } from './lib/api';
import type { BotConfig, BotStats } from './lib/types';

export function App() {
  const [tab, setTab] = useState<TabId>('general');
  const config = useConfig();
  const status = useStatus();

  return (
    <Layout tab={tab} onTabChange={setTab} status={status.data}>
      {config.isPending ? (
        <div className="flex items-center justify-center py-24 text-[var(--surface-muted)]">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : config.isError || !config.data ? (
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
      ) : (
        <Pages tab={tab} config={config.data} stats={status.data?.stats ?? null} />
      )}
    </Layout>
  );
}

function Pages({ tab, config, stats }: { tab: TabId; config: BotConfig; stats: BotStats | null }) {
  switch (tab) {
    case 'general':
      return <GeneralPage config={config} stats={stats} />;
    case 'events':
      return <EventsPage />;
    case 'commands':
      return <CommandsPage config={config} />;
    case 'auto':
      return <AutoResponsesPage config={config} />;
    case 'timers':
      return <TimersPage config={config} />;
    case 'notifications':
      return <NotificationsPage config={config} />;
    case 'points':
      return <PointsPage config={config} />;
    case 'games':
      return <GamesPage config={config} />;
    case 'songs':
      return <SongsPage config={config} />;
    case 'banned':
      return <BannedWordsPage config={config} />;
    case 'permissions':
      return <PermissionsPage config={config} />;
  }
}
