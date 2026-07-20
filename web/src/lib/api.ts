import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AutoResponse, BannedWord, BotConfig, CustomCommand, StatusResponse } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof data === 'object' && data !== null && 'error' in data
        ? String(data.error)
        : `${res.status} 오류가 발생했습니다.`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export const CONFIG_KEY = ['config'] as const;
export const STATUS_KEY = ['status'] as const;

export function useConfig() {
  return useQuery({
    queryKey: CONFIG_KEY,
    queryFn: () => request<BotConfig>('/config'),
    staleTime: 2000,
  });
}

export function useStatus() {
  return useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => request<StatusResponse>('/status'),
    // 봇이 살아 있는지, 통계가 어떻게 변하는지 계속 비춰줍니다.
    refetchInterval: 4000,
    retry: false,
  });
}

/**
 * 성공하면 설정을 다시 불러오고 토스트를 띄우는 공통 뮤테이션.
 * 실패 메시지는 서버가 준 문장을 그대로 보여줍니다 — 어느 필드가 왜 막혔는지 서버가 알려주기 때문입니다.
 */
function useConfigMutation<TVars>(
  fn: (vars: TVars) => Promise<unknown>,
  successMessage: string | ((vars: TVars) => string)
): UseMutationResult<unknown, Error, TVars> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: fn,
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: CONFIG_KEY });
      toast.success(typeof successMessage === 'function' ? successMessage(vars) : successMessage);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// ─── 설정 섹션 ────────────────────────────────────────────────────────────────

export function useSaveSection(section: 'general' | 'permissions' | 'moderation') {
  return useConfigMutation(
    (values: Record<string, unknown>) => request(`/config/${section}`, 'PUT', values),
    '저장했습니다.'
  );
}

// ─── 명령어 ──────────────────────────────────────────────────────────────────

export function useCreateCommand() {
  return useConfigMutation(
    (values: Partial<CustomCommand>) => request<CustomCommand>('/commands', 'POST', values),
    (values) => `${values.name ?? '명령어'} 을(를) 만들었습니다.`
  );
}

export function useUpdateCommand() {
  return useConfigMutation(
    ({ id, ...values }: Partial<CustomCommand> & { id: string }) =>
      request<CustomCommand>(`/commands/${id}`, 'PUT', values),
    '저장했습니다.'
  );
}

export function useDeleteCommand() {
  return useConfigMutation((id: string) => request(`/commands/${id}`, 'DELETE'), '삭제했습니다.');
}

// ─── 자동응답 ────────────────────────────────────────────────────────────────

export function useCreateAutoResponse() {
  return useConfigMutation(
    (values: Partial<AutoResponse>) => request<AutoResponse>('/auto-responses', 'POST', values),
    '자동응답을 추가했습니다.'
  );
}

export function useUpdateAutoResponse() {
  return useConfigMutation(
    ({ id, ...values }: Partial<AutoResponse> & { id: string }) =>
      request<AutoResponse>(`/auto-responses/${id}`, 'PUT', values),
    '저장했습니다.'
  );
}

export function useDeleteAutoResponse() {
  return useConfigMutation(
    (id: string) => request(`/auto-responses/${id}`, 'DELETE'),
    '삭제했습니다.'
  );
}

// ─── 금칙어 ──────────────────────────────────────────────────────────────────

export function useCreateBannedWord() {
  return useConfigMutation(
    (values: Partial<BannedWord>) => request<BannedWord>('/banned-words', 'POST', values),
    '금칙어를 추가했습니다.'
  );
}

export function useUpdateBannedWord() {
  return useConfigMutation(
    ({ id, ...values }: Partial<BannedWord> & { id: string }) =>
      request<BannedWord>(`/banned-words/${id}`, 'PUT', values),
    '저장했습니다.'
  );
}

export function useDeleteBannedWord() {
  return useConfigMutation(
    (id: string) => request(`/banned-words/${id}`, 'DELETE'),
    '삭제했습니다.'
  );
}
