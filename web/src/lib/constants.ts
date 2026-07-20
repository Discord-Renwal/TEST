import type { CommandType, MatchMode, ModerationAction, UserRoleCodeValue } from './types';

export const ROLES: readonly (readonly [UserRoleCodeValue, string])[] = [
  ['streamer', '스트리머'],
  ['streaming_channel_manager', '채널 매니저'],
  ['streaming_chat_manager', '채팅 매니저'],
  ['common_user', '일반 시청자'],
];

export const MATCH_MODES: readonly (readonly [MatchMode, string])[] = [
  ['contains', '포함하면'],
  ['equals', '완전히 같으면'],
  ['startsWith', '으로 시작하면'],
  ['regex', '정규식'],
];

export const COMMAND_TYPES: readonly (readonly [CommandType, string])[] = [
  ['text', '고정 문구'],
  ['list', '목록형'],
  ['counter', '카운터'],
];

export const COMMAND_TYPE_HINTS: Record<CommandType, string> = {
  text: '정해진 문구를 그대로 답합니다.',
  list: '채팅에서 값을 등록해 두고 누구나 꺼내 볼 수 있습니다.',
  counter: '부를 때마다 1씩 늘어나는 숫자를 보여줍니다.',
};

export const MODERATION_ACTIONS: readonly (readonly [ModerationAction, string])[] = [
  ['blind', '메시지 숨기기'],
  ['blindAndWarn', '숨기고 경고'],
  ['blindAndTempBan', '숨기고 임시제한'],
];

/** 응답 문구에 넣을 수 있는 치환자 안내 */
export const PLACEHOLDERS = [
  ['{user}', '호출한 사람 닉네임'],
  ['{value}', '저장된 값'],
  ['{n}', '항목 개수'],
  ['{count}', '카운터 값'],
] as const;
