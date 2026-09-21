import type { Saldo } from '@/types';
import { proximoDecremento, proximoIncremento, snapDown } from './granularity';

export interface MetaFillResult {
  take: Record<string, number>;
  value: number;
  solicitado: number;
  diferenca: number;
  diferencaPct: number;
}

export interface DistribuirPedidoOpts {
  codigos: string[];
  avail: Saldo;
  pu: Saldo;
  /** true = quantidade de origem já vinha decimal. */
  origemQuebrada?: Record<string, boolean>;
  /** Alvo em reais. Ignorado quando `pct` é informado. */
  alvo?: number | null;
  /** Fração-base (0–100). Define o solicitado como pct% do valor do conjunto. */
  pct?: number | null;
  /** true = nunca ultrapassa o solicitado. */
  tetoReal?: boolean;
}

const EPS = 1e-9;

function quebradaDe(c: string, flags: Record<string, boolean> | undefined): boolean {
  return flags?.[c] === true;
}

function valorDe(take: Record<string, number>, pu: Saldo): number {
  let v = 0;
  for (const c in take) v += take[c] * (pu[c] || 0);
  return v;
}

function relatorio(take: Record<string, number>, pu: Saldo, solicitado: number): MetaFillResult {
  const value = valorDe(take, pu);
  const diferenca = value - solicitado;
  const diferencaPct = solicitado > EPS ? (diferenca / solicitado) * 100 : 0;
  return { take, value, solicitado, diferenca, diferencaPct };
}

/**
 * Rateia um alvo (R$ ou %) sobre o conjunto inteiro de SKUs, ajustando a
 * quantidade de cada item pelo PU de saída. Não escolhe um subconjunto até
 * somar o valor.
 *
 * Grade: origem inteira só inteiros; origem quebrada permite 0…floor e o valor
 * original. Nunca inventa decimal. Aproxima o solicitado minimizando |diff|.
 */
export function distribuirPedido(opts: DistribuirPedidoOpts): MetaFillResult {
  const { avail, pu, origemQuebrada, tetoReal = false } = opts;
  const pool = [...new Set(opts.codigos)].filter((c) => (avail[c] || 0) > 0 && (pu[c] || 0) > 0);
  const take: Record<string, number> = {};
  const total = pool.reduce((s, c) => s + avail[c] * pu[c], 0);

  const pct = opts.pct != null && Number.isFinite(opts.pct) ? opts.pct : null;
  const solicitado =
    pct != null ? total * (pct / 100) : Math.max(0, opts.alvo ?? 0);

  if (total <= 0 || solicitado <= EPS) return relatorio(take, pu, solicitado);

  if (total <= solicitado + EPS) {
    for (const c of pool) take[c] = avail[c];
    return relatorio(take, pu, solicitado);
  }

  const scale = solicitado / total;
  const ideal: Record<string, number> = {};
  for (const c of pool) {
    const qbr = quebradaDe(c, origemQuebrada);
    ideal[c] = avail[c] * scale;
    const n = snapDown(ideal[c], avail[c], qbr);
    if (n > EPS) take[c] = n;
  }

  const aceita = (novo: number, atual: number) => {
    if (tetoReal && novo > solicitado + EPS) return false;
    return Math.abs(novo - solicitado) + EPS < Math.abs(atual - solicitado);
  };

  // Resíduo: maiores restos, só incrementos da grade que aproximam o alvo.
  let guard = 0;
  while (guard++ < 200000) {
    const value = valorDe(take, pu);
    let best: { c: string; step: number; resto: number } | null = null;
    for (const c of pool) {
      const qbr = quebradaDe(c, origemQuebrada);
      const atual = take[c] || 0;
      const step = proximoIncremento(atual, avail[c], qbr);
      if (step <= EPS) continue;
      const novo = value + step * pu[c];
      if (!aceita(novo, value)) continue;
      const resto = ideal[c] - atual;
      if (!best || resto > best.resto + EPS || (Math.abs(resto - best.resto) <= EPS && pu[c] < pu[best.c])) {
        best = { c, step, resto };
      }
    }
    if (!best) break;
    take[best.c] = (take[best.c] || 0) + best.step;
  }

  // Refino: qualquer +/− permitido que reduza |valor − solicitado|.
  guard = 0;
  while (guard++ < 200000) {
    const value = valorDe(take, pu);
    let best: { c: string; delta: number; ganho: number } | null = null;
    for (const c of pool) {
      const qbr = quebradaDe(c, origemQuebrada);
      const atual = take[c] || 0;
      const up = proximoIncremento(atual, avail[c], qbr);
      const down = proximoDecremento(atual, avail[c], qbr);
      for (const signed of [up, down ? -down : 0]) {
        if (Math.abs(signed) <= EPS) continue;
        const novo = value + signed * pu[c];
        if (!aceita(novo, value)) continue;
        const ganho = Math.abs(value - solicitado) - Math.abs(novo - solicitado);
        if (!best || ganho > best.ganho + EPS) best = { c, delta: signed, ganho };
      }
    }
    if (!best) break;
    const next = (take[best.c] || 0) + best.delta;
    if (next <= EPS) delete take[best.c];
    else take[best.c] = next;
  }

  return relatorio(take, pu, solicitado);
}

/**
 * Compatível com `compute`: alvo em R$, `integerOrigin[c] === false` = quebrada.
 */
export function metaFill(
  codigos: string[],
  avail: Saldo,
  pu: Saldo,
  target: number,
  integerOrigin: Record<string, boolean> = {},
  tetoReal = false,
): MetaFillResult {
  const origemQuebrada: Record<string, boolean> = {};
  for (const c of [...new Set(codigos)]) {
    origemQuebrada[c] = integerOrigin[c] === false;
  }
  return distribuirPedido({ codigos, avail, pu, origemQuebrada, alvo: target, tetoReal });
}
