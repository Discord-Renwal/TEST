import * as Tooltip from '@radix-ui/react-tooltip';
import { Bot, Moon, Sun } from 'lucide-react';
import { motion } from 'motion/react';
import { NavLink, useLocation } from 'react-router';
import { ROUTES, NAV_GROUPS } from '../routes';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import type { StatusResponse } from '../lib/types';

/** 다크/라이트 전환. 선택은 localStorage 에 남습니다. */
function ThemeToggle() {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') !== 'light');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <button
      type="button"
      onClick={() => setDark((v) => !v)}
      aria-label={dark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      className={cn(
        'grid size-8 place-items-center rounded-lg text-[var(--surface-muted)]',
        'transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--surface-text)]',
        'focus-visible:focus-ring'
      )}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

function ConnectionBadge({ status }: { status: StatusResponse | undefined }) {
  const online = Boolean(status?.account);

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <div
          className={cn(
            'flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px]',
            online
              ? 'border-brand-600/40 bg-brand/10 text-brand-300'
              : 'border-[var(--surface-border)] text-[var(--surface-muted)]'
          )}
        >
          <span className="relative flex size-2">
            {online ? (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
            ) : null}
            <span
              className={cn(
                'relative inline-flex size-2 rounded-full',
                online ? 'bg-brand' : 'bg-[var(--color-ink-500)]'
              )}
            />
          </span>
          <span className="max-w-40 truncate">
            {online ? status?.account?.channelName : '봇 꺼짐'}
          </span>
        </div>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content sideOffset={8} className="panel z-50 max-w-xs px-3 py-2 text-xs shadow-xl">
          {online ? (
            <>
              <p className="font-medium">채널 ID</p>
              <p className="mt-0.5 break-all font-mono text-[var(--surface-muted)]">
                {status?.account?.channelId}
              </p>
              <p className="mt-2 break-all text-[var(--surface-muted)]">{status?.configPath}</p>
            </>
          ) : (
            <p>
              봇이 실행 중이 아닙니다. <code>pnpm bot</code> 으로 실행하세요.
            </p>
          )}
          <Tooltip.Arrow className="fill-[var(--surface-border)]" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

interface LayoutProps {
  status: StatusResponse | undefined;
  children: ReactNode;
}

export function Layout({ status, children }: LayoutProps) {
  return (
    <Tooltip.Provider delayDuration={200}>
      <div className="min-h-dvh">
        <header className="sticky top-0 z-30 border-b border-[var(--surface-border)] bg-[var(--surface-bg)]/85 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
            <div className="grid size-9 place-items-center rounded-xl bg-brand text-brand-ink">
              <Bot className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-[15px] font-semibold leading-tight">치지직 챗봇 설정</h1>
              <p className="text-xs text-[var(--surface-muted)]">Chzzk Chat Bot Tools</p>
            </div>
            <ConnectionBadge status={status} />
            <ThemeToggle />
          </div>
        </header>

        <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:gap-8">
          <nav className="hidden w-52 shrink-0 lg:block">
            <div className="sticky top-24 space-y-4">
              {NAV_GROUPS.map((group) => (
                <div key={group} className="space-y-0.5">
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--surface-muted)]">
                    {group}
                  </p>
                  {ROUTES.filter((r) => r.group === group).map(({ path, label, icon: Icon }) => (
                    <NavLink
                      key={path}
                      to={`/${path}`}
                      className={({ isActive }) =>
                        cn(
                          'relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm',
                          'transition-colors focus-visible:focus-ring',
                          isActive
                            ? 'text-brand-ink'
                            : 'text-[var(--surface-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--surface-text)]'
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive ? (
                            <motion.span
                              layoutId="nav-active"
                              className="absolute inset-0 rounded-lg bg-brand"
                              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                            />
                          ) : null}
                          <Icon className="relative size-4 shrink-0" />
                          <span className="relative flex-1 truncate font-medium">{label}</span>
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              ))}
            </div>
          </nav>

          {/* 좁은 화면에서는 가로 스크롤 탭 */}
          <div className="min-w-0 flex-1">
            <nav className="mb-5 flex gap-1 overflow-x-auto pb-1 lg:hidden">
              {ROUTES.map(({ path, label, icon: Icon }) => (
                <NavLink
                  key={path}
                  to={`/${path}`}
                  className={({ isActive }) =>
                    cn(
                      'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium',
                      isActive
                        ? 'bg-brand text-brand-ink'
                        : 'text-[var(--surface-muted)] hover:bg-[var(--surface-raised)]'
                    )
                  }
                >
                  <Icon className="size-4" />
                  {label}
                </NavLink>
              ))}
            </nav>

            <motion.main
              key={useLocation().pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.main>
          </div>
        </div>
      </div>
    </Tooltip.Provider>
  );
}

export function PageHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm leading-relaxed text-[var(--surface-muted)]">{description}</p>
      ) : null}
    </div>
  );
}
