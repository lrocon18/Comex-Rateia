import type { Saldo } from '@/types';

/** Fonte de aleatoriedade injetável — retorna [0, 1). Default: Math.random. */
export type Rng = () => number;

/**
 * Divisão igual do restante com variação proposital (doc 04 §4 / doc 06 D1).
 * Port 1:1 do protótipo validado.
 *
 * Distribui igualmente o saldo de cada produto entre os clientes (o resto da
 * divisão vai 1 a 1 a partir de um início rotacionado) e depois "embaralha"
 * `variacao` unidades avulsas entre clientes — muda o VALOR das notas sem
 * criar/perder estoque. 100% do saldo é distribuído (avail zera).
 *
 * ATENÇÃO: muta `avail` (zera os códigos distribuídos), como no protótipo — é
 * o saldo de trabalho sendo consumido por esta etapa.
 */
export function splitEqual(
  clients: string[],
  avail: Saldo,
  variacao: number,
  rng: Rng = Math.random,
): Record<string, Record<string, number>> {
  const res: Record<string, Record<string, number>> = {};
  clients.forEach((c) => (res[c] = {}));
  const n = clients.length;
  if (!n) return res;

  const cods = Object.keys(avail).filter((c) => avail[c] > 0);
  for (const c of cods) {
    const a = avail[c];
    const base = Math.floor(a / n);
    const rem = a - base * n;
    const start = Math.floor(rng() * n);
    clients.forEach((cl) => (res[cl][c] = base));
    for (let k = 0; k < rem; k++) {
      res[clients[(start + k) % n]][c] += 1;
    }
    avail[c] = 0;
  }

  const moves = Math.max(0, variacao | 0);
  for (let m = 0; m < moves; m++) {
    if (!cods.length) break;
    const c = cods[Math.floor(rng() * cods.length)];
    const givers = clients.filter((cl) => res[cl][c] > 0);
    if (givers.length < 1 || n < 2) continue;
    const g = givers[Math.floor(rng() * givers.length)];
    let r = clients[Math.floor(rng() * n)];
    if (r === g) r = clients[(clients.indexOf(g) + 1) % n];
    res[g][c] -= 1;
    res[r][c] += 1;
  }

  return res;
}
