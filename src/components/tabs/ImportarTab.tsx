import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAppStore, type PedidoConfirmado, type PedidoDraft } from '@/store/useAppStore';
import { getMapping, saveMapping } from '@/store/db';
import {
  importCliente,
  matchPedido,
  parseSheet,
  type Campo,
  type MapaColunas,
  type MatchVia,
  type Row,
  type SheetParse,
} from '@/io';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Status, type Tone } from '@/components/ui/status';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatInteger } from '@/lib/utils';

const VIA: Record<MatchVia, { txt: string; tone: Tone }> = {
  codigo: { txt: 'código', tone: 'ok' },
  subcodigo: { txt: 'sub-código', tone: 'ok' },
  nome: { txt: 'nome — confirmar', tone: 'warn' },
  none: { txt: 'não casou', tone: 'risk' },
};

const CAMPOS: { campo: Campo; label: string }[] = [
  { campo: 'codigo', label: 'Código' },
  { campo: 'produto', label: 'Descrição' },
  { campo: 'quantidade', label: 'Quantidade' },
];

/** Rótulo curto de uma linha da planilha, para o seletor de cabeçalho. */
function resumoLinha(row: Row): string {
  return (
    row
      .map((c) => String(c ?? '').trim())
      .filter(Boolean)
      .slice(0, 4)
      .join(' · ') || '(vazia)'
  );
}

