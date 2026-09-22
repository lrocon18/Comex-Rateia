import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';
import type { Produto } from '@/types';
import { normalizeValor, parseDecimal, parseValorAlvoCelula } from './normalizeValue';
import { detectColumns, detectExportColumns } from './columnMap';
import { avisosMapeamento, buildPedidosWorkbook, type ExportMolde } from './exportTemplate';
import { buildSobraWorkbook } from './exportSobra';
import { subCodes, matchPedido, buildCodeIndex } from './matching';
import { normalizeCnpj, parseSheet, parseSheetToPedido, pedidosFromWorkbook } from './importCliente';
import { cleanMainoName, produtosFromRows } from './importMaino';
import mainoRaw from '@/fixtures/maino.json';

const MAINO = mainoRaw as Produto[];

describe('normalizeValor — valores informais (doc 03)', () => {
  it.each([
    ['maximo de R$5mil', 5000],
    ['R$45mil', 45000],
    ['15k', 15000],
    ['13k', 13000],
    ['R$ 1.234,56', 1234.56],
  ])('%s -> %d', (raw, esperado) => {
    expect(normalizeValor(raw).valor).toBeCloseTo(esperado, 2);
  });

  it('"sem nota" marca cliente sem NF', () => {
    const r = normalizeValor('sem nota');
    expect(r.semNota).toBe(true);
    expect(r.valor).toBeNull();
  });
});

describe('parseValorAlvoCelula — C3 em reais ou %', () => {
  it('vazio fica vazio, em reais', () => {
    expect(parseValorAlvoCelula('')).toEqual({ valor: null, unidade: 'reais', semNota: false });
    expect(parseValorAlvoCelula(null)).toEqual({ valor: null, unidade: 'reais', semNota: false });
  });

  it('porcentagem com o sinal %', () => {
    expect(parseValorAlvoCelula('15%')).toEqual({ valor: 15, unidade: 'pct', semNota: false });
    expect(parseValorAlvoCelula('15,5 %')).toMatchObject({ valor: 15.5, unidade: 'pct' });
  });

  it('reais sem %', () => {
    expect(parseValorAlvoCelula(5000)).toEqual({ valor: 5000, unidade: 'reais', semNota: false });
    expect(parseValorAlvoCelula('R$ 1.234,56')).toMatchObject({ valor: 1234.56, unidade: 'reais' });
    expect(parseValorAlvoCelula('15k')).toMatchObject({ valor: 15000, unidade: 'reais' });
  });
});

describe('parseDecimal — vírgula/ponto', () => {
  it.each([
    ['2,82', 2.82],
    ['1.234,56', 1234.56],
    ['1234.56', 1234.56],
    [1000, 1000],
  ])('%s -> %d', (raw, esperado) => {
    expect(parseDecimal(raw)).toBeCloseTo(esperado as number, 2);
  });
});

describe('subCodes — códigos combinados do Maino', () => {
  it.each([
    ['WM1-61 WM1-68', ['WM1-61', 'WM1-68']],
    ['WM2-102-WM2-103', ['WM2-102', 'WM2-103']],
    ['WM2-44-WM2-58', ['WM2-44', 'WM2-58']],
    ['WM1-53-2', ['WM1-53-2']],
    ['46025', ['46025']],
  ])('%s', (cod, esperado) => {
    expect(subCodes(cod)).toEqual(esperado);
  });
});

describe('detectColumns — sinônimos', () => {
  it('mapeia Ref. Mercadoria / Descricao / Qts', () => {
    const { map } = detectColumns(['Ref. Mercadoria', 'Descricao', 'Qts', 'NCM'], ['codigo', 'produto', 'quantidade']);
    expect(map.codigo).toBe('Ref. Mercadoria');
    expect(map.produto).toBe('Descricao');
    expect(map.quantidade).toBe('Qts');
  });
});

describe('detectExportColumns — molde de exportação', () => {
  it('mapeia código, quantidade, PU, cliente e CNPJ', () => {
    const { map, uncertain } = detectExportColumns([
      'Código',
      'Quantidade',
      'Valor unitário',
      'Cliente',
      'CNPJ',
      'Descrição',
    ]);
    expect(map.codigo).toBe('Código');
    expect(map.quantidade).toBe('Quantidade');
    expect(map.pu).toBe('Valor unitário');
    expect(map.cliente).toBe('Cliente');
    expect(map.cnpj).toBe('CNPJ');
    expect(map.produto).toBe('Descrição');
    expect(uncertain).toEqual([]);
  });

  it('avisa código e quantidade obrigatórios sem origem', () => {
    const { uncertain } = detectExportColumns(['NCM', 'Observação']);
    expect(uncertain).toEqual(expect.arrayContaining(['codigo', 'quantidade']));
    expect(avisosMapeamento({})).toHaveLength(2);
  });
});

