import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-md border border-[var(--color-rule-strong)] bg-[var(--color-surface)] px-2.5 text-sm text-[var(--color-ink)] transition-colors',
        'placeholder:text-[var(--color-graphite-light)] hover:border-[var(--color-graphite-light)]',
        'disabled:cursor-not-allowed disabled:bg-[var(--color-sunken)] disabled:opacity-60',
        type === 'number' && 'num text-right',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
