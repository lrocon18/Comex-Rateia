import { create } from 'zustand';
import { compute } from '@/engine';
import type { ExportMolde, MatchItem, MatchVia, Row, SheetParse } from '@/io';
import type { Escopo, PedidoCliente, Produto, Regra, RegraInput, RegraTipo, Result, ValorAlvoUnidade } from '@/types';
import {
  loadCurrent,
  saveCurrent,
  saveOperation,
  loadOperation,
  type OperationSnapshot,
} from './db';

export type Tab = 'estoque' | 'importar' | 'distribuir' | 'resultado' | 'sobra';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'r' + Math.random().toString(36).slice(2));

/** Confirmação vinda da tela de import: cliente + itens já casados. */
export interface PedidoConfirmado {
  pedido: PedidoCliente;
  matches: MatchItem[];
}

/** Item de uma aba em conferência no passo 2. */
export interface ItemDraft {
  codigoPedido: string;
  desc: string;
  qts: number;
  produto: Produto | null;
  via: MatchVia;
}

/** Uma aba da planilha do cliente em conferência, com o mapa de colunas em uso. */
export interface PedidoDraft {
  rows: Row[];
  parse: SheetParse;
  pedido: PedidoCliente;
  itens: ItemDraft[];
  valorAlvo: number | null;
  valorAlvoUnidade: ValorAlvoUnidade;
  /** o mapa veio da memória do cliente (padrão salvo) */
  daMemoria: boolean;
  mapAberto: boolean;
  /** tabela de itens; começa fechada depois do mapeamento */
  itensAberto: boolean;
}

/** Regra sendo montada no formulário do passo 3. */
export interface RegraDraft {
  tipo: RegraTipo;
  cliente: string;
  codigo: string;
  pct: number;
  qtd: number;
  valor: number;
  tetoReal: boolean;
  scope: Escopo;
  codigos: string[];
  participantes: string[];
  variacao: number;
}

/**
 * Rascunhos das telas. Cada passo desmonta ao trocar de aba, então o que a
 * operadora já preencheu mora aqui e não no componente: ela precisa poder ir
 * conferir o estoque no passo 1 e voltar sem perder a conferência do pedido ou
 * a regra que estava montando.
 *
 * Fica de fora do `snapshot()`: é trabalho em andamento, não a divisão.
 */
export interface Drafts {
  pedidos: PedidoDraft[] | null;
  pedidosErro: string | null;
  regra: RegraDraft;
  novoCliente: string;
  sobraDestino: string;
  sobraNovoCliente: string;
  /** Molde oficial enviado pela operadora para a exportação (um arquivo por cliente). */
  exportMolde: ExportMolde | null;
  /** Clientes que pediram redistribuição com teto de valor (podem perder SKUs). */
  clientesTeto: string[];
}

const REGRA_VAZIA: RegraDraft = {
  tipo: 'fixo',
  cliente: '',
  codigo: '',
  pct: 100,
  qtd: 0,
  valor: 5000,
  tetoReal: false,
  scope: 'all',
  codigos: [],
  participantes: [],
  variacao: 12,
};

const DRAFTS_VAZIOS: Drafts = {
  pedidos: null,
  pedidosErro: null,
  regra: REGRA_VAZIA,
  novoCliente: '',
  sobraDestino: '',
  sobraNovoCliente: '',
  exportMolde: null,
  clientesTeto: [],
};

interface AppState {
  stock: Produto[];
  fileName: string | null;
  clients: string[];
  rules: Regra[];
  result: Result | null;
  tab: Tab;
  stockFilter: string;
  hydrated: boolean;
  currentOpId: number | null;
  currentOpName: string;
  drafts: Drafts;

