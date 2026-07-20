import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  CHZZK_CLIENT_ID: z.string().min(1, 'CHZZK_CLIENT_ID 가 비어 있습니다 (.env 확인)'),
  CHZZK_CLIENT_SECRET: z.string().min(1, 'CHZZK_CLIENT_SECRET 이 비어 있습니다 (.env 확인)'),
  CHZZK_REDIRECT_URI: z.string().url().default('http://localhost:3000/auth/callback'),
  CHZZK_LOGIN_PORT: z.coerce.number().int().positive().default(3000),
  CHZZK_TOKEN_FILE: z.string().default('.tokens/chzzk.json'),
  BOT_CONFIG_FILE: z.string().default('data/config.json'),
  BOT_USER_FILE: z.string().default('data/users.json'),
  BOT_SONG_FILE: z.string().default('data/songs.json'),
  DASHBOARD_PORT: z.coerce.number().int().positive().default(4700),
  BOT_COMMAND_PREFIX: z.string().default('!'),
  LOG_LEVEL: z.enum(['silent', 'error', 'warn', 'info', 'debug']).default('info'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/**
 * .env 를 읽어 검증한 설정을 반환합니다. 값이 잘못되면 어떤 키가 문제인지 명시하고 종료합니다.
 */
export function loadEnv(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `환경 변수 검증에 실패했습니다.\n${detail}\n\n.env.example 을 .env 로 복사한 뒤 값을 채워 주세요.`
    );
  }

  cached = parsed.data;
  return cached;
}
