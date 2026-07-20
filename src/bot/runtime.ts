import type { ChzzkClient } from '../client.js';
import type { ChatEvent, DonationEvent, SubscriptionEvent } from '../session/events.js';
import type { ConfigStore } from '../store/configStore.js';
import type { UserStore } from '../store/userStore.js';
import type { SongQueueStore } from '../store/songQueue.js';
import type { EventLog } from '../store/eventLog.js';
import type { BotConfig } from '../store/schema.js';
import { ChatSender } from './chatSender.js';
import { AutoResponder } from '../features/autoResponder.js';
import { CustomCommandEngine } from '../features/customCommands.js';
import { Moderator } from '../features/moderation.js';
import { SpamFilter } from '../features/spamFilter.js';
import { PointEngine, formatPoints } from '../features/points.js';
import { GameEngine, type GameResult } from '../features/games.js';
import { ChatterIndex } from '../features/chatterIndex.js';
import { AudienceIndex } from '../features/audienceIndex.js';
import { TimerScheduler } from '../features/timers.js';
import { ChannelContext, expandVariables, pickRandomVariant } from '../features/variables.js';
import { findBuiltin, BUILTIN_COMMANDS } from '../features/builtinCommands.js';
import { isAdmin, isIgnored } from '../features/permissions.js';
import type { Logger } from '../core/logger.js';
import { ChzzkApiError } from '../core/errors.js';

export interface BotStats {
  startedAt: number;
  messagesSeen: number;
  commandsRun: number;
  autoResponsesSent: number;
  moderationActions: number;
  spamBlocked: number;
  pointsAwarded: number;
  lastChatAt: number | null;
  uniqueChatters: number;
}

export interface RuntimeDeps {
  chzzk: ChzzkClient;
  config: ConfigStore;
  users: UserStore;
  songs: SongQueueStore;
  log: EventLog;
  botChannelId: string;
}

/**
 * 채팅 이벤트 하나를 처리하는 파이프라인.
 *
 * 순서가 곧 정책입니다:
 *   1. 무시 대상 / 봇 자신 걸러내기
 *   2. 스팸 · 금칙어 — **명령어보다 먼저**. 그렇지 않으면 금칙어를 명령 인자에
 *      실어 보내는 우회가 가능합니다.
 *   3. 포인트 적립 (제재당한 메시지에는 주지 않습니다)
 *   4. 명령어 (게임 → 내장 → 사용자 정의)
 *   5. 자동응답
 */
export class BotRuntime {
  private readonly commands: CustomCommandEngine;
  private readonly autoResponder = new AutoResponder();
  private readonly moderator = new Moderator();
  private readonly spamFilter = new SpamFilter();
  private readonly points: PointEngine;
  private readonly games: GameEngine;
  private readonly chatters = new ChatterIndex();
  private readonly audience: AudienceIndex;
  /**
   * 마지막으로 관측한 채팅 채널 ID.
   * 임시 제한 해제 API 가 이 값을 요구하는데, 대시보드에는 이 정보가 없어서
   * 지나가는 채팅 이벤트에서 주워 둡니다.
   */
  private lastChatChannel: string | undefined;
  private readonly channel: ChannelContext;
  private readonly sender: ChatSender;
  private readonly timers: TimerScheduler;
  private readonly log: Logger;

  /** 사람별 명령 실행 횟수 ($유저카운트) */
  private readonly userCommandCounts = new Map<string, number>();

  readonly stats: BotStats = {
    startedAt: Date.now(),
    messagesSeen: 0,
    commandsRun: 0,
    autoResponsesSent: 0,
    moderationActions: 0,
    spamBlocked: 0,
    pointsAwarded: 0,
    lastChatAt: null,
    uniqueChatters: 0,
  };

  constructor(private readonly deps: RuntimeDeps) {
    const { chzzk, config, users } = deps;

    this.commands = new CustomCommandEngine(config);
    this.points = new PointEngine(users);
    this.games = new GameEngine(users);
    this.channel = new ChannelContext(chzzk, 60_000, chzzk.logger);
    this.audience = new AudienceIndex(chzzk, deps.botChannelId, 10 * 60_000, chzzk.logger);
    this.log = chzzk.logger.child('runtime');

    this.sender = new ChatSender(chzzk.chat, {
      // 값이 아니라 함수를 넘겨, 대시보드에서 바꾼 간격이 재시작 없이 반영되게 합니다.
      intervalMs: () => this.deps.config.snapshot().general.sendIntervalMs,
      logger: chzzk.logger,
    });

    this.timers = new TimerScheduler(
      () => this.deps.config.snapshot().timers,
      (message) => this.sendOrThrow(this.expandForTimer(message)),
      { logger: chzzk.logger }
    );
  }

