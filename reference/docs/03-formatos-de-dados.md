# 03 · Formatos de dados (reais)

Baseado nas planilhas reais da operação. Leia antes de escrever qualquer parser.

Os dois arquivos estão em `reference/dados-exemplo/` (`maino-estoque.xlsx` e
`cliente-separacao-itens.xls`) e são lidos pelos testes em `src/io/reais.test.ts`.
Contêm CNPJs e nomes de clientes reais — anonimizar antes de publicar o repo.

## Planilha do Maino (estoque) — `.xlsx`
- Uma aba: **"Relatório de Produtos Estoque"**.
- Cabeçalho na primeira linha. Colunas:

| Coluna              | Significado            | Observação                                   |
|---------------------|------------------------|----------------------------------------------|
| `Código`            | código do produto      | chave de cruzamento                          |
| `Produto`           | descrição              | vem **duplicada**: `"COD DESC - COD DESC"`   |
| `Qtde Disponível`   | quantidade disponível  | pode vir com decimal (ex.: `155.6`)          |
| `PU Saída (R$)`     | preço unitário de saída| 4 casas decimais (ex.: `210.4557`)           |

- Volume real: **76 produtos**, 35.072 unidades, ~R$ 261.555, PU de R$ 0,54 a
  R$ 1.281.
- **Limpeza do nome:** cortar em `" - "` e remover o código no início. Ver
  `src/fixtures/maino.json` para o resultado já limpo.

## Planilha do cliente/chefe — `.xls`
- **Formato antigo** (Excel do Mac, "Composite Document"). Em Python precisa de
  `xlrd`; **SheetJS lê direto** no navegador (`XLSX.read`).
- **Uma aba por cliente/operação** (no arquivo real: `WM`, `WE'X`, `SG092`,
  `cliente`). Cada aba tem:
  - **Bloco de cabeçalho** com: CNPJ, nome do cliente, **valor-alvo da nota**
    (rótulos vistos: "vlr maximo NF", "valor") em formato informal
    (`"maximo de R$5mil"`, `"R$45mil"`, `"15k"`, `"13k"`) e "qt cxs".
  - **Tabela de produtos** começando algumas linhas abaixo, colunas:

| Coluna (cliente)   | Equivale a (Maino)     |
|--------------------|------------------------|
| `Ref. Mercadoria`  | `Código`               |
| `Descricao`        | `Produto`              |
| `Qts`              | quantidade             |
| `Cx's`, `Unid`, `NCM`, `Peso N.W`, `Peso G.W` | não usados na nota |

### Casos-limite reais (tratar no parser)
- **Códigos combinados no Maino:** `"WM1-61 WM1-68"`, `"WM2-102-WM2-103"`,
  `"WM2-44-WM2-58"` — um registro do Maino cobre dois códigos.
- **Nomes divergem:** Maino em MAIÚSCULA, sem acento e duplicado; cliente em
  minúscula e com acento. → cruzar por **código**; nome só como reforço.
- **Decimais com vírgula** nos pesos/quantidades (`2,82`).
- **Valor informal:** `"R$5mil"`, `"15k"`, `"sem nota"` — precisa de um
  normalizador (mil/k → *1000; "sem nota" = cliente sem nota fiscal).
- **Bloco de cabeçalho de tamanho variável** antes da tabela — detectar a linha
  de header pela presença de "Ref. Mercadoria"/"Descricao"/"Qts".
- **Cabeçalho sem rótulo:** o nome do cliente aparece na célula **à direita do
  CNPJ** (`CNPJ | M OLIVEIRA DINIZ | maximo de R$5mil`) e o valor pode vir solto
  (`15k`, sem "vlr maximo NF"). Exigir escala/moeda no valor solto para não
  confundir com "qt cxs" (um `46` na mesma linha não é o valor da nota).
- **CNPJ com vírgula:** `03,666,303/0001-36` e `08,110,675,/0001-03` — aceitar
  `.` ou `,` (inclusive a extra antes da barra) e normalizar para
  `xx.xxx.xxx/xxxx-xx`.

### Limitações conhecidas (candidatas da Fase 2)
Fixadas em `src/io/reais.test.ts` para o comportamento não mudar sem intenção.

- **Mais de um cliente por aba.** `WM` tem dois no bloco de cabeçalho
  (M OLIVEIRA DINIZ, 5 mil; Cliente Master, 45 mil) e **só o primeiro é lido**.
- **Vários clientes para os mesmos produtos.** `WE'X` lista seis
  (`bibian` 15k, `novo cliente` sem nota, `eclair` 13k, `pianeta` 10k,
  `oxalis` 13k, `mendry` 10k) para os 3 produtos da aba, e também vira **um
  pedido só**, com o primeiro cliente. O operador cobre o resto adicionando os
  clientes na aba Distribuir.

## Mapeamento de colunas (sinônimos conhecidos)
Ponto de partida para a detecção automática (item 2 da especificação):

- **Código:** `código`, `codigo`, `ref`, `ref. mercadoria`, `referência do produto`
- **Produto:** `produto`, `descrição`, `descricao`, `mercadoria`, `nome`
- **Quantidade:** `qts`, `qtde disponível`, `quantidade`, `disponível`, `estoque`
- **PU:** `pu saída`, `pu`, `preço`, `preco`, `valor unit`

A memória por cliente (Fase 3) guarda o mapeamento confirmado para reusar.
