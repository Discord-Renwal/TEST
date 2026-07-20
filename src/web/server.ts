import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { ConfigStore } from '../store/configStore.js';
import type { BotRuntime } from '../bot/runtime.js';
import type { Logger } from '../core/logger.js';
import {
  autoResponse,
  bannedWord,
  botConfig,
  customCommand,
  timerMessage,
} from '../store/schema.js';
import { isValidPattern } from '../features/matcher.js';
import { findBuiltin } from '../features/builtinCommands.js';
import { isGameCommandName } from '../features/games.js';
import type { UserStore } from '../store/userStore.js';
import type { SongQueueStore } from '../store/songQueue.js';
import type { EventLog } from '../store/eventLog.js';
import type { ChzzkClient } from '../client.js';
import { ChzzkApiError } from '../core/errors.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/** 프런트엔드를 빌드하지 않고 접속했을 때 보여주는 안내 */
const NOT_BUILT_HTML = `<!doctype html><html lang="ko"><meta charset="utf-8">
<title>대시보드 빌드 필요</title>
<body style="font-family:system-ui,'Malgun Gothic',sans-serif;background:#0d0f13;color:#eceef2;
display:grid;place-items:center;min-height:100vh;margin:0">
<div style="max-width:32rem;padding:2rem">
<h1 style="font-size:1.1rem;margin:0 0 .75rem">대시보드가 아직 빌드되지 않았습니다</h1>
<p style="color:#7d8695;line-height:1.7;margin:0 0 1rem">
React 대시보드는 <code>web/dist</code> 에 빌드된 파일을 사용합니다. 아래 중 하나를 실행하세요.</p>
<pre style="background:#1e2229;padding:1rem;border-radius:.5rem;overflow:auto;line-height:1.6"><code>pnpm build:web   <span style="color:#7d8695"># 빌드 후 이 주소를 새로고침</span>
pnpm dev:web     <span style="color:#7d8695"># 개발 서버(HMR) → http://localhost:5173</span></code></pre>
<p style="color:#7d8695;line-height:1.7;margin:1rem 0 0">
API 는 정상 동작 중이므로 봇 자체는 영향을 받지 않습니다.</p>
</div></body></html>`;

export interface DashboardOptions {
  store: ConfigStore;
  users?: UserStore | undefined;
  songs?: SongQueueStore | undefined;
  eventLog?: EventLog | undefined;
  /** 치지직 서버 상태를 직접 다루는 화면(제재·채팅설정)에 필요합니다. */
  chzzk?: ChzzkClient | undefined;
  runtime?: BotRuntime | undefined;
  logger: Logger;
  port?: number;
  /** 정적 파일 경로. 기본은 web/dist */
  publicDir?: string;
  /** 봇 계정 정보 — 상태 화면에 보여줍니다. */
  account?: { channelId: string; channelName: string } | undefined;
}

/** 부분 저장이 가능한 설정 섹션 — 위 경로 정규식과 반드시 같은 목록이어야 합니다. */
type ConfigSection =
  'general' | 'permissions' | 'moderation' | 'points' | 'songs' | 'games' | 'notifications';

/**
 * 설정 대시보드.
 *
 * 인증이 없으므로 **127.0.0.1 에만 바인딩**합니다. 원격에서 접속해야 한다면
 * 이 서버를 그대로 열지 말고 앞단에 인증 프록시를 두세요. 설정에는 금칙어 목록과
 * 관리자 채널 ID 가 들어가고, 대시보드에서 봇 동작을 바꿀 수 있습니다.
 */
