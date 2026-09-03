import type { Alloc, Produto, Regra, Result, Saldo } from '@/types';
import { metaFill } from './meta';
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

/**
 * Motor central (doc 04). Aplica as regras na ORDEM FIXA, cada etapa consumindo
 * o saldo (`avail`) já reduzido pelas anteriores:
 *   1. alocações diretas: quantidade explícita, depois fixo (%)
 *   2. percentual por produto
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

  const ensure = (c: string) => {
    if (!alloc[c]) alloc[c] = {};
  };
  const give = (cl: string, c: string, q: number) => {
    if (avail[c] == null) return; // código fora do estoque: ignora
    q = Math.min(Math.floor(q), avail[c]);
    if (q <= 0) return;
    ensure(cl);
    alloc[cl][c] = (alloc[cl][c] || 0) + q;
    avail[c] -= q;
  };

  const allCods = stock.map((s) => s.codigo);
  const scopeCods = (r: { scope: 'all' | 'sel'; codigos: string[] }): string[] =>
    r.scope === 'sel' ? r.codigos || [] : allCods;

  // 1. alocações diretas (mais específicas primeiro)
  for (const r of rules) {
    if (r.tipo === 'quantidade') give(r.cliente, r.codigo, r.qtd);
  }
  for (const r of rules) {
    if (r.tipo === 'fixo') give(r.cliente, r.codigo, avail[r.codigo] * (r.pct / 100));
  }
  // 2. percentual por produto
  for (const r of rules) {
    if (r.tipo === 'percentual')
      for (const c of scopeCods(r)) give(r.cliente, c, avail[c] * (r.pct / 100));
  }
  // 3. meta de valor
  for (const r of rules) {
    if (r.tipo === 'meta') {
      const cods = scopeCods(r).filter((c) => avail[c] > 0);
      const { take } = metaFill(cods, avail, pu, r.valor, r.tetoReal);
      for (const c of Object.keys(take)) give(r.cliente, c, take[c]);
    }
  }
  // 4. divisão igual do restante
  for (const r of rules) {
    if (r.tipo === 'igual') {
      const cls = r.clientes && r.clientes.length ? r.clientes : clients.slice();
      const res = splitEqual(cls, avail, r.variacao, rng);
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

  return { alloc, leftover, availFinal: { ...avail } };
}
