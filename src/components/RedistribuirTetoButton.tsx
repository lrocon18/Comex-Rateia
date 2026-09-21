import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/utils';

interface Props {
  cliente: string;
  solicitado: number;
}

export function RedistribuirTetoButton({ cliente, solicitado }: Props) {
  const [open, setOpen] = useState(false);
  const redistribuirComTeto = useAppStore((s) => s.redistribuirComTeto);
  const titleId = `redistribuir-teto-${cliente.replace(/\s+/g, '-')}`;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Redistribuir
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} labelledBy={titleId} className="max-w-md">
        <DialogHeader onClose={() => setOpen(false)}>
          <DialogTitle id={titleId}>Redistribuir com teto de valor</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <DialogDescription className="text-sm text-[var(--color-ink)]">
            <span className="font-semibold">{cliente}</span> será distribuído novamente respeitando o teto de{' '}
            {formatCurrency(solicitado)}. Alguns produtos da lista podem ficar de fora.
          </DialogDescription>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              setOpen(false);
              redistribuirComTeto(cliente);
            }}
          >
            Redistribuir com teto
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