describe('cleanMainoName', () => {
  it('corta em " - " e remove código repetido', () => {
    expect(cleanMainoName('WM2-37 Tubo de aluminio - WM2-37 tubo', 'WM2-37')).toBe('Tubo de aluminio');
  });
});

describe('produtosFromRows — import Maino', () => {
  it('lê código/produto/quantidade/PU', () => {
    const rows = [
      { 'Código': '46025', 'Produto': 'Disco - Disco', 'Qtde Disponível': '600', 'PU Saída (R$)': '1,2193' },
      { 'Código': 'WM1-51', 'Produto': 'Tubo', 'Qtde Disponível': '480', 'PU Saída (R$)': '5.5863' },
    ];
    const { produtos } = produtosFromRows(rows);
    expect(produtos).toHaveLength(2);
    expect(produtos[0]).toMatchObject({
      codigo: '46025',
      produto: 'Disco',
      estoque: 600,
      pu: 1.2193,
      origemQuebrada: false,
    });
    expect(produtos[1]).toMatchObject({ codigo: 'WM1-51', estoque: 480, pu: 5.5863 });
  });

  it('não arredonda quantidade quebrada que já vem da origem (doc 04 §exceção)', () => {
    const rows = [
      { 'Código': 'WM1-72', 'Produto': 'Tecido', 'Qtde Disponível': '155,6', 'PU Saída (R$)': '10' },
    ];
    const { produtos } = produtosFromRows(rows);
    expect(produtos[0].estoque).toBeCloseTo(155.6, 4);
    expect(produtos[0].origemQuebrada).toBe(true);
  });
});

describe('parseSheetToPedido — planilha do cliente', () => {
  const rows: unknown[][] = [
    ['Cliente:', 'WM', '', ''],
    ['CNPJ', '12.345.678/0001-90', '', ''],
    ['vlr maximo NF', 'maximo de R$5mil', '', ''],
    ['qt cxs', '10', '', ''],
    [],
    ['Ref. Mercadoria', 'Descricao', 'Qts', "Cx's"],
    ['WM1-51', 'Tubo do trem', '100', '2'],
    ['WM1-60', 'Capa', '50', '1'],
    ['', '', '', ''],
  ];
  const pedido = parseSheetToPedido('WM', rows)!;

  it('acha nome, CNPJ e valor-alvo do cabeçalho', () => {
    expect(pedido.nome).toBe('vlr maximo NF');
    expect(pedido.cnpj).toBe('12.345.678/0001-90');
    expect(pedido.valorAlvo).toBe(5000);
  });

  it('lê a tabela de itens', () => {
    expect(pedido.itens).toEqual([
      { codigo: 'WM1-51', desc: 'Tubo do trem', qts: 100 },
      { codigo: 'WM1-60', desc: 'Capa', qts: 50 },
    ]);
  });
});

describe('parseSheet — mapeamento corrigido/memorizado', () => {
  const rows: unknown[][] = [
    ['Cliente:', 'ACME'],
    [],
    ['Ref. Mercadoria', 'Descricao', 'Qts', 'Estoque'],
    ['A-1', 'peça', '10', '999'],
  ];

  it('detecta sozinho e diz quais campos ficaram no automático', () => {
    const r = parseSheet('ACME', rows);
    expect(r.headerIdx).toBe(2);
    expect(r.headers).toEqual(['Ref. Mercadoria', 'Descricao', 'Qts', 'Estoque']);
    expect(r.map).toEqual({ codigo: 'Ref. Mercadoria', produto: 'Descricao', quantidade: 'Qts' });
    expect(r.uncertain).toEqual([]);
    expect(r.pedido!.itens[0].qts).toBe(10);
  });

  it('mapa salvo vence a detecção automática', () => {
    const r = parseSheet('ACME', rows, { map: { quantidade: 'Estoque' } });
    expect(r.map.quantidade).toBe('Estoque');
    expect(r.pedido!.itens[0].qts).toBe(999);
  });

  it('ignora do mapa salvo o cabeçalho que não existe nesta aba', () => {
    const r = parseSheet('ACME', rows, { map: { quantidade: 'Qtde Disponível' } });
    expect(r.map.quantidade).toBe('Qts');
  });

  it('acha a linha de cabeçalho pelos cabeçalhos memorizados', () => {
    const exoticas: unknown[][] = [
      ['ACME', '', ''],
      ['Item', 'Volume', 'Peso'],
      ['A-1', '7', '2,5'],
    ];
    expect(parseSheet('ACME', exoticas).pedido).toBeNull();

    const r = parseSheet('ACME', exoticas, { map: { codigo: 'Item', quantidade: 'Volume' } });
    expect(r.headerIdx).toBe(1);
    expect(r.pedido!.itens).toEqual([{ codigo: 'A-1', desc: '', qts: 7 }]);
    expect(r.uncertain).toEqual(['produto']);
  });

  it('respeita a linha de cabeçalho escolhida na mão', () => {
    const r = parseSheet('X', [
      ['lixo', 'lixo'],
      ['meu cod', 'minha qtd'],
      ['A-9', '3'],
    ], { headerIdx: 1, map: { codigo: 'meu cod', quantidade: 'minha qtd' } });
    expect(r.pedido!.itens).toEqual([{ codigo: 'A-9', desc: '', qts: 3 }]);
  });
});

