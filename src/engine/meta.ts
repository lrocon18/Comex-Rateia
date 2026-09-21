import type { Saldo } from '@/types';
import { minimoPositivo, proximoDecremento, proximoIncremento, snapDown } from './granularity';

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
 * Rateia um alvo (R$ ou %) sobre o conjunto inteiro de SKUs.
 *
 * Hierarquia obrigatória: primeiro o produto, depois a quantidade.
 * Todo SKU listado com saldo entra na nota (mínimo positivo da grade). Só o
 * que sobra do alvo é rateado em quantidade — nunca zera um item para
 * empilhar unidades em outro.
 *
 * Grade: origem inteira só inteiros; origem quebrada permite 0…floor e o valor
 * original. Nunca inventa decimal. Aproxima o solicitado minimizando |diff|
 * sem abrir mão da cobertura.
 */
export function distribuirPedido(opts: DistribuirPedidoOpts): MetaFillResult {
  const { avail, pu, origemQuebrada, tetoReal = false } = opts;
  const pool = [...new Set(opts.codigos)].filter((c) => (avail[c] || 0) > 0 && (pu[c] || 0) > 0);
  const take: Record<string, number> = {};
  const total = pool.reduce((s, c) => s + avail[c] * pu[c], 0);

  const pct = opts.pct != null && Number.isFinite(opts.pct) ? opts.pct : null;
  const solicitado = pct != null ? total * (pct / 100) : Math.max(0, opts.alvo ?? 0);

  if (total <= 0 || solicitado <= EPS) return relatorio(take, pu, solicitado);

  if (total <= solicitado + EPS) {
    for (const c of pool) take[c] = avail[c];
    return relatorio(take, pu, solicitado);
  }

  const minQ: Record<string, number> = {};
  for (const c of pool) minQ[c] = minimoPositivo(avail[c], quebradaDe(c, origemQuebrada));

  // 1. Cobertura: todo produto listado entra. Com tetoReal, inclui os mais
  // baratos enquanto couber — não estoura o alvo.
  if (tetoReal) {
    const ordem = [...pool].sort((a, b) => pu[a] - pu[b] || a.localeCompare(b));
    let gasto = 0;
    for (const c of ordem) {
      const add = minQ[c] * pu[c];
      if (add <= EPS) continue;
      if (gasto + add > solicitado + EPS) continue;
      take[c] = minQ[c];
      gasto += add;
    }
  } else {
    for (const c of pool) {
      if (minQ[c] > EPS) take[c] = minQ[c];
    }
  }

  const piso: Record<string, number> = {};
  for (const c of pool) piso[c] = take[c] || 0;

  const aceita = (novo: number, atual: number) => {
    if (tetoReal && novo > solicitado + EPS) return false;
    return Math.abs(novo - solicitado) + EPS < Math.abs(atual - solicitado);
  };

  // 2. Quantidade: o que resta do alvo, na capacidade que sobrou, em cota.
  const restAlvo = solicitado - valorDe(take, pu);
  if (restAlvo > EPS) {
    const restTotal = pool.reduce((s, c) => s + Math.max(0, avail[c] - (take[c] || 0)) * pu[c], 0);
    if (restTotal <= restAlvo + EPS) {
      for (const c of pool) take[c] = avail[c];
    } else if (restTotal > EPS) {
      const scale = restAlvo / restTotal;
      const ideal: Record<string, number> = {};
      for (const c of pool) {
        const qbr = quebradaDe(c, origemQuebrada);
        const resto = Math.max(0, avail[c] - (take[c] || 0));
        ideal[c] = resto * scale;
        const extra = snapDown(ideal[c], resto, qbr);
        if (extra > EPS) take[c] = (take[c] || 0) + extra;
      }

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
          const resto = (piso[c] || 0) + ideal[c] - atual;
          if (!best || resto > best.resto + EPS || (Math.abs(resto - best.resto) <= EPS && pu[c] < pu[best.c])) {
            best = { c, step, resto };
          }
        }
        if (!best) break;
        take[best.c] = (take[best.c] || 0) + best.step;
      }
    }
  }

  // 3. Refino: só movimento que reduza |diff| e não tire produto da nota.
  let guard = 0;
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
        const next = atual + signed;
        if (next + EPS < (piso[c] || 0)) continue;
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
