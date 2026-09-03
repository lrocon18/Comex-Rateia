import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Pílula de baixa saturação. Badge é rótulo, não semáforo: para estado de
// conferência use <Status> (doc 06 §2).
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[0.6875rem] font-medium leading-4',
  {
    variants: {
      variant: {
        default: 'bg-[var(--color-sunken)] text-[var(--color-graphite)]',
        outline: 'border border-[var(--color-rule)] text-[var(--color-graphite)]',
        accent: 'bg-[var(--color-dock-wash)] text-[var(--color-dock-strong)]',
        ok: 'bg-[var(--color-signal-ok-wash)] text-[var(--color-signal-ok)]',
        warn: 'bg-[var(--color-signal-warn-wash)] text-[var(--color-signal-warn)]',
        risk: 'bg-[var(--color-signal-risk-wash)] text-[var(--color-signal-risk)]',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
