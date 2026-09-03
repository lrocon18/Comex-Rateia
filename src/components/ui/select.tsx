import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Seletor nativo (a operadora usa teclado e o sistema dela sabe abrir listas
 * longas melhor que qualquer menu nosso), só com a casca do design.
 */
const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<'select'>>(
  ({ className, ...props }, ref) => (
    <select ref={ref} className={cn('select-field', className)} {...props} />
  ),
);
Select.displayName = 'Select';

export { Select };
