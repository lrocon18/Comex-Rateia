import type { Alloc, ClienteNota, Produto, Regra, Result, Saldo } from '@/types';
import { distribuirPedido } from './meta';
import { isOrigemQuebrada } from './granularity';
import { splitEqual, type Rng } from './equal';

export function puMap(stock: Produto[]): Saldo {
  return Object.fromEntries(stock.map((s) => [s.codigo, s.pu]));
}
export function prodMap(stock: Produto[]): Record<string, string> {
  return Object.fromEntries(stock.map((s) => [s.codigo, s.produto]));
}
export function iniMap(stock: Produto[]): Saldo {
  return Object.fromEntries(stock.map((s) => [s.codigo, s.estoque]));
}

function flagsOrigem(stock: Produto[]): { origInt: Record<string, boolean>; origemQuebrada: Record<string, boolean> } {
  const origInt: Record<string, boolean> = {};
  const origemQuebrada: Record<string, boolean> = {};
  for (const s of stock) {
    const qbr = isOrigemQuebrada(s.estoque, s.origemQuebrada);
    origemQuebrada[s.codigo] = qbr;
    origInt[s.codigo] = !qbr;
  }
  return { origInt, origemQuebrada };
}

/**
 * Motor central (doc 04). Aplica as regras na ORDEM FIXA, cada etapa consumindo
 * o saldo (`avail`) já reduzido pelas anteriores:
 *   1. alocações diretas: quantidade explícita, depois fixo (%)
 *   2. percentual por produto (mesmo rateio de conjunto que a meta)
 *   3. meta de valor
 *   4. divisão igual do restante (com variação)
 * Puro: não muta os argumentos; devolve um novo `Result`.
 */
export function compute(
  stock: Produto[],
  clients: string[],
  rules: Regra[],
  rng: Rng = Math.random,
): Result {
  const pu = puMap(stock);
  const avail: Saldo = iniMap(stock);
  const alloc: Alloc = {};
  const notas: Record<string, ClienteNota> = {};
  const { origInt, origemQuebrada } = flagsOrigem(stock);

  const ensure = (c: string) => {
    if (!alloc[c]) alloc[c] = {};
  };
  const give = (cl: string, c: string, q: number) => {
    if (avail[c] == null) return;
    q = Math.min(q, avail[c]);
    if (origInt[c] !== false) q = Math.floor(q);
    if (q <= 0) return;
    ensure(cl);
    alloc[cl][c] = (alloc[cl][c] || 0) + q;
    avail[c] -= q;
  };

  const allCods = stock.map((s) => s.codigo);
  const scopeCods = (r: { scope: 'all' | 'sel'; codigos: string[] }): string[] =>
    r.scope === 'sel' ? r.codigos || [] : allCods;

  const aplicarRateio = (cliente: string, take: Record<string, number>, nota: Omit<ClienteNota, 'cnpj'>) => {
    for (const c of Object.keys(take)) give(cliente, c, take[c]);
    notas[cliente] = { ...nota, ...(notas[cliente]?.cnpj ? { cnpj: notas[cliente].cnpj } : {}) };
  };

  // 1. alocações diretas (mais específicas primeiro)
  for (const r of rules) {
    if (r.tipo === 'quantidade') give(r.cliente, r.codigo, r.qtd);
  }
  for (const r of rules) {
    if (r.tipo === 'fixo') give(r.cliente, r.codigo, avail[r.codigo] * (r.pct / 100));
  }
  // 2. percentual — cota de cada item do conjunto, na grade da origem
  for (const r of rules) {
    if (r.tipo === 'percentual') {
      const cods = scopeCods(r).filter((c) => avail[c] > 0);
      const d = distribuirPedido({ codigos: cods, avail, pu, origemQuebrada, pct: r.pct });
      aplicarRateio(r.cliente, d.take, {
        solicitado: d.solicitado,
        valor: d.value,
        diferenca: d.diferenca,
        diferencaPct: d.diferencaPct,
      });
    }
  }
  // 3. meta de valor — mesmo pipeline, alvo em R$
  for (const r of rules) {
    if (r.tipo === 'meta') {
      const cods = scopeCods(r).filter((c) => avail[c] > 0);
      const d = distribuirPedido({
        codigos: cods,
        avail,
        pu,
        origemQuebrada,
        alvo: r.valor,
        tetoReal: r.tetoReal,
      });
      aplicarRateio(r.cliente, d.take, {
        solicitado: d.solicitado,
        valor: d.value,
        diferenca: d.diferenca,
        diferencaPct: d.diferencaPct,
      });
    }
  }
  // 4. divisão igual do restante
  for (const r of rules) {
    if (r.tipo === 'igual') {
      const cls = r.clientes && r.clientes.length ? r.clientes : clients.slice();
      const res = splitEqual(cls, avail, r.variacao, rng, origInt);
      for (const cl in res)
        for (const c in res[cl]) {
          if (res[cl][c] > 0) {
            ensure(cl);
            alloc[cl][c] = (alloc[cl][c] || 0) + res[cl][c];
          }
        }
    }
  }

  const leftover: Saldo = {};
  for (const c in avail) if (avail[c] > 0) leftover[c] = avail[c];

  return { alloc, leftover, availFinal: { ...avail }, notas };
}
