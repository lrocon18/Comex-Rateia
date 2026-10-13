// Preenche células de um .xlsx mexendo só no XML da aba: estilos, tema,
// larguras, alturas, mesclagens, impressão e demais abas ficam byte a byte
// iguais ao arquivo original.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { DOMParser, XMLSerializer, type Document, type Element } from '@xmldom/xmldom';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

/** Célula a gravar; `r` e `c` são 0-based. */
export interface CelulaPatch {
  r: number;
  c: number;
  value: string | number;
  type: 's' | 'n';
}

export interface PatchOpts {
  /** Linha (0-based) cujo estilo/altura as linhas novas herdam. */
  linhaModelo?: number;
}

/** True quando os bytes são um zip (.xlsx), não um .xls binário. */
export function ehXlsx(bytes: ArrayLike<number>): boolean {
  return bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function colLetra(c: number): string {
  let s = '';
  let n = c + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function decodeRef(ref: string): { r: number; c: number } | null {
  const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref.toUpperCase());
  if (!m) return null;
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: Number(m[2]) - 1, c: c - 1 };
}

function filhos(el: Element, local: string): Element[] {
  const out: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && (n as Element).localName === local) out.push(n as Element);
  }
  return out;
}

function primeiro(doc: Document, local: string, ns = NS): Element | null {
  return doc.getElementsByTagNameNS(ns, local)[0] ?? null;
}

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'text/xml');
}

function nomeQualificado(ref: Element, local: string): string {
  return ref.prefix ? `${ref.prefix}:${local}` : local;
}

function resolverAlvo(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const partes = base.split('/').slice(0, -1);
  for (const p of target.split('/')) {
    if (p === '..') partes.pop();
    else if (p && p !== '.') partes.push(p);
  }
  return partes.join('/');
}

/** Caminho (no zip) do XML da 1ª aba do workbook. */
function caminhoPrimeiraAba(files: Record<string, Uint8Array>): string {
  const wb = parseXml(strFromU8(files['xl/workbook.xml']));
  const sheet = primeiro(wb, 'sheet');
  const rid = sheet?.getAttributeNS(NS_REL, 'id') || sheet?.getAttribute('r:id');
  const rels = parseXml(strFromU8(files['xl/_rels/workbook.xml.rels']));
  const rel = Array.from(rels.getElementsByTagNameNS(NS_PKG_REL, 'Relationship')).find(
    (r) => r.getAttribute('Id') === rid,
  );
  const target = rel?.getAttribute('Target');
  if (!target) throw new Error('Molde sem aba utilizável.');
  return resolverAlvo('xl/workbook.xml', target);
}

/** Estilo padrão de uma coluna declarado em <cols>, se houver. */
function estiloColuna(doc: Document, c: number): string | null {
  const cols = primeiro(doc, 'cols');
  if (!cols) return null;
  for (const col of filhos(cols, 'col')) {
    const min = Number(col.getAttribute('min'));
    const max = Number(col.getAttribute('max'));
    if (c + 1 >= min && c + 1 <= max) return col.getAttribute('style');
  }
  return null;
}

/** Garante `r` explícito em todas as células da linha e as devolve por coluna. */
function celulasDaLinha(row: Element): Map<number, Element> {
  const map = new Map<number, Element>();
  const rowN = Number(row.getAttribute('r'));
  let prox = 0;
  for (const cel of filhos(row, 'c')) {
    const ref = cel.getAttribute('r');
    const pos = ref ? decodeRef(ref) : null;
    const c = pos ? pos.c : prox;
    if (!ref) cel.setAttribute('r', `${colLetra(c)}${rowN}`);
    map.set(c, cel);
    prox = c + 1;
  }
  return map;
}

/**
 * Devolve os bytes do .xlsx com as células gravadas na 1ª aba. Só o XML dessa
 * aba muda (mais `calcPr`/`calcChain` quando há fórmula, para o Excel recalcular).
 */
