import type { ItemPedido, PedidoCliente, Produto } from '@/types';

const normCode = (s: string) => String(s ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
const normName = (s: string) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Desmembra um código do Maino em sub-códigos. Cobre os casos combinados:
 *  "WM1-61 WM1-68"      -> ["WM1-61", "WM1-68"]   (separados por espaço)
 *  "WM2-102-WM2-103"    -> ["WM2-102", "WM2-103"] (dois códigos unidos por "-")
 *  "WM1-53-2"           -> ["WM1-53-2"]            (não desmembra: "-2" é sufixo)
 */
export function subCodes(codigo: string): string[] {
  return normCode(codigo)
    .split(/\s+/)
    .flatMap((p) => p.split(/-(?=[A-Za-z])/))
    .map((c) => c.trim())
    .filter(Boolean);
}

/** Índice sub-código (normalizado) -> produto do Maino. */
export function buildCodeIndex(stock: Produto[]): Map<string, Produto> {
  const idx = new Map<string, Produto>();
  for (const p of stock) {
    idx.set(normCode(p.codigo), p);
    for (const sc of subCodes(p.codigo)) if (!idx.has(sc)) idx.set(sc, p);
  }
  return idx;
}

/** Similaridade de nomes por coeficiente de Dice sobre bigramas. */
function diceSimilarity(a: string, b: string): number {
  const bigrams = (s: string) => {
    const g: string[] = [];
    for (let i = 0; i < s.length - 1; i++) g.push(s.slice(i, i + 2));
    return g;
  };
  const A = bigrams(normName(a));
  const B = bigrams(normName(b));
  if (!A.length || !B.length) return 0;
  const count = new Map<string, number>();
  for (const g of A) count.set(g, (count.get(g) || 0) + 1);
  let inter = 0;
  for (const g of B) {
    const c = count.get(g) || 0;
    if (c > 0) {
      inter++;
      count.set(g, c - 1);
    }
  }
  return (2 * inter) / (A.length + B.length);
}

export type MatchVia = 'codigo' | 'subcodigo' | 'nome' | 'none';

export interface MatchItem {
  item: ItemPedido;
  produto: Produto | null;
  via: MatchVia;
  /** confiança 0–1 (1 = match exato por código). */
  score: number;
  /** candidatos por nome quando o código não bate (para confirmação). */
  candidatos: Produto[];
}

const NAME_MATCH = 0.6; // limiar para sugerir match por nome

/** Cruza os itens de um pedido com o estoque. Código é o caminho principal. */
export function matchPedido(pedido: PedidoCliente, stock: Produto[]): MatchItem[] {
  const idx = buildCodeIndex(stock);
  return pedido.itens.map((item) => {
    const code = normCode(item.codigo);
    // 1) código exato (inclui o registro combinado inteiro)
    const exact = idx.get(code);
    if (exact) {
      const via: MatchVia = normCode(exact.codigo) === code ? 'codigo' : 'subcodigo';
      return { item, produto: exact, via, score: 1, candidatos: [] };
    }
    // 2) por nome (fuzzy) — só como reforço, exige confirmação
    let best: Produto | null = null;
    let bestScore = 0;
    const candidatos: Produto[] = [];
    for (const p of stock) {
      const s = diceSimilarity(item.desc, p.produto);
      if (s >= NAME_MATCH) candidatos.push(p);
      if (s > bestScore) {
        bestScore = s;
        best = p;
      }
    }
    candidatos.sort((a, b) => diceSimilarity(item.desc, b.produto) - diceSimilarity(item.desc, a.produto));
    if (best && bestScore >= NAME_MATCH) {
      return { item, produto: best, via: 'nome', score: bestScore, candidatos: candidatos.slice(0, 5) };
    }
    return { item, produto: null, via: 'none', score: 0, candidatos: candidatos.slice(0, 5) };
  });
}
