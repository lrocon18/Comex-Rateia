import type { Produto, Regra, Result, Saldo } from '@/types';
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

/** Códigos listados na regra de pedido (meta/%) daquele cliente. */
export function produtosListadosDoCliente(rules: Regra[], cliente: string): string[] {
  const r = rules.find(
    (x) =>
      (x.tipo === 'meta' || x.tipo === 'percentual') &&
      x.cliente === cliente &&
      x.scope === 'sel' &&
      x.codigos.length > 0,
  );
  return r && (r.tipo === 'meta' || r.tipo === 'percentual') ? [...new Set(r.codigos)] : [];
}

/**
 * Passou do valor exigido cobrindo 100% dos produtos listados — candidato a
 * redistribuir com teto (pode deixar SKU de fora).
 */
export function clientePodeRedistribuirTeto(result: Result | null, rules: Regra[], cliente: string): boolean {
  if (!result) return false;
  const nota = result.notas?.[cliente];
  if (!nota || nota.diferenca <= 0.009) return false;
  const listados = produtosListadosDoCliente(rules, cliente);
  if (!listados.length) return false;
  const alloc = result.alloc[cliente] || {};
  return listados.every((c) => (alloc[c] || 0) > 1e-9);
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
