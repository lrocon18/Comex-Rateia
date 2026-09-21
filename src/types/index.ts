// Domínio do Rateia — modelo das regras de negócio refinadas (docs 02/04/06).
// Ver reference/docs para a fonte da verdade.

/** Produto do estoque do Maino. `estoque` é a quantidade inicial disponível. */
export interface Produto {
  codigo: string;
  produto: string; // descrição (nome limpo)
  estoque: number; // quantidade inicial
  pu: number; // PU de saída (R$)
  /** true quando a quantidade importada da origem já vinha decimal (ex.: 1,6). */
  origemQuebrada?: boolean;
}

export type RegraTipo = 'fixo' | 'quantidade' | 'percentual' | 'meta' | 'igual';

/** Escopo de produtos de uma regra: todos com saldo, ou uma seleção. */
export type Escopo = 'all' | 'sel';

export interface RegraFixo {
  id: string;
  tipo: 'fixo';
  cliente: string;
  codigo: string;
  pct: number; // % do disponível daquele produto
}

export interface RegraQuantidade {
  id: string;
  tipo: 'quantidade';
  cliente: string;
  codigo: string;
  qtd: number; // quantidade explícita
}

export interface RegraPercentual {
  id: string;
  tipo: 'percentual';
  cliente: string;
  pct: number; // % de cada produto no escopo
  scope: Escopo;
  codigos: string[]; // usados quando scope === 'sel'
}

export interface RegraMeta {
  id: string;
  tipo: 'meta';
  cliente: string;
  valor: number; // valor-alvo da nota (R$)
  scope: Escopo;
  codigos: string[];
  tetoReal: boolean; // true = não pode ultrapassar o alvo (sem overshoot)
}

export interface RegraIgual {
  id: string;
  tipo: 'igual';
  clientes: string[]; // participantes; vazio = todos
  variacao: number; // nº de trocas avulsas entre notas
}

export type Regra =
  | RegraFixo
  | RegraQuantidade
  | RegraPercentual
  | RegraMeta
  | RegraIgual;

/** Omit distributivo — preserva cada membro da união ao remover `id`. */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** Regra ainda sem `id` (entrada dos formulários). */
export type RegraInput = DistributiveOmit<Regra, 'id'>;

/** cliente -> codigo -> quantidade alocada (acumula). */
export type Alloc = Record<string, Record<string, number>>;

/** Saldo por código. */
export type Saldo = Record<string, number>;

/** Relatório da nota de um cliente após o rateio. */
export interface ClienteNota {
  solicitado: number;
  valor: number;
  diferenca: number;
  diferencaPct: number;
  cnpj?: string;
}

export interface Result {
  alloc: Alloc;
  leftover: Saldo; // saldo > 0 ao final (sobra, sem destino automático)
  availFinal: Saldo; // saldo por código após todas as regras
  notas?: Record<string, ClienteNota>;
}

// ---- Import da planilha do cliente (io) ----

/** Item de pedido lido da planilha do cliente. */
export interface ItemPedido {
  codigo: string;
  desc: string;
  qts: number;
}

/** Unidade do valor-alvo lido da planilha ou escolhido na tela. */
export type ValorAlvoUnidade = 'reais' | 'pct';

/** Bloco de um cliente/operação lido de uma aba da planilha do cliente. */
export interface PedidoCliente {
  aba: string;
  nome: string;
  cnpj: string;
  valorAlvo: number | null; // null = "sem nota" / não informado
  /** `pct` gera regra percentual; `reais` gera meta em R$. Ausente = reais. */
  valorAlvoUnidade?: ValorAlvoUnidade;
  semNota: boolean;
  itens: ItemPedido[];
}
