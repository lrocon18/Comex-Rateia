import { cn } from '@/lib/utils';

/**
 * Logomark: três barras de larguras diferentes que somam a mesma linha — o lote
 * dividido em notas desiguais, que é literalmente o que o produto faz (doc 06).
 */
export function Logomark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 28"
      className={cn('h-6 w-6', className)}
      role="img"
      aria-label="Rateia"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="0.75" y="0.75" width="26.5" height="26.5" rx="5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="6" y="8" width="9" height="3.5" rx="1" fill="currentColor" />
      <rect x="6" y="13.25" width="16" height="3.5" rx="1" fill="currentColor" opacity="0.55" />
      <rect x="6" y="18.5" width="5" height="3.5" rx="1" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

export function Brand({ className, sub = true }: { className?: string; sub?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <Logomark className="text-[var(--color-dock)]" />
      <div className="flex items-baseline gap-2.5">
        <span className="serif text-[1.5rem] leading-[1.15] text-[var(--color-ink)]">Rateia</span>
        {sub && (
          <span className="hidden text-xs text-[var(--color-graphite)] sm:inline">
            distribuição das notas de saída
          </span>
        )}
      </div>
    </div>
  );
}
