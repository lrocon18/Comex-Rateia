import type { Produto } from '@/types';
import { detectColumns, normalizeHeader } from './columnMap';
import { parseDecimal } from './normalizeValue';

const MAX_FILE_SIZE = 15 * 1024 * 1024;

export interface MainoImport {
  produtos: Produto[];
  colunas: { codigo: string; produto?: string; quantidade: string; pu: string };
}

/** Limpa o nome duplicado do Maino: corta em " - " e remove o código do início. */
export function cleanMainoName(raw: string, codigo: string): string {
  let name = String(raw ?? '');
  if (name.includes(' - ')) name = name.split(' - ')[0];
  name = name.trim();
  // remove um prefixo de código repetido (ex.: "WM2-37 tubo ..." -> "tubo ...")
  if (codigo && normalizeHeader(name).startsWith(normalizeHeader(codigo) + ' ')) {
    name = name.slice(codigo.length).trim();
  }
  return name || codigo;
}

/** Constrói os produtos a partir das linhas (objetos por header) da planilha. */
export function produtosFromRows(rows: Record<string, unknown>[]): MainoImport {
  if (!rows.length) throw new Error('Planilha vazia.');
  const headers = Object.keys(rows[0]);
  const { map } = detectColumns(headers, ['codigo', 'produto', 'quantidade', 'pu']);
  if (!map.codigo || !map.quantidade || !map.pu) {
    throw new Error(
      'Não encontrei as colunas de código, quantidade e PU. Colunas lidas: ' +
        headers.join(', '),
    );
  }
  const kc = map.codigo, kp = map.produto, kq = map.quantidade, ku = map.pu;

  const produtos: Produto[] = [];
  for (const r of rows) {
    const cod = String(r[kc] ?? '').trim();
    if (!cod || cod.toLowerCase() === 'nan') continue;
    // não arredonda: a planilha de origem pode trazer quantidade já quebrada
    // (ex.: 1,6) de propósito — o motor decide o que fazer com isso (doc 04 §exceção).
    const q = parseDecimal(r[kq]) || 0;
    const p = Number(String(r[ku] ?? '').replace(',', '.')) || 0;
    const nome = kp ? cleanMainoName(String(r[kp] ?? ''), cod) : cod;
    produtos.push({ codigo: cod, produto: nome, estoque: q, pu: p });
  }
  if (!produtos.length) throw new Error('Nenhuma linha válida encontrada.');
  return { produtos, colunas: { codigo: kc, produto: kp, quantidade: kq, pu: ku } };
}

export async function importMaino(file: File): Promise<MainoImport> {
  if (file.size > MAX_FILE_SIZE) throw new Error('Arquivo muito grande (limite 15 MB).');
  const XLSX = await import('./sheetjs');
  let rows: Record<string, unknown>[];
  try {
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error('Planilha vazia ou inválida.');
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  } catch (err) {
    throw new Error('Não consegui ler o arquivo: ' + (err as Error).message);
  }
  return produtosFromRows(rows);
}
