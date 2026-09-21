/**
 * Grade de quantidades permitidas na distribuição.
 * Inteira: 0, 1, …, disponível.
 * Quebrada de origem (ex. 1,6): 0, 1, …, floor(disponível) e o valor original.
 * Nunca inventa um decimal que não veio da planilha.
 */

const EPS = 1e-9;

export function isOrigemQuebrada(estoque: number, flag?: boolean): boolean {
  return flag ?? !Number.isInteger(estoque);
}

/** Lista explícita (para testes / estoques pequenos). */
export function quantidadesPermitidas(disponivel: number, quebrada: boolean): number[] {
  const cap = Math.max(0, disponivel);
  if (!quebrada) {
    const n = Math.floor(cap + EPS);
    return Array.from({ length: n + 1 }, (_, i) => i);
  }
  const fl = Math.floor(cap + EPS);
  const qs = Array.from({ length: fl + 1 }, (_, i) => i);
  if (cap > fl + EPS) qs.push(cap);
  return qs;
}

/** Maior quantidade permitida ≤ ideal e ≤ disponível. */
export function snapDown(ideal: number, disponivel: number, quebrada: boolean): number {
  const cap = Math.min(Math.max(0, ideal), Math.max(0, disponivel));
  if (!quebrada) return Math.floor(cap + EPS);
  const fl = Math.floor(disponivel + EPS);
  if (cap + EPS >= disponivel) return disponivel;
  return Math.min(fl, Math.floor(cap + EPS));
}

/** Menor quantidade positiva permitida (1, ou o original quebrado se for < 1). */
export function minimoPositivo(disponivel: number, quebrada: boolean): number {
  return proximoIncremento(0, disponivel, quebrada);
}

/** Próximo incremento permitido a partir de `atual` (0 se não há). */
export function proximoIncremento(atual: number, disponivel: number, quebrada: boolean): number {
  if (atual + EPS >= disponivel) return 0;
  if (!quebrada) return 1;
  const fl = Math.floor(disponivel + EPS);
  if (atual + EPS < fl) return 1;
  return disponivel - atual;
}

/** Próximo decremento permitido a partir de `atual` (0 se não há). */
export function proximoDecremento(atual: number, disponivel: number, quebrada: boolean): number {
  if (atual <= EPS) return 0;
  if (!quebrada) return 1;
  const fl = Math.floor(disponivel + EPS);
  if (atual + EPS >= disponivel && disponivel > fl + EPS) return disponivel - fl;
  return Math.min(1, atual);
}

export function quantidadePermitida(q: number, disponivel: number, quebrada: boolean): boolean {
  if (q < -EPS || q > disponivel + EPS) return false;
  if (!quebrada) return Math.abs(q - Math.round(q)) < 1e-6;
  if (Math.abs(q - disponivel) < 1e-6) return true;
  const fl = Math.floor(disponivel + EPS);
  return q <= fl + EPS && Math.abs(q - Math.round(q)) < 1e-6;
}
