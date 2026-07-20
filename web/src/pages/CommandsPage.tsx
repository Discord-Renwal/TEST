import { useState } from 'react';
import { Plus, TerminalSquare } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, EmptyState } from '../components/ui/Card';
import { Field, Input } from '../components/ui/Field';
import { Select } from '../components/ui/Select';
import { PageHeader } from '../components/Layout';
import { CommandCard } from '../components/CommandCard';
import { COMMAND_TYPES, COMMAND_TYPE_HINTS } from '../lib/constants';
import type { BotConfig, CommandType } from '../lib/types';
import { useCreateCommand } from '../lib/api';

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
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="새 명령어 이름" className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-[var(--surface-muted)]">{prefix}</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="멤버"
                maxLength={30}
              />
            </div>
          </Field>

          <Field label="종류" hint={COMMAND_TYPE_HINTS[type]} className="sm:w-48">
            <Select
              value={type}
              onValueChange={setType}
              options={COMMAND_TYPES}
              aria-label="종류"
            />
          </Field>

          <Button
            type="submit"
            variant="primary"
            loading={create.isPending}
            disabled={name.trim() === ''}
            className="sm:mb-6"
          >
            <Plus className="size-4" />
            추가
          </Button>
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
