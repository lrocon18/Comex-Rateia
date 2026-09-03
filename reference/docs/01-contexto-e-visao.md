# 01 · Contexto e visão

## Quem usa
A operadora (namorada do Rocon) trabalha com **importação** e é quem prepara as
notas fiscais de entrada e de saída da mercadoria. A empresa fica em **Alagoas**.
Ela é especialista no domínio, mas não é da área técnica — a ferramenta precisa
ser simples e guiada.

## O contexto fiscal
Existe um **benefício fiscal** ligado à operação de entrada e saída em até
**24 horas**. Por isso agilidade importa: quanto mais rápido a distribuição fica
pronta, melhor a operação cabe nessa janela.

A **nota de entrada já é feita no Maino**. Portanto o sistema **não precisa
emitir NF** — o foco é automatizar a **preparação da nota de saída** e a
**distribuição dos produtos entre os clientes**.

## O problema hoje (a dor)
Ela recebe duas planilhas que não conversam entre si:

1. **Estoque (Maino):** código, produto, quantidade disponível e **PU de saída**
   (o valor pelo qual o produto entra na nota de saída). Só o Maino tem o PU.
2. **Pedido (cliente/chefe):** quais produtos vão para cada cliente e/ou qual
   valor cada cliente precisa receber. Vem em **formato variável** — às vezes
   sem código, às vezes com colunas a mais. **Nunca tem o PU.**

Hoje o trabalho é manual e é um "cara-crachá": procurar o produto numa planilha,
achar na outra, conferir código/nome, puxar o PU correspondente, fazer conta de
porcentagem, tentar chegar no valor da nota e conferir quanto sobrou. Repetido
produto a produto, cliente a cliente.

## A visão
Ela coloca os dados e diz o que precisa — por exemplo:

> "Tenho esses produtos disponíveis. Para o Gabriel preciso de R$ 5.000. Para o
> Rafael, 30% das escovas de dente e 50% das presilhas."

E o sistema cruza as planilhas, identifica os produtos, busca o PU, verifica o
estoque, aplica as regras de distribuição por cliente, calcula quantidades e
valores, controla o saldo restante e entrega a **divisão final por cliente**,
numa planilha pronta para emitir as notas de saída no Maino.

## O fluxo, de ponta a ponta
```
Planilha do Maino            Planilha do cliente
(código, qtd, PU)            (quem recebe o quê: qtd / % / valor)
        \                    /
         → mapear colunas (resolve o formato variável)
         → cruzar produtos (por código; por nome quando não houver código)
         → aplicar regras de distribuição POR PRODUTO
         → controlar saldo (nunca ultrapassa o disponível)
         → gerar distribuição final por cliente
         → exportar planilha pronta para as notas de saída
```
