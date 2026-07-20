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
import { UserStore } from '../store/userStore.js';
import { SongQueueStore } from '../store/songQueue.js';
import { EventLog } from '../store/eventLog.js';
import { BotRuntime } from '../bot/runtime.js';
import { createDashboard } from '../web/server.js';
import { loadEnv } from '../env.js';

const env = loadEnv();
const chzzk = ChzzkClient.fromEnv();
const log = chzzk.logger.child('start');

const config = await ConfigStore.open(env.BOT_CONFIG_FILE, { logger: chzzk.logger });
const users = await UserStore.open(env.BOT_USER_FILE, chzzk.logger);
const songs = await SongQueueStore.open(env.BOT_SONG_FILE, chzzk.logger);
const eventLog = new EventLog();

log.info(`설정 파일: ${config.path}`);

const me = await chzzk.users.me();
log.info(`${me.channelName} (${me.channelId}) 계정으로 동작합니다.`);
eventLog.push('system', `봇 시작 — ${me.channelName}`);

const runtime = new BotRuntime({
  chzzk,
  config,
  users,
  songs,
  log: eventLog,
  botChannelId: me.channelId,
});

// 대시보드에서 타이머를 추가/삭제하면 스케줄러에 알려줍니다.
config.on('change', () => runtime.syncTimers());

const dashboard = createDashboard({
  store: config,
  users,
  songs,
  eventLog,
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
  eventLog.push('system', '채팅 구독 시작');
});

session.on('chat', (event) => void runtime.handleChat(event));
session.on('donation', (event) => void runtime.handleDonation(event));
session.on('subscription', (event) => void runtime.handleSubscription(event));

session.on('disconnect', ({ reason }) => {
  eventLog.push('system', `연결 끊김 (${reason})`);
});

session.on('revoked', ({ eventType }) => {
  log.error(`${eventType} 권한이 회수되었습니다. \`pnpm login\` 으로 재인증이 필요합니다.`);
  eventLog.push('error', `${eventType} 권한 회수됨 — 재인증 필요`);
});

session.on('error', (error) => {
  log.error('세션 오류', error);
  eventLog.push('error', '세션 오류', { detail: error.message });
});

try {
  await session.connect();
  runtime.start();
} catch (error) {
  // 세션 생성 실패는 원인이 뚜렷한 편이라, 스택 트레이스보다 해법을 보여주는 게 낫습니다.
  if (error instanceof ChzzkApiError && error.isRateLimited) {
    log.error('세션 연결 제한을 초과했습니다. 유저 세션은 동시에 3개까지만 유지됩니다.');
    log.error('이전에 띄운 봇 프로세스가 남아 있지 않은지 확인한 뒤 다시 실행하세요.');

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

    runtime.stop();
    // 포인트는 5초씩 묶어 저장하므로, 종료 전에 남은 것을 반드시 내려씁니다.
    void Promise.allSettled([
      session.close(),
      dashboard.close(),
      users.flush(),
      songs.flush(),
    ]).then(() => process.exit(0));
  });
}
