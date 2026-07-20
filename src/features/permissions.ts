import type { ChatEvent } from '../session/events.js';
import type { PermissionSettings, UserRoleCodeValue } from '../store/schema.js';

/** 치지직이 보내주는 역할 코드가 스키마의 값 중 하나인지 확인합니다. */
export function normalizeRole(role: string): UserRoleCodeValue {
  switch (role) {
    case 'streamer':
    case 'streaming_channel_manager':
    case 'streaming_chat_manager':
      return role;
    default:
      return 'common_user';
  }
}

/**
 * 관리자 판정.
 *
 * 역할이 스트리머/매니저이거나, 설정에서 채널 ID 를 직접 관리자로 등록한 경우입니다.
 * ID 직접 등록은 매니저 권한을 주지 않고 봇만 맡기고 싶을 때 씁니다.
 */
export function isAdmin(event: ChatEvent, permissions: PermissionSettings): boolean {
  if (permissions.extraAdminChannelIds.includes(event.senderChannelId)) return true;
  return permissions.manageCommands.includes(normalizeRole(event.userRoleCode));
}

/** 봇이 이 사람의 메시지를 아예 무시해야 하는지 */
export function isIgnored(event: ChatEvent, permissions: PermissionSettings): boolean {
  return permissions.ignoredChannelIds.includes(event.senderChannelId);
}

/** 역할 기반 허용 여부 (관리자는 항상 통과) */
export function hasRole(
  event: ChatEvent,
  allowed: UserRoleCodeValue[],
  permissions: PermissionSettings
): boolean {
  if (isAdmin(event, permissions)) return true;
  return allowed.includes(normalizeRole(event.userRoleCode));
}
