import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[background-color,border-color,color] disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        // ação primária: uma só por tela, na cor de carimbo
        default: 'bg-[var(--color-dock)] text-white hover:bg-[var(--color-dock-strong)]',
        outline:
          'border border-[var(--color-rule-strong)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:border-[var(--color-dock)] hover:text-[var(--color-dock)]',
        secondary: 'bg-[var(--color-sunken)] text-[var(--color-ink)] hover:bg-[var(--color-rule)]',
        ghost: 'text-[var(--color-graphite)] hover:bg-[var(--color-sunken)] hover:text-[var(--color-ink)]',
        danger:
          'text-[var(--color-signal-risk)] hover:bg-[var(--color-signal-risk-wash)]',
      },
      size: {
        default: 'h-9 px-3.5 text-sm',
        sm: 'h-8 px-3 text-[0.8125rem]',
        lg: 'h-11 px-5 text-[0.9375rem]',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button type={type} className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  ),
);
Button.displayName = 'Button';

export { Button, buttonVariants };
