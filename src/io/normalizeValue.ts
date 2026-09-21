// Normalização de valores informais das planilhas do cliente (doc 03).
// Ex.: "maximo de R$5mil" -> 5000 · "R$45mil" -> 45000 · "15k" -> 15000 ·
//      "13k" -> 13000 · "sem nota" -> { semNota: true }

import type { ValorAlvoUnidade } from '@/types';

export interface ValorNormalizado {
  valor: number | null;
  semNota: boolean;
}

export interface ValorAlvoLido extends ValorNormalizado {
  unidade: ValorAlvoUnidade;
}

/** Converte "2,82" / "1.234,56" / "1234.56" em número. */
export function parseDecimal(raw: unknown): number {
  if (typeof raw === 'number') return raw;
  let s = String(raw ?? '').trim();
  if (!s) return NaN;
  s = s.replace(/[^\d.,-]/g, '');
  // Se tem vírgula e ponto, o último separador é o decimal.
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  return Number(s);
}

/**
 * Normaliza o valor-alvo da nota vindo do cabeçalho da planilha do cliente.
 * Trata sufixos "mil"/"k" (×1000) e "sem nota".
 */
export function normalizeValor(raw: unknown): ValorNormalizado {
  const s = String(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

  if (!s) return { valor: null, semNota: false };
  if (s.includes('sem nota') || s.includes('sem nf')) return { valor: null, semNota: true };

  // captura o primeiro número (com . , como separadores) e um sufixo opcional
  const m = s.match(/(\d[\d.,]*)\s*(mil|k)?/);
  if (!m) return { valor: null, semNota: false };

  let n = parseDecimal(m[1]);
  if (!Number.isFinite(n)) return { valor: null, semNota: false };
  if (m[2] === 'mil' || m[2] === 'k') n *= 1000;
  return { valor: n, semNota: false };
}

/**
 * Lê o valor-alvo de uma célula (em especial C3): vazio, reais ou percentual.
 * "15%" / "15 %" → 15 e unidade `pct`. Sem `%`, segue `normalizeValor` em reais.
 */
export function parseValorAlvoCelula(raw: unknown): ValorAlvoLido {
  if (raw == null) return { valor: null, unidade: 'reais', semNota: false };
  const s = String(raw).trim();
  if (!s) return { valor: null, unidade: 'reais', semNota: false };

  const lower = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (lower.includes('sem nota') || lower.includes('sem nf')) {
    return { valor: null, unidade: 'reais', semNota: true };
  }

  if (/%/.test(s)) {
    const n = parseDecimal(s.replace(/%/g, ''));
    if (!Number.isFinite(n)) return { valor: null, unidade: 'pct', semNota: false };
    return { valor: n, unidade: 'pct', semNota: false };
  }

  const v = normalizeValor(raw);
  return { valor: v.valor, unidade: 'reais', semNota: v.semNota };
}
