import { useAppStore } from '@/store/useAppStore';
import { clientTotal, prodMap, puMap } from '@/engine';
import { exportClientesPorTemplate, exportXlsx } from '@/io';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatCurrency4, formatInteger, formatQuantity } from '@/lib/utils';

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <Card className="mt-5">
      <CardContent className="py-12 text-center text-sm text-[var(--color-graphite)]">{children}</CardContent>
    </Card>
  );
}

export function ResultadoTab() {
  const stock = useAppStore((s) => s.stock);
  const result = useAppStore((s) => s.result);
  const setTab = useAppStore((s) => s.setTab);

  if (!result) {
    return (
      <Vazio>
        Ainda não calculado.{' '}
        <button
          onClick={() => setTab('distribuir')}
          className="font-medium text-[var(--color-dock)] underline underline-offset-2"
        >
          Vá em Distribuir
        </button>{' '}
        e rode o cálculo.
      </Vazio>
    );
  }

  const clients = Object.keys(result.alloc);
  if (!clients.length) return <Vazio>Nenhum produto foi alocado. Confira as regras.</Vazio>;

  const pu = puMap(stock);
  const prod = prodMap(stock);
  const totals = clients.map((c) => ({ c, v: clientTotal(stock, result, c) }));
  const spread = totals.length > 1 ? Math.max(...totals.map((t) => t.v)) - Math.min(...totals.map((t) => t.v)) : 0;

  return (
    <div className="mt-5 space-y-5">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Valor de cada nota</CardTitle>
            <CardDescription>
              as notas saem propositalmente diferentes — {formatCurrency(spread)} entre a maior e a menor
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void exportXlsx(stock, result)}>
              Exportar controle geral
            </Button>
            <Button onClick={() => void exportClientesPorTemplate(stock, result)}>
              Exportar planilha (modelo do cliente)
            </Button>
          </div>
        </CardHeader>
        {/* fios pelas bordas das próprias células: quantidade de clientes é
            variável e uma grade com vão sobrando deixa buraco na superfície */}
        <div className="flex flex-wrap overflow-hidden">
          {totals.map((t) => (
            <div
              key={t.c}
              className="-mt-px -ml-px min-w-[180px] flex-1 border-t border-l border-[var(--color-rule)] px-4 py-3"
            >
              <div className="truncate text-xs text-[var(--color-graphite)]" title={t.c}>
                {t.c}
              </div>
              <div className="num mt-0.5 text-[1.0625rem] font-semibold leading-[1.3]">{formatCurrency(t.v)}</div>
            </div>
          ))}
        </div>
      </Card>

      {clients.map((c) => {
        const a = result.alloc[c];
        const cods = Object.keys(a).sort();
        return (
          <Card key={c} className="overflow-hidden">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>{c}</CardTitle>
                <CardDescription className="num">{formatInteger(cods.length)} produto(s) na nota</CardDescription>
              </div>
              <div className="text-right">
                <div className="label-xs">Total da nota</div>
                <div className="num mt-0.5 text-[1.0625rem] font-semibold leading-[1.3]">
                  {formatCurrency(clientTotal(stock, result, c))}
                </div>
              </div>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">PU saída</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cods.map((cd) => (
                  <TableRow key={cd}>
                    <TableCell className="code">{cd}</TableCell>
                    <TableCell className="max-w-[360px] truncate" title={prod[cd]}>
                      {prod[cd]}
                    </TableCell>
                    <TableCell className="num text-right font-medium">{formatQuantity(a[cd])}</TableCell>
                    <TableCell className="num text-right text-[var(--color-graphite)]">
                      {formatCurrency4(pu[cd])}
                    </TableCell>
                    <TableCell className="num text-right">{formatCurrency(a[cd] * pu[cd])}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        );
      })}
    </div>
  );
}
