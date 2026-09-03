import type { WorkBook } from 'xlsx';
import type { ItemPedido, PedidoCliente } from '@/types';
import { type Campo, detectColumns, normalizeHeader } from './columnMap';
import { normalizeValor, parseDecimal } from './normalizeValue';

/** Campo -> cabeçalho que o representa naquela aba. */
export type MapaColunas = Partial<Record<Campo, string>>;

const CAMPOS_PEDIDO: Campo[] = ['codigo', 'produto', 'quantidade'];

const MAX_FILE_SIZE = 15 * 1024 * 1024;
// separadores opcionais e intercambiáveis: a planilha real tem "66.269.378/0001-01",
// "03,666,303/0001-36" e até "08,110,675,/0001-03".
const CNPJ_RE = /\d{2}[.,]?\d{3}[.,]?\d{3}[.,]?\/?\d{4}-?\d{2}/;
/** Célula que é um valor, não um nome: "46", "15k", "R$5mil", rótulos de NF. */
const VALOR_RE = /^r?\$?\s*\d[\d.,]*\s*(mil|k)?$/;
// Valor da nota escrito sem rótulo nenhum, como na aba WE'X: "15k", "R$45mil".
// Exige escala ou moeda para não confundir com contagem de caixas ("46").
const VALOR_SOZINHO_RE = /^(r\$\s*)?\d[\d.,]*\s*(mil|k)$|^r\$\s*\d[\d.,]*$/;

export type Row = unknown[];

function cell(r: Row, i: number): string {
  return String(r?.[i] ?? '').trim();
}

