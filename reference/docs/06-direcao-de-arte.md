# 06 · Direção de arte

Este documento é a **fonte da verdade visual** do Rateia. Antes de criar tela,
componente ou cor nova, leia daqui. Se algo na interface não obedecer ao que
está escrito abaixo, o errado é a interface.

## A missão

> **O Rateia é um instrumento de conferência, não um painel de apresentação.**

Quem usa está dividindo dinheiro real: cada linha da tela vira uma nota fiscal.
A interface tem que dar a sensação de uma **mesa de trabalho bem iluminada** —
papel, tinta, régua — onde cada número está no lugar certo e nada disputa
atenção com o valor da nota. O oposto do que buscamos é o "dashboard": cartão
colorido, sombra, gradiente, ícone grande, número decorativo.

O nome diz o que o produto faz: **rateia** um lote em partes desiguais que somam
o todo. A identidade inteira sai daí.

## Os três princípios

### 1. O número é o herói

- Números **sempre** com algarismos tabulares (`.num`) e alinhados à direita.
  Coluna de número não balança quando o valor muda.
- Hierarquia se faz com **tamanho e peso**, nunca com fundo colorido. Um total
  importante é maior e mais escuro, não verde.
- Código de produto é **monoespaçado** (`.code`): é identificador, não texto.
- Unidade e moeda em cinza, o número em tinta: `R$` menor que `261.555,40`.

### 2. Papel, tinta e uma cor de carimbo

- A superfície é **papel** (off-white levemente quente), não branco de tela.
- O texto é **tinta** grafite-preta; o secundário é grafite claro.
- Existe **um** acento: o *verde-doca*, usado para ação primária, foco e
  confirmação. Nada mais compete com ele.
- Vermelho e âmbar são **sinais de risco**, nunca decoração. Se aparecerem em
  tela sem haver risco, estão errados.
- Proibido: gradiente, sombra colorida, emoji na interface, badge saturado
  dentro de tabela (era o pior vício da versão antiga).

### 3. Silêncio na moldura

- Separação por **fio de 1px**, não por sombra. Sombra só no que flutua de fato
  (modal).
- Densidade alta: a operadora precisa ver 30 linhas, não 8. Altura de linha de
  tabela em 36–40px.
- Tudo na **grade de 4px**. Raio de canto pequeno (4–6px): papel cortado, não
  bolha.
- A moldura desaparece para o conteúdo aparecer.

## O ritual (UX)

O trabalho é **linear e sempre o mesmo**: importar o estoque → cruzar o pedido →
distribuir → conferir → destinar a sobra → exportar. Então a navegação não é um
menu, é uma **trilha numerada** que mostra em que passo a operadora está. Isso
transforma a interface no roteiro do trabalho e é o que mais reduz erro de
operação.

Regras de comportamento:

- **Trocar de passo não custa trabalho.** A operadora vai e volta entre os
  passos o tempo todo (confere um saldo no 1 no meio da conferência do 2), então
  o que ela já preencheu — conferência das abas do pedido, ajuste de colunas,
  regra em construção, campos de destino da sobra — vive no store, não no
  componente da tela. Nunca guarde trabalho em andamento em `useState` de aba.
- **Nada de automático em cima de dinheiro.** Toda alocação é confirmada por
  quem opera (a sobra, inclusive).
- **Estado vazio é instrução**, não decoração: diz o que fazer em seguida.
- **Erro fala português**, aponta a aba e a ação ("escolha a linha do
  cabeçalho"), nunca joga a exceção na cara.
- Foco visível sempre (fio de 2px no acento): o fluxo é de teclado e planilha.

## Tokens

Definidos em [`src/index.css`](../../src/index.css). Use sempre o token, nunca a
cor crua do Tailwind (`bg-emerald-600` está proibido).

| Token                       | Uso                                            |
|-----------------------------|------------------------------------------------|
| `--color-paper`             | fundo da aplicação (papel)                     |
| `--color-surface`           | superfície de cartão/tabela                    |
| `--color-ink`               | texto principal                                |
| `--color-graphite`          | texto secundário, rótulos                      |
| `--color-rule`              | fio de 1px, divisórias                         |
| `--color-dock` / `-strong`  | acento: ação primária, foco, confirmação       |
| `--color-dock-wash`         | fundo suave do acento (seleção, destaque leve) |
| `--color-signal-ok`         | conferido / casou / disponível                 |
| `--color-signal-warn`       | atenção: precisa de conferência humana         |
| `--color-signal-risk`       | risco: não casou, estoque zerado, erro         |

## Tipografia

Três vozes, todas **empacotadas no projeto** (`@fontsource`) — o princípio
inegociável é que nada sai da máquina, então também **nada entra**: zero
requisição a CDN de fonte.

- **Instrument Serif** — só a marca e os títulos de tela grandes. É a assinatura
  do produto, o toque de "documento". Nunca em texto corrido nem em botão.
- **Inter** — toda a interface: rótulo, texto, número. Com `tnum` ligado.
- **JetBrains Mono** — código de produto, CNPJ, cabeçalho de planilha. Tudo que
  a operadora compara caractere por caractere.

Escala (rem): 0.6875 rótulo · 0.75 apoio · 0.8125 tabela · 0.875 texto ·
1.125 título de bloco · 1.5+ marca e números de destaque.

**Nada de aperto.** Erro que já aconteceu e não deve voltar: tracking negativo
achata o texto. Algarismo tabular já tem avanço fixo, monoespaçado já é
desenhado com o espaço certo e a Instrument Serif já é estreita — nos três,
`letter-spacing` negativo fecha as contraformas e o número parece amassado.
E `line-height: 1` em número grande ou na serifada come o espaço das
descendentes: o piso é ~1.15, e ~1.3 nos números de destaque.

## A marca

Logomark: **três barras de larguras diferentes que somam a mesma linha** — o
lote dividido em notas desiguais. Nunca redesenhe por fora do componente
[`src/components/Brand.tsx`](../../src/components/Brand.tsx).

Assinatura: `Rateia` em Instrument Serif + `distribuição das notas de saída` em
Inter, cinza, minúsculo. A frase é parte da marca; não invente outra.