  start(): void {
    this.timers.start();
    void this.channel.refresh();
    void this.audience.refresh();
  }

  /** 임시 제한 해제에 필요합니다. 채팅이 한 번도 안 왔으면 undefined */
  get lastChatChannelId(): string | undefined {
    return this.lastChatChannel;
  }

  /** 구독자 전용 명령이 동작할 수 있는 상태인지 */
  get subscriberDataAvailable(): boolean {
    return this.audience.isSubscriberDataAvailable;
  }

  stop(): void {
    this.timers.stop();
  }

  /** 대시보드에서 타이머가 바뀌면 알려줍니다. */
  syncTimers(): void {
    this.timers.sync();
  }

  // ─── 채팅 ──────────────────────────────────────────────────────────────────

  async handleChat(event: ChatEvent): Promise<void> {
    const config = this.deps.config.snapshot();

    this.stats.messagesSeen += 1;
    this.stats.lastChatAt = Date.now();

    if (!config.general.enabled) return;
    if (event.senderChannelId === this.deps.botChannelId) return;
    if (isIgnored(event, config.permissions)) return;

    this.chatters.remember(event);
    this.timers.noteChat();
    this.lastChatChannel = event.chatChannelId;
    void this.audience.refresh();

    const nickname = event.profile?.nickname ?? '';
    const firstEver = this.deps.users.isFirstEver(event.senderChannelId);

    // 1) 스팸 필터
    const spam = this.spamFilter.inspect(event, config.moderation.spam);
    if (spam) {
      this.stats.spamBlocked += 1;
      await this.punish(event, {
        label: spam.label,
        tempBan: spam.escalateToTempBan && config.moderation.allowTempBan,
        warn:
          spam.violations === 1
            ? `${nickname}님, ${spam.label} 은(는) 자제해 주세요.`
            : `${nickname}님, ${spam.label} — ${spam.violations}회째입니다.`,
      });
      return;
    }

    // 2) 금칙어
    const verdict = this.moderator.inspect(event, config);
    if (verdict) {
      this.stats.moderationActions += 1;
      await this.deps.config.bumpBannedWordHit(verdict.word.id);
      await this.punish(event, {
        label: '금칙어',
        tempBan: verdict.tempBan,
        warn: verdict.warn,
      });
      return;
    }

    // 3) 포인트 적립
    const earned = this.points.onChat(event.senderChannelId, nickname, config.points);
    if (earned > 0) this.stats.pointsAwarded += earned;
    this.stats.uniqueChatters = this.deps.users.userCount;

    // 4) 첫 채팅 인사
    if (firstEver && config.notifications.greeting.enabled) {
      const greeting = config.notifications.greeting.firstTimeMessage;
      if (greeting.trim()) {
        await this.reply(this.expand(greeting, event, ''));
        this.deps.log.push('system', '첫 채팅 인사', { actor: nickname });
      }
    }

    const content = event.content?.trim() ?? '';
    const prefix = config.general.prefix;

    // 5) 명령어
    if (content.startsWith(prefix)) {
      const [rawName, ...args] = content.slice(prefix.length).trim().split(/\s+/);
      if (rawName) {
        const handled = await this.runCommand(event, rawName, args);
        if (handled) return;
      }
    }

    // 6) 자동응답
    const auto = this.autoResponder.respond(event, config);
    if (auto) {
      this.stats.autoResponsesSent += 1;
      await this.reply(this.expand(auto, event, ''));
      this.deps.log.push('auto', auto, { actor: nickname });
    }
  }

