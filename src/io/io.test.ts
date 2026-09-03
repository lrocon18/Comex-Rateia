import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import type { Produto } from '@/types';
import { normalizeValor, parseDecimal } from './normalizeValue';
import { detectColumns } from './columnMap';
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
    expect(produtos[0]).toMatchObject({ codigo: '46025', produto: 'Disco', estoque: 600, pu: 1.2193 });
    expect(produtos[1]).toMatchObject({ codigo: 'WM1-51', estoque: 480, pu: 5.5863 });
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
    expect(pedido.nome).toBe('WM');
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

describe('cabeçalho sem rótulo — nome ao lado do CNPJ e valor solto', () => {
  it('lê nome e "15k" na mesma linha do CNPJ, sem rótulo nenhum', () => {
    const pedido = parseSheetToPedido('WEX', [
      ['', '', '03,666,303/0001-36', 'bibian', 98, '15k'],
      [],
      ['Ref', 'Descricao', 'Qts'],
      ['TP-1911', 'tecido', '10'],
    ])!;
    expect(pedido.cnpj).toBe('03.666.303/0001-36');
    expect(pedido.nome).toBe('bibian');
    expect(pedido.valorAlvo).toBe(15000);
  });

  it('não confunde contagem de caixas com valor da nota', () => {
    const pedido = parseSheetToPedido('X', [
      ['', '12.345.678/0001-90', 'ACME', 46],
      ['Ref', 'Descricao', 'Qts'],
      ['A-1', 'peça', '1'],
    ])!;
    expect(pedido.nome).toBe('ACME');
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
