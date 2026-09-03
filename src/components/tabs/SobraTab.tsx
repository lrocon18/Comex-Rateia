import { useAppStore } from '@/store/useAppStore';
import { prodMap, puMap } from '@/engine';
import { exportXlsx } from '@/io';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatCurrency4, formatInteger } from '@/lib/utils';

export function SobraTab() {
  const stock = useAppStore((s) => s.stock);
  const result = useAppStore((s) => s.result);
  const clients = useAppStore((s) => s.clients);
  const assignLeftover = useAppStore((s) => s.assignLeftover);
  const destino = useAppStore((s) => s.drafts.sobraDestino);
  const novo = useAppStore((s) => s.drafts.sobraNovoCliente);
  const patchDrafts = useAppStore((s) => s.patchDrafts);

  if (!result) {
    return (
      <Card className="mt-5">
        <CardContent className="py-12 text-center text-sm text-[var(--color-graphite)]">
          Calcule a distribuição primeiro.
        </CardContent>
      </Card>
    );
  }

  const pu = puMap(stock);
  const prod = prodMap(stock);
  const cods = Object.keys(result.leftover)
    .filter((c) => result.leftover[c] > 0)
    .sort();
  const val = cods.reduce((s, c) => s + result.leftover[c] * pu[c], 0);

  const enviar = () => {
    const cl = novo.trim() || destino;
    if (!cl) return alert('Escolha ou digite um cliente.');
    // assignLeftover já limpa os campos de destino
    assignLeftover(cl);
  };

  return (
    <Card className="mt-5 overflow-hidden">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>Saldo para utilização</CardTitle>
          <CardDescription>
            só os produtos que ainda têm saldo — pronto para o cliente de sobra
          </CardDescription>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="label-xs">Total da sobra</div>
            <div className="num mt-0.5 text-[1.0625rem] font-semibold leading-[1.3]">{formatCurrency(val)}</div>
          </div>
          <Button variant="outline" onClick={() => void exportXlsx(stock, result)}>
            Exportar .xlsx
          </Button>
        </div>
      </CardHeader>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Produto</TableHead>
            <TableHead className="text-right">Disponível</TableHead>
            <TableHead className="text-right">PU saída</TableHead>
            <TableHead className="text-right">Valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cods.map((c) => (
            <TableRow key={c}>
              <TableCell className="code">{c}</TableCell>
              <TableCell className="max-w-[360px] truncate" title={prod[c]}>
                {prod[c]}
              </TableCell>
              <TableCell className="num text-right font-semibold text-[var(--color-signal-ok)]">
                {formatInteger(result.leftover[c])}
              </TableCell>
              <TableCell className="num text-right text-[var(--color-graphite)]">
                {formatCurrency4(pu[c])}
              </TableCell>
              <TableCell className="num text-right">{formatCurrency(result.leftover[c] * pu[c])}</TableCell>
            </TableRow>
          ))}
          {cods.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-12 text-center text-sm text-[var(--color-graphite)]">
                Nada sobrou — todo o estoque foi distribuído.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {cods.length > 0 && (
        <CardFooter className="flex-col items-start gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">Destinar toda a sobra para</span>
            <Select
              value={destino}
              onChange={(e) => patchDrafts({ sobraDestino: e.target.value })}
              aria-label="Cliente de destino"
            >
              <option value="">— escolher —</option>
              {clients.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <span className="text-xs text-[var(--color-graphite)]">ou</span>
            <Input
              placeholder="novo cliente (ex.: Cliente sobra)"
              value={novo}
              onChange={(e) => patchDrafts({ sobraNovoCliente: e.target.value })}
              className="w-56"
            />
            <Button variant="outline" onClick={enviar}>
              Enviar sobra
            </Button>
          </div>
          <p className="text-xs text-[var(--color-graphite)]">
            A sobra só é atribuída quando você confirmar — nada é distribuído automaticamente.
          </p>
        </CardFooter>
      )}
    </Card>
  );
}
