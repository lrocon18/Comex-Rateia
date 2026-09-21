import { describe, it, expect, beforeEach } from 'vitest';
import type { Produto } from '@/types';
import { useAppStore, type PedidoDraft } from './useAppStore';

const PRODUTOS: Produto[] = [
  { codigo: 'A-1', produto: 'peça a', estoque: 10, pu: 2 },
  { codigo: 'A-2', produto: 'peça b', estoque: 5, pu: 3 },
];

/** Uma aba em conferência, como a tela de import monta. */
function draftDeAba(nome: string): PedidoDraft {
  const pedido = { aba: nome, nome, cnpj: '', valorAlvo: 5000, semNota: false, itens: [] };
  return {
    rows: [['Ref', 'Qts'], ['A-1', 3]],
    parse: { aba: nome, pedido, headers: ['Ref', 'Qts'], headerIdx: 0, map: { codigo: 'Ref' }, uncertain: [] },
    pedido,
    itens: [{ codigoPedido: 'A-1', desc: 'peça a', qts: 3, produto: PRODUTOS[0], via: 'codigo' }],
    valorAlvo: 5000,
    valorAlvoUnidade: 'reais',
    daMemoria: false,
    mapAberto: false,
    itensAberto: false,
  };
}

describe('store — divisão vem da planilha do usuário (sem seed)', () => {
  beforeEach(() => {
    useAppStore.getState().newOperation();
  });

  it('começa sem produtos pré-cadastrados', () => {
    const s = useAppStore.getState();
    expect(s.stock).toEqual([]);
    expect(s.fileName).toBeNull();
  });

  it('startDivision carrega o estoque e zera clientes, regras e resultado', () => {
    const store = useAppStore.getState();
    store.addClient('Cliente antigo');
    store.addRule({ tipo: 'igual', clientes: [], variacao: 3 });

    useAppStore.getState().startDivision(PRODUTOS, 'maino.xlsx');

    const s = useAppStore.getState();
    expect(s.stock).toHaveLength(2);
    expect(s.fileName).toBe('maino.xlsx');
    expect(s.clients).toEqual([]);
    expect(s.rules).toEqual([]);
    expect(s.result).toBeNull();
    expect(s.currentOpId).toBeNull();
    expect(s.tab).toBe('estoque');
  });

  it('newOperation limpa o estoque (volta para a tela inicial)', () => {
    useAppStore.getState().startDivision(PRODUTOS, 'maino.xlsx');
    useAppStore.getState().newOperation();

    const s = useAppStore.getState();
    expect(s.stock).toEqual([]);
    expect(s.fileName).toBeNull();
  });
});

