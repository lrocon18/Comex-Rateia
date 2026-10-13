import { describe, it, expect } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import * as XLSX from 'xlsx';
import type { Produto, Result } from '@/types';
import { detectExportColumns } from './columnMap';
import { avisosMapeamento, buildPedidoXlsx, moldeEhXlsx, type ExportMolde } from './exportTemplate';

const CT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/calcChain.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"/></Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Pedido Oficial" sheetId="1" r:id="rId1"/><sheet name="Instruções" sheetId="2" r:id="rId2"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'Pedido Oficial'!$A$1:$D$40</definedName></definedNames></workbook>`;

const WB_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/calcChain" Target="calcChain.xml"/></Relationships>`;

// fontes (negrito/itálico/sublinhado/cor), preenchimento, borda, moeda e % com alinhamento
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/><numFmt numFmtId="165" formatCode="0.00%"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><i/><u/><sz val="14"/><color rgb="FF1F4E79"/><name val="Arial"/></font><font><sz val="10"/><color rgb="FFC00000"/><name val="Courier New"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="medium"><color rgb="FF000000"/></top><bottom style="double"><color rgb="FF000000"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left"/></xf><xf numFmtId="164" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const SHEET1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:D6"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="18.5" customWidth="1"/><col min="2" max="2" width="12.25" customWidth="1"/><col min="3" max="3" width="15" customWidth="1" style="3"/><col min="4" max="4" width="9" customWidth="1"/></cols><sheetData><row r="1" ht="30" customHeight="1"><c r="A1" s="1" t="inlineStr"><is><t>PEDIDO DE VENDA</t></is></c><c r="B1" s="1"/><c r="C1" s="1"/></row><row r="3"><c r="A3" s="1" t="inlineStr"><is><t>NOME</t></is></c><c r="C3" s="3"><v>0</v></c><c r="D3" s="4"><v>0.25</v></c></row><row r="5" ht="22" customHeight="1"><c r="A5" s="1" t="inlineStr"><is><t>Código</t></is></c><c r="B5" s="1" t="inlineStr"><is><t>Quantidade</t></is></c><c r="C5" s="1" t="inlineStr"><is><t>PU saída</t></is></c><c r="D5" s="1" t="inlineStr"><is><t>Total</t></is></c></row><row r="6" ht="18.75" customHeight="1"><c r="A6" s="2"/><c r="B6" s="2"/><c r="C6" s="3"/><c r="D6" s="3"><f>B6*C6</f><v>0</v></c></row></sheetData><mergeCells count="1"><mergeCell ref="A1:C1"/></mergeCells><pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToHeight="0"/><headerFooter><oddHeader>&amp;CPedido</oddHeader></headerFooter></worksheet>`;

const SHEET2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Não alterar</t></is></c></row></sheetData></worksheet>`;

const CALC = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<calcChain xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><c r="D6" i="1"/></calcChain>`;

function moldeXlsx(): ExportMolde {
  const bytes = zipSync({
    '[Content_Types].xml': strToU8(CT),
    '_rels/.rels': strToU8(RELS),
    'xl/workbook.xml': strToU8(WORKBOOK),
    'xl/_rels/workbook.xml.rels': strToU8(WB_RELS),
    'xl/styles.xml': strToU8(STYLES),
    'xl/worksheets/sheet1.xml': strToU8(SHEET1),
    'xl/worksheets/sheet2.xml': strToU8(SHEET2),
    'xl/calcChain.xml': strToU8(CALC),
  });
  const headers = ['Código', 'Quantidade', 'PU saída', 'Total'];
  const { map } = detectExportColumns(headers);
  return { bytes: Array.from(bytes), fileName: 'pedido.xlsx', headers, headerIdx: 4, map, avisos: avisosMapeamento(map) };
}

const stock: Produto[] = [
  { codigo: 'A-1', produto: 'peça a', estoque: 100, pu: 2.5 },
  { codigo: 'B-2', produto: 'peça b', estoque: 50, pu: 10 },
  { codigo: 'C-3', produto: 'peça c', estoque: 20, pu: 7.25 },
];
const result: Result = {
  alloc: { ACME: { 'A-1': 25, 'B-2': 10, 'C-3': 4 } },
  leftover: {},
  availFinal: {},
  notas: {},
};

/** Elemento XML (com filhos) pelo nome, para comparar trechos do sheet. */
const trecho = (xml: string, tag: string) => xml.match(new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`))?.[0];
const celula = (xml: string, ref: string) => xml.match(new RegExp(`<c r="${ref}"[^>]*?(/>|>[\\s\\S]*?</c>)`))?.[0] ?? '';
const atributo = (xml: string, attr: string) => xml.match(new RegExp(`\\s${attr}="([^"]*)"`))?.[1];
const linha = (xml: string, r: number) => xml.match(new RegExp(`<row r="${r}"[^>]*>`))?.[0] ?? '';