export function preencherXlsx(bytes: Uint8Array, celulas: CelulaPatch[], opts: PatchOpts = {}): Uint8Array {
  const files = unzipSync(bytes);
  const path = caminhoPrimeiraAba(files);
  const doc = parseXml(strFromU8(files[path]));
  const sheetData = primeiro(doc, 'sheetData');
  if (!sheetData) throw new Error('Molde sem aba utilizável.');

  const linhas = new Map<number, Element>();
  let prox = 0;
  for (const row of filhos(sheetData, 'row')) {
    const r = row.getAttribute('r') ? Number(row.getAttribute('r')) - 1 : prox;
    if (!row.getAttribute('r')) row.setAttribute('r', String(r + 1));
    linhas.set(r, row);
    prox = r + 1;
  }

  const modelo = opts.linhaModelo != null ? linhas.get(opts.linhaModelo) : undefined;
  const celulasModelo = modelo ? celulasDaLinha(modelo) : new Map<number, Element>();

  const linha = (r: number): Element => {
    const existente = linhas.get(r);
    if (existente) return existente;
    const row = doc.createElementNS(NS, nomeQualificado(sheetData, 'row'));
    row.setAttribute('r', String(r + 1));
    if (modelo) {
      for (const a of ['s', 'customFormat', 'ht', 'customHeight']) {
        const v = modelo.getAttribute(a);
        if (v != null && v !== '') row.setAttribute(a, v);
      }
    }
    const depois = [...linhas.keys()].filter((k) => k > r).sort((a, b) => a - b)[0];
    sheetData.insertBefore(row, depois != null ? linhas.get(depois)! : null);
    linhas.set(r, row);
    return row;
  };

  let tirouFormula = false;
  let maxR = -1;
  let maxC = -1;

  for (const cel of celulas) {
    const row = linha(cel.r);
    const cels = celulasDaLinha(row);
    let el = cels.get(cel.c);
    if (!el) {
      el = doc.createElementNS(NS, nomeQualificado(sheetData, 'c'));
      el.setAttribute('r', `${colLetra(cel.c)}${cel.r + 1}`);
      const s =
        celulasModelo.get(cel.c)?.getAttribute('s') ||
        (row.getAttribute('customFormat') === '1' ? row.getAttribute('s') : null) ||
        estiloColuna(doc, cel.c);
      if (s) el.setAttribute('s', s);
      const depois = [...cels.keys()].filter((k) => k > cel.c).sort((a, b) => a - b)[0];
      row.insertBefore(el, depois != null ? cels.get(depois)! : null);
    }
    while (el.firstChild) {
      const filho = el.firstChild as Element;
      if (filho.nodeType === 1 && filho.localName === 'f') tirouFormula = true;
      el.removeChild(filho);
    }
    for (const a of ['t', 'cm', 'vm']) el.removeAttribute(a);
    if (cel.type === 'n') {
      const v = doc.createElementNS(NS, nomeQualificado(sheetData, 'v'));
      v.appendChild(doc.createTextNode(String(cel.value)));
      el.appendChild(v);
    } else {
      el.setAttribute('t', 'inlineStr');
      const is = doc.createElementNS(NS, nomeQualificado(sheetData, 'is'));
      const t = doc.createElementNS(NS, nomeQualificado(sheetData, 't'));
      t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
      t.appendChild(doc.createTextNode(String(cel.value)));
      is.appendChild(t);
      el.appendChild(is);
    }
    maxR = Math.max(maxR, cel.r);
    maxC = Math.max(maxC, cel.c);
  }

  const dim = primeiro(doc, 'dimension');
  if (dim && maxR >= 0) {
    const [ini, fim] = (dim.getAttribute('ref') || 'A1').split(':');
    const a = decodeRef(ini) ?? { r: 0, c: 0 };
    const b = decodeRef(fim ?? ini) ?? a;
    const r2 = Math.max(b.r, maxR);
    const c2 = Math.max(b.c, maxC);
    dim.setAttribute('ref', `${colLetra(a.c)}${a.r + 1}:${colLetra(c2)}${r2 + 1}`);
  }

  files[path] = strToU8(new XMLSerializer().serializeToString(doc));

  const temFormula = Object.keys(files).some(
    (k) => k.startsWith('xl/worksheets/') && k.endsWith('.xml') && /<(\w+:)?f[\s>]/.test(strFromU8(files[k])),
  );
  if (temFormula) ativarRecalculo(files);
  if (tirouFormula) removerCalcChain(files);

  return zipSync(files, { level: 6 });
}

/** CT_Workbook: elementos que vêm depois de <calcPr>. */
const DEPOIS_DE_CALCPR = [
  'oleSize',
  'customWorkbookViews',
  'pivotCaches',
  'smartTagPr',
  'smartTagTypes',
  'webPublishing',
  'fileRecoveryPr',
  'webPublishObjects',
  'extLst',
];

function ativarRecalculo(files: Record<string, Uint8Array>) {
  const doc = parseXml(strFromU8(files['xl/workbook.xml']));
  const wb = doc.documentElement;
  if (!wb) return;
  let calc = primeiro(doc, 'calcPr');
  if (!calc) {
    calc = doc.createElementNS(NS, nomeQualificado(wb, 'calcPr'));
    let antes: Element | null = null;
    for (let n = wb.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 1 && DEPOIS_DE_CALCPR.includes((n as Element).localName ?? '')) {
        antes = n as Element;
        break;
      }
    }
    wb.insertBefore(calc, antes);
  }
  if (calc.getAttribute('fullCalcOnLoad') === '1') return;
  calc.setAttribute('fullCalcOnLoad', '1');
  files['xl/workbook.xml'] = strToU8(new XMLSerializer().serializeToString(doc));
}

function removerCalcChain(files: Record<string, Uint8Array>) {
  if (!files['xl/calcChain.xml']) return;
  delete files['xl/calcChain.xml'];
  const rels = parseXml(strFromU8(files['xl/_rels/workbook.xml.rels']));
  for (const r of Array.from(rels.getElementsByTagNameNS(NS_PKG_REL, 'Relationship'))) {
    if ((r.getAttribute('Target') || '').endsWith('calcChain.xml')) r.parentNode?.removeChild(r);
  }
  files['xl/_rels/workbook.xml.rels'] = strToU8(new XMLSerializer().serializeToString(rels));
  const ct = files['[Content_Types].xml'];
  if (ct) {
    const doc = parseXml(strFromU8(ct));
    for (const o of Array.from(doc.getElementsByTagName('Override'))) {
      if ((o.getAttribute('PartName') || '').endsWith('calcChain.xml')) o.parentNode?.removeChild(o);
    }
    files['[Content_Types].xml'] = strToU8(new XMLSerializer().serializeToString(doc));
  }
}