  setTab: (t: Tab) => void;
  setStockFilter: (s: string) => void;
  patchDrafts: (p: Partial<Drafts>) => void;
  patchRegraDraft: (p: Partial<RegraDraft>) => void;
  setPedidosDraft: (fn: (anterior: PedidoDraft[] | null) => PedidoDraft[] | null) => void;
  /** Nova planilha do cliente: substitui a conferência e zera distribuir / notas / sobra. */
  carregarPedidos: (pedidos: PedidoDraft[] | null, pedidosErro: string | null) => void;
  setStock: (produtos: Produto[], fileName: string) => void;
  startDivision: (produtos: Produto[], fileName: string) => void;
  addClient: (nome: string) => void;
  removeClient: (nome: string) => void;
  addRule: (regra: RegraInput) => void;
  removeRule: (id: string) => void;
  calculate: () => void;
  /** Recalcula o cliente respeitando o teto de valor; SKUs da lista podem ficar de fora. */
  redistribuirComTeto: (cliente: string) => void;
  assignLeftover: (cliente: string) => void;
  applyPedidos: (confirmados: PedidoConfirmado[]) => void;

  hydrate: () => Promise<void>;
  newOperation: () => void;
  saveAs: (name: string) => Promise<void>;
  openOperation: (id: number) => Promise<void>;
}

function regrasDoPedido(pedidos: PedidoDraft[], clientesTeto: string[] = []): { clients: string[]; rules: Regra[] } {
  const clients: string[] = [];
  const rules: Regra[] = [];
  const teto = new Set(clientesTeto);
  for (const d of pedidos) {
    if (!d.itens.some((i) => i.produto)) continue;
    const nome = d.pedido.nome.trim() || d.pedido.aba;
    if (!clients.includes(nome)) clients.push(nome);
    const codigos = [...new Set(d.itens.filter((i) => i.produto).map((i) => i.produto!.codigo))];
    if (d.valorAlvo == null || !codigos.length) continue;
    if (d.valorAlvoUnidade === 'pct') {
      rules.push({
        id: uid(),
        tipo: 'percentual',
        cliente: nome,
        pct: d.valorAlvo,
        scope: 'sel',
        codigos,
        tetoReal: teto.has(nome),
      });
    } else {
      rules.push({
        id: uid(),
        tipo: 'meta',
        cliente: nome,
        valor: d.valorAlvo,
        scope: 'sel',
        codigos,
        tetoReal: teto.has(nome),
      });
    }
  }
  return { clients, rules };
}

function snapshot(s: AppState): OperationSnapshot {
  return { stock: s.stock, clients: s.clients, rules: s.rules, result: s.result, fileName: s.fileName };
}

