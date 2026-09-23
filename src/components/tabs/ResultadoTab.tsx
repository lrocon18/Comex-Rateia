import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { clientePodeRedistribuirTeto, clientTotal, prodMap, puMap } from '@/engine';
import { isOrigemQuebrada } from '@/engine/granularity';
import {
  CAMPOS_EXPORT,
  clientesExportaveis,
  comMapaMolde,
  exportarPlanilhaMolde,
  exportXlsx,
  lerMoldeExportacao,
  type CampoExport,
} from '@/io';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RedistribuirTetoButton } from '@/components/RedistribuirTetoButton';
import { formatCurrency, formatCurrency4, formatInteger, formatPercent, formatQuantity } from '@/lib/utils';

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
  const molde = useAppStore((s) => s.drafts.exportMolde);
  const patchDrafts = useAppStore((s) => s.patchDrafts);
  const rules = useAppStore((s) => s.rules);
  const jaNoTeto = useAppStore((s) => s.drafts.clientesTeto);
  const origem = Object.fromEntries(stock.map((s) => [s.codigo, isOrigemQuebrada(s.estoque, s.origemQuebrada)]));
  const fileInput = useRef<HTMLInputElement>(null);
  const [moldeErro, setMoldeErro] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const exportaveis = useMemo(() => (result ? clientesExportaveis(result) : []), [result]);
  const exportaveisKey = exportaveis.join('\0');
  const [marcados, setMarcados] = useState<string[] | null>(null);

  useEffect(() => {
    setMarcados(null);
  }, [exportaveisKey]);

  const selecionados = marcados ?? exportaveis;

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
  const podeExportar = !!molde && molde.avisos.length === 0 && selecionados.length > 0;

  const onMolde = async (file: File) => {
    setMoldeErro(null);
    try {
      patchDrafts({ exportMolde: await lerMoldeExportacao(file) });
    } catch (e) {
      setMoldeErro(e instanceof Error ? e.message : 'Não foi possível ler o molde.');
      patchDrafts({ exportMolde: null });
    }
  };

  const setCampo = (campo: CampoExport, header: string) => {
    if (!molde) return;
    const map = { ...molde.map };
    if (header) map[campo] = header;
    else delete map[campo];
    patchDrafts({ exportMolde: comMapaMolde(molde, map) });
  };

  const onExportar = async () => {
    if (!molde) return;
    setMoldeErro(null);
    setExportando(true);
    try {
      await exportarPlanilhaMolde(molde, stock, result, selecionados);
    } catch (e) {
      setMoldeErro(e instanceof Error ? e.message : 'Falha ao exportar.');
    } finally {
      setExportando(false);
    }
  };

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
          <Button variant="outline" onClick={() => void exportXlsx(stock, result)}>
            Exportar controle geral
          </Button>
        </CardHeader>
        <div className="flex flex-wrap overflow-hidden">
          {totals.map((t) => {
            const nota = result.notas?.[t.c];
            return (
              <div
                key={t.c}
                className="-mt-px -ml-px min-w-[200px] flex-1 border-t border-l border-[var(--color-rule)] px-4 py-3"
              >
                <div className="truncate text-xs text-[var(--color-graphite)]" title={t.c}>
                  {t.c}
                </div>
                <div className="num mt-0.5 text-[1.0625rem] font-semibold leading-[1.3]">{formatCurrency(t.v)}</div>
                {nota && (
                  <div className="mt-1 space-y-0.5 text-[0.6875rem] text-[var(--color-graphite)]">
                    <div>solicitado {formatCurrency(nota.solicitado)}</div>
                    <div>
                      diff {formatCurrency(nota.diferenca)} ({formatPercent(nota.diferencaPct)})
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Exportar planilha</CardTitle>
            <CardDescription>
              um arquivo por cliente, só com os dados dele, no molde oficial — envie o modelo, confira o mapeamento e
              escolha quem entra
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => fileInput.current?.click()}>
              {molde ? 'Trocar molde' : 'Enviar molde'}
            </Button>
            <Button disabled={!podeExportar || exportando} onClick={() => void onExportar()}>
              {exportando
                ? 'Exportando…'
                : selecionados.length <= 1
                  ? 'Exportar planilha'
                  : `Exportar ${selecionados.length} planilhas`}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.xls"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void onMolde(file);
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {molde ? (
            <>
              <p className="text-sm text-[var(--color-graphite)]">
                Molde <span className="font-medium text-[var(--color-ink)]">{molde.fileName}</span>
                {' · '}
                cabeçalho na linha {molde.headerIdx + 1}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {CAMPOS_EXPORT.map(({ campo, label, obrigatorio }) => (
                  <label key={campo} className="block">
                    <span className="label-xs">
                      {label}
                      {obrigatorio && <span className="text-[var(--color-signal-warn)]"> · obrigatório</span>}
                    </span>
                    <Select
                      className="mt-1 h-8 w-full text-[0.8125rem]"
                      value={molde.map[campo] ?? ''}
                      onChange={(e) => setCampo(campo, e.target.value)}
                    >
                      <option value="">— não usar —</option>
                      {molde.headers.map((h, i) => (
                        <option key={`${h}-${i}`} value={h}>
                          {h || `(coluna ${i + 1})`}
                        </option>
                      ))}
                    </Select>
                  </label>
                ))}
              </div>
              {molde.avisos.length > 0 && (
                <ul className="space-y-1 rounded-md bg-[var(--color-signal-warn-wash)] px-3 py-2 text-sm text-[var(--color-signal-warn)]">
                  {molde.avisos.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-sm text-[var(--color-graphite)]">
              Envie o modelo oficial (.xlsx). O Rateia detecta as colunas; ajuste se algum campo obrigatório ficar sem
              origem — ele não preenche vazio no silêncio.
            </p>
          )}
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="label-xs">Clientes nesta exportação</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-xs font-medium text-[var(--color-dock)] underline-offset-2 hover:underline"
                  onClick={() => setMarcados(exportaveis)}
                >
                  Marcar todos
                </button>
                <button
                  type="button"
                  className="text-xs font-medium text-[var(--color-dock)] underline-offset-2 hover:underline"
                  onClick={() => setMarcados([])}
                >
                  Desmarcar todos
                </button>
              </div>
            </div>
            <div className="max-h-48 space-y-0.5 overflow-auto rounded-md border border-[var(--color-rule)] bg-[var(--color-paper)] p-2">
              {exportaveis.map((c) => (
                <label key={c} className="flex cursor-pointer items-center gap-2 px-1 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={selecionados.includes(c)}
                    onChange={() =>
                      setMarcados(
                        selecionados.includes(c) ? selecionados.filter((x) => x !== c) : [...selecionados, c],
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 truncate" title={c}>
                    {c}
                  </span>
                  <span className="num shrink-0 text-xs text-[var(--color-graphite)]">
                    {formatCurrency(clientTotal(stock, result, c))}
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-[var(--color-graphite)]">
              Cada cliente gera um arquivo separado, só com os produtos dele.
            </p>
          </div>
          {moldeErro && (
            <div className="rounded-md bg-[var(--color-signal-risk-wash)] px-3 py-2 text-sm text-[var(--color-signal-risk)]">
              {moldeErro}
            </div>
          )}
        </CardContent>
      </Card>

      {clients.map((c) => {
        const a = result.alloc[c];
        const cods = Object.keys(a).sort();
        const nota = result.notas?.[c];
        return (
          <Card key={c} className="overflow-hidden">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>{c}</CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-x-2">
                  <span className="num">{formatInteger(cods.length)} produto(s) na nota</span>
                  {nota?.cnpj ? (
                    <>
                      <span>·</span>
                      <span className="code">{nota.cnpj}</span>
                    </>
                  ) : null}
                </CardDescription>
              </div>
              <div className="flex flex-col items-end gap-2">
                {nota && !jaNoTeto.includes(c) && clientePodeRedistribuirTeto(result, rules, c) && (
                  <RedistribuirTetoButton cliente={c} solicitado={nota.solicitado} />
                )}
                <div className="text-right">
                {nota && (
                  <>
                    <div className="label-xs">Solicitado {formatCurrency(nota.solicitado)}</div>
                    <div className="label-xs mt-0.5">
                      Diferença {formatCurrency(nota.diferenca)} ({formatPercent(nota.diferencaPct)})
                    </div>
                  </>
                )}
                <div className="label-xs mt-1">Total da nota</div>
                <div className="num mt-0.5 text-[1.0625rem] font-semibold leading-[1.3]">
                  {formatCurrency(clientTotal(stock, result, c))}
                </div>
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
                    <TableCell className="num text-right font-medium">
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {formatQuantity(a[cd])}
                        {origem[cd] && Math.abs(a[cd] - Math.round(a[cd])) > 1e-6 && (
                          <Badge variant="accent">origem</Badge>
                        )}
                      </span>
                    </TableCell>
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
