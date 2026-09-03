import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  labelledBy?: string;
}

function Dialog({ open, onClose, children, className, labelledBy }: DialogProps) {
  const panel = React.useRef<HTMLDivElement>(null);
  // o onClose costuma ser recriado a cada render do dono do modal; guardar numa
  // ref mantém o efeito preso só ao `open` — senão ele refocaria o painel a cada
  // tecla, roubando o foco de quem está digitando dentro do modal.
  const close = React.useRef(onClose);
  React.useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[hsl(215_25%_11%/0.45)] p-4 backdrop-blur-[2px] sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={cn(
          'my-auto w-full max-w-2xl rounded-lg border border-[var(--color-rule)] bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-float)] outline-none',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

function DialogHeader({
  onClose,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { onClose?: () => void }) {
  return (
    <div
      className={cn('flex items-start justify-between gap-3 border-b border-[var(--color-rule)] px-5 py-4', className)}
      {...props}
    >
      <div className="space-y-1">{children}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="-mr-1 rounded-md p-1 text-[var(--color-graphite)] transition-colors hover:bg-[var(--color-sunken)] hover:text-[var(--color-ink)]"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2 ref={ref} className={cn('serif text-[1.375rem] leading-tight', className)} {...props} />
  ),
);
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-xs leading-relaxed text-[var(--color-graphite)]', className)} {...props} />
  ),
);
DialogDescription.displayName = 'DialogDescription';

function DialogContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-end gap-2 border-t border-[var(--color-rule)] bg-[var(--color-paper)] px-5 py-4',
        className,
      )}
      {...props}
    />
  );
}

export { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter };
