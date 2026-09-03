// Detecção automática de colunas equivalentes (doc 02 §2 / doc 03).
// Ponto de partida da confirmação na importação; a memória por cliente
// (store) guarda o mapeamento confirmado para reusar.

export type Campo = 'codigo' | 'produto' | 'quantidade' | 'pu';

/** Sinônimos conhecidos (doc 03) — normalizados (minúsculo, sem acento). */
export const SYNONYMS: Record<Campo, string[]> = {
  codigo: ['codigo', 'código', 'cod', 'ref', 'ref. mercadoria', 'ref mercadoria', 'referencia do produto', 'referência do produto', 'referencia'],
  produto: ['produto', 'descricao', 'descrição', 'mercadoria', 'nome'],
  quantidade: ['qts', 'qtde disponivel', 'qtde disponível', 'quantidade', 'disponivel', 'disponível', 'estoque', 'qtd', 'qtde'],
  pu: ['pu saida', 'pu saída', 'pu', 'preco', 'preço', 'valor unit', 'preco unit', 'preço unit'],
};

export function normalizeHeader(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .trim();
}

export interface ColMapResult {
  /** campo -> header original que o representa. */
  map: Partial<Record<Campo, string>>;
  /** campos que não deram match confiável (precisam de confirmação). */
  uncertain: Campo[];
  headers: string[];
}

/**
 * Tenta mapear cada `campo` pedido a um header. Match por sinônimo exato tem
 * prioridade; senão por "contém". Cada header é usado por no máximo um campo.
 */
export function detectColumns(headers: string[], campos: Campo[]): ColMapResult {
  const norm = headers.map(normalizeHeader);
  const used = new Set<number>();
  const map: Partial<Record<Campo, string>> = {};
  const uncertain: Campo[] = [];

  const pick = (campo: Campo): number => {
    const syns = SYNONYMS[campo];
    // 1) match exato
    for (let i = 0; i < norm.length; i++) {
      if (used.has(i)) continue;
      if (syns.includes(norm[i])) return i;
    }
    // 2) match por "contém" (header contém sinônimo ou vice-versa)
    for (let i = 0; i < norm.length; i++) {
      if (used.has(i)) continue;
      if (syns.some((s) => norm[i].includes(s) || (s.length > 2 && s.includes(norm[i]) && norm[i].length > 2)))
        return i;
    }
    return -1;
  };

  for (const campo of campos) {
    const idx = pick(campo);
    if (idx >= 0) {
      used.add(idx);
      map[campo] = headers[idx];
    } else {
      uncertain.push(campo);
    }
  }

  return { map, uncertain, headers };
}
