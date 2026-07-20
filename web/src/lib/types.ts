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
  timerMessage,
  generalSettings,
  permissionSettings,
  moderationSettings,
  spamSettings,
  pointSettings,
  songSettings,
  gameSettings,
  notificationSettings,
  ROLE_LABELS,
} from '../../../src/store/schema';

export type {
  BotConfig,
  CustomCommand,
  AutoResponse,
  BannedWord,
  TimerMessage,
  CommandType,
  MatchMode,
  ModerationAction,
  SpamSettings,
  PointSettings,
  SongSettings,
  GameSettings,
  NotificationSettings,
  UserRoleCodeValue,
} from '../../../src/store/schema';

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

export interface UserRecord {
  channelId: string;
  nickname: string;
  points: number;
  chatCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
  attendanceStreak: number;
  lastAttendanceDate: string;
}

export interface SongRequest {
  id: string;
  title: string;
  requesterChannelId: string;
  requesterNickname: string;
  status: 'queued' | 'playing' | 'done' | 'skipped';
  requestedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  pointsSpent: number;
}

export interface SongsResponse {
  playing: SongRequest | null;
  pending: SongRequest[];
  history: SongRequest[];
}

export type LogKind =
  | 'chat'
  | 'command'
  | 'auto'
  | 'moderation'
  | 'donation'
  | 'subscription'
  | 'song'
  | 'system'
  | 'error';

export interface LogEntry {
  id: number;
  at: number;
  kind: LogKind;
  actor?: string;
  message: string;
  detail?: string;
}

export interface StatusResponse {
  account: { channelId: string; channelName: string } | null;
  stats: BotStats | null;
  configPath: string;
}