  private async runCommand(event: ChatEvent, name: string, args: string[]): Promise<boolean> {
    const config = this.deps.config.snapshot();
    const nickname = event.profile?.nickname ?? '';
    const admin = isAdmin(event, config.permissions);
    const rest = args.join(' ');
    const key = name.toLowerCase();

    // 도움말은 설정과 무관하게 항상 동작합니다.
    if (['도움말', '명령어', 'help'].includes(key)) {
      await this.reply(this.helpText(config.general.prefix, admin));
      this.stats.commandsRun += 1;
      return true;
    }

    // 미니게임
    const game = this.runGame(event, key, args[0], config);
    if (game !== undefined) {
      this.stats.commandsRun += 1;
      if (game) {
        await this.reply(game.message);
        this.deps.log.push('command', game.message, { actor: nickname });
      }
      return true;
    }

    // 내장 명령
    const builtin = findBuiltin(name);
    if (builtin) {
      if (builtin.adminOnly && !admin) return true; // 조용히 무시
      this.stats.commandsRun += 1;

      const reply = await builtin.run({
        event,
        config,
        args,
        rest,
        isAdmin: admin,
        chzzk: this.deps.chzzk,
        users: this.deps.users,
        songs: this.deps.songs,
        chatters: this.chatters,
        log: this.deps.log,
      });

      // 방송 설정을 바꾼 뒤에는 $방제/$게임 캐시를 비웁니다.
      if (['제목', 'title', '방제변경', '카테고리', 'category', 'game', '게임변경'].includes(key)) {
        this.channel.invalidate();
      }
      if (reply) {
        await this.reply(reply);
        this.deps.log.push('command', `${config.general.prefix}${name} → ${reply}`, {
          actor: nickname,
        });
      }
      return true;
    }

    // 사용자 정의 명령
    const outcome = await this.commands.execute(
      event,
      config,
      name,
      args,
      this.audience.isSubscriberDataAvailable
        ? (channelId) => this.audience.isSubscriber(channelId)
        : undefined
    );
    if (outcome.handled) {
      this.stats.commandsRun += 1;
      if (outcome.reply) {
        await this.reply(this.expand(outcome.reply, event, rest, name));
        this.deps.log.push('command', `${config.general.prefix}${name}`, { actor: nickname });
      }
      return true;
    }

    if (config.general.replyOnUnknownCommand && admin) {
      await this.reply(`"${name}" 명령을 찾을 수 없습니다.`);
      return true;
    }
    return false;
  }

  /** 게임 명령이면 결과(또는 null)를, 게임이 아니면 undefined 를 돌려줍니다. */
  private runGame(
    event: ChatEvent,
    key: string,
    bet: string | undefined,
    config: BotConfig
  ): GameResult | null | undefined {
    // 게임이 꺼져 있으면 이 이름들을 아예 잡지 않습니다.
    // 여기서 null(=처리됨) 을 돌려주면 같은 이름의 커스텀 명령이 영영 가려집니다.
    if (!config.games.enabled) return undefined;

    const nickname = event.profile?.nickname ?? '';
    const id = event.senderChannelId;

    if (['도박', 'gamble'].includes(key)) {
      return this.games.gamble(id, nickname, bet, config.games, config.points);
    }
    if (['주사위', 'dice'].includes(key)) {
      return this.games.dice(id, nickname, bet, config.games, config.points);
    }
    if (['슬롯', 'slot', 'slots'].includes(key)) {
      return this.games.slots(id, nickname, bet, config.games, config.points);
    }
    return undefined;
  }

  // ─── 후원 / 구독 ───────────────────────────────────────────────────────────

  async handleDonation(event: DonationEvent): Promise<void> {
    const config = this.deps.config.snapshot();
    const earned = this.points.onDonation(
      event.donatorChannelId,
      event.donatorNickname,
      event.payAmount,
      config.points
    );

    this.deps.log.push('donation', `${event.payAmount}원 후원`, {
      actor: event.donatorNickname,
      detail: event.donationText,
    });

    if (!config.general.enabled || !config.notifications.donationEnabled) return;

    const amount = Number(String(event.payAmount).replace(/[^\d]/g, '')) || 0;
    if (amount < config.notifications.donationMinAmount) return;

    const message = pickRandomVariant(config.notifications.donationMessage)
      .replaceAll('{user}', event.donatorNickname)
      .replaceAll('$닉네임', event.donatorNickname)
      .replaceAll('{amount}', amount.toLocaleString('ko-KR'))
      .replaceAll('$금액', amount.toLocaleString('ko-KR'))
      .replaceAll('{message}', event.donationText ?? '')
      .replaceAll('{points}', formatPoints(earned));

    await this.reply(message);
  }

  async handleSubscription(event: SubscriptionEvent): Promise<void> {
    const config = this.deps.config.snapshot();

    // 구독자 전용 명령이 곧바로 통하도록, 목록 갱신을 기다리지 않고 반영합니다.
    this.audience.noteSubscription({
      channelId: event.subscriberChannelId,
      nickname: event.subscriberNickname,
      month: event.month,
      tierNo: event.tierNo,
    });

    this.points.onSubscription(
      event.subscriberChannelId,
      event.subscriberNickname,
      event.month,
      config.points
    );

    this.deps.log.push('subscription', `${event.month}개월 구독 (티어${event.tierNo})`, {
      actor: event.subscriberNickname,
    });

    if (!config.general.enabled || !config.notifications.subscriptionEnabled) return;

    const message = pickRandomVariant(config.notifications.subscriptionMessage)
      .replaceAll('{user}', event.subscriberNickname)
      .replaceAll('$닉네임', event.subscriberNickname)
      .replaceAll('{month}', String(event.month))
      .replaceAll('$개월', String(event.month))
      .replaceAll('{tier}', String(event.tierNo));

    await this.reply(message);
  }

