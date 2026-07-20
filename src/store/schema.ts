import { z } from 'zod';

/**
 * 봇 설정의 단일 진실 공급원(single source of truth).
 *
 * 대시보드가 보내는 값과 디스크에 저장된 값을 같은 스키마로 검증하므로,
 * 손으로 고친 설정 파일이 깨져 있어도 부팅 시점에 잡힙니다.
 */

export const userRoleCode = z.enum([
  'streamer',
  'streaming_channel_manager',
  'streaming_chat_manager',
  'common_user',
]);
export type UserRoleCodeValue = z.infer<typeof userRoleCode>;

/** 역할 표시명 — 대시보드와 채팅 안내 문구에서 함께 씁니다. */
export const ROLE_LABELS: Record<UserRoleCodeValue, string> = {
  streamer: '스트리머',
  streaming_channel_manager: '채널 매니저',
  streaming_chat_manager: '채팅 매니저',
  common_user: '일반 시청자',
};

// ─── 커스텀 명령어 ─────────────────────────────────────────────────────────────

/**
 * - `text`   고정 문구를 돌려줍니다. (예: !디스코드 → 초대 링크)
 * - `list`   목록을 기억했다가 보여줍니다. (예: !멤버 빅헤드,9구진 → 저장 / !멤버 → 조회)
 * - `counter` 호출할 때마다 1씩 증가한 숫자를 보여줍니다. (예: !데스)
 */
export const commandType = z.enum(['text', 'list', 'counter']);
export type CommandType = z.infer<typeof commandType>;

export const customCommand = z.object({
  id: z.string(),
  /** 접두사를 뺀 이름. 예: "멤버" */
  name: z.string().min(1).max(30),
  aliases: z.array(z.string().min(1).max(30)).default([]),
  type: commandType.default('text'),

  /**
   * 응답 템플릿. 사용 가능한 치환자:
   *   {user} 호출자 닉네임 · {value} 저장된 값 · {count} 카운터 값 · {n} 항목 개수
   */
  response: z.string().max(300).default(''),

  /** list 타입이 기억하는 항목들 */
  items: z.array(z.string()).default([]),
  /** counter 타입의 현재 값 */
  count: z.number().int().min(0).default(0),

  /** 명령을 사용(조회)할 수 있는 역할 */
  useRoles: z
    .array(userRoleCode)
    .default(['streamer', 'streaming_channel_manager', 'streaming_chat_manager', 'common_user']),
  /** 값을 수정할 수 있는 역할 (list/counter 에서만 의미 있음) */
  editRoles: z.array(userRoleCode).default(['streamer', 'streaming_channel_manager']),

  /** 같은 사람이 다시 쓰기까지 기다려야 하는 시간(초) */
  cooldownSec: z.number().int().min(0).max(3600).default(3),
  enabled: z.boolean().default(true),

  /** 통계 */
  usedCount: z.number().int().min(0).default(0),
});
export type CustomCommand = z.infer<typeof customCommand>;

// ─── 채팅 자동응답 ─────────────────────────────────────────────────────────────

/**
 * - `contains` 메시지에 포함되면
 * - `equals`   메시지 전체가 일치하면
 * - `startsWith` 로 시작하면
 * - `regex`    정규식에 걸리면
 */
export const matchMode = z.enum(['contains', 'equals', 'startsWith', 'regex']);
export type MatchMode = z.infer<typeof matchMode>;

export const autoResponse = z.object({
  id: z.string(),
  /** 대시보드에서 구분하기 위한 이름 */
  label: z.string().max(50).default(''),
  pattern: z.string().min(1).max(200),
  mode: matchMode.default('contains'),
  caseSensitive: z.boolean().default(false),
  response: z.string().min(1).max(300),
  /** 채널 전체 공통 쿨다운(초). 같은 문구가 도배되는 걸 막습니다. */
  cooldownSec: z.number().int().min(0).max(3600).default(10),
  /** 0~100. 100 이면 항상 응답합니다. */
  chancePercent: z.number().int().min(1).max(100).default(100),
  enabled: z.boolean().default(true),
});
export type AutoResponse = z.infer<typeof autoResponse>;

// ─── 금칙어 ───────────────────────────────────────────────────────────────────

/**
 * - `blind`             메시지 숨기기만
 * - `blindAndWarn`      숨기고 채팅으로 경고
 * - `blindAndTempBan`   숨기고 임시 제한
 */
