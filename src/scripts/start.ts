/**
 * 봇 + 설정 대시보드를 함께 실행합니다.
 *
 *   pnpm bot
 *
 * 실행 전 `pnpm login` 으로 액세스 토큰을 발급받아야 합니다.
 */
import { ChzzkClient } from '../client.js';
import { ChzzkApiError } from '../core/errors.js';
import { ConfigStore } from '../store/configStore.js';
import { BotRuntime } from '../bot/runtime.js';
import { createDashboard } from '../web/server.js';
import { loadEnv } from '../env.js';

const env = loadEnv();
const chzzk = ChzzkClient.fromEnv();
const log = chzzk.logger.child('start');

const store = await ConfigStore.open(env.BOT_CONFIG_FILE, { logger: chzzk.logger });
log.info(`설정 파일: ${store.path}`);

const me = await chzzk.users.me();
log.info(`${me.channelName} (${me.channelId}) 계정으로 동작합니다.`);

const runtime = new BotRuntime(chzzk, store, me.channelId);

const dashboard = createDashboard({
  store,
  runtime,
  logger: chzzk.logger,
  port: env.DASHBOARD_PORT,
  account: { channelId: me.channelId, channelName: me.channelName },
});
// 대시보드가 안 떠도 봇은 계속 돌아야 합니다.
let dashboardUp = true;
try {
  await dashboard.listen();
} catch (error) {
  dashboardUp = false;
  log.error(
    `대시보드를 띄우지 못했습니다 — ${error instanceof Error ? error.message : String(error)}`
  );
  log.error('봇은 기존 설정 그대로 계속 동작합니다.');
}

const session = chzzk.createSessionClient({
  events: ['CHAT', 'DONATION', 'SUBSCRIPTION'],
  authMode: 'user',
});

session.on('ready', ({ sessionKey }) => {
  log.info(`채팅 구독을 시작했습니다. sessionKey=${sessionKey}`);
});

session.on('chat', (event) => {
  void runtime.handleChat(event);
});

session.on('donation', (event) => {
  log.info(`[후원] ${event.donatorNickname} ${event.payAmount}원 — ${event.donationText}`);
});

session.on('subscription', (event) => {
  log.info(`[구독] ${event.subscriberNickname} 티어${event.tierNo} ${event.month}개월`);
});

session.on('revoked', ({ eventType }) => {
  log.error(`${eventType} 권한이 회수되었습니다. \`pnpm login\` 으로 재인증이 필요합니다.`);
});

session.on('error', (error) => {
  log.error('세션 오류', error);
});

try {
  await session.connect();
} catch (error) {
  // 세션 생성 실패는 원인이 뚜렷한 편이라, 스택 트레이스보다 해법을 보여주는 게 낫습니다.
  if (error instanceof ChzzkApiError && error.isRateLimited) {
    log.error('세션 연결 제한을 초과했습니다. 유저 세션은 동시에 3개까지만 유지됩니다.');
    log.error('이전에 띄운 봇 프로세스가 남아 있지 않은지 확인한 뒤 다시 실행하세요.');

    // 어떤 세션이 물고 있는지 보여주면 정리하기 쉽습니다.
    try {
      const sessions = await chzzk.sessions.listUserSessions({ size: 10 });
      const alive = sessions.filter((s) => !s.disconnectedDate);
      log.error(`현재 연결된 세션 ${alive.length}개: ${alive.map((s) => s.sessionKey).join(', ')}`);
    } catch {
      /* 목록 조회까지 실패하면 그냥 넘어갑니다 */
    }
  } else {
    log.error('채팅 세션 연결에 실패했습니다.', error);
  }

  if (dashboardUp) {
    log.error(`대시보드(http://localhost:${env.DASHBOARD_PORT})는 계속 사용할 수 있습니다.`);
  }
  process.exitCode = 1;
}

if (dashboardUp) console.log(`\n  대시보드 → http://localhost:${env.DASHBOARD_PORT}\n`);

let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`${signal} 수신 — 종료합니다.`);
    void Promise.allSettled([session.close(), dashboard.close()]).then(() => process.exit(0));
  });
}
