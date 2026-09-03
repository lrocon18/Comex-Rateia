import { X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import type { Regra } from '@/types';
import { RuleForm } from '@/components/RuleForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';

const ORDER: Record<Regra['tipo'], number> = { fixo: 1, quantidade: 1, percentual: 2, meta: 3, igual: 4 };

function describe(r: Regra, clientsCount: number): { desc: string; meta: string } {
  if (r.tipo === 'fixo') return { desc: `${r.cliente} recebe ${r.pct}% de ${r.codigo}`, meta: 'alocação fixa (%)' };
  if (r.tipo === 'quantidade')
    return { desc: `${r.cliente} recebe ${r.qtd} un. de ${r.codigo}`, meta: 'quantidade explícita' };
  if (r.tipo === 'percentual')
    return {
      desc: `${r.cliente} recebe ${r.pct}% ${r.scope === 'sel' ? `de ${r.codigos.length} produto(s)` : 'de cada produto'}`,
      meta: 'percentual por produto',
    };
  if (r.tipo === 'meta')
    return {
      desc: `${r.cliente} — meta ${formatCurrency(r.valor)} ${r.scope === 'sel' ? `(${r.codigos.length} produto(s))` : '(todos com saldo)'}`,
      meta: `meta de valor · ${r.tetoReal ? 'teto real' : 'arredonda pra cima'}`,
    };
  return {
    desc: `Divisão do restante entre ${r.clientes.length || clientsCount} cliente(s)`,
    meta: `divisão igual · variação ${r.variacao}`,
  };
}

export function DistribuirTab() {
  const clients = useAppStore((s) => s.clients);
  const rules = useAppStore((s) => s.rules);
  const addClient = useAppStore((s) => s.addClient);
  const removeClient = useAppStore((s) => s.removeClient);
  const removeRule = useAppStore((s) => s.removeRule);
  const calculate = useAppStore((s) => s.calculate);
  const novo = useAppStore((s) => s.drafts.novoCliente);
  const patchDrafts = useAppStore((s) => s.patchDrafts);

  const sorted = [...rules].sort((a, b) => ORDER[a.tipo] - ORDER[b.tipo]);

  return (
    <div className="mt-5 space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Clientes</CardTitle>
          <CardDescription>quem vai receber nesta divisão</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="nome do cliente"
              value={novo}
              onChange={(e) => patchDrafts({ novoCliente: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && addClient(novo)}
              className="w-64"
            />
            <Button variant="outline" onClick={() => addClient(novo)}>
              Adicionar
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {clients.length === 0 && (
              <span className="text-sm text-[var(--color-graphite)]">
                nenhum cliente ainda — eles também entram sozinhos ao importar o pedido.
              </span>
            )}
            {clients.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-rule)] bg-[var(--color-surface)] py-1 pr-1 pl-2.5 text-[0.8125rem]"
              >
                {c}
                <button
                  type="button"
                  aria-label={`Remover ${c}`}
                  onClick={() => removeClient(c)}
                  className="rounded p-0.5 text-[var(--color-graphite-light)] transition-colors hover:bg-[var(--color-signal-risk-wash)] hover:text-[var(--color-signal-risk)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Regras de distribuição</CardTitle>
          <CardDescription>
            aplicadas sempre nesta ordem: fixa/quantidade → percentual → meta → divisão igual, cada etapa
            consumindo o saldo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RuleForm />

          <div className="space-y-2">
            {sorted.length === 0 && (
              <div className="rounded-md border border-dashed border-[var(--color-rule-strong)] bg-[var(--color-paper)] py-6 text-center text-sm text-[var(--color-graphite)]">
                Nenhuma regra ainda. Monte a primeira acima.
              </div>
            )}
            {sorted.map((r) => {
              const d = describe(r, clients.length);
              return (
                <div
                  key={r.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-[var(--color-rule)] px-3 py-2.5"
                >
                  <div className="flex gap-3">
                    <span className="num mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-[var(--color-dock-wash)] text-[0.6875rem] font-semibold text-[var(--color-dock-strong)]">
                      {ORDER[r.tipo]}
                    </span>
                    <div>
                      <div className="text-sm">{d.desc}</div>
                      <div className="mt-0.5 text-xs text-[var(--color-graphite)]">{d.meta}</div>
                    </div>
                  </div>
                  <Button variant="danger" size="sm" onClick={() => removeRule(r.id)}>
                    remover
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 border-b-0">
          <div className="space-y-1">
            <CardTitle>Calcular a distribuição</CardTitle>
            <CardDescription>roda as regras respeitando o saldo — nunca ultrapassa o disponível</CardDescription>
          </div>
          <Button size="lg" onClick={calculate} disabled={rules.length === 0}>
            Calcular
          </Button>
        </CardHeader>
      </Card>
    </div>
  );
}
