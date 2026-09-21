import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { distributedMap } from '@/engine';
import { ImportMainoDialog } from '@/components/ImportMainoDialog';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatCurrency4, formatQuantity } from '@/lib/utils';

export function EstoqueTab() {
  const stock = useAppStore((s) => s.stock);
  const result = useAppStore((s) => s.result);
  const filter = useAppStore((s) => s.stockFilter);
  const setFilter = useAppStore((s) => s.setStockFilter);
  const [modal, setModal] = useState(false);

  const dist = distributedMap(stock, result);
  const f = filter.trim().toLowerCase();
  const rows = stock.filter((s) => !f || s.codigo.toLowerCase().includes(f) || s.produto.toLowerCase().includes(f));

  return (
    <Card className="mt-5 overflow-hidden">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>Controle geral do estoque</CardTitle>
          <CardDescription>todos os produtos da divisão — inclusive os que zeraram</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="filtrar por código ou nome"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8 w-56 text-[0.8125rem]"
          />
          <Button variant="outline" size="sm" onClick={() => setModal(true)}>
            Substituir Maino
          </Button>
        </div>
      </CardHeader>

      <ImportMainoDialog open={modal} mode="substituir" onClose={() => setModal(false)} />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Produto</TableHead>
            <TableHead className="text-right">Estoque inicial</TableHead>
            <TableHead className="text-right">Distribuído</TableHead>
            <TableHead className="text-right">Disponível</TableHead>
            <TableHead className="text-right">PU saída</TableHead>
            <TableHead className="text-right">Valor disponível</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((s) => {
            const d = dist[s.codigo] || 0;
            const disp = s.estoque - d;
            const zerado = disp <= 0;
            return (
              <TableRow key={s.codigo}>
                <TableCell className="code">{s.codigo}</TableCell>
                <TableCell className="max-w-[300px] truncate" title={s.produto}>
                  {s.produto}
                </TableCell>
                <TableCell className="num text-right">{formatQuantity(s.estoque)}</TableCell>
                <TableCell className={`num text-right ${d ? '' : 'text-[var(--color-graphite)]'}`}>
                  {formatQuantity(d)}
                </TableCell>
                <TableCell
                  className={`num text-right font-semibold ${
                    zerado ? 'font-normal text-[var(--color-graphite)]' : 'text-[var(--color-signal-ok)]'
                  }`}
                >
                  {formatQuantity(Math.max(0, disp))}
                </TableCell>
                <TableCell className="num text-right text-[var(--color-graphite)]">
                  {formatCurrency4(s.pu)}
                </TableCell>
                <TableCell className={`num text-right ${zerado ? 'text-[var(--color-graphite)]' : ''}`}>
                  {formatCurrency(Math.max(0, disp) * s.pu)}
                </TableCell>
              </TableRow>
            );
          })}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-sm text-[var(--color-graphite)]">
                {stock.length === 0
                  ? 'Nenhum produto na divisão. Importe a planilha do Maino.'
                  : `Nenhum produto casa com “${filter}”.`}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
