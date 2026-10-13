import type { Alloc, ClienteNota, Produto, Regra, RegraPercentual, Result, Saldo } from '@/types';
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

/** Soma de % a partir da qual o produto é dividido por inteiro (33,33% × 3 conta como 100%). */
const PCT_CHEIO = 99.95;
const EPS = 1e-9;

/**
 * Quantidade de cada participante de um produto pelas suas %, arredondada por
 * maiores restos: inteiros, nunca negativos, somando exatamente o total
 * (`base` inteira quando as % somam 100%; acima disso, normaliza).
 * `teto[i]` = participante fica no piso do seu ideal, sem unidade extra.
 * Origem quebrada: a fração da origem vai inteira para o participante de maior %.
 */
export function rateioPercentual(base: number, pcts: number[], teto: boolean[], quebrada: boolean): number[] {
  const soma = pcts.reduce((s, p) => s + p, 0);
  const cheio = soma >= PCT_CHEIO;
  const fator = cheio ? 100 / soma : 1;
  const inteiro = Math.floor(base + EPS);
  const ideais = pcts.map((p) => inteiro * ((p * fator) / 100));
  const q = ideais.map((x) => Math.floor(x + EPS));
  const total = cheio ? inteiro : Math.floor((inteiro * soma) / 100 + EPS);
  let falta = total - q.reduce((s, v) => s + v, 0);
  const ordem = pcts
    .map((_, i) => i)
    .filter((i) => !teto[i])
    .sort((a, b) => ideais[b] - q[b] - (ideais[a] - q[a]) || pcts[b] - pcts[a] || a - b);
  for (const i of ordem) {
    if (falta <= 0) break;
    q[i]++;
    falta--;
  }
  if (quebrada && cheio && base > inteiro + EPS && ordem.length) {
    const maior = ordem.reduce((m, i) => (pcts[i] > pcts[m] ? i : m), ordem[0]);
    q[maior] += base - inteiro;
  }
  return q;
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
 *   2. percentual por produto (quantidade de cada código, maiores restos)
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
  // 2. percentual — por código, todos os clientes sobre a MESMA base (saldo
  // após as diretas). A % vale sobre a quantidade de cada produto.
  const percentuais = rules.filter((r): r is RegraPercentual => r.tipo === 'percentual');
  if (percentuais.length) {
    const escopos = percentuais.map((r) => new Set(scopeCods(r)));
    const solicitado: Record<string, number> = {};
    const valor: Record<string, number> = {};
    for (const c of allCods) {
      const base = avail[c] || 0;
      if (base <= 0) continue;
      const idx = percentuais.map((_, i) => i).filter((i) => percentuais[i].pct > 0 && escopos[i].has(c));
      if (!idx.length) continue;
      const q = rateioPercentual(
        base,
        idx.map((i) => percentuais[i].pct),
        idx.map((i) => percentuais[i].tetoReal === true),
        origemQuebrada[c] === true,
      );
      idx.forEach((i, k) => {
        const cl = percentuais[i].cliente;
        solicitado[cl] = (solicitado[cl] || 0) + base * (percentuais[i].pct / 100) * (pu[c] || 0);
        const antes = alloc[cl]?.[c] || 0;
        give(cl, c, q[k]);
        valor[cl] = (valor[cl] || 0) + ((alloc[cl]?.[c] || 0) - antes) * (pu[c] || 0);
      });
    }
    for (const cl of new Set(percentuais.map((r) => r.cliente))) {
      const sol = solicitado[cl] || 0;
      const val = valor[cl] || 0;
      const diferenca = val - sol;
      notas[cl] = {
        solicitado: sol,
        valor: val,
        diferenca,
        diferencaPct: sol > 1e-9 ? (diferenca / sol) * 100 : 0,
        ...(notas[cl]?.cnpj ? { cnpj: notas[cl].cnpj } : {}),
      };
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
