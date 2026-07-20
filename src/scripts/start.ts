/**
 * 봇 + 설정 대시보드를 함께 실행합니다.
 *
 *   pnpm bot
 *
 * 실행 전 `pnpm login` 으로 액세스 토큰을 발급받아야 합니다.
 */
import { ChzzkClient } from '../client.js';
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

await session.connect();

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
