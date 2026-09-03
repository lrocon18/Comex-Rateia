import { useAppStore } from '@/store/useAppStore';
import type { Escopo, RegraInput, RegraTipo } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

const TIPO_LABEL: Record<RegraTipo, string> = {
  fixo: '1 · Produto → cliente (fixa %)',
  quantidade: '1 · Quantidade explícita',
  percentual: '2 · Percentual por produto',
  meta: '3 · Meta de valor',
  igual: '4 · Dividir o restante (igual)',
};

/** Rótulo + controle no mesmo <label>, para o clique no texto focar o campo. */
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-xs">{label}</span>
      {children}
    </label>
  );
}

function Caixa({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-h-44 space-y-0.5 overflow-auto rounded-md border border-[var(--color-rule)] bg-[var(--color-paper)] p-2">
      {children}
    </div>
  );
}

function ProdutoPicker({ selected, onToggle }: { selected: string[]; onToggle: (c: string) => void }) {
  const stock = useAppStore((s) => s.stock);
  return (
    <Caixa>
      {stock.map((s) => (
        <label key={s.codigo} className="flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={selected.includes(s.codigo)}
            onChange={() => onToggle(s.codigo)}
          />
          <span className="code">{s.codigo}</span>
          <span className="truncate text-[var(--color-graphite)]">{s.produto}</span>
        </label>
      ))}
    </Caixa>
  );
}

export function RuleForm() {
  const clients = useAppStore((s) => s.clients);
  const stock = useAppStore((s) => s.stock);
  const addRule = useAppStore((s) => s.addRule);
  // a regra em construção mora no store: dá para ir conferir o estoque no
  // passo 1 e voltar com a seleção de produtos intacta
  const d = useAppStore((s) => s.drafts.regra);
  const patch = useAppStore((s) => s.patchRegraDraft);

  const { tipo, pct, qtd, valor, tetoReal, scope, participantes, variacao } = d;
  const sel = d.codigos;

  const cli = d.cliente || clients[0] || '';
  const cod = d.codigo || stock[0]?.codigo || '';
  const toggle = (lista: string[], c: string) =>
    lista.includes(c) ? lista.filter((x) => x !== c) : [...lista, c];
  const codigos = () => (scope === 'sel' && sel.length ? sel : []);
  const effScope = (): Escopo => (scope === 'sel' && sel.length ? 'sel' : 'all');

  const submit = () => {
    if (tipo !== 'igual' && !cli) return alert('Adicione um cliente primeiro.');
    let regra: RegraInput;
    if (tipo === 'fixo') regra = { tipo, cliente: cli, codigo: cod, pct };
    else if (tipo === 'quantidade') regra = { tipo, cliente: cli, codigo: cod, qtd };
    else if (tipo === 'percentual') regra = { tipo, cliente: cli, pct, scope: effScope(), codigos: codigos() };
    else if (tipo === 'meta') regra = { tipo, cliente: cli, valor, scope: effScope(), codigos: codigos(), tetoReal };
    else {
      const cls = participantes.length ? participantes : clients.slice();
      if (!cls.length) return alert('Adicione clientes primeiro.');
      regra = { tipo, clientes: cls, variacao };
    }
    addRule(regra);
  };

  return (
    <div className="rounded-md border border-[var(--color-rule)] bg-[var(--color-paper)] p-3">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-end gap-3">
        <Campo label="Tipo de regra">
          <Select value={tipo} onChange={(e) => patch({ tipo: e.target.value as RegraTipo })}>
            {(Object.keys(TIPO_LABEL) as RegraTipo[]).map((t) => (
              <option key={t} value={t}>
                {TIPO_LABEL[t]}
              </option>
            ))}
          </Select>
        </Campo>

        {tipo !== 'igual' && (
          <Campo label="Cliente">
            <Select value={cli} onChange={(e) => patch({ cliente: e.target.value })}>
              {clients.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Campo>
        )}

        {(tipo === 'fixo' || tipo === 'quantidade') && (
          <Campo label="Produto">
            <Select value={cod} onChange={(e) => patch({ codigo: e.target.value })}>
              {stock.map((s) => (
                <option key={s.codigo} value={s.codigo}>
                  {s.codigo} — {s.produto}
                </option>
              ))}
            </Select>
          </Campo>
        )}

        {tipo === 'fixo' && (
          <Campo label="Percentual">
            <Input
              type="number"
              min={1}
              max={100}
              value={pct}
              onChange={(e) => patch({ pct: Number(e.target.value) })}
            />
          </Campo>
        )}
        {tipo === 'quantidade' && (
          <Campo label="Quantidade">
            <Input type="number" min={1} value={qtd} onChange={(e) => patch({ qtd: Number(e.target.value) })} />
          </Campo>
        )}
        {tipo === 'percentual' && (
          <Campo label="% de cada produto">
            <Input
              type="number"
              min={1}
              max={100}
              value={pct}
              onChange={(e) => patch({ pct: Number(e.target.value) })}
            />
          </Campo>
        )}
        {tipo === 'meta' && (
          <Campo label="Valor alvo da nota">
            <Input
              type="number"
              min={1}
              step={100}
              value={valor}
              onChange={(e) => patch({ valor: Number(e.target.value) })}
            />
          </Campo>
        )}

        {(tipo === 'percentual' || tipo === 'meta') && (
          <div className="col-span-full flex flex-col gap-1.5">
            <Label>Quais produtos</Label>
            <div className="flex gap-4 text-sm">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="radio" checked={scope === 'all'} onChange={() => patch({ scope: 'all' })} /> Todos
                com saldo
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="radio" checked={scope === 'sel'} onChange={() => patch({ scope: 'sel' })} />{' '}
                Escolher produtos
              </label>
            </div>
            {scope === 'sel' && (
              <ProdutoPicker selected={sel} onToggle={(c) => patch({ codigos: toggle(sel, c) })} />
            )}
          </div>
        )}

        {tipo === 'meta' && (
          <label className="col-span-full flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={tetoReal}
              onChange={(e) => patch({ tetoReal: e.target.checked })}
            />
            Teto real — não pode passar do alvo
          </label>
        )}

        {tipo === 'igual' && (
          <div className="col-span-full flex flex-col gap-1.5">
            <Label>Clientes que participam da divisão do restante</Label>
            <Caixa>
              {clients.length === 0 && (
                <span className="text-xs text-[var(--color-graphite)]">adicione clientes primeiro</span>
              )}
              {clients.map((c) => (
                <label key={c} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    // lista vazia significa "todos participam"
                    checked={participantes.length === 0 || participantes.includes(c)}
                    onChange={() =>
                      patch({ participantes: toggle(participantes.length ? participantes : clients, c) })
                    }
                  />
                  {c}
                </label>
              ))}
            </Caixa>
            <Label className="mt-2">
              Variação entre as notas — <span className="num">{variacao}</span> trocas
            </Label>
            <input
              type="range"
              min={0}
              max={40}
              value={variacao}
              onChange={(e) => patch({ variacao: Number(e.target.value) })}
              className="max-w-sm"
            />
          </div>
        )}

        <div className="col-span-full">
          <Button variant="outline" onClick={submit}>
            Adicionar regra
          </Button>
        </div>
      </div>
    </div>
  );
}
