import type { Produto, Result, Saldo } from '@/types';
import { puMap } from './distribute';

/** codigo -> quantidade total distribuída entre todos os clientes. */
export function distributedMap(stock: Produto[], result: Result | null): Saldo {
  const d: Saldo = {};
  stock.forEach((s) => (d[s.codigo] = 0));
  if (result) {
    for (const cl in result.alloc)
      for (const c in result.alloc[cl]) d[c] = (d[c] || 0) + result.alloc[cl][c];
  }
  return d;
}

/** Valor total da nota de um cliente. */
export function clientTotal(
  stock: Produto[],
  result: Result | null,
  cliente: string,
): number {
  const pu = puMap(stock);
  const a = result?.alloc?.[cliente] || {};
  let v = 0;
  for (const c in a) v += a[c] * pu[c];
  return v;
}

export interface LedgerTotals {
  produtos: number;
  estoqueInicial: number;
  distribuido: number;
  disponivel: number;
  valorSobra: number;
  clientes: number;
}

/** Totais do "ledger" do topo (controle geral). */
export function ledgerTotals(
  stock: Produto[],
  result: Result | null,
  clientsCount: number,
): LedgerTotals {
  const dist = distributedMap(stock, result);
  const estoqueInicial = stock.reduce((s, x) => s + x.estoque, 0);
  const distribuido = Object.values(dist).reduce((a, b) => a + b, 0);
  const disponivel = estoqueInicial - distribuido;
  const valorSobra = stock.reduce(
    (s, x) => s + Math.max(0, x.estoque - (dist[x.codigo] || 0)) * x.pu,
    0,
  );
  const clientes = Object.keys(result?.alloc || {}).length || clientsCount;
  return {
    produtos: stock.length,
    estoqueInicial,
    distribuido,
    disponivel,
    valorSobra,
    clientes,
  };
}