describe('normalizeCnpj — separadores como o cliente digita', () => {
  it.each([
    ['66.269.378/0001-01', '66.269.378/0001-01'],
    ['03,666,303/0001-36', '03.666.303/0001-36'],
    ['08,110,675,/0001-03', '08.110.675/0001-03'],
    ['CNPJ: 12345678000190', '12.345.678/0001-90'],
  ])('%s -> %s', (raw, esperado) => {
    expect(normalizeCnpj(raw)).toBe(esperado);
  });

  it.each(['', 'sem cnpj aqui', '123.456', '46025'])('ignora %o', (raw) => {
    expect(normalizeCnpj(raw)).toBe('');
  });
});

describe('cabeçalho A3 vs rótulo CNPJ em B1', () => {
  it('não usa o rótulo CNPJ em B1 como nome — lê A3', () => {
    const pedido = parseSheetToPedido('ABA', [
      ['Cliente', 'CNPJ'],
      ['', '12.345.678/0001-90'],
      ['M OLIVEIRA DINIZ', ''],
      ['Ref. Mercadoria', 'Descricao', 'Qts'],
      ['WM1-51', 'Tubo', '1'],
    ])!;
    expect(pedido.nome).toBe('M OLIVEIRA DINIZ');
    expect(pedido.cnpj).toBe('12.345.678/0001-90');
  });

  it('lê A3 mesmo sem rótulo Cliente na linha 1', () => {
    const pedido = parseSheetToPedido('ABA', [
      ['', 'CNPJ'],
      ['', '12.345.678/0001-90'],
      ['ACME LTDA'],
      ['Ref. Mercadoria', 'Descricao', 'Qts'],
      ['A-1', 'peça', '2'],
    ])!;
    expect(pedido.nome).toBe('ACME LTDA');
  });

  it('C3 em % não vira nome da seção — o nome é sempre A3', () => {
    const pedido = parseSheetToPedido('ABA', [
      ['Cliente', 'CNPJ'],
      ['', '12.345.678/0001-90'],
      ['ACME LTDA', '', '100%'],
      ['Ref. Mercadoria', 'Descricao', 'Qts'],
      ['A-1', 'peça', '2'],
    ])!;
    expect(pedido.nome).toBe('ACME LTDA');
    expect(pedido.valorAlvo).toBe(100);
    expect(pedido.valorAlvoUnidade).toBe('pct');
  });

  it('C3 em reais vira valor-alvo em reais', () => {
    const pedido = parseSheetToPedido('ABA', [
      ['Cliente', 'CNPJ'],
      ['', '12.345.678/0001-90'],
      ['ACME LTDA', '', 8000],
      ['Ref. Mercadoria', 'Descricao', 'Qts'],
      ['A-1', 'peça', '2'],
    ])!;
    expect(pedido.valorAlvo).toBe(8000);
    expect(pedido.valorAlvoUnidade).toBe('reais');
  });

  it('C3 vazio no molde com nome em A3 deixa o valor-alvo vazio', () => {
    const pedido = parseSheetToPedido('ABA', [
      ['Cliente', 'CNPJ'],
      ['', '12.345.678/0001-90'],
      ['ACME LTDA', '', ''],
      ['Ref. Mercadoria', 'Descricao', 'Qts'],
      ['A-1', 'peça', '2'],
    ])!;
    expect(pedido.valorAlvo).toBeNull();
  });
});