describe('T7 — pedido no molde .xlsx sai idêntico ao original', () => {
  const molde = moldeXlsx();
  const original = unzipSync(new Uint8Array(molde.bytes));
  const gerado = unzipSync(buildPedidoXlsx(molde, stock, result, 'ACME'));
  const sheetOrig = strFromU8(original['xl/worksheets/sheet1.xml']);
  const sheet = strFromU8(gerado['xl/worksheets/sheet1.xml']);

  it('reconhece o molde como .xlsx', () => {
    expect(moldeEhXlsx(molde)).toBe(true);
    expect(molde.avisos).toEqual([]);
  });

  it('estilos (fonte, cor, preenchimento, borda, formatos) e demais abas ficam byte a byte iguais', () => {
    for (const parte of ['xl/styles.xml', 'xl/worksheets/sheet2.xml', '_rels/.rels']) {
      expect(gerado[parte]).toEqual(original[parte]);
    }
  });

  it('nome e ordem das abas e área de impressão continuam iguais', () => {
    const wbOrig = strFromU8(original['xl/workbook.xml']);
    const wb = strFromU8(gerado['xl/workbook.xml']);
    expect(trecho(wb, 'sheets')).toBe(trecho(wbOrig, 'sheets'));
    expect(trecho(wb, 'definedNames')).toBe(trecho(wbOrig, 'definedNames'));
    expect(wb).toMatch(/<calcPr fullCalcOnLoad="1"\/>/);
  });

  it('larguras, mesclagem, margens, impressão, cabeçalho e linhas do topo não mudam', () => {
    for (const tag of ['cols', 'mergeCells', 'headerFooter', 'sheetViews', 'sheetPr']) {
      expect(trecho(sheet, tag)).toBe(trecho(sheetOrig, tag));
    }
    for (const tag of ['pageMargins', 'pageSetup', 'sheetFormatPr']) {
      const re = new RegExp(`<${tag}[^>]*/>`);
      expect(sheet.match(re)?.[0]).toBe(sheetOrig.match(re)?.[0]);
    }
    for (const r of [1, 5, 6]) expect(linha(sheet, r)).toBe(linha(sheetOrig, r));
    for (const ref of ['A1', 'B1', 'C1', 'A5', 'B5', 'C5', 'D5', 'D3']) {
      expect(celula(sheet, ref)).toBe(celula(sheetOrig, ref));
    }
  });

  it('dados vão nas colunas Código / Quantidade / PU com o estilo de cada célula preservado', () => {
    expect(atributo(celula(sheet, 'A6'), 's')).toBe('2');
    expect(atributo(celula(sheet, 'B6'), 's')).toBe('2');
    expect(atributo(celula(sheet, 'C6'), 's')).toBe('3');
    expect(atributo(celula(sheet, 'C3'), 's')).toBe('3');
    expect(celula(sheet, 'D6')).toBe(celula(sheetOrig, 'D6'));
    // linhas novas herdam a altura e os estilos da 1ª linha de dados
    for (const r of [7, 8]) {
      expect(atributo(linha(sheet, r), 'ht')).toBe('18.75');
      expect(atributo(linha(sheet, r), 'customHeight')).toBe('1');
      expect(atributo(celula(sheet, `A${r}`), 's')).toBe('2');
      expect(atributo(celula(sheet, `B${r}`), 's')).toBe('2');
      expect(atributo(celula(sheet, `C${r}`), 's')).toBe('3');
    }
    expect(atributo(sheet.match(/<dimension[^>]*>/)![0], 'ref')).toBe('A1:D8');
  });

  it('o Excel lê os valores certos nas células certas', () => {
    const wb = XLSX.read(buildPedidoXlsx(molde, stock, result, 'ACME'), { type: 'array' });
    expect(wb.SheetNames).toEqual(['Pedido Oficial', 'Instruções']);
    const ws = wb.Sheets['Pedido Oficial'];
    expect(ws.A1.v).toBe('PEDIDO DE VENDA');
    expect(ws.A3.v).toBe('ACME');
    expect(ws.C3.v).toBe(25 * 2.5 + 10 * 10 + 4 * 7.25);
    expect([ws.A6.v, ws.B6.v, ws.C6.v]).toEqual(['A-1', 25, 2.5]);
    expect([ws.A7.v, ws.B7.v, ws.C7.v]).toEqual(['B-2', 10, 10]);
    expect([ws.A8.v, ws.B8.v, ws.C8.v]).toEqual(['C-3', 4, 7.25]);
    expect(ws['!merges']).toEqual([XLSX.utils.decode_range('A1:C1')]);
  });

  it('o calcChain sai junto com a referência dele (o Excel recria), sem deixar o arquivo inválido', () => {
    // a fórmula D6 continua; calcChain só é removido quando uma fórmula é sobrescrita
    expect(gerado['xl/calcChain.xml']).toEqual(original['xl/calcChain.xml']);
    expect(gerado['[Content_Types].xml']).toEqual(original['[Content_Types].xml']);
  });
});
