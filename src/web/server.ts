import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import type { ConfigStore } from '../store/configStore.js';
import type { BotRuntime } from '../bot/runtime.js';
import type { Logger } from '../core/logger.js';
import { autoResponse, bannedWord, botConfig, customCommand } from '../store/schema.js';
import { isValidPattern } from '../features/matcher.js';

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
  runtime?: BotRuntime | undefined;
  logger: Logger;
  port?: number;
  /** 정적 파일 경로. 기본은 저장소의 src/web/public */
  publicDir?: string;
  /** 봇 계정 정보 — 상태 화면에 보여줍니다. */
  account?: { channelId: string; channelName: string } | undefined;
}

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

    // 부분 설정 저장 (general / permissions / moderation 탭)
    const sectionMatch = /^\/api\/config\/(general|permissions|moderation)$/.exec(path);
    if (sectionMatch && method === 'PUT') {
      const section = sectionMatch[1] as 'general' | 'permissions' | 'moderation';
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

    // ─ 명령어
    if (path === '/api/commands' && method === 'POST') {
      const body = await readJson(req);
      // id 를 넘기지 않아야 스토어가 새 id 를 발급합니다.
      const parsed = customCommand.omit({ id: true }).safeParse(body);
      if (!parsed.success) return sendJson(res, 400, { error: formatIssues(parsed.error.issues) });

      if (store.findCommand(parsed.data.name)) {
        return sendJson(res, 409, { error: `"${parsed.data.name}" 명령이 이미 있습니다.` });
      }
      // 별칭이 기존 명령과 겹쳐도 영영 호출되지 않는 명령이 생깁니다.
      for (const alias of parsed.data.aliases) {
        if (store.findCommand(alias)) {
          return sendJson(res, 409, { error: `별칭 "${alias}" 이(가) 이미 사용 중입니다.` });
        }
      }

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
    if (!target.startsWith(publicDir)) {
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

function formatIssues(issues: { path: (string | number)[]; message: string }[]): string {
  return issues.map((i) => `${i.path.join('.') || '값'}: ${i.message}`).join(', ');
}
