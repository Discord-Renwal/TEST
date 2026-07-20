import type { ChzzkClient } from '../client.js';
import type { ChatEvent } from '../session/events.js';
import type { ConfigStore } from '../store/configStore.js';
import { ChatSender } from './chatSender.js';
import { AutoResponder } from '../features/autoResponder.js';
import { CustomCommandEngine, visibleCommandNames } from '../features/customCommands.js';
import { Moderator } from '../features/moderation.js';
import { isAdmin, isIgnored } from '../features/permissions.js';
import type { Logger } from '../core/logger.js';

export interface BotStats {
  startedAt: number;
  messagesSeen: number;
  commandsRun: number;
  autoResponsesSent: number;
  moderationActions: number;
  lastChatAt: number | null;
}

/**
 * 채팅 이벤트 하나를 처리하는 파이프라인.
 *
 * 순서가 중요합니다: 금칙어 검사가 명령어보다 먼저입니다. 그렇지 않으면
 * 금칙어를 명령어 인자에 실어 보내는 우회가 가능해집니다.
 */
export class BotRuntime {
  private readonly commands: CustomCommandEngine;
  private readonly autoResponder = new AutoResponder();
  private readonly moderator = new Moderator();
  private readonly sender: ChatSender;
  private readonly log: Logger;

  readonly stats: BotStats = {
    startedAt: Date.now(),
    messagesSeen: 0,
    commandsRun: 0,
    autoResponsesSent: 0,
    moderationActions: 0,
    lastChatAt: null,
  };

  constructor(
    private readonly chzzk: ChzzkClient,
    private readonly store: ConfigStore,
    private readonly botChannelId: string
  ) {
    this.commands = new CustomCommandEngine(store);
    this.log = chzzk.logger.child('runtime');
    this.sender = new ChatSender(chzzk.chat, {
      intervalMs: store.snapshot().general.sendIntervalMs,
      logger: chzzk.logger,
    });
  }

  async handleChat(event: ChatEvent): Promise<void> {
    const config = this.store.snapshot();

    this.stats.messagesSeen += 1;
    this.stats.lastChatAt = Date.now();

    if (!config.general.enabled) return;
    // 봇이 자기 메시지에 반응해 무한 루프를 도는 것을 막습니다.
    if (event.senderChannelId === this.botChannelId) return;
    if (isIgnored(event, config.permissions)) return;

    // 1) 금칙어 — 명령어 처리보다 먼저
    const verdict = this.moderator.inspect(event, config);
    if (verdict) {
      await this.enforce(event, verdict);
      return;
    }

    const content = event.content?.trim() ?? '';
    const prefix = config.general.prefix;

    // 2) 명령어
    if (content.startsWith(prefix)) {
      const [rawName, ...args] = content.slice(prefix.length).trim().split(/\s+/);
      if (rawName) {
        // 도움말은 설정에 없어도 항상 동작하는 내장 명령입니다.
        if (['도움말', '명령어', 'help'].includes(rawName.toLowerCase())) {
          const names = visibleCommandNames(config, event, prefix);
          await this.reply(
            names.length > 0 ? `사용 가능한 명령: ${names.join(', ')}` : '등록된 명령어가 없습니다.'
          );
          return;
        }

        const outcome = await this.commands.execute(event, config, rawName, args);
        if (outcome.handled) {
          this.stats.commandsRun += 1;
          if (outcome.reply) await this.reply(outcome.reply);
          return;
        }

        if (config.general.replyOnUnknownCommand && isAdmin(event, config.permissions)) {
          await this.reply(`"${rawName}" 명령을 찾을 수 없습니다.`);
          return;
        }
        return;
      }
    }

    // 3) 자동응답
    const auto = this.autoResponder.respond(event, config);
    if (auto) {
      this.stats.autoResponsesSent += 1;
      await this.reply(auto);
    }
  }

  /** 금칙어 판정에 따라 실제 제재를 실행합니다. */
  private async enforce(
    event: ChatEvent,
    verdict: NonNullable<ReturnType<Moderator['inspect']>>
  ): Promise<void> {
    this.stats.moderationActions += 1;
    await this.store.bumpBannedWordHit(verdict.word.id);

    if (verdict.blind) {
      try {
        await this.chzzk.chat.blindMessage({
          chatChannelId: event.chatChannelId,
          messageTime: event.messageTime,
          senderChannelId: event.senderChannelId,
        });
      } catch (error) {
        // 스트리머 계정이 아니면 400 이 납니다. 봇을 죽이지 않고 남깁니다.
        this.log.warn('메시지 숨기기에 실패했습니다.', error);
      }
    }

    if (verdict.tempBan) {
      try {
        await this.chzzk.restrictions.temporaryRestrict({
          targetChannelId: event.senderChannelId,
          chatChannelId: event.chatChannelId,
        });
      } catch (error) {
        this.log.warn('임시 제한에 실패했습니다.', error);
      }
    }

    if (verdict.warn) await this.reply(verdict.warn);
  }

  private async reply(message: string): Promise<void> {
    try {
      await this.sender.send(message);
    } catch (error) {
      this.log.error('응답 전송에 실패했습니다.', error);
    }
  }
}
