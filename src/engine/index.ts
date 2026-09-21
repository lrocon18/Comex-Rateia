export { compute, puMap, prodMap, iniMap } from './distribute';
export { metaFill, distribuirPedido, type MetaFillResult, type DistribuirPedidoOpts } from './meta';
export {
  quantidadesPermitidas,
  snapDown,
  isOrigemQuebrada,
  quantidadePermitida,
  minimoPositivo,
} from './granularity';
export { splitEqual, type Rng } from './equal';
export {
  distributedMap,
  clientTotal,
  clientePodeRedistribuirTeto,
  produtosListadosDoCliente,
  ledgerTotals,
  type LedgerTotals,
} from './selectors';
