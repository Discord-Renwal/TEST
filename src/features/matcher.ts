import type { MatchMode } from '../store/schema.js';

/**
 * 자동응답과 금칙어가 공유하는 매칭 규칙.
 *
 * 사용자가 대시보드에서 정규식을 직접 넣을 수 있으므로, 잘못된 정규식 하나가
 * 봇 전체를 죽이지 않도록 컴파일 실패는 "매칭 안 됨"으로 흡수합니다.
 */
export function matches(
  text: string,
  pattern: string,
  mode: MatchMode,
  caseSensitive = false
): boolean {
  if (!pattern) return false;

  if (mode === 'regex') {
    try {
      return new RegExp(pattern, caseSensitive ? 'u' : 'iu').test(text);
    } catch {
      return false;
    }
  }

  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? pattern : pattern.toLowerCase();

  switch (mode) {
    case 'equals':
      return haystack.trim() === needle.trim();
    case 'startsWith':
      return haystack.trimStart().startsWith(needle);
    case 'contains':
    default:
      return haystack.includes(needle);
  }
}

/** 정규식이 유효한지 미리 확인합니다. 대시보드 저장 시 검증에 씁니다. */
export function isValidPattern(pattern: string, mode: MatchMode): boolean {
  if (mode !== 'regex') return pattern.length > 0;
  try {
    new RegExp(pattern, 'iu');
    return true;
  } catch {
    return false;
  }
}
