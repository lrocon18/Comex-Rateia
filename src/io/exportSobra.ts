import type { WorkBook, WorkSheet } from 'xlsx';
import type { Produto, Result } from '@/types';
import { puMap } from '@/engine';
import templateUrl from '@/assets/template-pedido-cliente.xlsx?url';

/** Cabeçalho Código · Quantidade · Valor Unitário (linha 4 do molde oficial). */
const HEADER_ROW = 3;
/** Primeira linha de dado (linha 5). */
const DATA_START = 4;

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
  delete ws[addr].w;
  delete ws[addr].r;
  delete ws[addr].h;
}

async function lerMoldeBytes(): Promise<Uint8Array> {
  const res = await fetch(templateUrl);
  if (!res.ok) throw new Error('Molde de pedido do cliente não encontrado.');
  return new Uint8Array(await res.arrayBuffer());
}

/** Sobra no molde oficial: Código, Quantidade, Valor Unitário a partir da linha 5. */
export async function buildSobraWorkbook(
  stock: Produto[],
  result: Result,
  moldeBytes?: Uint8Array,
): Promise<WorkBook> {
  const XLSX = await import('./sheetjs');
  const bytes = moldeBytes ?? (await lerMoldeBytes());
  const wb = XLSX.read(bytes, { type: 'array', cellStyles: true });
  const nome = wb.SheetNames[0];
  const ws = wb.Sheets[nome];
  if (!ws) throw new Error('Molde de sobra vazio ou inválido.');

  const pu = puMap(stock);
  const modeloC = ws[XLSX.utils.encode_cell({ r: DATA_START, c: 2 })] || {};
  const cods = Object.keys(result.leftover)
    .filter((c) => result.leftover[c] > 0)
    .sort();

  cods.forEach((codigo, i) => {
    const r = DATA_START + i;
    setCell(ws, XLSX, r, 0, codigo, 's');
    setCell(ws, XLSX, r, 1, result.leftover[codigo], 'n');
    setCell(ws, XLSX, r, 2, pu[codigo] ?? 0, 'n');
    const addrC = XLSX.utils.encode_cell({ r, c: 2 });
    if (!ws[addrC].z && modeloC.z) ws[addrC].z = modeloC.z;
  });

  const lastData = DATA_START + cods.length - 1;
  const ref = ws['!ref']
    ? XLSX.utils.decode_range(ws['!ref'])
    : { s: { r: 0, c: 0 }, e: { r: HEADER_ROW, c: 2 } };
  if (cods.length) ref.e.r = Math.max(ref.e.r, lastData);
  ref.e.c = Math.max(ref.e.c, 2);
  ws['!ref'] = XLSX.utils.encode_range(ref);

  return wb;
}

export async function exportSobra(stock: Produto[], result: Result, filename = 'sobra.xlsx'): Promise<void> {
  const XLSX = await import('./sheetjs');
  XLSX.writeFileXLSX(await buildSobraWorkbook(stock, result), filename);
}