export const moderationAction = z.enum(['blind', 'blindAndWarn', 'blindAndTempBan']);
export type ModerationAction = z.infer<typeof moderationAction>;

export const bannedWord = z.object({
  id: z.string(),
  pattern: z.string().min(1).max(200),
  mode: matchMode.default('contains'),
  caseSensitive: z.boolean().default(false),
  action: moderationAction.default('blindAndWarn'),
  /** 경고 문구. 비우면 기본 문구를 씁니다. */
  warnMessage: z.string().max(200).default(''),
  enabled: z.boolean().default(true),
  /** 몇 번 걸렸는지 */
  hitCount: z.number().int().min(0).default(0),
});
export type BannedWord = z.infer<typeof bannedWord>;

export const moderationSettings = z.object({
  enabled: z.boolean().default(true),
  /** 이 역할들은 금칙어 검사를 건너뜁니다. */
  exemptRoles: z
    .array(userRoleCode)
    .default(['streamer', 'streaming_channel_manager', 'streaming_chat_manager']),
  /** 임시 제한 조치를 실제로 실행할지. 꺼두면 숨기기까지만 합니다. */
  allowTempBan: z.boolean().default(false),
  words: z.array(bannedWord).default([]),
});
export type ModerationSettings = z.infer<typeof moderationSettings>;

// ─── 봇 권한 ──────────────────────────────────────────────────────────────────

export const permissionSettings = z.object({
  /** 대시보드 없이 채팅에서 명령어를 관리할 수 있는 역할 */
  manageCommands: z.array(userRoleCode).default(['streamer', 'streaming_channel_manager']),
  /** 역할과 무관하게 관리자로 취급할 채널 ID 목록 */
  extraAdminChannelIds: z.array(z.string()).default([]),
  /** 봇이 아예 무시할 채널 ID (다른 봇 등) */
  ignoredChannelIds: z.array(z.string()).default([]),
});
export type PermissionSettings = z.infer<typeof permissionSettings>;

// ─── 전체 설정 ────────────────────────────────────────────────────────────────

export const generalSettings = z.object({
  /** 봇 전체 on/off. 끄면 어떤 응답도 보내지 않습니다. */
  enabled: z.boolean().default(true),
  prefix: z.string().min(1).max(5).default('!'),
  /** 메시지 사이 최소 간격(ms). 429 를 피하기 위한 값. */
  sendIntervalMs: z.number().int().min(300).max(10_000).default(1200),
  /** 알 수 없는 명령어에 "그런 명령 없습니다" 라고 답할지 */
  replyOnUnknownCommand: z.boolean().default(false),
});
export type GeneralSettings = z.infer<typeof generalSettings>;

export const botConfig = z.object({
  version: z.literal(1).default(1),
  general: generalSettings.default({}),
  permissions: permissionSettings.default({}),
  moderation: moderationSettings.default({}),
  commands: z.array(customCommand).default([]),
  autoResponses: z.array(autoResponse).default([]),
});
export type BotConfig = z.infer<typeof botConfig>;

/** 빈 설정에서 시작할 때 쓰는 기본값 */
export function defaultConfig(): BotConfig {
  return botConfig.parse({});
}

/**
 * 처음 실행하는 사람이 바로 감을 잡도록 넣어두는 예시 설정.
 * 요청하신 `!멤버` 명령이 여기에 들어 있습니다.
 */
export function starterConfig(): BotConfig {
  return botConfig.parse({
    commands: [
      {
        id: 'cmd_member',
        name: '멤버',
        aliases: ['member', '팀'],
        type: 'list',
        response: '오늘의 멤버 ({n}명): {value}',
        items: [],
        // 스트리머와 매니저만 목록을 바꿀 수 있고, 조회는 누구나 가능합니다.
        editRoles: ['streamer', 'streaming_channel_manager'],
        cooldownSec: 5,
      },
      {
        id: 'cmd_discord',
        name: '디스코드',
        aliases: ['discord'],
        type: 'text',
        response: '디스코드 주소는 여기입니다 → (주소를 입력하세요)',
        cooldownSec: 10,
      },
    ],
    autoResponses: [
      {
        id: 'ar_hello',
        label: '인사 받아주기',
        pattern: '안녕',
        mode: 'contains',
        response: '{user}님 안녕하세요! 반갑습니다 :)',
        cooldownSec: 30,
      },
    ],
  });
}