export function createDashboard(options: DashboardOptions) {
  const { store, logger } = options;
  const log = logger.child('web');
  // React 대시보드의 빌드 산출물. `pnpm build:web` 이 만들어 둡니다.
  const publicDir = resolve(options.publicDir ?? join(process.cwd(), 'web/dist'));
  const port = options.port ?? 4000;

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      log.error('요청 처리 중 오류', error);
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    const path = url.pathname;

    if (path.startsWith('/api/')) return handleApi(req, res, path);
    return serveStatic(res, path);
  }

  /**
   * 이름·별칭이 다른 명령과 겹치는지 확인합니다.
   *
   * 내장 명령까지 함께 봐야 합니다. 예전에는 커스텀끼리만 비교해서,
   * `!시간` 이나 `!팔로워` 같은 이름을 만들면 저장은 200 으로 성공하는데
   * 실제로는 내장이 먼저 잡아 영영 실행되지 않았습니다.
   */
  function findNameConflict(name: string, aliases: string[], selfId?: string): string | null {
    for (const candidate of [name, ...aliases]) {
      const existing = store.findCommand(candidate);
      if (existing && existing.id !== selfId) {
        return `"${candidate}" 은(는) 이미 다른 명령이 쓰고 있습니다.`;
      }
      // 게임 명령은 BUILTIN_COMMANDS 가 아니라 런타임에서 따로 처리하므로
      // 여기서 함께 확인해야 합니다.
      if (findBuiltin(candidate) || isGameCommandName(candidate)) {
        return `"${candidate}" 은(는) 내장 명령과 겹칩니다. 다른 이름을 쓰세요.`;
      }
    }
    return null;
  }

  // ─── API ───────────────────────────────────────────────────────────────────

  async function handleApi(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
    const method = req.method ?? 'GET';

    if (path === '/api/status' && method === 'GET') {
      return sendJson(res, 200, {
        account: options.account ?? null,
        stats: options.runtime?.stats ?? null,
        configPath: store.path,
      });
    }

    if (path === '/api/config') {
      if (method === 'GET') return sendJson(res, 200, store.snapshot());
      if (method === 'PUT') {
        const body = await readJson(req);
        const parsed = botConfig.safeParse(body);
        if (!parsed.success)
          return sendJson(res, 400, { error: formatIssues(parsed.error.issues) });
        return sendJson(res, 200, await store.replace(parsed.data));
      }
    }

    // 부분 설정 저장
    const sectionMatch =
      /^\/api\/config\/(general|permissions|moderation|points|songs|games|notifications)$/.exec(
        path
      );
    if (sectionMatch && method === 'PUT') {
      const section = sectionMatch[1] as ConfigSection;
      const body = await readJson(req);
      const draft = store.snapshot();

      // 금칙어 목록은 별도 엔드포인트로 관리하므로 덮어쓰지 않습니다.
      const merged =
        section === 'moderation'
          ? { ...draft.moderation, ...(body as object), words: draft.moderation.words }
          : { ...draft[section], ...(body as object) };

      const parsed = botConfig.safeParse({ ...draft, [section]: merged });
      if (!parsed.success) return sendJson(res, 400, { error: formatIssues(parsed.error.issues) });
      return sendJson(res, 200, await store.replace(parsed.data));
    }

    // ─ 타이머(주기 메시지)
    if (path === '/api/timers' && method === 'POST') {
      const body = await readJson(req);
      const parsed = timerMessage.omit({ id: true }).safeParse(body);
      if (!parsed.success) return sendJson(res, 400, { error: formatIssues(parsed.error.issues) });

      const saved = timerMessage.parse({ ...parsed.data, id: `tm_${randomUUID().slice(0, 8)}` });
      await store.update((draft) => {
        draft.timers.push(saved);
      });
      return sendJson(res, 200, saved);
    }

    const timerMatch = /^\/api\/timers\/([\w-]+)$/.exec(path);
    if (timerMatch) {
      const id = timerMatch[1]!;
      if (method === 'PUT') {
        const body = await readJson(req);
        const existing = store.snapshot().timers.find((t) => t.id === id);
        if (!existing) return sendJson(res, 404, { error: '주기 메시지를 찾을 수 없습니다.' });

        const parsed = timerMessage.safeParse({ ...existing, ...(body as object), id });
        if (!parsed.success)
          return sendJson(res, 400, { error: formatIssues(parsed.error.issues) });

        await store.update((draft) => {
          const index = draft.timers.findIndex((t) => t.id === id);
          if (index >= 0) draft.timers[index] = parsed.data;
        });
        return sendJson(res, 200, parsed.data);
      }
      if (method === 'DELETE') {
        let removed = false;
        await store.update((draft) => {
          const before = draft.timers.length;
          draft.timers = draft.timers.filter((t) => t.id !== id);
          removed = draft.timers.length < before;
        });
        return sendJson(
          res,
          removed ? 200 : 404,
          removed ? { ok: true } : { error: '없는 항목입니다.' }
        );
      }
    }

    // ─ 시청자 / 포인트
    if (path === '/api/users' && method === 'GET') {
      if (!options.users) return sendJson(res, 503, { error: '봇이 실행 중이 아닙니다.' });
      const list = options.users
        .all()
        .sort((a, b) => b.points - a.points)
        .slice(0, 200);
      return sendJson(res, 200, { users: list, total: options.users.userCount });
    }

    const userPointMatch = /^\/api\/users\/([\w-]+)\/points$/.exec(path);
    if (userPointMatch && method === 'POST') {
      if (!options.users) return sendJson(res, 503, { error: '봇이 실행 중이 아닙니다.' });
      const body = (await readJson(req)) as { delta?: unknown };
      const delta = Number(body.delta);
      if (!Number.isFinite(delta) || delta === 0) {
        return sendJson(res, 400, { error: 'delta 는 0 이 아닌 숫자여야 합니다.' });
      }
      const channelId = userPointMatch[1]!;
      const existing = options.users.get(channelId);
      const total = options.users.addPoints(channelId, existing?.nickname ?? '', Math.floor(delta));
      // 다른 변경 라우트와 마찬가지로 즉시 내려씁니다.
      await options.users.flush();
      return sendJson(res, 200, { channelId, points: total });
    }

    if (path === '/api/users/reset-points' && method === 'POST') {
      if (!options.users) return sendJson(res, 503, { error: '봇이 실행 중이 아닙니다.' });
      options.users.resetAllPoints();
      await options.users.flush();
      return sendJson(res, 200, { ok: true });
    }

    // ─ 신청곡
    if (path === '/api/songs' && method === 'GET') {
      if (!options.songs) return sendJson(res, 503, { error: '봇이 실행 중이 아닙니다.' });
      return sendJson(res, 200, {
        playing: options.songs.playing() ?? null,
        pending: options.songs.pending(),
        history: options.songs
          .all()
          .filter((s) => s.status === 'done' || s.status === 'skipped')
          .slice(-20)
          .reverse(),
      });
    }

    if (path === '/api/songs/next' && method === 'POST') {
      if (!options.songs) return sendJson(res, 503, { error: '봇이 실행 중이 아닙니다.' });
      const started = options.songs.next();
      await options.songs.flush();
      return sendJson(res, 200, { started });
    }

    if (path === '/api/songs/clear' && method === 'POST') {
      if (!options.songs) return sendJson(res, 503, { error: '봇이 실행 중이 아닙니다.' });
      const count = options.songs.clearPending();
      await options.songs.flush();
      return sendJson(res, 200, { cleared: count });
    }

    const songMatch = /^\/api\/songs\/([\w-]+)(?:\/(up|down|skip))?$/.exec(path);
    if (songMatch && !['next', 'clear'].includes(songMatch[1]!)) {
      if (!options.songs) return sendJson(res, 503, { error: '봇이 실행 중이 아닙니다.' });
      const id = songMatch[1]!;
      const action = songMatch[2];

      if (method === 'POST' && (action === 'up' || action === 'down')) {
        const moved = options.songs.move(id, action);
        await options.songs.flush();
        return sendJson(
          res,
          moved ? 200 : 404,
          moved ? { ok: true } : { error: '옮기지 못했습니다.' }
        );
      }
      if (method === 'POST' && action === 'skip') {
        const skipped = options.songs.skip(id);
        await options.songs.flush();
        return sendJson(
          res,
          skipped ? 200 : 404,
          skipped ? { skipped } : { error: '없는 곡입니다.' }
        );
      }
      if (method === 'DELETE') {
        const removed = options.songs.remove(id);
        await options.songs.flush();
        return sendJson(
          res,
          removed ? 200 : 404,
          removed ? { ok: true } : { error: '없는 곡입니다.' }
        );
      }
    }

    // ─ 치지직 직접 연동 (제재 / 채팅설정 / 시청자 / 매니저)
    //
    // 이 구간은 설정 파일이 아니라 치지직 서버 상태를 직접 다룹니다.
    // 스트리머 계정이 아니면 400 "스트리머가 아닙니다" 가 나오므로,
    // 그 사실을 프런트가 구분할 수 있도록 코드를 그대로 전달합니다.
    if (path.startsWith('/api/chzzk/')) {
      if (!options.chzzk) return sendJson(res, 503, { error: '봇이 실행 중이 아닙니다.' });
      const chzzk = options.chzzk;

      try {
        if (path === '/api/chzzk/restrictions' && method === 'GET') {
          const page = await chzzk.restrictions.list({ size: 30 });
          return sendJson(res, 200, { data: page.data, next: page.page?.next ?? null });
        }

        if (path === '/api/chzzk/restrictions' && method === 'POST') {
          const body = (await readJson(req)) as { targetChannelId?: string };
          if (!body.targetChannelId) return sendJson(res, 400, { error: 'targetChannelId 필요' });
          await chzzk.restrictions.restrict(body.targetChannelId);
          return sendJson(res, 200, { ok: true });
        }

        const restrictMatch = /^\/api\/chzzk\/restrictions\/([\w-]+)$/.exec(path);
        if (restrictMatch && method === 'DELETE') {
          await chzzk.restrictions.unrestrict(restrictMatch[1]!);
          return sendJson(res, 200, { ok: true });
        }

        // 임시 제한 해제는 채팅 채널 ID 가 필요합니다. 최근 채팅에서 얻어 둔 값을 씁니다.
        const tempMatch = /^\/api\/chzzk\/temporary-restrictions\/([\w-]+)$/.exec(path);
        if (tempMatch && method === 'DELETE') {
          const chatChannelId = options.runtime?.lastChatChannelId;
          if (!chatChannelId) {
            return sendJson(res, 409, {
              error: '채팅 채널 ID를 아직 모릅니다. 방송 채팅이 한 번 오간 뒤에 시도하세요.',
            });
          }
          await chzzk.restrictions.temporaryUnrestrict({
            targetChannelId: tempMatch[1]!,
            chatChannelId,
          });
          return sendJson(res, 200, { ok: true });
        }

        if (path === '/api/chzzk/chat-settings') {
          if (method === 'GET') return sendJson(res, 200, await chzzk.chat.getSettings());
          if (method === 'PUT') {
            const body = await readJson(req);
            await chzzk.chat.updateSettings(
              body as Parameters<typeof chzzk.chat.updateSettings>[0]
            );
            return sendJson(res, 200, await chzzk.chat.getSettings());
          }
        }

        if (path === '/api/chzzk/audience' && method === 'GET') {
          // 팔로워와 구독자를 함께 돌려줍니다. 각각 따로 부르면 왕복이 늘어납니다.
          const [followers, subscribers] = await Promise.allSettled([
            chzzk.channels.followers({ size: 50 }),
            chzzk.channels.subscribers({ size: 50, sort: 'RECENT' }),
          ]);
          return sendJson(res, 200, {
            followers: followers.status === 'fulfilled' ? followers.value : [],
            subscribers: subscribers.status === 'fulfilled' ? subscribers.value : [],
            followersError:
              followers.status === 'rejected' ? describeError(followers.reason) : null,
            subscribersError:
              subscribers.status === 'rejected' ? describeError(subscribers.reason) : null,
          });
        }

        if (path === '/api/chzzk/managers' && method === 'GET') {
          return sendJson(res, 200, { data: await chzzk.channels.streamingRoles() });
        }

        if (path === '/api/chzzk/live-setting' && method === 'GET') {
          return sendJson(res, 200, await chzzk.lives.getSetting());
        }

        if (path === '/api/chzzk/live-setting' && method === 'PATCH') {
          const body = await readJson(req);
          await chzzk.lives.updateSetting(body as Parameters<typeof chzzk.lives.updateSetting>[0]);
          return sendJson(res, 200, await chzzk.lives.getSetting());
        }

        if (path === '/api/chzzk/categories' && method === 'GET') {
          const query = new URL(req.url ?? '', 'http://x').searchParams.get('q') ?? '';
          if (!query.trim()) return sendJson(res, 200, { data: [] });
          return sendJson(res, 200, { data: await chzzk.categories.search(query, { size: 10 }) });
        }
      } catch (error) {
        const status = error instanceof ChzzkApiError ? error.status || 400 : 500;
        return sendJson(res, status, { error: describeError(error) });
      }
    }

    // ─ 이벤트 로그
    if (path === '/api/events' && method === 'GET') {
      if (!options.eventLog) return sendJson(res, 200, { events: [], lastId: 0 });
      const url = new URL(
        path + (req.url?.split('?')[1] ? `?${req.url.split('?')[1]}` : ''),
        'http://x'
      );
      const since = Number(url.searchParams.get('since') ?? 0);
      return sendJson(res, 200, {
        events: options.eventLog.recent(120, Number.isFinite(since) ? since : 0),
        lastId: options.eventLog.lastId,
      });
    }

    // ─ 명령어
    if (path === '/api/commands' && method === 'POST') {
      const body = await readJson(req);
      // id 를 넘기지 않아야 스토어가 새 id 를 발급합니다.
      const parsed = customCommand.omit({ id: true }).safeParse(body);
      if (!parsed.success) return sendJson(res, 400, { error: formatIssues(parsed.error.issues) });

      const conflict = findNameConflict(parsed.data.name, parsed.data.aliases);
      if (conflict) return sendJson(res, 409, { error: conflict });

      return sendJson(res, 200, await store.upsertCommand(parsed.data));
    }

    const commandMatch = /^\/api\/commands\/([\w-]+)$/.exec(path);
    if (commandMatch) {
      const id = commandMatch[1]!;
      if (method === 'PUT') {
        const body = await readJson(req);
        const existing = store.snapshot().commands.find((c) => c.id === id);
        if (!existing) return sendJson(res, 404, { error: '명령어를 찾을 수 없습니다.' });

        const parsed = customCommand.safeParse({ ...existing, ...(body as object), id });
        if (!parsed.success)
          return sendJson(res, 400, { error: formatIssues(parsed.error.issues) });

        // 생성 때와 같은 검사를 여기서도 해야 합니다. 그러지 않으면 이름을
        // 이미 있는 명령으로 바꿔 저장할 수 있고, findCommand 는 먼저 찾은
        // 것만 돌려주므로 이 명령이 영영 호출되지 않습니다.
        const conflict = findNameConflict(parsed.data.name, parsed.data.aliases, id);
        if (conflict) return sendJson(res, 409, { error: conflict });

        return sendJson(res, 200, await store.upsertCommand(parsed.data));
      }
      if (method === 'DELETE') {
        const ok = await store.deleteCommand(id);
        return sendJson(res, ok ? 200 : 404, ok ? { ok: true } : { error: '없는 명령어입니다.' });
      }
    }

    // ─ 자동응답
    if (path === '/api/auto-responses' && method === 'POST') {
      const body = await readJson(req);
      const parsed = autoResponse.omit({ id: true }).safeParse(body);
      if (!parsed.success) return sendJson(res, 400, { error: formatIssues(parsed.error.issues) });
      if (!isValidPattern(parsed.data.pattern, parsed.data.mode)) {
        return sendJson(res, 400, { error: '정규식이 올바르지 않습니다.' });
      }
      return sendJson(res, 200, await store.upsertAutoResponse(parsed.data));
    }

    const autoMatch = /^\/api\/auto-responses\/([\w-]+)$/.exec(path);
    if (autoMatch) {
      const id = autoMatch[1]!;
      if (method === 'PUT') {
        const body = await readJson(req);
        const existing = store.snapshot().autoResponses.find((a) => a.id === id);
        if (!existing) return sendJson(res, 404, { error: '자동응답을 찾을 수 없습니다.' });

        const parsed = autoResponse.safeParse({ ...existing, ...(body as object), id });
        if (!parsed.success)
          return sendJson(res, 400, { error: formatIssues(parsed.error.issues) });
        if (!isValidPattern(parsed.data.pattern, parsed.data.mode)) {
          return sendJson(res, 400, { error: '정규식이 올바르지 않습니다.' });
        }
        return sendJson(res, 200, await store.upsertAutoResponse(parsed.data));
      }
      if (method === 'DELETE') {
        const ok = await store.deleteAutoResponse(id);
        return sendJson(res, ok ? 200 : 404, ok ? { ok: true } : { error: '없는 항목입니다.' });
      }
    }

    // ─ 금칙어
    if (path === '/api/banned-words' && method === 'POST') {
      const body = await readJson(req);
      const parsed = bannedWord.omit({ id: true }).safeParse(body);
      if (!parsed.success) return sendJson(res, 400, { error: formatIssues(parsed.error.issues) });
      if (!isValidPattern(parsed.data.pattern, parsed.data.mode)) {
        return sendJson(res, 400, { error: '정규식이 올바르지 않습니다.' });
      }
      return sendJson(res, 200, await store.upsertBannedWord(parsed.data));
    }

    const wordMatch = /^\/api\/banned-words\/([\w-]+)$/.exec(path);
    if (wordMatch) {
      const id = wordMatch[1]!;
      if (method === 'PUT') {
        const body = await readJson(req);
        const existing = store.snapshot().moderation.words.find((w) => w.id === id);
        if (!existing) return sendJson(res, 404, { error: '금칙어를 찾을 수 없습니다.' });

        const parsed = bannedWord.safeParse({ ...existing, ...(body as object), id });
        if (!parsed.success)
          return sendJson(res, 400, { error: formatIssues(parsed.error.issues) });
        if (!isValidPattern(parsed.data.pattern, parsed.data.mode)) {
          return sendJson(res, 400, { error: '정규식이 올바르지 않습니다.' });
        }
        return sendJson(res, 200, await store.upsertBannedWord(parsed.data));
      }
      if (method === 'DELETE') {
        const ok = await store.deleteBannedWord(id);
        return sendJson(res, ok ? 200 : 404, ok ? { ok: true } : { error: '없는 항목입니다.' });
      }
    }

    sendJson(res, 404, { error: `${method} ${path} 은(는) 없는 엔드포인트입니다.` });
  }

  // ─── 정적 파일 ─────────────────────────────────────────────────────────────

  async function serveStatic(res: ServerResponse, path: string): Promise<void> {
    const relative = path === '/' ? 'index.html' : path.slice(1);
    // 경로 탈출(../) 차단
    const target = resolve(publicDir, normalize(relative));
    // 구분자까지 포함해 비교해야 합니다. 단순 문자열 접두사면
    // `web/dist-backup` 처럼 이름이 같은 이웃 디렉터리로 새어 나갑니다.
    if (target !== publicDir && !target.startsWith(publicDir + sep)) {
      res.writeHead(403).end('forbidden');
      return;
    }

    try {
      const content = await readFile(target);
      res.writeHead(200, {
        'Content-Type': MIME[extname(target)] ?? 'application/octet-stream',
        // 해시가 붙은 에셋은 오래 캐시해도 안전하고, index.html 은 항상 새로 받아야 합니다.
        'Cache-Control': target.endsWith('index.html')
          ? 'no-cache'
          : 'public, max-age=31536000, immutable',
      });
      res.end(content);
      return;
    } catch {
      /* 아래에서 처리 */
    }

    // 빌드를 안 했으면 404 대신 무엇을 해야 하는지 알려줍니다.
    if (relative === 'index.html') {
      res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(NOT_BUILT_HTML);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('찾을 수 없습니다.');
  }

  return {
    listen: () =>
      new Promise<void>((resolveListen, rejectListen) => {
        // listen 실패를 잡지 않으면 'error' 이벤트가 프로세스를 통째로 죽입니다.
        // 대시보드를 못 띄웠다고 봇까지 멈출 이유는 없으므로 원인을 알려주고 넘깁니다.
        server.once('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'EADDRINUSE') {
            rejectListen(
              new Error(
                `포트 ${port} 가 이미 사용 중입니다. .env 의 DASHBOARD_PORT 를 바꾸거나 해당 프로세스를 종료하세요.`
              )
            );
            return;
          }
          rejectListen(error);
        });

        // 인증이 없으므로 외부에 노출하지 않습니다.
        server.listen(port, '127.0.0.1', () => {
          log.info(`대시보드: http://localhost:${port}`);
          resolveListen();
        });
      }),
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    // 설정 JSON 이 1MB 를 넘을 일은 없습니다.
    if (size > 1_000_000) throw new Error('요청 본문이 너무 큽니다.');
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

/** 치지직 오류를 프런트가 그대로 보여줄 수 있는 문장으로 바꿉니다. */
function describeError(error: unknown): string {
  if (error instanceof ChzzkApiError) {
    // "[400] GET /path — 스트리머가 아닙니다." 에서 뒷부분만 남깁니다.
    return error.message.split('—').pop()?.trim() ?? error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function formatIssues(issues: { path: (string | number)[]; message: string }[]): string {
  return issues.map((i) => `${i.path.join('.') || '값'}: ${i.message}`).join(', ');
}
