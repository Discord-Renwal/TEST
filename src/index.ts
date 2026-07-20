export { ChzzkClient, type ChzzkClientOptions } from './client.js';
export { loadEnv, type Env } from './env.js';

export { HttpClient, CHZZK_API_BASE, type TokenProvider, type AuthMode } from './core/http.js';
export { ChzzkApiError, ChzzkTransportError, ChzzkValidationError } from './core/errors.js';
export { createLogger, noopLogger, type Logger, type LogLevel } from './core/logger.js';

export { UsersApi } from './api/users.js';
export { ChannelsApi, MAX_CHANNEL_IDS } from './api/channels.js';
export {
  ChatApi,
  splitMessage,
  MAX_MESSAGE_LENGTH,
  ALLOWED_MIN_FOLLOWER_MINUTES,
  ALLOWED_SLOW_MODE_SEC,
  type UpdateChatSettingsInput,
  type BlindMessageInput,
} from './api/chat.js';
export { LivesApi, type UpdateLiveSettingInput } from './api/lives.js';
export { CategoriesApi } from './api/categories.js';
export { RestrictionsApi } from './api/restrictions.js';
export {
  SessionsApi,
  MAX_SUBSCRIPTIONS_PER_SESSION,
  MAX_CLIENT_SESSIONS,
  MAX_USER_SESSIONS,
} from './api/sessions.js';
export { DropsApi, type ListRewardClaimsParams } from './api/drops.js';
export type * from './api/types.js';

export {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  refreshToken,
  revokeToken,
  generateState,
  CHZZK_AUTHORIZE_URL,
  CHZZK_TOKEN_URL,
  CHZZK_REVOKE_URL,
  type OAuthConfig,
} from './auth/oauth.js';
export { FileTokenStore, toStoredToken, type StoredToken } from './auth/tokenStore.js';

export { ChzzkSessionClient, type SessionClientOptions } from './session/sessionClient.js';
export type * from './session/events.js';

export {
  CommandRouter,
  type CommandDefinition,
  type CommandContext,
  type CommandRouterOptions,
} from './bot/commandRouter.js';
export { ChatSender, type ChatSenderOptions } from './bot/chatSender.js';
