import type { WorkSheet } from 'xlsx';
import type { Produto, Result } from '@/types';
import { puMap } from '@/engine';
import templateUrl from '@/assets/template-pedido-cliente.xlsx?url';

/**
 * Exportação pelo template do cliente (doc 04 §exportação-template).
 *
 * O arquivo em `src/assets/template-pedido-cliente.xlsx` É o molde oficial —
 * mesmas colunas, mesma ordem, mesma formatação, fornecido pela operadora.
 * Não é reconstruído: é carregado, e só as células de dado são preenchidas,
 * preservando estilo e formato de número que já vêm no arquivo.
 *
 * Colunas do template (linha 4, 0-indexed): Código · Quantidade · Valor
 * Unitário (PU — não o valor total da linha). As linhas 0-3 são cabeçalho e
 * instruções fixas do molde; o dado começa na linha 4 (a 5ª linha do arquivo).
 */
const HEADER_ROWS = 4;

function safeFileName(nomeCliente: string): string {
  const base = String(nomeCliente).replace(/[\\/:*?"<>|]/g, '').trim();
  return `${base || 'cliente'}.xlsx`;
}

/** Escreve um valor preservando o estilo/formato (`s`/`z`) já presente na célula do molde. */
function setCell(
  ws: WorkSheet,
  XLSX: typeof import('./sheetjs'),
  r: number,
  c: number,
  value: string | number,
  type: 's' | 'n',
) {
  const addr = XLSX.utils.encode_cell({ r, c });
  const existente = ws[addr] || {};
  ws[addr] = { ...existente, t: type, v: value };
  delete ws[addr].w; // texto formatado fica velho — os leitores recalculam a partir de v/z
  delete ws[addr].r;
  delete ws[addr].h;
}

async function carregarTemplate(XLSX: typeof import('./sheetjs')) {
  const resp = await fetch(templateUrl);
  if (!resp.ok) throw new Error('Não consegui carregar o template de exportação.');
  const buf = await resp.arrayBuffer();
  return XLSX.read(new Uint8Array(buf), { type: 'array', cellStyles: true });
}

/** Monta o workbook de um cliente a partir do molde, preenchido com a distribuição dele. */
export async function buildClienteTemplateWorkbook(stock: Produto[], result: Result, cliente: string) {
  const XLSX = await import('./sheetjs');
  const wb = await carregarTemplate(XLSX);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const pu = puMap(stock);
  const alloc = result.alloc[cliente] || {};
  const codigos = Object.keys(alloc)
    .filter((c) => alloc[c] > 0)
    .sort();

  codigos.forEach((codigo, i) => {
    const row = HEADER_ROWS + i;
    setCell(ws, XLSX, row, 0, codigo, 's');
    setCell(ws, XLSX, row, 1, alloc[codigo], 'n');
    setCell(ws, XLSX, row, 2, pu[codigo], 'n');
  });

  const ref = ws['!ref']
    ? XLSX.utils.decode_range(ws['!ref'])
    : { s: { r: 0, c: 0 }, e: { r: HEADER_ROWS, c: 2 } };
  ref.e.r = Math.max(ref.e.r, HEADER_ROWS + codigos.length - 1);
  ws['!ref'] = XLSX.utils.encode_range(ref);

  return wb;
}

/** Um arquivo `.xlsx` por cliente, cada um exatamente no molde oficial fornecido. */
export async function exportClientesPorTemplate(stock: Produto[], result: Result): Promise<void> {
  const XLSX = await import('./sheetjs');
  const clientes = Object.keys(result.alloc).filter((cl) =>
    Object.values(result.alloc[cl]).some((q) => q > 0),
  );
  for (const cliente of clientes) {
    const wb = await buildClienteTemplateWorkbook(stock, result, cliente);
    XLSX.writeFileXLSX(wb, safeFileName(cliente));
    // um pequeno espaçamento evita que o navegador trave downloads múltiplos disparados em sequência
    await new Promise((r) => setTimeout(r, 150));
  }
}