describe('cabeçalho sem rótulo — nome ao lado do CNPJ e valor solto', () => {
  it('lê nome e "15k" na mesma linha do CNPJ, sem rótulo nenhum', () => {
    const pedido = parseSheetToPedido('WEX', [
      ['', '', '03,666,303/0001-36', 'bibian', 98, '15k'],
      [],
      ['Ref', 'Descricao', 'Qts'],
      ['TP-1911', 'tecido', '10'],
    ])!;
    expect(pedido.cnpj).toBe('03.666.303/0001-36');
    expect(pedido.nome).toBe('WEX');
    expect(pedido.valorAlvo).toBe(15000);
  });

  it('não confunde contagem de caixas com valor da nota', () => {
    const pedido = parseSheetToPedido('X', [
      ['', '12.345.678/0001-90', 'ACME', 46],
      ['Ref', 'Descricao', 'Qts'],
      ['A-1', 'peça', '1'],
    ])!;
    expect(pedido.nome).toBe('X');
    expect(pedido.valorAlvo).toBeNull();
  });
});

describe('matchPedido — cruzamento por código e nome', () => {
  const stock: Produto[] = [
    { codigo: 'WM1-61 WM1-68', produto: 'Modulo de alimentacao para drone', estoque: 32, pu: 48 },
    { codigo: 'WM2-102-WM2-103', produto: 'Estacao de carregamento', estoque: 2, pu: 1281 },
    { codigo: '46025', produto: 'Disco flexivel para polimento', estoque: 600, pu: 1.2 },
  ];

  it('índice inclui sub-códigos', () => {
    const idx = buildCodeIndex(stock);
    expect(idx.get('WM1-61')?.codigo).toBe('WM1-61 WM1-68');
    expect(idx.get('WM2-103')?.codigo).toBe('WM2-102-WM2-103');
  });

  it('casa por código, sub-código, nome e marca não-casados', () => {
    const pedido = {
      aba: 'x', nome: 'x', cnpj: '', valorAlvo: null, semNota: false,
      itens: [
        { codigo: '46025', desc: 'disco', qts: 10 },
        { codigo: 'WM1-61', desc: 'modulo', qts: 5 },
        { codigo: 'ZZZ', desc: 'disco flexivel para polimento', qts: 1 },
        { codigo: 'QQQ', desc: 'xpto nada a ver', qts: 1 },
      ],
    };
    const m = matchPedido(pedido, stock);
    expect(m[0].via).toBe('codigo');
    expect(m[1].via).toBe('subcodigo');
    expect(m[1].produto?.codigo).toBe('WM1-61 WM1-68');
    expect(m[2].via).toBe('nome');
    expect(m[2].produto?.codigo).toBe('46025');
    expect(m[3].via).toBe('none');
    expect(m[3].produto).toBeNull();
  });
});

describe('pedidosFromWorkbook + matchPedido — integração com a fixture real', () => {
  it('lê um workbook de 2 abas e cruza com o Maino (inclui código combinado)', async () => {
    const wb = XLSX.utils.book_new();
    const abaWM = XLSX.utils.aoa_to_sheet([
      ['Cliente:', 'WM'],
      ['CNPJ', '12.345.678/0001-90'],
      ['vlr maximo NF', 'R$45mil'],
      [],
      ['Ref. Mercadoria', 'Descricao', 'Qts'],
      ['WM1-61', 'Modulo de alimentacao', '10'], // sub-código de "WM1-61 WM1-68"
      ['46025', 'Disco', '50'],
    ]);
    const abaSG = XLSX.utils.aoa_to_sheet([
      ['cliente', 'SG'],
      ['valor', '15k'],
      [],
      ['Ref. Mercadoria', 'Descricao', 'Qts'],
      ['WM2-80', 'Vedacao', '100'],
    ]);
    XLSX.utils.book_append_sheet(wb, abaWM, 'WM');
    XLSX.utils.book_append_sheet(wb, abaSG, 'SG');

    const pedidos = await pedidosFromWorkbook(wb);
    expect(pedidos).toHaveLength(2);

    const wm = pedidos.find((p) => p.aba === 'WM')!;
    expect(wm.valorAlvo).toBe(45000);
    expect(wm.itens).toHaveLength(2);

    const matches = matchPedido(wm, MAINO);
    expect(matches[0].via).toBe('subcodigo');
    expect(matches[0].produto?.codigo).toBe('WM1-61 WM1-68');
    expect(matches[1].via).toBe('codigo');
    expect(matches[1].produto?.codigo).toBe('46025');

    const sg = pedidos.find((p) => p.aba === 'SG')!;
    expect(sg.valorAlvo).toBe(15000);
  });
});

