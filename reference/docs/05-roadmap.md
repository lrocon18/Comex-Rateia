# 05 · Roadmap

Priorizado por dor aliviada ÷ esforço.

## Fase 0 — Núcleo (CONCLUÍDA — protótipo)
Elimina o grosso do trabalho manual.
- [x] Importar Maino (detecção de colunas) + estoque pré-carregado
- [x] Controle geral (inicial / distribuído / disponível / valor), zerados visíveis
- [x] Cruzamento por código
- [x] Distribuição: fixa, percentual, meta de valor, divisão igual com variação
- [x] Ordem das regras consumindo saldo; sem estoque negativo
- [x] Visão de saldo (só > 0) para o cliente de sobra
- [x] Sobra sem destino automático (operadora decide)
- [x] Exportar `.xlsx` (aba por cliente + sobra + controle geral)

Referência viva: `prototipo/rateia-prototipo.html`.

## Fase 1 — Funcional e customizável (CONCLUÍDA)
Transformar o protótipo em sistema de trabalho.
- [x] **Sem produtos pré-cadastrados:** a divisão começa na tela inicial (clique no
      meio da tela) e o estoque vem sempre da planilha do Maino importada, com
      detecção de colunas e prévia antes de confirmar.
- [x] **Persistência entre sessões**: salvar/abrir divisões localmente
      (IndexedDB) — dados nunca saem da máquina.
- [x] **Leitura automática da planilha do cliente** (`.xls`/`.xlsx`): parser do
      bloco de cabeçalho (CNPJ, cliente, valor-alvo) + tabela de produtos, com
      normalização de valor informal ("R$5mil", "15k").
- [x] **Mapeamento de colunas com confirmação** na importação, com memória do
      padrão por cliente.
- [x] Cruzamento automático do pedido do cliente com o estoque (traz PU + saldo).
- [x] **Validado com as planilhas reais** (`src/io/reais.test.ts`): os 76 produtos
      do Maino e os 72 itens da aba `WM` cruzam 100% por código/sub-código.
- [x] **Identidade visual própria** (doc 06): missão de arte, paleta de papel/tinta
      com um acento, três vozes tipográficas empacotadas, primitivos redesenhados e
      navegação como trilha numerada do ritual de trabalho.

## Fase 2 — Refino da distribuição (PRÓXIMA)
- [ ] Meta de valor multi-produto com seleção de elegíveis mais rica.
- [ ] Marcação por cliente de **teto real** ("não pode passar") vs alvo aproximado.
      O motor (`metaFill`) e o formulário de regra já tratam a flag; o que falta é
      poder marcar isso **na importação**: as metas geradas por `applyPedidos`
      saem sempre com `tetoReal: false`, e hoje só dá para corrigir refazendo a
      regra à mão no passo 3.
- [ ] Ajuste fino da variação (por nº de trocas e/ou por % de diferença nas notas).
- [ ] **Vários clientes numa aba só** (doc 03): hoje o parser lê apenas o
      primeiro. `WM` traz dois clientes (5 mil e o Master de 45 mil) e `WE'X`
      seis para os mesmos 3 produtos — virar N pedidos, ou N clientes com a
      mesma lista de itens.

## Fase 3 — Memória e escala
- [x] **Memória de mapeamento de colunas por cliente** — entregue junto da Fase 1
      (tabela `mappings` no Dexie + selo "padrão salvo" na importação).
- [ ] **Perfis de cliente reutilizáveis** (regras fixas do Gabriel etc.).
- [ ] **Memória de sinônimos de nome** (ex.: "escova cab." = "Escova de cabelo")
      para melhorar o matching por nome ao longo do tempo.

## Ideias futuras (não priorizadas)
- Empacotar como app de desktop (ex.: Tauri) para virar um aplicativo instalável.
- Histórico de operações / relatório de conferência do estoque.
