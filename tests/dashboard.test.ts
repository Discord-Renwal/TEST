import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigStore } from '../src/store/configStore.js';
import { createDashboard } from '../src/web/server.js';
import { noopLogger } from '../src/core/logger.js';

let dir: string;
let store: ConfigStore;
let dashboard: ReturnType<typeof createDashboard>;
let base: string;

// 테스트가 병렬로 돌아도 포트가 겹치지 않게 매번 다른 포트를 씁니다.
let nextPort = 47_100;

async function req(path: string, method = 'GET', body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'chzzk-web-'));
  store = await ConfigStore.open(join(dir, 'config.json'), { logger: noopLogger });

  const port = nextPort++;
  base = `http://127.0.0.1:${port}/api`;
  dashboard = createDashboard({ store, logger: noopLogger, port });
  await dashboard.listen();
});

afterEach(async () => {
  await dashboard.close();
  await rm(dir, { recursive: true, force: true });
});

describe('명령어 API', () => {
  it('생성한 항목마다 서로 다른 id 를 발급한다', async () => {
    // 회귀 테스트: 한때 모든 신규 항목이 id "tmp" 를 받아 서로를 덮어썼습니다.
    const first = await req('/commands', 'POST', { name: '공지사항', type: 'text' });
    const second = await req('/commands', 'POST', { name: '일정', type: 'text' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.id).not.toBe(second.body.id);
    expect(first.body.id).not.toBe('tmp');

    const config = store.snapshot();
    expect(config.commands.map((c) => c.name)).toContain('공지사항');
    expect(config.commands.map((c) => c.name)).toContain('일정');
  });

  it('이름이 겹치면 409 로 거부한다', async () => {
    const res = await req('/commands', 'POST', { name: '멤버' });
    expect(res.status).toBe(409);
    expect(String(res.body.error)).toContain('이미 다른 명령이');
  });

  it('기존 명령의 별칭과 겹쳐도 거부한다', async () => {
    // 예시 설정의 !멤버 가 "팀" 을 별칭으로 갖고 있습니다.
    const res = await req('/commands', 'POST', { name: '팀' });
    expect(res.status).toBe(409);
  });

  it('이름이 없으면 400', async () => {
    expect((await req('/commands', 'POST', { type: 'text' })).status).toBe(400);
  });

  it('한글 이름과 응답이 그대로 저장된다', async () => {
    const created = await req('/commands', 'POST', {
      name: '금일멤버',
      type: 'list',
      response: '오늘 함께하는 분들: {value}',
    });
    expect(created.body.name).toBe('금일멤버');

    const found = store.findCommand('금일멤버');
    expect(found?.response).toBe('오늘 함께하는 분들: {value}');
  });

  it('수정과 삭제가 동작한다', async () => {
    const created = await req('/commands', 'POST', { name: '임시', type: 'text' });
    const id = created.body.id as string;

    const updated = await req(`/commands/${id}`, 'PUT', { response: '바뀐 응답' });
    expect(updated.body.response).toBe('바뀐 응답');
    // 수정 시 다른 필드가 초기화되면 안 됩니다.
    expect(updated.body.name).toBe('임시');

    expect((await req(`/commands/${id}`, 'DELETE')).status).toBe(200);
    expect(store.findCommand('임시')).toBeUndefined();
  });

  it('내장 명령과 겹치는 이름은 409 로 거부한다', async () => {
    // 저장은 성공했는데 내장이 먼저 잡아 영영 실행되지 않는 상황을 막습니다.
    for (const name of ['시간', '포인트', '팔로워']) {
      const res = await req('/commands', 'POST', { name });
      expect(res.status).toBe(409);
      expect(String(res.body.error)).toContain('내장 명령');
    }
  });

  it('수정할 때도 이름 충돌을 막는다', async () => {
    const created = await req('/commands', 'POST', { name: '임시이름' });
    const id = created.body.id as string;

    // 이미 있는 !멤버 로 이름을 바꾸려는 시도
    const renamed = await req(`/commands/${id}`, 'PUT', { name: '멤버' });
    expect(renamed.status).toBe(409);

    // 내장 명령 이름으로 바꾸는 것도 막습니다.
    expect((await req(`/commands/${id}`, 'PUT', { name: '랭킹' })).status).toBe(409);

    // 자기 이름 그대로 저장하는 건 통과해야 합니다.
    expect((await req(`/commands/${id}`, 'PUT', { response: '수정됨' })).status).toBe(200);
  });

  it('없는 id 수정은 404', async () => {
    expect((await req('/commands/cmd_없음', 'PUT', { response: 'x' })).status).toBe(404);
  });
});

describe('자동응답 / 금칙어 API', () => {
  it('각각 고유한 id 를 받는다', async () => {
    const a = await req('/auto-responses', 'POST', { pattern: '하이', response: '안녕!' });
    const b = await req('/auto-responses', 'POST', { pattern: '바이', response: '잘 가!' });
    expect(a.body.id).not.toBe(b.body.id);

    const w1 = await req('/banned-words', 'POST', { pattern: '욕설1' });
    const w2 = await req('/banned-words', 'POST', { pattern: '욕설2' });
    expect(w1.body.id).not.toBe(w2.body.id);
    expect(store.snapshot().moderation.words).toHaveLength(2);
  });

  it('잘못된 정규식은 400 으로 막는다', async () => {
    const res = await req('/auto-responses', 'POST', {
      pattern: '[',
      mode: 'regex',
      response: 'x',
    });
    expect(res.status).toBe(400);
  });
});

describe('설정 저장', () => {
  it('허용 범위를 벗어난 값은 400', async () => {
    const res = await req('/config/general', 'PUT', { sendIntervalMs: 10 });
    expect(res.status).toBe(400);
    expect(store.snapshot().general.sendIntervalMs).toBe(2000);
  });

  it('moderation 저장이 금칙어 목록을 지우지 않는다', async () => {
    await req('/banned-words', 'POST', { pattern: '지켜져야함' });
    await req('/config/moderation', 'PUT', { enabled: false, allowTempBan: true });

    const config = store.snapshot();
    expect(config.moderation.enabled).toBe(false);
    expect(config.moderation.words).toHaveLength(1);
  });

  it('일부만 보내도 나머지 설정이 유지된다', async () => {
    await req('/config/general', 'PUT', { prefix: '?' });
    const config = store.snapshot();
    expect(config.general.prefix).toBe('?');
    expect(config.general.sendIntervalMs).toBe(2000);
  });
});

describe('정적 파일', () => {
  it('경로 탈출을 막는다', async () => {
    const res = await fetch(`${base.replace('/api', '')}/../../.env`);
    expect([403, 404]).toContain(res.status);
  });
});

describe('명령어 이름 충돌', () => {
  it('게임 명령 이름도 거부한다', async () => {
    // 게임(!도박 !주사위 !슬롯)은 BUILTIN_COMMANDS 가 아니라 런타임에서
    // 따로 처리해서, 충돌 검사에서 빠져 있었다. 저장은 되는데 실행되지
    // 않는 명령이 만들어졌다.
    for (const name of ['슬롯', '도박', '주사위', 'slots']) {
      const res = await req('/commands', 'POST', { name });
      expect(res.status, `${name} 이(가) 허용되면 안 됩니다`).toBe(409);
    }
  });

  it('겹치지 않는 이름은 통과한다', async () => {
    expect((await req('/commands', 'POST', { name: '오늘일정' })).status).toBe(200);
  });
});
