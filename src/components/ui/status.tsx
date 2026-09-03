import { cn } from '@/lib/utils';

export type Tone = 'ok' | 'warn' | 'risk' | 'muted';

const TONE: Record<Tone, { dot: string; text: string }> = {
  ok: { dot: 'bg-[var(--color-signal-ok)]', text: 'text-[var(--color-signal-ok)]' },
  warn: { dot: 'bg-[var(--color-signal-warn)]', text: 'text-[var(--color-signal-warn)]' },
  risk: { dot: 'bg-[var(--color-signal-risk)]', text: 'text-[var(--color-signal-risk)]' },
  muted: { dot: 'bg-[var(--color-graphite-light)]', text: 'text-[var(--color-graphite-light)]' },
};

/**
 * Estado de conferência: ponto de cor + palavra. Sem fundo, para não competir
 * com os números da tabela (doc 06 §1).
 */
export function Status({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  const t = TONE[tone];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', t.text, className)}>
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', t.dot)} aria-hidden />
      {children}
    </span>
  );
}
