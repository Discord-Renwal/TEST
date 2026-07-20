import { useState } from 'react';
import { Plus, TerminalSquare } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, EmptyState } from '../components/ui/Card';
import { Field } from '../components/ui/Field';
import { Select } from '../components/ui/Select';
import { PageHeader } from '../components/Layout';
import { CommandCard } from '../components/CommandCard';
import { COMMAND_TYPES, COMMAND_TYPE_HINTS } from '../lib/constants';
import type { BotConfig, CommandType } from '../lib/types';
import { useCreateCommand } from '../lib/api';
import { cn } from '../lib/cn';

export function CommandsPage({ config }: { config: BotConfig }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<CommandType>('list');
  const create = useCreateCommand();
  const prefix = config.general.prefix;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    create.mutate({ name: trimmed, type }, { onSuccess: () => setName('') });
  }

  return (
    <>
      <PageHeader
        title="명령어 추가"
        description={
          <>
            <b className="text-[var(--surface-text)]">목록형</b>을 쓰면{' '}
            <code className="rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-brand-300">
              {prefix}멤버 빅헤드,9구진
            </code>{' '}
            처럼 채팅에서 값을 등록해 두고, 다른 시청자가{' '}
            <code className="rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-brand-300">
              {prefix}멤버
            </code>{' '}
            만 쳐도 그 목록이 나옵니다.
          </>
        }
      />

      <Card className="mb-4">
        {/*
          라벨 높이가 같고 힌트가 행 밖에 있으므로, 세 컨트롤의 아래선이 정확히 맞습니다.
          (예전에는 버튼에 margin 을 줘서 맞췄는데, 힌트 줄 수가 바뀌면 어긋났습니다.)
        */}
        <form onSubmit={submit} className="space-y-2.5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="새 명령어 이름" className="flex-1">
              {/* 접두사를 입력칸 안쪽에 붙여 한 덩어리로 보이게 합니다. */}
              <div
                className={cn(
                  'flex items-center rounded-lg border border-[var(--surface-border)]',
                  'bg-[var(--surface-bg)] transition-colors',
                  'focus-within:border-brand-600 hover:border-[var(--color-ink-400)]'
                )}
              >
                <span className="pl-3 pr-0.5 font-mono text-sm text-[var(--surface-muted)]">
                  {prefix}
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="멤버"
                  maxLength={30}
                  className={cn(
                    'h-9.5 w-full min-w-0 rounded-r-lg bg-transparent pr-3 text-sm outline-none',
                    'placeholder:text-[var(--surface-muted)]/60'
                  )}
                />
              </div>
            </Field>

            <Field label="종류" className="sm:w-44">
              <Select
                value={type}
                onValueChange={setType}
                options={COMMAND_TYPES}
                aria-label="종류"
                className="h-9.5"
              />
            </Field>

            <Button
              type="submit"
              variant="primary"
              loading={create.isPending}
              disabled={name.trim() === ''}
            >
              <Plus className="size-4" />
              추가
            </Button>
          </div>

          <p className="text-xs leading-relaxed text-[var(--surface-muted)]">
            {COMMAND_TYPE_HINTS[type]}
          </p>
        </form>
      </Card>

      {config.commands.length === 0 ? (
        <EmptyState
          icon={<TerminalSquare className="size-5" />}
          title="아직 등록된 명령어가 없습니다"
        >
          위에서 이름을 입력해 첫 명령어를 만들어 보세요.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {config.commands.map((command) => (
            <CommandCard key={command.id} command={command} prefix={prefix} />
          ))}
        </div>
      )}
    </>
  );
}