  // ─── 공통 ──────────────────────────────────────────────────────────────────

  /** 제재 실행. 숨기기 → (필요시) 임시제한 → 경고 순서. */
  private async punish(
    event: ChatEvent,
    action: { label: string; tempBan: boolean; warn: string | null }
  ): Promise<void> {
    try {
      await this.deps.chzzk.chat.blindMessage({
        chatChannelId: event.chatChannelId,
        messageTime: event.messageTime,
        senderChannelId: event.senderChannelId,
      });
    } catch (error) {
      // 스트리머 계정이 아니면 400 이 납니다. 봇을 죽이지 않고 남깁니다.
      this.log.warn('메시지 숨기기에 실패했습니다.', error);
    }

    if (action.tempBan) {
      try {
        await this.deps.chzzk.restrictions.temporaryRestrict({
          targetChannelId: event.senderChannelId,
          chatChannelId: event.chatChannelId,
        });
      } catch (error) {
        this.log.warn('임시 제한에 실패했습니다.', error);
      }
    }

    this.deps.log.push('moderation', `${action.label} 차단${action.tempBan ? ' + 임시제한' : ''}`, {
      actor: event.profile?.nickname,
      detail: event.content,
    });

    if (action.warn) await this.reply(action.warn);
  }

  /** 랜덤 응답을 고른 뒤 변수를 채웁니다. */
  private expand(template: string, event: ChatEvent, query: string, commandName = ''): string {
    const picked = pickRandomVariant(template);

    const userKey = `${commandName}:${event.senderChannelId}`;
    const userCount = (this.userCommandCounts.get(userKey) ?? 0) + 1;
    if (commandName) this.userCommandCounts.set(userKey, userCount);

    return expandVariables(picked, {
      event,
      query,
      commandCount: this.stats.commandsRun,
      userCount,
      channel: this.channel,
      users: this.deps.users,
      botStartedAt: this.stats.startedAt,
    });
  }

  /** 주기 메시지에는 호출자가 없어 방송 관련 변수만 채웁니다. */
  private expandForTimer(template: string): string {
    return pickRandomVariant(template)
      .replace(/\$방제|\{방제\}|\$title/g, this.channel.liveTitle)
      .replace(/\$게임|\{게임\}|\$카테고리/g, this.channel.liveCategory);
  }

  private helpText(prefix: string, admin: boolean): string {
    const config = this.deps.config.snapshot();
    const custom = config.commands.filter((c) => c.enabled).map((c) => `${prefix}${c.name}`);
    const builtins = BUILTIN_COMMANDS.filter((c) => admin || !c.adminOnly)
      .map((c) => `${prefix}${c.names[0]}`)
      .slice(0, 8);

    const all = [...custom, ...builtins];
    return all.length > 0 ? `사용 가능: ${all.join(' ')}` : '등록된 명령어가 없습니다.';
  }

  /**
   * 채팅 응답. 실패해도 이벤트 처리를 계속하기 위해 오류를 흡수합니다.
   *
   * 실패를 알아야 하는 호출자(주기 메시지 등)는 `sendOrThrow` 를 쓰세요.
   * 예전에는 이쪽만 있어서, 전송이 400 으로 실패했는데도 스케줄러가 성공으로 보고
   * "주기 메시지를 보냈습니다" 라는 거짓 로그를 남겼습니다.
   */
  private async reply(message: string): Promise<void> {
    try {
      await this.sendOrThrow(message);
    } catch (error) {
      this.log.error('응답 전송에 실패했습니다.', error);
      this.deps.log.push('error', '메시지 전송 실패', { detail: describeError(error) });
    }
  }

  /** 실패를 그대로 던집니다. */
  private async sendOrThrow(message: string): Promise<void> {
    if (!message.trim()) return;
    await this.sender.send(message);
  }
}

/** 로그에 남길 짧은 사유 */
function describeError(error: unknown): string {
  if (error instanceof ChzzkApiError)
    return error.message.split('—').pop()?.trim() ?? error.message;
  return error instanceof Error ? error.message : String(error);
}
