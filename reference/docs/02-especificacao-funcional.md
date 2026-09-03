# 02 · Especificação funcional

Cada item abaixo já está **decidido** (ver o porquê em `06-registro-de-decisoes.md`).

## 1. Entrada de dados
- **Estoque (Maino):** importar a exportação `.xlsx`. Campos: código, produto,
  quantidade disponível, PU de saída.
- **Pedido (cliente):** importar a planilha do cliente/chefe (`.xls`/`.xlsx`),
  em formato variável.

## 2. Mapeamento de colunas
O sistema tenta **identificar automaticamente** as colunas equivalentes — ex.:
na do cliente pode existir "Ref. Mercadoria" ou "Referência do Produto"
representando o mesmo que "Código" no Maino. Quando não tiver certeza, mostra o
mapeamento para a operadora **confirmar**. Depois de confirmado, o sistema
**guarda o padrão daquele cliente**, para reconhecer automaticamente nas
próximas planilhas (memória por cliente).

## 3. Cruzamento de produtos (matching)
- **Por código** quando houver — é o caminho principal e confiável (na operação
  real os códigos batem entre as duas planilhas).
- **Por nome/descrição** quando não houver código — correspondência aproximada
  (fuzzy), **sempre mostrando o resultado para confirmação** quando houver
  dúvida. Os nomes divergem bastante (maiúsculas x minúsculas, acentos), então
  nome é reforço, não o principal.
- Ao casar, o sistema traz automaticamente o **PU de saída** e a **quantidade
  disponível** do Maino.

## 4. Distribuição — sempre POR PRODUTO
Não é dividir o estoque inteiro; a regra pode ser diferente para cada produto.
Modalidades suportadas:

- **Produto → cliente (fixa):** "todas as escovas de cabelo são do Gabriel"
  (X% de um produto específico para um cliente).
- **Percentual por produto:** cliente recebe X% da quantidade **disponível** de
  cada produto selecionado (ex.: José recebe 50% de cada um dos 10 produtos → 50
  de cada, sobrando 50 de cada para as próximas regras).
- **Meta de valor:** cliente informa um **valor** (não %); o sistema usa o PU
  para montar a combinação de produtos/quantidades que chega **o mais próximo
  possível** da meta.
- **Divisão igual do restante:** divide o que sobrou igualmente entre os clientes
  participantes — **com variação proposital** (ver item 6).
- (Também aceita **quantidade explícita** por produto/cliente.)

## 5. Meta de valor — regras
- **Aproximada, arredondando pra cima.** Pedir R$ 5.000 pode fechar em R$ 5.050,
  R$ 5.100 etc. Se ficar abaixo, adiciona mais uma unidade para passar da meta.
- **Overshoot mínimo:** usa os produtos de **menor PU** disponível para dar os
  últimos passos, passando da meta pelo menor valor possível.
- **Nunca ultrapassa o estoque.** Se o estoque disponível não alcança a meta,
  pega tudo o que há e fica abaixo (não força, não inventa quantidade).
- "Valor máximo NF" que aparece nas planilhas do cliente é tratado como **alvo
  aproximado** (pode passar), por padrão. Se algum cliente específico tiver um
  **teto real** (não pode passar), isso vira uma marcação por cliente.

## 6. Divisão igual com variação proposital
Objetivo: **as notas não podem sair todas com o mesmo valor** (notas idênticas
parecem artificiais). O sistema divide igual e depois "embaralha" um pouco —
move algumas unidades entre clientes — só o suficiente para cada nota fechar num
**valor diferente**. Nada some e nada é criado: o que sai de um entra no outro, e
**100% do estoque é distribuído**. A intensidade é ajustável (ordem de ~10–15
trocas; a operadora deu esse número). Não há cliente que precise receber mais —
a variação é aleatória entre eles.

## 7. Ordem de aplicação das regras
Sempre nesta ordem, cada etapa **consumindo o saldo disponível**:
1. Alocações fixas produto → cliente
2. Percentual por produto/cliente
3. Meta de valor
4. Divisão do saldo restante

Exemplo: um produto 100% do Gabriel é alocado primeiro; o que sobrar entra nas
regras seguintes.

## 8. Controle de saldo e arredondamento
- Unidades **inteiras**; o sistema calcula **sem ultrapassar** o disponível.
- Quando não divide exato, **a sobra permanece disponível** (não desaparece).
- **Estoque zerado permanece zerado** — nunca negativo, nunca forçado. Um produto
  que zerou **continua visível com quantidade 0**, deixando claro que existia na
  operação mas já foi todo usado.
- Invariante: `estoque inicial = distribuído + disponível` por produto, sempre.

## 9. Duas visões de estoque
- **Controle geral:** todos os produtos — código, descrição, estoque inicial,
  quantidade já distribuída, saldo disponível, valor. Zerados aparecem com 0.
- **Saldo para utilização:** apenas os produtos que ainda têm saldo (> 0) —
  código, descrição, quantidade restante, PU, valor. É a lista pronta para o
  **cliente de sobra** (que costuma receber tudo o que restou), sem precisar
  conferir produto por produto.

## 10. Sobra
Sem destino automático. O sistema mostra claramente **quanto sobrou de cada
produto e o valor** ao longo da operação. No fim, a sobra pode ficar numa aba
**"Não distribuído"** (disponível para a próxima rodada) **ou** a operadora
define manualmente para qual cliente vai (ela normalmente aguarda o chefe
informar). **Ela decide** — o sistema nunca distribui essa última parte sozinho.

## 11. Saída
Planilha organizada, **uma aba por cliente** (código, produto, quantidade, PU,
valor total, com o total da nota), mais a aba de **sobra** e o **controle geral**.
