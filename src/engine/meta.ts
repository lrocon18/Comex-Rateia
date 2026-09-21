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
 * @param integerOrigin por código: true (ou ausente) quando a quantidade
 *   inicial daquele produto na planilha de origem é inteira — o algoritmo pode
 *   fatiar normalmente (unidade a unidade). Quando false (origem já veio
 *   quebrada, ex. 1,6), o produto é uma parcela indivisível: o algoritmo só
 *   pode levar tudo ou nada, nunca inventar uma fração dela para ajustar o
 *   valor (regra obrigatória — nunca quebrar quantidade pra bater valor).
 * @param tetoReal quando true, pula o passo 2 — para no maior valor <= target
 *   (cliente com teto real, "não pode passar"). Default false = alvo aproximado.
 */
export function metaFill(
  codigos: string[],
  avail: Saldo,
  pu: Saldo,
  target: number,
  integerOrigin: Record<string, boolean> = {},
  tetoReal = false,
): MetaFillResult {
  const take: Record<string, number> = {};
  let value = 0;
  const isInt = (c: string) => integerOrigin[c] !== false;

  const desc = codigos.filter((c) => avail[c] > 0).sort((a, b) => pu[b] - pu[a]);
  for (const c of desc) {
    const room = target - value;
    if (room <= 0) break;
    const remaining = avail[c] - (take[c] || 0);
    let n: number;
    if (isInt(c)) {
      n = Math.min(Math.floor(room / pu[c]), remaining);
    } else {
      // parcela indivisível: só entra aqui se ela inteira couber no espaço restante
      n = remaining > 0 && remaining * pu[c] <= room + 1e-9 ? remaining : 0;
    }
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
      const remaining = avail[c] - (take[c] || 0);
      const step = isInt(c) ? 1 : remaining; // parcela quebrada: leva o restante inteiro de uma vez
      take[c] = (take[c] || 0) + step;
      value += step * pu[c];
    }
  }

  return { take, value };
}
