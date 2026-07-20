import { Coins, Music } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/Layout';

const CONTENT = {
  songs: {
    icon: Music,
    title: '신청곡 설정',
    summary: '대기열 방식으로 만들기로 했습니다.',
    body: [
      '!신청곡 <제목> 으로 목록에 쌓고, 순서 변경·삭제·완료 처리를 이 화면에서 합니다.',
      '재생은 직접 하시고 외부 서비스 연동은 하지 않습니다. YouTube 연동이 필요해지면 Data API 키가 따로 있어야 합니다.',
    ],
  },
  points: {
    icon: Coins,
    title: '포인트 설정',
    summary: '적립 기준을 정한 뒤 만드는 편이 좋아 미뤄두었습니다.',
    body: [
      '채팅당 적립인지 시청 시간당 적립인지, 상한과 사용처를 어떻게 잡을지에 따라 구조가 달라집니다.',
      '치지직 API 는 시청자 목록을 주지 않아, 시청 시간 기준으로 하려면 채팅 활동으로 추정해야 합니다.',
    ],
  },
} as const;

export function ComingSoonPage({ kind }: { kind: 'songs' | 'points' }) {
  const { icon: Icon, title, summary, body } = CONTENT[kind];

  return (
    <>
      <PageHeader title={title} />

      <Card className="overflow-hidden p-0">
        <div className="border-b border-[var(--surface-border)] bg-gradient-to-br from-brand/8 to-transparent px-6 py-8">
          <div className="mb-3 grid size-11 place-items-center rounded-xl bg-brand/15 text-brand">
            <Icon className="size-5" />
          </div>
          <p className="text-sm font-semibold">2단계에서 추가됩니다</p>
          <p className="mt-1 text-sm text-[var(--surface-muted)]">{summary}</p>
        </div>

        <div className="space-y-2.5 px-6 py-5">
          {body.map((line) => (
            <p key={line} className="text-[13px] leading-relaxed text-[var(--surface-muted)]">
              {line}
            </p>
          ))}
          <p className="pt-2 text-[13px] leading-relaxed">
            먼저 만든 기능들이 실제 방송에서 검증되면 이어서 작업하겠습니다.
          </p>
        </div>
      </Card>
    </>
  );
}
