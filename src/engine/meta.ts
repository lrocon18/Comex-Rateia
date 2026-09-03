import type { Saldo } from '@/types';

export interface MetaFillResult {
  take: Record<string, number>;
  value: number;
}

/**
 * Meta de valor (doc 04 §3 / doc 06 D2). Port 1:1 do protótipo validado.
 *
 * Passo 1: preenche por baixo consumindo os PU mais caros primeiro.
 * Passo 2: arredonda PRA CIMA com o menor PU disponível (overshoot mínimo).
 *
 * Resultado: `value >= target` por uma diferença mínima, OU o máximo possível
 * quando o estoque não alcança (não força).
 *
 * @param tetoReal quando true, pula o passo 2 — para no maior valor <= target
 *   (cliente com teto real, "não pode passar"). Default false = alvo aproximado.
 */
export function metaFill(
  codigos: string[],
  avail: Saldo,
  pu: Saldo,
  target: number,
  tetoReal = false,
): MetaFillResult {
  const take: Record<string, number> = {};
  let value = 0;

  const desc = codigos.filter((c) => avail[c] > 0).sort((a, b) => pu[b] - pu[a]);
  for (const c of desc) {
    const room = target - value;
    if (room <= 0) break;
    let n = Math.floor(room / pu[c]);
    n = Math.min(n, avail[c] - (take[c] || 0));
    if (n > 0) {
      take[c] = (take[c] || 0) + n;
      value += n * pu[c];
    }
  }

  if (!tetoReal) {
    let guard = 0;
    while (value < target && guard++ < 200000) {
      const cand = codigos
        .filter((c) => avail[c] - (take[c] || 0) > 0)
        .sort((a, b) => pu[a] - pu[b]);
      if (!cand.length) break;
      const c = cand[0];
      take[c] = (take[c] || 0) + 1;
      value += pu[c];
    }
  }

  return { take, value };
}
