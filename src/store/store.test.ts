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
});
