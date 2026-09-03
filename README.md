# Rateia

Prepara a **distribuição das notas de saída** de uma operação de importação. Cruza o
estoque exportado do Maino com o pedido do cliente, puxa o PU de saída, distribui os
produtos entre os clientes por regras, controla o saldo e gera uma planilha pronta para
emitir as notas.

> **Não emite NF.** A nota de entrada já é feita no Maino; o Rateia só organiza, cruza,
> calcula e distribui.

**Princípio inegociável:** tudo roda localmente, **nada sai da máquina** (sem servidor,
sem nuvem). As regras de negócio (fonte da verdade) estão em [`reference/docs`](reference/docs).

A interface segue uma direção de arte própria — **"instrumento de conferência, não painel
de apresentação"** — descrita em
[`reference/docs/06-direcao-de-arte.md`](reference/docs/06-direcao-de-arte.md). Leia antes de
mexer em cor, tipografia ou componente.

## Stack

- React + TypeScript + Vite
- Tailwind CSS + primitivos próprios em `src/components/ui` (tokens no `src/index.css`)
- Tipografia empacotada via `@fontsource` (Instrument Serif · Inter · JetBrains Mono):
  o app não faz requisição a CDN de fonte, coerente com o princípio de nada sair da máquina
- SheetJS (`xlsx`) — leitura (`.xls`/`.xlsx`) e exportação. Vem do **CDN oficial**
  (`cdn.sheetjs.com`), não do npm: o registro está parado na 0.18.5, que tem
  vulnerabilidades altas. Carregado sob demanda (`src/io/sheetjs.ts`), fora do bundle inicial.
- Zustand — estado global · Dexie (IndexedDB) — persistência local
- Vitest — testes das invariantes do motor

## Uso

```bash
npm install
npm run dev
```

Nada vem pré-cadastrado: os produtos são sempre os da planilha importada.

## Fluxo

A navegação é uma **trilha numerada** (1 Estoque → 5 Sobra): o trabalho é sempre linear e a
interface é o roteiro dele. **Ir e voltar entre os passos não perde nada** — a conferência do
pedido, o ajuste de colunas, a regra em construção e os campos da sobra ficam no store
(`drafts`), então dá para conferir um saldo no passo 1 no meio da conferência e voltar. Esses
rascunhos são trabalho em andamento: ficam fora do autosave, que só grava a divisão em si.

0. **Nova divisão** — na tela inicial, clique em "Iniciar nova divisão" e importe a
   planilha de estoque do Maino (`.xlsx`/`.xls`). O modal detecta as colunas, mostra uma prévia
   (totais + primeiras linhas) e só então cria a divisão. A tela inicial também lista as divisões
   salvas para reabrir.
1. **Estoque** — controle geral (inicial / distribuído / disponível / valor); substituir o Maino.
2. **Importar cliente** — lê a planilha do cliente (uma aba por cliente: CNPJ, valor-alvo, tabela de produtos),
   cruza com o estoque por código (com índice de sub-códigos para os códigos combinados do Maino) e gera
   clientes + regras de meta. Cada aba mostra **quais colunas foram usadas** (código, descrição, quantidade)
   e a linha de cabeçalho: trocar qualquer uma reprocessa os itens na hora, e abas que o sistema não
   reconheceu sozinho pedem a linha do cabeçalho em vez de sumir. O padrão de colunas é **guardado por
   cliente** e reaplicado na importação seguinte (selo “padrão salvo”).
3. **Distribuir** — clientes + regras nas 4 modalidades, aplicadas sempre na ordem `fixa/quantidade → percentual → meta → divisão igual`, cada etapa consumindo o saldo.
4. **Resultado** — valor de cada nota (com variação proposital para não saírem idênticas) + uma aba por cliente.
5. **Sobra** — saldo restante, sem destino automático (a operadora decide).
6. **Exportar `.xlsx`** — Controle geral + uma aba por cliente + Sobra.

Divisões são salvas/abertas localmente (IndexedDB) e há autosave da divisão corrente.

## Arquitetura

```
src/
├── engine/   # motor PURO e testável (compute, metaFill, splitEqual, seletores)
├── io/        # importMaino, importCliente, columnMap, matching, normalizeValue, exportXlsx
├── store/     # Zustand (estado) + Dexie (persistência local)
├── components/# UI (marca, tela inicial, modal de import, abas + primitivos em ui/)
└── fixtures/  # maino.json (estoque real — fixture dos testes e referência de formato)
```

O **motor** (`src/engine`) é um port 1:1 do protótipo validado (`reference/rateia-prototipo.html`)
e é onde um bug custa uma nota errada — por isso é puro e coberto por testes.

## Testes

```bash
npm test
```

Cobre as **6 invariantes** do motor (doc 04), os exemplos de meta validados
(R$ 5.000 → R$ 5.000,43 · R$ 10.000 → R$ 10.000,17), a conservação da divisão igual, e os
parsers do io (valor informal, sub-códigos combinados, sinônimos de coluna, planilha do cliente).

`src/io/reais.test.ts` roda contra as **planilhas reais** da operação
(`reference/dados-exemplo/`): fixa os totais do Maino (76 produtos, 35.072 un., R$ 261.555,40),
o cabeçalho e os itens de cada aba do cliente, os CNPJs e valores-alvo lidos, e o cruzamento
ponta a ponta — os 72 itens da aba `WM` casam 100% por código/sub-código. Esses arquivos têm
CNPJs e nomes reais: anonimizar antes de publicar o repositório.

## Build

```bash
npm run build
npm run preview
```