export function ImportarTab() {
  const stock = useAppStore((s) => s.stock);
  const applyPedidos = useAppStore((s) => s.applyPedidos);
  // a conferência das abas vive no store: trocar de passo não pode custar o
  // trabalho já feito aqui
  const drafts = useAppStore((s) => s.drafts.pedidos);
  const erro = useAppStore((s) => s.drafts.pedidosErro);
  const setDrafts = useAppStore((s) => s.setPedidosDraft);
  const patchDrafts = useAppStore((s) => s.patchDrafts);
  const fileInput = useRef<HTMLInputElement>(null);
  const [removerDi, setRemoverDi] = useState<number | null>(null);

  const setErro = (pedidosErro: string | null) => patchDrafts({ pedidosErro });

  const montarDraft = (rows: Row[], parse: SheetParse, base?: PedidoDraft): PedidoDraft => {
    const pedido = parse.pedido ?? {
      aba: parse.aba,
      nome: parse.aba,
      cnpj: '',
      valorAlvo: null,
      semNota: false,
      itens: [],
    };
    return {
      rows,
      parse,
      pedido,
      itens: matchPedido(pedido, stock).map((m) => ({
        codigoPedido: m.item.codigo,
        desc: m.item.desc,
        qts: m.item.qts,
        produto: m.produto,
        via: m.via,
      })),
      // valor-alvo editado na mão sobrevive ao reprocessamento
      valorAlvo: base ? base.valorAlvo : pedido.valorAlvo,
      daMemoria: base?.daMemoria ?? false,
      mapAberto: base?.mapAberto ?? parse.uncertain.length > 0,
    };
  };

  const onFile = async (file: File) => {
    patchDrafts({ pedidos: null, pedidosErro: null });
    try {
      const { abas, parses } = await importCliente(file);
      const novos: PedidoDraft[] = [];
      for (let i = 0; i < abas.length; i++) {
        const { rows } = abas[i];
        let parse = parses[i];
        let daMemoria = false;
        const salvo = await getMapping(parse.pedido?.nome ?? parse.aba);
        if (salvo && Object.keys(salvo).length) {
          parse = parseSheet(parse.aba, rows, { map: salvo });
          daMemoria = true;
        }
        novos.push({ ...montarDraft(rows, parse), daMemoria });
      }
      patchDrafts({
        pedidos: novos,
        pedidosErro: novos.some((d) => d.itens.length)
          ? null
          : 'Não reconheci a tabela de produtos em nenhuma aba. Escolha a linha do cabeçalho e as colunas abaixo.',
      });
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  /** Reprocessa uma aba com um mapa/linha de cabeçalho novos. */
  const reprocessar = (di: number, mudanca: { map?: MapaColunas; headerIdx?: number }) =>
    setDrafts((ds) =>
      ds
        ? ds.map((d, i) => {
            if (i !== di) return d;
            const map = mudanca.map ?? d.parse.map;
            const headerIdx = mudanca.headerIdx ?? d.parse.headerIdx;
            return montarDraft(d.rows, parseSheet(d.parse.aba, d.rows, { map, headerIdx }), d);
          })
        : ds,
    );

  const setCampo = (di: number, campo: Campo, header: string) => {
    const d = drafts?.[di];
    if (!d) return;
    const map: MapaColunas = { ...d.parse.map };
    if (header) map[campo] = header;
    else delete map[campo];
    reprocessar(di, { map });
  };

  const toggleMapa = (di: number) =>
    setDrafts((ds) => (ds ? ds.map((d, i) => (i === di ? { ...d, mapAberto: !d.mapAberto } : d)) : ds));

  const override = (di: number, ri: number, codigo: string) =>
    setDrafts((ds) =>
      ds
        ? ds.map((d, i) =>
            i !== di
              ? d
              : {
                  ...d,
                  itens: d.itens.map((r, j) =>
                    j !== ri
                      ? r
                      : {
                          ...r,
                          produto: stock.find((s) => s.codigo === codigo) || null,
                          via: (codigo ? 'nome' : 'none') as MatchVia,
                        },
                  ),
                },
          )
        : ds,
    );

  const setValorAlvo = (di: number, v: number | null) =>
    setDrafts((ds) => (ds ? ds.map((d, i) => (i === di ? { ...d, valorAlvo: v } : d)) : ds));

  const fecharRemover = () => setRemoverDi(null);

  /** Tira o bloco da conferência: esse cliente não vira regra nem entra na exportação. */
  const confirmarRemover = () => {
    if (removerDi == null) return;
    const di = removerDi;
    setRemoverDi(null);
    const atuais = drafts;
    if (!atuais) return;
    const next = atuais.filter((_, i) => i !== di);
    patchDrafts({
      pedidos: next.length ? next : null,
      pedidosErro: next.some((d) => d.itens.length)
        ? null
        : next.length
          ? 'Não reconheci a tabela de produtos em nenhuma aba. Escolha a linha do cabeçalho e as colunas abaixo.'
          : null,
    });
  };

  const clienteARemover = removerDi != null ? drafts?.[removerDi] : undefined;

  const aplicar = async () => {
    if (!drafts) return;
    const usados = drafts.filter((d) => d.itens.length);
    const confirmados: PedidoConfirmado[] = usados.map((d) => ({
      pedido: { ...d.pedido, valorAlvo: d.valorAlvo },
      matches: d.itens.map((r) => ({
        item: { codigo: r.codigoPedido, desc: r.desc, qts: r.qts },
        produto: r.produto,
        via: r.via,
        score: r.produto ? 1 : 0,
        candidatos: [],
      })),
    }));
    // memória: o padrão de colunas daquele cliente para a próxima planilha
    await Promise.all(usados.map((d) => saveMapping(d.pedido.nome, d.parse.map)));
    // applyPedidos já descarta o rascunho: a conferência foi consumida
    applyPedidos(confirmados);
  };

  const prontos = drafts?.filter((d) => d.itens.length).length ?? 0;

  return (
    <div className="mt-5 space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Pedido do cliente</CardTitle>
          <CardDescription>
            uma aba por cliente — CNPJ, valor-alvo e a tabela de produtos. O cruzamento é por código; nome só
            como reforço.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => fileInput.current?.click()}>
            Escolher arquivo (.xls / .xlsx)
          </Button>
          <span className="text-xs text-[var(--color-graphite)]">
            lido localmente; nada sai da máquina.
          </span>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls"
            hidden
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          {erro && (
            <div className="w-full rounded-md bg-[var(--color-signal-risk-wash)] px-3 py-2 text-sm text-[var(--color-signal-risk)]">
              {erro}
            </div>
          )}
        </CardContent>
      </Card>

      {drafts?.map((d, di) => {
        const naoCasou = d.itens.filter((r) => !r.produto).length;
        const semCabecalho = d.parse.headerIdx < 0;
        return (
          <Card key={d.parse.aba} className="overflow-hidden">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                  {d.pedido.nome}
                  {d.daMemoria && <Badge variant="accent">padrão salvo</Badge>}
                  <button
                    type="button"
                    aria-label={`Remover o cliente mapeado ${d.pedido.nome}`}
                    onClick={() => setRemoverDi(di)}
                    className="rounded-md p-1 text-[var(--color-signal-risk)] transition-colors hover:bg-[var(--color-signal-risk-wash)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-x-2">
                  <span className="code">{d.parse.aba}</span>
                  <span>·</span>
                  <span className="code">{d.pedido.cnpj || 'sem CNPJ'}</span>
                  <span>·</span>
                  <span className="num">{formatInteger(d.itens.length)} item(ns)</span>
                  {naoCasou > 0 && (
                    <>
                      <span>·</span>
                      <Status tone="risk">{formatInteger(naoCasou)} não casou</Status>
                    </>
                  )}
                  {d.pedido.semNota && (
                    <>
                      <span>·</span>
                      <Badge variant="warn">sem nota</Badge>
                    </>
                  )}
                </CardDescription>
              </div>
              <label className="flex items-center gap-2">
                <span className="label-xs">Valor-alvo</span>
                <Input
                  type="number"
                  className="h-8 w-36"
                  value={d.valorAlvo ?? ''}
                  placeholder="sem meta"
                  onChange={(e) => setValorAlvo(di, e.target.value === '' ? null : Number(e.target.value))}
                />
              </label>
            </CardHeader>

            <div className="border-b border-[var(--color-rule)] bg-[var(--color-paper)] px-4 py-2.5">
              <button
                type="button"
                onClick={() => toggleMapa(di)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span className="label-xs">
                  Colunas desta aba
                  {d.parse.uncertain.length > 0 && (
                    <span className="text-[var(--color-signal-warn)]">
                      {' '}
                      · {d.parse.uncertain.length} sem coluna
                    </span>
                  )}
                </span>
                <span className="text-xs text-[var(--color-dock)]">{d.mapAberto ? 'ocultar' : 'ajustar'}</span>
              </button>

              {d.mapAberto && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {CAMPOS.map(({ campo, label }) => (
                    <label key={campo} className="block">
                      <span className="label-xs">{label}</span>
                      <Select
                        className="mt-1 h-8 w-full text-[0.8125rem]"
                        value={d.parse.map[campo] ?? ''}
                        disabled={semCabecalho}
                        onChange={(e) => setCampo(di, campo, e.target.value)}
                      >
                        <option value="">— não usar —</option>
                        {d.parse.headers.map((h, i) => (
                          <option key={`${h}-${i}`} value={h}>
                            {h || `(coluna ${i + 1})`}
                          </option>
                        ))}
                      </Select>
                    </label>
                  ))}
                  <label className="block">
                    <span className="label-xs">
                      Linha do cabeçalho
                      {semCabecalho && <span className="text-[var(--color-signal-warn)]"> · escolha</span>}
                    </span>
                    <Select
                      className="mt-1 h-8 w-full text-[0.8125rem]"
                      value={d.parse.headerIdx}
                      onChange={(e) => reprocessar(di, { headerIdx: Number(e.target.value) })}
                    >
                      {semCabecalho && <option value={-1}>— escolher —</option>}
                      {d.rows.slice(0, 20).map((row, i) => (
                        <option key={i} value={i}>
                          linha {i + 1}: {resumoLinha(row)}
                        </option>
                      ))}
                    </Select>
                  </label>
                </div>
              )}
            </div>

            {d.itens.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cód. pedido</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Qts</TableHead>
                    <TableHead>Cruzamento</TableHead>
                    <TableHead>Produto no estoque</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.itens.map((r, ri) => (
                    <TableRow key={ri}>
                      <TableCell className="code">{r.codigoPedido}</TableCell>
                      <TableCell className="max-w-[220px] truncate" title={r.desc}>
                        {r.desc}
                      </TableCell>
                      <TableCell className="num text-right">{formatInteger(r.qts)}</TableCell>
                      <TableCell>
                        <Status tone={VIA[r.via].tone}>{VIA[r.via].txt}</Status>
                      </TableCell>
                      <TableCell>
                        <Select
                          className="h-8 w-full max-w-[300px] text-[0.8125rem]"
                          value={r.produto?.codigo ?? ''}
                          onChange={(e) => override(di, ri, e.target.value)}
                        >
                          <option value="">— não casar —</option>
                          {stock.map((s) => (
                            <option key={s.codigo} value={s.codigo}>
                              {s.codigo} — {s.produto}
                            </option>
                          ))}
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        );
      })}

      {drafts && drafts.length > 0 && (
        <Card>
          <CardFooter className="justify-end bg-[var(--color-surface)]">
            <span className="num mr-auto text-xs text-[var(--color-graphite)]">
              {formatInteger(prontos)} de {formatInteger(drafts.length)} aba(s) com itens reconhecidos
            </span>
            <Button variant="ghost" onClick={() => patchDrafts({ pedidos: null, pedidosErro: null })}>
              Descartar
            </Button>
            <Button onClick={() => void aplicar()} disabled={prontos === 0}>
              Gerar clientes e regras de meta
            </Button>
          </CardFooter>
        </Card>
      )}

      <Dialog
        open={removerDi != null}
        onClose={fecharRemover}
        labelledBy="remover-cliente-mapeado-title"
        className="max-w-md"
      >
        <DialogHeader onClose={fecharRemover}>
          <DialogTitle id="remover-cliente-mapeado-title">Remover cliente mapeado</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <DialogDescription className="text-sm text-[var(--color-ink)]">
            Você realmente quer remover o cliente mapeado
            {clienteARemover ? (
              <>
                {' '}
                <span className="font-semibold">{clienteARemover.pedido.nome}</span>
              </>
            ) : null}
            ? Ele não será gerado nem exportado nesta planilha.
          </DialogDescription>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={fecharRemover}>
            NÃO
          </Button>
          <Button
            className="bg-[var(--color-signal-risk)] text-white hover:bg-[var(--color-signal-risk)]"
            onClick={confirmarRemover}
          >
            SIM
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
