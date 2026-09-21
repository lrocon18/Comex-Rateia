import type { WorkBook, WorkSheet } from 'xlsx';
import type { Produto, Result } from '@/types';
import { prodMap, puMap } from '@/engine';
import { clientTotal } from '@/engine/selectors';
import {
  CAMPOS_EXPORT,
  detectExportColumns,
  type CampoExport,
} from './columnMap';
import { sheetName } from './exportXlsx';

export interface ExportMolde {
  bytes: number[];
  fileName: string;
  headers: string[];
  headerIdx: number;
  map: Partial<Record<CampoExport, string>>;
  avisos: string[];
}

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

export function avisosMapeamento(map: Partial<Record<CampoExport, string>>): string[] {
  return CAMPOS_EXPORT.filter((c) => c.obrigatorio && !map[c.campo]).map(
    (c) => `O molde não tem coluna para «${c.label}». Mapeie ou o arquivo não importa.`,
  );
}

export function comMapaMolde(molde: ExportMolde, map: Partial<Record<CampoExport, string>>): ExportMolde {
  return { ...molde, map, avisos: avisosMapeamento(map) };
}

function acharCabecalho(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const headers = (rows[i] || []).map((c) => String(c ?? ''));
    const { map } = detectExportColumns(headers);
    if (map.codigo && map.quantidade) return i;
  }
  return 0;
}

export async function lerMoldeExportacao(file: File): Promise<ExportMolde> {
  const XLSX = await import('./sheetjs');
  const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
  const wb = XLSX.read(new Uint8Array(bytes), { type: 'array', cellStyles: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('Molde vazio ou inválido.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  const headerIdx = acharCabecalho(rows);
  const headers = (rows[headerIdx] || []).map((c) => String(c ?? ''));
  const { map } = detectExportColumns(headers);
  return {
    bytes,
    fileName: file.name,
    headers,
    headerIdx,
    map,
    avisos: avisosMapeamento(map),
  };
}

function cloneSheet(ws: WorkSheet): WorkSheet {
  return JSON.parse(JSON.stringify(ws)) as WorkSheet;
}

function colIndex(headers: string[], header: string | undefined): number {
  if (!header) return -1;
  return headers.indexOf(header);
}

/** Um workbook: aba-modelo clonada uma vez por cliente, só células de dado preenchidas. */
export async function buildPedidosWorkbook(
  molde: ExportMolde,
  stock: Produto[],
  result: Result,
): Promise<WorkBook> {
  const XLSX = await import('./sheetjs');
  const wb = XLSX.read(new Uint8Array(molde.bytes), { type: 'array', cellStyles: true });
  const modeloNome = wb.SheetNames[0];
  const modelo = wb.Sheets[modeloNome];
  if (!modelo) throw new Error('Molde sem aba utilizável.');

  const extras = wb.SheetNames.slice(1);
  const extraSheets = Object.fromEntries(extras.map((n) => [n, wb.Sheets[n]]));

  const pu = puMap(stock);
  const prod = prodMap(stock);
  const clientes = Object.keys(result.alloc).filter((cl) => Object.values(result.alloc[cl]).some((q) => q > 0));
  const used = new Set<string>(extras);
  const out: WorkBook = { SheetNames: [], Sheets: {} };

  for (const cliente of clientes) {
    const nomeAba = sheetName(cliente, used);
    const ws = cloneSheet(modelo);
    const alloc = result.alloc[cliente] || {};
    const codigos = Object.keys(alloc)
      .filter((c) => alloc[c] > 0)
      .sort();
    const cnpj = result.notas?.[cliente]?.cnpj || '';
    const total = clientTotal(stock, result, cliente);
    const ic = colIndex(molde.headers, molde.map.codigo);
    const iq = colIndex(molde.headers, molde.map.quantidade);
    const ipu = colIndex(molde.headers, molde.map.pu);
    const ip = colIndex(molde.headers, molde.map.produto);
    const icl = colIndex(molde.headers, molde.map.cliente);
    const icnpj = colIndex(molde.headers, molde.map.cnpj);

    if (molde.headerIdx > 2) {
      setCell(ws, XLSX, 2, 0, cliente, 's');
      setCell(ws, XLSX, 2, 2, total, 'n');
    }

    codigos.forEach((codigo, i) => {
      const r = molde.headerIdx + 1 + i;
      if (ic >= 0) setCell(ws, XLSX, r, ic, codigo, 's');
      if (iq >= 0) setCell(ws, XLSX, r, iq, alloc[codigo], 'n');
      if (ipu >= 0) setCell(ws, XLSX, r, ipu, pu[codigo], 'n');
      if (ip >= 0) setCell(ws, XLSX, r, ip, prod[codigo] || '', 's');
      if (icl >= 0) setCell(ws, XLSX, r, icl, cliente, 's');
      if (icnpj >= 0) setCell(ws, XLSX, r, icnpj, cnpj, 's');
    });

    const last = molde.headerIdx + Math.max(codigos.length, 1);
    const ref = ws['!ref']
      ? XLSX.utils.decode_range(ws['!ref'])
      : { s: { r: 0, c: 0 }, e: { r: last, c: Math.max(molde.headers.length - 1, 0) } };
    ref.e.r = Math.max(ref.e.r, last);
    ref.e.c = Math.max(ref.e.c, Math.max(molde.headers.length - 1, 0));
    ws['!ref'] = XLSX.utils.encode_range(ref);

    out.Sheets[nomeAba] = ws;
    out.SheetNames.push(nomeAba);
  }

  for (const n of extras) {
    out.Sheets[n] = extraSheets[n];
    out.SheetNames.push(n);
  }
  return out;
}

export async function exportarPlanilhaMolde(molde: ExportMolde, stock: Produto[], result: Result): Promise<void> {
  if (avisosMapeamento(molde.map).length) {
    throw new Error(avisosMapeamento(molde.map).join(' '));
  }
  const XLSX = await import('./sheetjs');
  const wb = await buildPedidosWorkbook(molde, stock, result);
  const base = molde.fileName.replace(/\.(xlsx|xls)$/i, '');
  XLSX.writeFileXLSX(wb, `${base || 'pedidos'}-distribuido.xlsx`);
}
