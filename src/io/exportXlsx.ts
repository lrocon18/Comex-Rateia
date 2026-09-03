import type { WorkBook } from 'xlsx';
import type { Produto, Result } from '@/types';
import { prodMap, puMap, distributedMap } from '@/engine';

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Sanitiza o nome da aba (doc 04): sem \ / ? * [ ] :, <=31 chars, único. */
export function sheetName(name: string, used: Set<string>): string {
  let base = String(name).replace(/[\\/?*[\]:]/g, '').slice(0, 28) || 'Cliente';
  let n = base;
  let i = 2;
  while (used.has(n)) n = base.slice(0, 26) + ' ' + i++;
  used.add(n);
  return n;
}

/** Monta o workbook de saída (port de doExport do protótipo). */
export async function buildWorkbook(stock: Produto[], result: Result): Promise<WorkBook> {
  const XLSX = await import('./sheetjs');
  const pu = puMap(stock);
  const prod = prodMap(stock);
  const dist = distributedMap(stock, result);
  const wb = XLSX.utils.book_new();

  // Controle geral
  const cg: (string | number)[][] = [
    ['Código', 'Produto', 'Estoque inicial', 'Distribuído', 'Disponível', 'PU saída', 'Valor disponível'],
  ];
  for (const s of stock) {
    const d = dist[s.codigo] || 0;
    const disp = s.estoque - d;
    cg.push([s.codigo, s.produto, s.estoque, d, disp, round4(s.pu), round2(Math.max(0, disp) * s.pu)]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cg), 'Controle geral');

  // Uma aba por cliente
  const used = new Set<string>(['Controle geral']);
  for (const cl of Object.keys(result.alloc)) {
    const a = result.alloc[cl];
    const aoa: (string | number)[][] = [['Código', 'Produto', 'Quantidade', 'PU saída', 'Valor total']];
    let tv = 0;
    for (const c of Object.keys(a).sort()) {
      const v = a[c] * pu[c];
      tv += v;
      aoa.push([c, prod[c], a[c], round4(pu[c]), round2(v)]);
    }
    aoa.push([]);
    aoa.push(['', '', '', 'TOTAL', round2(tv)]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName(cl, used));
  }

  // Sobra
  const cods = Object.keys(result.leftover).filter((c) => result.leftover[c] > 0).sort();
  const sob: (string | number)[][] = [['Código', 'Produto', 'Disponível', 'PU saída', 'Valor']];
  for (const c of cods) sob.push([c, prod[c], result.leftover[c], round4(pu[c]), round2(result.leftover[c] * pu[c])]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sob), 'Sobra');

  return wb;
}

export async function exportXlsx(
  stock: Produto[],
  result: Result,
  filename = 'distribuicao_notas.xlsx',
): Promise<void> {
  const XLSX = await import('./sheetjs');
  XLSX.writeFileXLSX(await buildWorkbook(stock, result), filename);
}