export const useAppStore = create<AppState>((set, get) => ({
  stock: [],
  fileName: null,
  clients: [],
  rules: [],
  result: null,
  tab: 'estoque',
  stockFilter: '',
  hydrated: false,
  currentOpId: null,
  currentOpName: '',
  drafts: DRAFTS_VAZIOS,

  setTab: (tab) => set({ tab }),
  setStockFilter: (stockFilter) => set({ stockFilter }),

  patchDrafts: (p) => set((s) => ({ drafts: { ...s.drafts, ...p } })),
  patchRegraDraft: (p) => set((s) => ({ drafts: { ...s.drafts, regra: { ...s.drafts.regra, ...p } } })),
  setPedidosDraft: (fn) => set((s) => ({ drafts: { ...s.drafts, pedidos: fn(s.drafts.pedidos) } })),

  carregarPedidos: (pedidos, pedidosErro) =>
    set((s) => ({
      clients: [],
      rules: [],
      result: null,
      drafts: {
        ...s.drafts,
        pedidos,
        pedidosErro,
        regra: REGRA_VAZIA,
        novoCliente: '',
        sobraDestino: '',
        sobraNovoCliente: '',
        clientesTeto: [],
      },
    })),

  setStock: (produtos, fileName) =>
    set((s) => ({
      stock: produtos,
      fileName,
      rules: [],
      result: null,
      // itens conferidos e produtos escolhidos apontavam para o estoque antigo
      drafts: {
        ...s.drafts,
        pedidos: null,
        pedidosErro: null,
        regra: { ...s.drafts.regra, codigo: '', codigos: [] },
        clientesTeto: [],
      },
    })),

  startDivision: (produtos, fileName) =>
    set({
      stock: produtos,
      fileName,
      clients: [],
      rules: [],
      result: null,
      currentOpId: null,
      currentOpName: '',
      tab: 'estoque',
      drafts: DRAFTS_VAZIOS,
    }),

  addClient: (nome) =>
    set((s) => {
      const v = nome.trim();
      // o campo esvazia junto, mesmo se o nome já existia
      const drafts = { ...s.drafts, novoCliente: '' };
      if (!v || s.clients.includes(v)) return { drafts };
      return { drafts, clients: [...s.clients, v], result: null };
    }),

  removeClient: (nome) =>
    set((s) => ({
      clients: s.clients.filter((c) => c !== nome),
      rules: s.rules.filter((r) => !('cliente' in r && r.cliente === nome)),
      result: null,
      drafts: {
        ...s.drafts,
        regra: {
          ...s.drafts.regra,
          cliente: s.drafts.regra.cliente === nome ? '' : s.drafts.regra.cliente,
          participantes: s.drafts.regra.participantes.filter((c) => c !== nome),
        },
      },
    })),

  addRule: (regra) => set((s) => ({ rules: [...s.rules, { ...regra, id: uid() } as Regra], result: null })),
  removeRule: (id) => set((s) => ({ rules: s.rules.filter((r) => r.id !== id), result: null })),

  calculate: () => {
    const s = get();
    const pedidos = s.drafts.pedidos?.filter((d) => d.itens.some((i) => i.produto)) ?? null;
    let clients = s.clients;
    let rules = s.rules;
    if (pedidos?.length) {
      const auto = regrasDoPedido(pedidos, s.drafts.clientesTeto);
      const manuais = s.rules.filter((r) => r.tipo === 'igual' || r.tipo === 'fixo' || r.tipo === 'quantidade');
      clients = [...new Set([...auto.clients, ...s.clients])];
      rules = [...auto.rules, ...manuais];
    }
    const result = compute(s.stock, clients, rules);
    if (pedidos && result.notas) {
      for (const d of pedidos) {
        const nome = d.pedido.nome.trim() || d.pedido.aba;
        if (result.notas[nome]) result.notas[nome].cnpj = d.pedido.cnpj;
      }
    }
    set({ clients, rules, result, tab: 'resultado' });
  },

  redistribuirComTeto: (cliente) => {
    const nome = cliente.trim();
    if (!nome) return;
    set((s) => ({
      drafts: {
        ...s.drafts,
        clientesTeto: s.drafts.clientesTeto.includes(nome) ? s.drafts.clientesTeto : [...s.drafts.clientesTeto, nome],
      },
      rules: s.rules.map((r) => {
        if ((r.tipo === 'meta' || r.tipo === 'percentual') && r.cliente === nome) return { ...r, tetoReal: true };
        return r;
      }),
    }));
    get().calculate();
  },

  assignLeftover: (cliente) =>
    set((s) => {
      if (!s.result) return s;
      const alloc = { ...s.result.alloc, [cliente]: { ...(s.result.alloc[cliente] || {}) } };
      for (const c in s.result.leftover) alloc[cliente][c] = (alloc[cliente][c] || 0) + s.result.leftover[c];
      const availFinal = { ...s.result.availFinal };
      for (const c in availFinal) availFinal[c] = 0;
      const clients = s.clients.includes(cliente) ? s.clients : [...s.clients, cliente];
      return {
        clients,
        result: { alloc, leftover: {}, availFinal },
        drafts: { ...s.drafts, sobraDestino: '', sobraNovoCliente: '' },
      };
    }),

  applyPedidos: (confirmados) =>
    set(() => {
      const clients: string[] = [];
      const rules: Regra[] = [];
      for (const { pedido, matches } of confirmados) {
        const nome = pedido.nome.trim() || pedido.aba;
        if (!clients.includes(nome)) clients.push(nome);
        const codigos = matches.filter((m) => m.produto).map((m) => m.produto!.codigo);
        if (pedido.valorAlvo != null && codigos.length) {
          const unidade = pedido.valorAlvoUnidade ?? 'reais';
          if (unidade === 'pct') {
            rules.push({
              id: uid(),
              tipo: 'percentual',
              cliente: nome,
              pct: pedido.valorAlvo,
              scope: 'sel',
              codigos: [...new Set(codigos)],
            });
          } else {
            rules.push({
              id: uid(),
              tipo: 'meta',
              cliente: nome,
              valor: pedido.valorAlvo,
              scope: 'sel',
              codigos: [...new Set(codigos)],
              tetoReal: false,
            });
          }
        }
      }
      // a conferência fica na tela: trocar de aba (estoque, distribuir) não a apaga
      return {
        clients,
        rules,
        result: null,
        tab: 'distribuir' as const,
      };
    }),

  hydrate: async () => {
    const cur = await loadCurrent();
    if (cur) {
      const d = cur.data;
      set({
        stock: d?.stock || [],
        clients: d?.clients || [],
        rules: d?.rules || [],
        result: d?.result || null,
        fileName: d?.fileName || null,
        currentOpId: cur.opId ?? null,
        currentOpName: cur.opName || '',
        hydrated: true,
      });
    } else {
      set({ hydrated: true });
    }
  },

  newOperation: () =>
    set({
      stock: [],
      fileName: null,
      clients: [],
      rules: [],
      result: null,
      currentOpId: null,
      currentOpName: '',
      tab: 'estoque',
      drafts: DRAFTS_VAZIOS,
    }),

  saveAs: async (name) => {
    const id = await saveOperation(name, snapshot(get()), get().currentOpId ?? undefined);
    set({ currentOpId: id, currentOpName: name });
  },

  openOperation: async (id) => {
    const rec = await loadOperation(id);
    if (!rec) return;
    const d = rec.data;
    set({
      stock: d.stock,
      clients: d.clients,
      rules: d.rules,
      result: d.result,
      fileName: d.fileName,
      currentOpId: rec.id ?? null,
      currentOpName: rec.name,
      tab: 'estoque',
      // rascunho de outra divisão não pode atravessar
      drafts: DRAFTS_VAZIOS,
    });
  },
}));

