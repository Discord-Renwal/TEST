/**
 * 서버와 **같은 zod 스키마**를 그대로 씁니다.
 *
 * 폼 검증 규칙(문자 수 제한, 허용값, 범위)이 서버와 어긋날 수 없다는 게 핵심입니다.
 * 스키마를 고치면 프런트 타입과 폼 검증이 동시에 따라옵니다.
 */
export {
  botConfig,
  customCommand,
  autoResponse,
  bannedWord,
  generalSettings,
  permissionSettings,
  moderationSettings,
  ROLE_LABELS,
} from '../../../src/store/schema';

export type {
  BotConfig,
  CustomCommand,
  AutoResponse,
  BannedWord,
  CommandType,
  MatchMode,
  ModerationAction,
  UserRoleCodeValue,
} from '../../../src/store/schema';

export interface BotStats {
  startedAt: number;
  messagesSeen: number;
  commandsRun: number;
  autoResponsesSent: number;
  moderationActions: number;
  lastChatAt: number | null;
}

export interface StatusResponse {
  account: { channelId: string; channelName: string } | null;
  stats: BotStats | null;
  configPath: string;
}