/** Acha e formata o CNPJ de uma célula; '' quando não há um válido. */
export function normalizeCnpj(raw: string): string {
  const m = String(raw ?? '').match(CNPJ_RE);
  if (!m) return '';
  const d = m[0].replace(/\D/g, '');
  if (d.length !== 14) return '';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * Nome do cliente na primeira célula útil à direita do CNPJ — é assim que a
 * planilha real escreve (sem rótulo): `CNPJ | M OLIVEIRA DINIZ | maximo de R$5mil`.
 */
function nomeAoLadoDoCnpj(cells: string[], i: number): string {
  for (let j = i + 1; j < cells.length; j++) {
    const v = cells[j].trim();
    if (!v) continue;
    const t = normalizeHeader(v);
    if (VALOR_RE.test(t)) return '';
    if (/maximo|vlr|valor|sem nota|sem nf|\bnf\b|cliente|cnpj/.test(t)) return '';
    return v;
  }
  return '';
}

/**
 * Acha a linha de header da tabela de produtos. Tenta primeiro pelos cabeçalhos
 * já conhecidos daquele cliente (mapa memorizado) e só depois pela detecção
 * automática — código + quantidade, ex. "Ref. Mercadoria" + "Qts".
 */
export function findHeaderRow(rows: Row[], conhecidos?: string[]): number {
  const alvo = (conhecidos ?? []).map(normalizeHeader).filter(Boolean);
  if (alvo.length) {
    for (let i = 0; i < rows.length; i++) {
      const cells = (rows[i] || []).map(normalizeHeader);
      if (alvo.every((h) => cells.includes(h))) return i;
    }
  }
  for (let i = 0; i < rows.length; i++) {
    const cells = (rows[i] || []).map((c) => String(c ?? ''));
    if (cells.every((c) => c.trim() === '')) continue;
    const { map } = detectColumns(cells, CAMPOS_PEDIDO);
    if (map.codigo && map.quantidade) return i;
  }
  return -1;
}

/** Extrai CNPJ, nome e valor-alvo do bloco de cabeçalho (linhas antes da tabela). */
function parseHeaderBlock(
  block: Row[],
  aba: string,
): { nome: string; cnpj: string; valorAlvo: number | null; semNota: boolean } {
  let cnpj = '';
  let nome = '';
  let valorAlvo: number | null = null;
  let semNota = false;

  for (const row of block) {
    const cells = (row || []).map((c) => String(c ?? ''));
    for (let i = 0; i < cells.length; i++) {
      const raw = cells[i];
      const t = normalizeHeader(raw);
      if (!t) continue;

      if (!cnpj) {
        const achado = normalizeCnpj(raw);
        if (achado) {
          cnpj = achado;
          if (!nome) nome = nomeAoLadoDoCnpj(cells, i);
        }
      }
      if (t.includes('sem nota') || t.includes('sem nf')) semNota = true;

      // rótulos de nome
      if ((t.includes('cliente') || t === 'nome') && !nome) {
        const next = cell(row, i + 1);
        if (next && !normalizeHeader(next).includes('cliente')) nome = next;
      }
      // rótulos de valor-alvo
      if (valorAlvo == null && (t.includes('maximo') || t.includes('vlr') || t.includes('nf') || t === 'valor')) {
        // valor pode estar no mesmo texto ("maximo de R$5mil") ou na próxima célula
        let v = normalizeValor(raw);
        if (v.valor == null && !v.semNota) v = normalizeValor(cell(row, i + 1));
        if (v.semNota) semNota = true;
        if (v.valor != null) valorAlvo = v.valor;
      }
      if (valorAlvo == null && VALOR_SOZINHO_RE.test(t)) {
        valorAlvo = normalizeValor(raw).valor;
      }
    }
  }

  return { nome: nome || aba, cnpj, valorAlvo, semNota };
}

/** Lê os itens da tabela a partir da linha seguinte ao header, pelo mapa dado. */
function parseItens(rows: Row[], headerIdx: number, headers: string[], map: MapaColunas): ItemPedido[] {
  const col = (campo: Campo) => (map[campo] ? headers.indexOf(map[campo]!) : -1);
  const ic = col('codigo');
  const ip = col('produto');
  const iq = col('quantidade');
  if (ic < 0) return [];

  const itens: ItemPedido[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const codigo = cell(row, ic);
    if (!codigo || codigo.toLowerCase() === 'nan') continue;
    const qts = iq >= 0 ? Math.round(parseDecimal(row[iq]) || 0) : 0;
    const desc = ip >= 0 ? cell(row, ip) : '';
    itens.push({ codigo, desc, qts });
  }
  return itens;
}

export interface ParseSheetOpts {
  /** Mapa memorizado/corrigido na tela; vence a detecção automática. */
  map?: MapaColunas;
  /** Linha de cabeçalho escolhida na mão (0-based). */
  headerIdx?: number;
}

export interface SheetParse {
  aba: string;
  /** `null` só quando não há linha de cabeçalho utilizável. */
  pedido: PedidoCliente | null;
  /** Cabeçalhos da linha usada, para os seletores da tela. */
  headers: string[];
  /** -1 quando nem a detecção nem o `opts` deram uma linha. */
  headerIdx: number;
  map: MapaColunas;
  /** Campos que ninguém conseguiu preencher (pedem escolha na tela). */
  uncertain: Campo[];
}

/**
 * Lê uma aba do cliente devolvendo, além do pedido, o que a tela precisa para
 * corrigir o mapeamento: cabeçalhos, linha usada e o mapa aplicado.
 */
export function parseSheet(aba: string, rows: Row[], opts: ParseSheetOpts = {}): SheetParse {
  const headerIdx =
    opts.headerIdx != null && opts.headerIdx >= 0
      ? opts.headerIdx
      : findHeaderRow(rows, opts.map ? Object.values(opts.map) : undefined);

  if (headerIdx < 0 || headerIdx >= rows.length) {
    return { aba, pedido: null, headers: [], headerIdx: -1, map: {}, uncertain: CAMPOS_PEDIDO };
  }

  const headers = (rows[headerIdx] || []).map((c) => String(c ?? ''));
  const auto = detectColumns(headers, CAMPOS_PEDIDO);
  const map: MapaColunas = { ...auto.map };
  for (const campo of CAMPOS_PEDIDO) {
    const salvo = opts.map?.[campo];
    if (salvo && headers.includes(salvo)) map[campo] = salvo;
  }

  const { nome, cnpj, valorAlvo, semNota } = parseHeaderBlock(rows.slice(0, headerIdx), aba);
  const itens = parseItens(rows, headerIdx, headers, map);

  return {
    aba,
    pedido: { aba, nome, cnpj, valorAlvo, semNota, itens },
    headers,
    headerIdx,
    map,
    uncertain: CAMPOS_PEDIDO.filter((c) => !map[c]),
  };
}

export function parseSheetToPedido(aba: string, rows: Row[], opts?: ParseSheetOpts): PedidoCliente | null {
  return parseSheet(aba, rows, opts).pedido;
}

export interface AbaRows {
  aba: string;
  rows: Row[];
}

/** Linhas cruas de cada aba, para a tela reprocessar sem reler o arquivo. */
export async function rowsFromWorkbook(wb: WorkBook): Promise<AbaRows[]> {
  const XLSX = await import('./sheetjs');
  const abas: AbaRows[] = [];
  for (const aba of wb.SheetNames) {
    const ws = wb.Sheets[aba];
    if (!ws) continue;
    abas.push({ aba, rows: XLSX.utils.sheet_to_json<Row>(ws, { header: 1, defval: '' }) });
  }
  return abas;
}

export async function pedidosFromWorkbook(wb: WorkBook): Promise<PedidoCliente[]> {
  const abas = await rowsFromWorkbook(wb);
  const pedidos: PedidoCliente[] = [];
  for (const { aba, rows } of abas) {
    const pedido = parseSheetToPedido(aba, rows);
    if (pedido && pedido.itens.length) pedidos.push(pedido);
  }
  return pedidos;
}

export interface ClienteImport {
  /** Uma entrada por aba, na ordem do arquivo, com as linhas cruas. */
  abas: AbaRows[];
  /** Primeira leitura de cada aba (detecção automática). */
  parses: SheetParse[];
}

export async function importCliente(file: File): Promise<ClienteImport> {
  if (file.size > MAX_FILE_SIZE) throw new Error('Arquivo muito grande (limite 15 MB).');
  const XLSX = await import('./sheetjs');
  let abas: AbaRows[];
  try {
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
    abas = await rowsFromWorkbook(wb);
  } catch (err) {
    throw new Error('Não consegui ler o arquivo: ' + (err as Error).message);
  }
  if (!abas.length) throw new Error('Planilha vazia ou inválida.');
  return { abas, parses: abas.map(({ aba, rows }) => parseSheet(aba, rows)) };
}