/** Autosave da operação corrente (debounced) + hidratação inicial. */
export function initPersistence(): void {
  let t: ReturnType<typeof setTimeout> | null = null;
  let salvo: { data: OperationSnapshot; opId: number | null; opName: string } | null = null;

  // Os campos da divisão são sempre substituídos (nunca mutados), então
  // comparar referência basta — e evita regravar (e mexer no `updatedAt` da
  // divisão salva) só porque a operadora trocou de aba ou digitou num rascunho.
  const mudou = (data: OperationSnapshot, opId: number | null, opName: string) =>
    !salvo ||
    salvo.data.stock !== data.stock ||
    salvo.data.clients !== data.clients ||
    salvo.data.rules !== data.rules ||
    salvo.data.result !== data.result ||
    salvo.data.fileName !== data.fileName ||
    salvo.opId !== opId ||
    salvo.opName !== opName;

  useAppStore.subscribe((state) => {
    if (!state.hydrated) return;
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      const data = snapshot(state);
      if (!mudou(data, state.currentOpId, state.currentOpName)) return;
      salvo = { data, opId: state.currentOpId, opName: state.currentOpName };
      void saveCurrent(data, state.currentOpId, state.currentOpName);
      // divisão já nomeada acompanha as alterações, para a lista não ficar defasada
      if (state.currentOpId != null) void saveOperation(state.currentOpName, data, state.currentOpId);
    }, 400);
  });
}