describe('buildPedidosWorkbook — um arquivo, aba por cliente', () => {
  const aoa = [
    ['Pedido'],
    [],
    ['', '', 0],
    [],
    ['Código', 'Quantidade', 'PU', 'Descrição', 'Cliente', 'CNPJ', 'NCM'],
    ['', '', '', '', '', '', 'NCM-KEEP'],
  ];

  function moldeDeAoa(): ExportMolde {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Modelo');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['extra']]), 'Instrucoes');
    const raw = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const bytes = Array.from(new Uint8Array(raw));
    const headers = aoa[4] as string[];
    const { map } = detectExportColumns(headers);
    return {
      bytes,
      fileName: 'molde.xlsx',
      headers,
      headerIdx: 4,
      map,
      avisos: avisosMapeamento(map),
    };
  }

  const stock: Produto[] = [
    { codigo: 'A-1', produto: 'peça a', estoque: 10, pu: 2 },
    { codigo: 'A-2', produto: 'peça b', estoque: 5, pu: 3 },
  ];

  it('clona o modelo em uma aba por cliente e não preenche coluna sem origem', async () => {
    const molde = moldeDeAoa();
    expect(molde.avisos).toEqual([]);
    const wb = await buildPedidosWorkbook(molde, stock, {
      alloc: {
        ACME: { 'A-1': 2, 'A-2': 1 },
        Beta: { 'A-1': 1 },
      },
      leftover: {},
      availFinal: {},
      notas: {
        ACME: { solicitado: 10, valor: 7, diferenca: -3, diferencaPct: -0.3, cnpj: '12.345.678/0001-90' },
        Beta: { solicitado: 2, valor: 2, diferenca: 0, diferencaPct: 0, cnpj: '' },
      },
    });

    expect(wb.SheetNames[0]).toBe('ACME');
    expect(wb.SheetNames[1]).toBe('Beta');
    expect(wb.SheetNames).toContain('Instrucoes');
    const acme = wb.Sheets.ACME;
    expect(acme.A3.v).toBe('ACME');
    expect(acme.C3.v).toBe(7);
    expect(acme.A6.v).toBe('A-1');
    expect(acme.B6.v).toBe(2);
    expect(acme.C6.v).toBe(2);
    expect(acme.D6.v).toBe('peça a');
    expect(acme.E6.v).toBe('ACME');
    expect(acme.F6.v).toBe('12.345.678/0001-90');
    expect(acme.G6.v).toBe('NCM-KEEP');
    expect(acme.A7.v).toBe('A-2');
    expect(acme.B7.v).toBe(1);

    expect(wb.Sheets.Beta.A3.v).toBe('Beta');
    expect(wb.Sheets.Beta.A6.v).toBe('A-1');
    expect(wb.Sheets.Beta.B6.v).toBe(1);
  });

  it('não exporta se código ou quantidade ficarem sem coluna', () => {
    expect(avisosMapeamento({ pu: 'PU' }).join(' ')).toMatch(/Código/);
    expect(avisosMapeamento({ pu: 'PU' }).join(' ')).toMatch(/Quantidade/);
  });
});

describe('buildSobraWorkbook — molde CLIENTE 1', () => {
  const bytes = new Uint8Array(readFileSync(resolve('src/assets/template-pedido-cliente.xlsx')));

  it('preenche Código, Quantidade e Valor Unitário a partir da linha 5', async () => {
    const stock: Produto[] = [
      { codigo: 'A-1', produto: 'peça a', estoque: 10, pu: 2.5 },
      { codigo: 'B-2', produto: 'peça b', estoque: 3, pu: 10 },
    ];
    const wb = await buildSobraWorkbook(
      stock,
      { alloc: {}, leftover: { 'A-1': 4, 'B-2': 1 }, availFinal: { 'A-1': 4, 'B-2': 1 } },
      bytes,
    );
    const ws = wb.Sheets[wb.SheetNames[0]];
    expect(ws.B1.v).toBe('Produtos');
    expect(ws.A4.v).toBe('Código');
    expect(ws.B4.v).toBe('Quantidade');
    expect(ws.C4.v).toBe('Valor Unitário');
    expect(ws.A5.v).toBe('A-1');
    expect(ws.B5.v).toBe(4);
    expect(ws.C5.v).toBe(2.5);
    expect(ws.A6.v).toBe('B-2');
    expect(ws.B6.v).toBe(1);
    expect(ws.C6.v).toBe(10);
  });
});
