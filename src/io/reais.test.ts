// Validação contra as planilhas REAIS da operação (reference/dados-exemplo).
// É o teste que pega o que a planilha sintética não pega: bloco de cabeçalho de
// tamanho variável, CNPJ com vírgula, nome ao lado do CNPJ, aba-modelo etc.
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { Produto } from '@/types';
import { produtosFromRows } from './importMaino';
import { parseSheetToPedido } from './importCliente';
import { matchPedido } from './matching';

const DIR = fileURLToPath(new URL('../../reference/dados-exemplo/', import.meta.url));
// o build ESM do SheetJS não lê do disco por conta própria (sem set_fs)
const abrir = (arquivo: string) => XLSX.read(readFileSync(join(DIR, arquivo)), { type: 'buffer' });

const MAINO = abrir('maino-estoque.xlsx');
const CLIENTE = abrir('cliente-separacao-itens.xls');

function linhas(wb: XLSX.WorkBook, aba: string): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[aba], { header: 1, defval: '' });
}

function estoqueReal(): Produto[] {
  const ws = MAINO.Sheets[MAINO.SheetNames[0]];
  return produtosFromRows(XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })).produtos;
}

describe('Maino real — Relatório de Produtos Estoque', () => {
  it('tem uma aba só, com o nome do relatório', () => {
    expect(MAINO.SheetNames).toEqual(['Relatório de Produtos Estoque']);
  });

  it('detecta as quatro colunas pelos nomes reais', () => {
    const ws = MAINO.Sheets[MAINO.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    const { colunas } = produtosFromRows(rows);
    expect(colunas).toEqual({
      codigo: 'Código',
      produto: 'Produto',
      quantidade: 'Qtde Disponível',
      pu: 'PU Saída (R$)',
    });
  });

  it('bate com os totais da operação (doc 03): 76 produtos, 35.072 un., ~R$ 261.555', () => {
    const produtos = estoqueReal();
    expect(produtos).toHaveLength(76);
    expect(produtos.reduce((s, p) => s + p.estoque, 0)).toBe(35072);
    expect(produtos.reduce((s, p) => s + p.estoque * p.pu, 0)).toBeCloseTo(261555.4, 1);
  });

  it('limpa o nome duplicado de todos os produtos', () => {
    for (const p of estoqueReal()) {
      expect(p.produto).not.toContain(' - ');
      expect(p.produto.toUpperCase().startsWith(p.codigo.toUpperCase())).toBe(false);
      expect(p.produto.length).toBeGreaterThan(0);
    }
  });

  it('quantidade com decimal é arredondada e o PU mantém as 4 casas', () => {
    const produtos = estoqueReal();
    expect(produtos.every((p) => Number.isInteger(p.estoque))).toBe(true);
    expect(produtos.find((p) => p.codigo === 'TP-1911')?.pu).toBeCloseTo(210.4557, 4);
  });
});

describe('Planilha real do cliente — 4 abas com cabeçalhos de tamanho variável', () => {
  it('tem as abas da operação', () => {
    expect(CLIENTE.SheetNames).toEqual(['WM', "WE'X", 'SG092', 'cliente']);
  });

  it.each([
    ['WM', 72],
    ["WE'X", 3],
    ['SG092', 1],
    ['cliente', 76],
  ])('aba %s: acha a tabela e lê %i item(ns)', (aba, itens) => {
    const pedido = parseSheetToPedido(aba, linhas(CLIENTE, aba));
    expect(pedido).not.toBeNull();
    expect(pedido!.itens).toHaveLength(itens);
  });

  it('WM: CNPJ, nome ao lado do CNPJ e valor informal "maximo de R$5mil"', () => {
    const p = parseSheetToPedido('WM', linhas(CLIENTE, 'WM'))!;
    expect(p.cnpj).toBe('66.269.378/0001-01');
    expect(p.nome).toBe('M OLIVEIRA DINIZ');
    expect(p.valorAlvo).toBe(5000);
    expect(p.semNota).toBe(false);
  });

  it("WE'X: CNPJ escrito com vírgula é normalizado e o valor lê \"15k\"", () => {
    const p = parseSheetToPedido("WE'X", linhas(CLIENTE, "WE'X"))!;
    expect(p.cnpj).toBe('03.666.303/0001-36');
    expect(p.nome).toBe('bibian');
    expect(p.valorAlvo).toBe(15000);
  });

  it('SG092: lê CNPJ e nome, sem valor-alvo informado', () => {
    const p = parseSheetToPedido('SG092', linhas(CLIENTE, 'SG092'))!;
    expect(p.cnpj).toBe('07.286.086/0001-00');
    expect(p.nome).toBe('sg');
    expect(p.valorAlvo).toBeNull();
  });

  it('aba-modelo "cliente": só a tabela de produtos, nome cai no nome da aba', () => {
    const p = parseSheetToPedido('cliente', linhas(CLIENTE, 'cliente'))!;
    expect(p.cnpj).toBe('');
    expect(p.nome).toBe('cliente');
    expect(p.valorAlvo).toBeNull();
  });

  it('itens vêm com quantidade inteira e código não vazio', () => {
    const p = parseSheetToPedido('WM', linhas(CLIENTE, 'WM'))!;
    expect(p.itens.every((i) => i.codigo.trim().length > 0)).toBe(true);
    expect(p.itens.every((i) => Number.isInteger(i.qts) && i.qts > 0)).toBe(true);
    expect(p.itens[0]).toEqual({ codigo: 'WM1-60-5', desc: 'adaptador de hélice para drone', qts: 50 });
  });
});

describe('Cruzamento real: pedido do cliente × estoque do Maino', () => {
  it('WM casa todos os itens por código ou sub-código', () => {
    const pedido = parseSheetToPedido('WM', linhas(CLIENTE, 'WM'))!;
    const matches = matchPedido(pedido, estoqueReal());
    const porVia = matches.reduce<Record<string, number>>((acc, m) => {
      acc[m.via] = (acc[m.via] || 0) + 1;
      return acc;
    }, {});
    expect(porVia.none ?? 0).toBe(0);
    expect((porVia.codigo ?? 0) + (porVia.subcodigo ?? 0)).toBe(matches.length);
  });

  it("WE'X casa os tecidos e SG092 o disco (código numérico)", () => {
    const stock = estoqueReal();
    const wex = matchPedido(parseSheetToPedido("WE'X", linhas(CLIENTE, "WE'X"))!, stock);
    expect(wex.map((m) => m.produto?.codigo)).toEqual(['TP-1911', 'TP-2209', 'TP-2211']);

    const sg = matchPedido(parseSheetToPedido('SG092', linhas(CLIENTE, 'SG092'))!, stock);
    expect(sg[0].via).toBe('codigo');
    expect(sg[0].produto?.codigo).toBe('46025');
  });
});

// Limitações conhecidas do formato real (candidatas da Fase 2, doc 03).
describe('Limitação conhecida: mais de um cliente por aba', () => {
  it('WM tem dois clientes no cabeçalho (5 mil e o Master de 45 mil); só o primeiro é lido', () => {
    const rows = linhas(CLIENTE, 'WM');
    const textos = rows.slice(0, 5).flat().map(String);
    expect(textos.some((t) => t.includes('maximo de R$5mil'))).toBe(true);
    expect(textos.some((t) => t.includes('maximo de R$45mil'))).toBe(true);

    const p = parseSheetToPedido('WM', rows)!;
    expect(p.valorAlvo).toBe(5000); // o Master (45 mil) e seu CNPJ ficam de fora
  });

  it("WE'X lista 6 clientes com valor para os mesmos 3 produtos; vira um pedido só", () => {
    const rows = linhas(CLIENTE, "WE'X");
    const nomes = rows.slice(0, 7).map((r) => String(r[3] ?? '')).filter(Boolean);
    expect(nomes).toEqual(['bibian', 'eclair', 'pianeta', 'oxalis', 'mendry']);

    const p = parseSheetToPedido("WE'X", rows)!;
    expect(p.nome).toBe('bibian'); // os outros 5 (e o "sem nota") ficam de fora
  });
});
