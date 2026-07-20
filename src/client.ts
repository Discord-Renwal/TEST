import { HttpClient, type TokenProvider } from './core/http.js';
import { createLogger, type LogLevel, type Logger } from './core/logger.js';
import { CategoriesApi } from './api/categories.js';
import { ChannelsApi } from './api/channels.js';
import { ChatApi } from './api/chat.js';
import { DropsApi } from './api/drops.js';
import { LivesApi } from './api/lives.js';
import { RestrictionsApi } from './api/restrictions.js';
import { SessionsApi } from './api/sessions.js';
import { UsersApi } from './api/users.js';
import { ChzzkSessionClient, type SessionClientOptions } from './session/sessionClient.js';
import { FileTokenStore } from './auth/tokenStore.js';
import { loadEnv } from './env.js';

export interface ChzzkClientOptions {
  clientId: string;
  clientSecret: string;
  /** 사용자 인증이 필요한 API 를 쓰려면 필수. 보통 FileTokenStore 를 넘깁니다. */
  tokenProvider?: TokenProvider | undefined;
  logger?: Logger | undefined;
  logLevel?: LogLevel;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * CHZZK Open API 진입점. 리소스별 API 를 한데 묶어 둔 얇은 파사드입니다.
 *
 * ```ts
 * const chzzk = ChzzkClient.fromEnv();
 * await chzzk.chat.send('안녕하세요!');
 * ```
 */
export class ChzzkClient {
  readonly http: HttpClient;
  readonly logger: Logger;

  readonly users: UsersApi;
  readonly channels: ChannelsApi;
  readonly chat: ChatApi;
  readonly lives: LivesApi;
  readonly categories: CategoriesApi;
  readonly restrictions: RestrictionsApi;
  readonly sessions: SessionsApi;
  readonly drops: DropsApi;

  constructor(options: ChzzkClientOptions) {
    this.logger = options.logger ?? createLogger(options.logLevel ?? 'info');

    this.http = new HttpClient({
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      tokenProvider: options.tokenProvider,
      logger: this.logger,
      ...(options.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
    });

    this.users = new UsersApi(this.http);
    this.channels = new ChannelsApi(this.http);
    this.chat = new ChatApi(this.http);
    this.lives = new LivesApi(this.http);
    this.categories = new CategoriesApi(this.http);
    this.restrictions = new RestrictionsApi(this.http);
    this.sessions = new SessionsApi(this.http);
    this.drops = new DropsApi(this.http);
  }

  /** .env 를 읽어 토큰 저장소까지 연결된 클라이언트를 만듭니다. */
  static fromEnv(overrides: Partial<ChzzkClientOptions> = {}): ChzzkClient {
    const env = loadEnv();
    const logger = overrides.logger ?? createLogger(overrides.logLevel ?? env.LOG_LEVEL);

    const tokenProvider =
      overrides.tokenProvider ??
      new FileTokenStore(
        {
          clientId: env.CHZZK_CLIENT_ID,
          clientSecret: env.CHZZK_CLIENT_SECRET,
          redirectUri: env.CHZZK_REDIRECT_URI,
        },
        { filePath: env.CHZZK_TOKEN_FILE, logger }
      );

    return new ChzzkClient({
      clientId: env.CHZZK_CLIENT_ID,
      clientSecret: env.CHZZK_CLIENT_SECRET,
      ...overrides,
      tokenProvider,
      logger,
    });
  }

  /** 소켓 세션 클라이언트를 만듭니다. `connect()` 는 직접 호출해 주세요. */
  createSessionClient(options: SessionClientOptions = {}): ChzzkSessionClient {
    return new ChzzkSessionClient(this.sessions, { logger: this.logger, ...options });
  }
}
