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
  /** 대상이 되는 사람 (있으면) */
  actor?: string;
  message: string;
  /** 상세 보기용 부가 정보 */
  detail?: string;
}

/**
 * 최근 이벤트를 메모리에 담아 대시보드에 보여줍니다.
 *
 * 디스크에 남기지 않는 이유: 채팅 로그는 개인정보에 가깝고 금방 커집니다.
 * "지금 봇이 뭘 하고 있나" 를 확인하는 용도라 프로세스 수명만큼만 있으면 충분합니다.
 * 영구 보관이 필요하면 별도 저장소를 붙이는 게 맞습니다.
 */
export class EventLog {
  private readonly entries: LogEntry[] = [];
  private nextId = 1;

  constructor(private readonly capacity = 300) {}

  push(kind: LogKind, message: string, extra: { actor?: string; detail?: string } = {}): LogEntry {
    const entry: LogEntry = {
      id: this.nextId++,
      at: Date.now(),
      kind,
      message,
      ...(extra.actor !== undefined ? { actor: extra.actor } : {}),
      ...(extra.detail !== undefined ? { detail: extra.detail } : {}),
    };

    this.entries.push(entry);
    if (this.entries.length > this.capacity) {
      this.entries.splice(0, this.entries.length - this.capacity);
    }
    return entry;
  }

  /**
   * 최근 항목을 새 것부터 돌려줍니다.
   * @param sinceId 이 id 보다 큰 것만 (대시보드가 폴링할 때 씁니다)
   */
  recent(limit = 100, sinceId = 0): LogEntry[] {
    const filtered = sinceId > 0 ? this.entries.filter((e) => e.id > sinceId) : this.entries;
    return filtered.slice(-limit).reverse();
  }

  get lastId(): number {
    return this.nextId - 1;
  }

  clear(): void {
    this.entries.length = 0;
  }
}
