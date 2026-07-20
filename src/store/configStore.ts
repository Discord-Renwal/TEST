import { EventEmitter } from 'node:events';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { noopLogger, type Logger } from '../core/logger.js';
import {
  botConfig,
  starterConfig,
  type AutoResponse,
  type BannedWord,
  type BotConfig,
  type CustomCommand,
} from './schema.js';

/**
 * 설정을 JSON 파일 하나에 보관합니다.
 *
 * 데이터가 명령어 수십 개 규모라 DB를 붙일 이유가 없고, 네이티브 의존성 없이
 * 어디서나 돌아가는 편이 배포에 유리합니다. 대신 쓰기는 임시 파일 + rename 으로
 * 원자적으로 처리해, 저장 도중 죽어도 설정이 반쯤 쓰인 채 남지 않게 했습니다.
 */
export class ConfigStore extends EventEmitter {
  private readonly filePath: string;
  private readonly log: Logger;
  private config: BotConfig;
  private writeQueue: Promise<void> = Promise.resolve();

  private constructor(filePath: string, config: BotConfig, logger: Logger) {
    super();
    this.filePath = filePath;
    this.config = config;
    this.log = logger.child('config');
  }

  /** 파일을 읽어 스토어를 엽니다. 파일이 없으면 예시 설정으로 새로 만듭니다. */
  static async open(
    filePath = 'data/config.json',
    options: { logger?: Logger } = {}
  ): Promise<ConfigStore> {
    const path = resolve(filePath);
    const log = options.logger ?? noopLogger;

    let config: BotConfig;
    try {
      const raw = await readFile(path, 'utf8');
      const parsed = botConfig.safeParse(JSON.parse(raw));
      if (parsed.success) {
        config = parsed.data;
      } else {
        // 설정이 깨졌을 때 조용히 기본값으로 덮으면 사용자가 작업물을 잃습니다.
        // 무엇이 잘못됐는지 알리고 멈추는 편이 낫습니다.
        const detail = parsed.error.issues
          .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
          .join('\n');
        throw new Error(`설정 파일(${path})이 올바르지 않습니다.\n${detail}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      config = starterConfig();
      log.info(`설정 파일이 없어 예시 설정으로 새로 만듭니다: ${path}`);
      const store = new ConfigStore(path, config, log);
      await store.persist();
      return store;
    }

    return new ConfigStore(path, config, log);
  }

  get path(): string {
    return this.filePath;
  }

  /** 현재 설정의 깊은 복사본. 반환값을 고쳐도 스토어에는 영향이 없습니다. */
  snapshot(): BotConfig {
    return structuredClone(this.config);
  }

  /**
   * 설정을 통째로 교체합니다. 검증에 실패하면 아무것도 바꾸지 않고 throw 합니다.
   */
  async replace(next: unknown): Promise<BotConfig> {
    const parsed = botConfig.parse(next);
    this.config = parsed;
    await this.persist();
    this.emit('change', this.snapshot());
    return this.snapshot();
  }

  /** 일부만 수정합니다. */
  async update(mutate: (draft: BotConfig) => void): Promise<BotConfig> {
    const draft = structuredClone(this.config);
    mutate(draft);
    return this.replace(draft);
  }

  // ─── 명령어 ────────────────────────────────────────────────────────────────

  findCommand(nameOrAlias: string): CustomCommand | undefined {
    const key = nameOrAlias.toLowerCase();
    return this.config.commands.find(
      (c) => c.name.toLowerCase() === key || c.aliases.some((a) => a.toLowerCase() === key)
    );
  }

  async upsertCommand(input: Partial<CustomCommand> & { name: string }): Promise<CustomCommand> {
    const id = input.id ?? `cmd_${randomUUID().slice(0, 8)}`;
    let saved!: CustomCommand;

    await this.update((draft) => {
      const index = draft.commands.findIndex((c) => c.id === id);
      const base = index >= 0 ? draft.commands[index] : undefined;
      saved = { ...(base ?? {}), ...input, id } as CustomCommand;
      if (index >= 0) draft.commands[index] = saved;
      else draft.commands.push(saved);
    });

    return saved;
  }

  async deleteCommand(id: string): Promise<boolean> {
    let removed = false;
    await this.update((draft) => {
      const before = draft.commands.length;
      draft.commands = draft.commands.filter((c) => c.id !== id);
      removed = draft.commands.length < before;
    });
    return removed;
  }

  /** `!멤버 빅헤드,9구진` 처럼 채팅에서 목록을 갱신할 때 씁니다. */
  async setCommandItems(id: string, items: string[]): Promise<void> {
    await this.update((draft) => {
      const command = draft.commands.find((c) => c.id === id);
      if (command) command.items = items;
    });
  }

  async bumpCommandUsage(id: string, counterDelta = 0): Promise<number> {
    let count = 0;
    await this.update((draft) => {
      const command = draft.commands.find((c) => c.id === id);
      if (!command) return;
      command.usedCount += 1;
      if (counterDelta) command.count += counterDelta;
      count = command.count;
    });
    return count;
  }

  // ─── 자동응답 ──────────────────────────────────────────────────────────────

  async upsertAutoResponse(
    input: Partial<AutoResponse> & { pattern: string; response: string }
  ): Promise<AutoResponse> {
    const id = input.id ?? `ar_${randomUUID().slice(0, 8)}`;
    let saved!: AutoResponse;

    await this.update((draft) => {
      const index = draft.autoResponses.findIndex((a) => a.id === id);
      const base = index >= 0 ? draft.autoResponses[index] : undefined;
      saved = { ...(base ?? {}), ...input, id } as AutoResponse;
      if (index >= 0) draft.autoResponses[index] = saved;
      else draft.autoResponses.push(saved);
    });

    return saved;
  }

  async deleteAutoResponse(id: string): Promise<boolean> {
    let removed = false;
    await this.update((draft) => {
      const before = draft.autoResponses.length;
      draft.autoResponses = draft.autoResponses.filter((a) => a.id !== id);
      removed = draft.autoResponses.length < before;
    });
    return removed;
  }

  // ─── 금칙어 ────────────────────────────────────────────────────────────────

  async upsertBannedWord(input: Partial<BannedWord> & { pattern: string }): Promise<BannedWord> {
    const id = input.id ?? `bw_${randomUUID().slice(0, 8)}`;
    let saved!: BannedWord;

    await this.update((draft) => {
      const index = draft.moderation.words.findIndex((w) => w.id === id);
      const base = index >= 0 ? draft.moderation.words[index] : undefined;
      saved = { ...(base ?? {}), ...input, id } as BannedWord;
      if (index >= 0) draft.moderation.words[index] = saved;
      else draft.moderation.words.push(saved);
    });

    return saved;
  }

  async deleteBannedWord(id: string): Promise<boolean> {
    let removed = false;
    await this.update((draft) => {
      const before = draft.moderation.words.length;
      draft.moderation.words = draft.moderation.words.filter((w) => w.id !== id);
      removed = draft.moderation.words.length < before;
    });
    return removed;
  }

  async bumpBannedWordHit(id: string): Promise<void> {
    await this.update((draft) => {
      const word = draft.moderation.words.find((w) => w.id === id);
      if (word) word.hitCount += 1;
    });
  }

  // ─── 저장 ──────────────────────────────────────────────────────────────────

  /**
   * 쓰기를 직렬화합니다. 대시보드 저장과 채팅 명령이 동시에 들어와도
   * 뒤엉킨 내용이 파일에 남지 않습니다.
   */
  private persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      await writeFile(tmp, JSON.stringify(this.config, null, 2), 'utf8');
      await rename(tmp, this.filePath);
      this.log.debug('설정을 저장했습니다.');
    });
    return this.writeQueue;
  }
}