describe('rascunhos das telas — trocar de passo não perde o preenchido', () => {
  beforeEach(() => {
    useAppStore.getState().newOperation();
    useAppStore.getState().startDivision(PRODUTOS, 'maino.xlsx');
  });

  it('conferência do pedido e regra em construção atravessam a troca de aba', () => {
    const store = useAppStore.getState();
    store.patchDrafts({ pedidos: [draftDeAba('WM')], novoCliente: 'Gabri' });
    store.patchRegraDraft({ tipo: 'meta', valor: 15000, codigos: ['A-1', 'A-2'] });

    // vai conferir o estoque e volta
    useAppStore.getState().setTab('estoque');
    useAppStore.getState().setTab('importar');

    const d = useAppStore.getState().drafts;
    expect(d.pedidos).toHaveLength(1);
    expect(d.pedidos?.[0].itens[0].codigoPedido).toBe('A-1');
    expect(d.novoCliente).toBe('Gabri');
    expect(d.regra).toMatchObject({ tipo: 'meta', valor: 15000, codigos: ['A-1', 'A-2'] });
  });

  it('applyPedidos gera clientes e regras e mantém a conferência na tela', () => {
    useAppStore.getState().patchDrafts({ pedidos: [draftDeAba('WM')] });

    useAppStore.getState().applyPedidos([
      {
        pedido: { aba: 'WM', nome: 'WM', cnpj: '', valorAlvo: 5000, semNota: false, itens: [] },
        matches: [
          {
            item: { codigo: 'A-1', desc: 'peça a', qts: 3 },
            produto: PRODUTOS[0],
            via: 'codigo',
            score: 1,
            candidatos: [],
          },
        ],
      },
    ]);

    const s = useAppStore.getState();
    expect(s.drafts.pedidos).toHaveLength(1);
    expect(s.drafts.pedidos?.[0].pedido.nome).toBe('WM');
    expect(s.clients).toEqual(['WM']);
    expect(s.rules).toHaveLength(1);
    expect(s.rules[0]).toMatchObject({ tipo: 'meta', valor: 5000, cliente: 'WM' });
    expect(s.tab).toBe('distribuir');
  });

  it('Distribuir pedidos consome o pedido cruzado sem redigitar', () => {
    useAppStore.getState().patchDrafts({ pedidos: [draftDeAba('WM')] });
    useAppStore.getState().calculate();

    const s = useAppStore.getState();
    expect(s.tab).toBe('resultado');
    expect(s.clients).toContain('WM');
    expect(s.result).not.toBeNull();
    expect(s.result!.alloc['WM']['A-1']).toBeGreaterThan(0);
    expect(s.result!.notas?.['WM']?.solicitado).toBe(5000);
  });

  it('uma nova planilha do cliente apaga distribuir, notas e sobra', () => {
    const store = useAppStore.getState();
    store.addClient('antigo');
    store.addRule({ tipo: 'igual', clientes: [], variacao: 3 });
    store.calculate();
    store.patchDrafts({ sobraDestino: 'antigo', novoCliente: 'x' });

    useAppStore.getState().carregarPedidos([draftDeAba('WM')], null);

    const s = useAppStore.getState();
    expect(s.drafts.pedidos).toHaveLength(1);
    expect(s.clients).toEqual([]);
    expect(s.rules).toEqual([]);
    expect(s.result).toBeNull();
    expect(s.drafts.sobraDestino).toBe('');
    expect(s.drafts.novoCliente).toBe('');
  });

  it('o molde de exportação permanece na sessão ao carregar um pedido novo', () => {
    const molde = {
      bytes: [1, 2, 3],
      fileName: 'oficial.xlsx',
      headers: ['Código', 'Quantidade'],
      headerIdx: 4,
      map: { codigo: 'Código', quantidade: 'Quantidade' },
      avisos: [] as string[],
    };
    useAppStore.getState().patchDrafts({ exportMolde: molde });
    useAppStore.getState().carregarPedidos([draftDeAba('WM')], null);
    expect(useAppStore.getState().drafts.exportMolde?.fileName).toBe('oficial.xlsx');
  });

  it('applyPedidos com valor-alvo em % gera regra percentual', () => {
    useAppStore.getState().applyPedidos([
      {
        pedido: {
          aba: 'WM',
          nome: 'WM',
          cnpj: '',
          valorAlvo: 15,
          valorAlvoUnidade: 'pct',
          semNota: false,
          itens: [],
        },
        matches: [
          {
            item: { codigo: 'A-1', desc: 'peça a', qts: 3 },
            produto: PRODUTOS[0],
            via: 'codigo',
            score: 1,
            candidatos: [],
          },
        ],
      },
    ]);

    const r = useAppStore.getState().rules[0];
    expect(r).toMatchObject({ tipo: 'percentual', pct: 15, cliente: 'WM', scope: 'sel' });
  });

  it('substituir o Maino descarta a conferência e os produtos escolhidos na regra', () => {
    const store = useAppStore.getState();
    store.patchDrafts({ pedidos: [draftDeAba('WM')] });
    store.patchRegraDraft({ codigo: 'A-1', codigos: ['A-1'], valor: 15000 });

    useAppStore.getState().setStock([{ codigo: 'B-9', produto: 'outro', estoque: 4, pu: 1 }], 'novo.xlsx');

    const d = useAppStore.getState().drafts;
    expect(d.pedidos).toBeNull();
    expect(d.regra.codigo).toBe('');
    expect(d.regra.codigos).toEqual([]);
    // o resto do que ela digitou continua
    expect(d.regra.valor).toBe(15000);
  });

  it('remover cliente o tira da regra em construção', () => {
    const store = useAppStore.getState();
    store.addClient('bibian');
    store.addClient('WM');
    useAppStore.getState().patchRegraDraft({ cliente: 'bibian', participantes: ['bibian', 'WM'] });

    useAppStore.getState().removeClient('bibian');

    const d = useAppStore.getState().drafts.regra;
    expect(d.cliente).toBe('');
    expect(d.participantes).toEqual(['WM']);
  });

  it('addClient esvazia o campo do nome', () => {
    useAppStore.getState().patchDrafts({ novoCliente: 'bibian' });
    useAppStore.getState().addClient('bibian');

    expect(useAppStore.getState().drafts.novoCliente).toBe('');
    expect(useAppStore.getState().clients).toEqual(['bibian']);
  });

  it('abrir/criar outra divisão não leva rascunho da anterior', () => {
    useAppStore.getState().patchDrafts({ pedidos: [draftDeAba('WM')], sobraDestino: 'bibian' });

    useAppStore.getState().newOperation();

    const d = useAppStore.getState().drafts;
    expect(d.pedidos).toBeNull();
    expect(d.sobraDestino).toBe('');
  });

  it('redistribuir com teto baixa o valor e pode deixar produto de fora', () => {
    const stock: Produto[] = [
      { codigo: 'A', produto: 'a', estoque: 1, pu: 100 },
      { codigo: 'B', produto: 'b', estoque: 1, pu: 100 },
      { codigo: 'C', produto: 'c', estoque: 1, pu: 1 },
    ];
    useAppStore.getState().startDivision(stock, 'maino.xlsx');
    const pedido = { aba: 'WM', nome: 'WM', cnpj: '', valorAlvo: 150, semNota: false, itens: [] };
    const draft: PedidoDraft = {
      rows: [],
      parse: { aba: 'WM', pedido, headers: [], headerIdx: 0, map: {}, uncertain: [] },
      pedido,
      itens: stock.map((p) => ({
        codigoPedido: p.codigo,
        desc: p.produto,
        qts: 1,
        produto: p,
        via: 'codigo' as const,
      })),
      valorAlvo: 150,
      valorAlvoUnidade: 'reais',
      daMemoria: false,
      mapAberto: false,
      itensAberto: false,
    };
    useAppStore.getState().patchDrafts({ pedidos: [draft] });
    useAppStore.getState().calculate();

    const antes = useAppStore.getState().result!;
    expect(antes.notas?.WM?.diferenca).toBeGreaterThan(0);
    expect(Object.values(antes.alloc.WM).filter((q) => q > 0)).toHaveLength(3);

    useAppStore.getState().redistribuirComTeto('WM');
    const depois = useAppStore.getState().result!;
    expect(depois.notas?.WM?.valor).toBeLessThanOrEqual(150);
    expect(depois.notas?.WM?.diferenca).toBeLessThanOrEqual(0.009);
    expect(Object.values(depois.alloc.WM).filter((q) => q > 0).length).toBeLessThan(3);
    expect(useAppStore.getState().drafts.clientesTeto).toContain('WM');
  });
});
