# 04 · Motor de distribuição

O coração do sistema. Os algoritmos abaixo **já foram validados** no protótipo
(ver invariantes ao final). Pseudocódigo em estilo JS.

## Modelo de dados
```
produto        = { codigo, produto, estoque /* inicial */, pu }
avail[codigo]  = saldo disponível (começa = estoque, decrementa ao alocar)
alloc[cliente][codigo] = quantidade alocada (acumula)
regra          = { tipo, cliente, ... }   // tipos abaixo
```

## Função central: `give` (nunca ultrapassa, nunca negativa)
```
give(cliente, codigo, qtd):
    qtd = min(qtd, avail[codigo])   // trava no saldo
    se origemInteira[codigo]: qtd = floor(qtd)   // ver exceção abaixo
    if qtd <= 0: return
    alloc[cliente][codigo] += qtd
    avail[codigo] -= qtd
```

### Exceção: origem já quebrada
Normalmente a quantidade distribuída é **sempre inteira** — o motor nunca
inventa uma fração pra bater um valor. Mas, às vezes, a própria planilha de
origem (Maino) já traz um produto com quantidade quebrada (ex.: `1,6`, por
algum motivo da operação real — já aconteceu com `WM1-72`, ver
`reference/dados-exemplo`). Nesse caso:

- **A importação não arredonda** (`src/io/importMaino.ts`) — a quantidade lida
  fica exatamente como veio.
- **`give` não floreia** esse código — só trava no saldo. Uma regra fixa/
  percentual pode dar `1,6` (ou uma fração dele) normalmente.
- **`metaFill` e `splitEqual` tratam esse código como parcela indivisível**:
  leva tudo ou nada, nunca uma fatia calculada pra aproximar um valor ou
  dividir entre clientes — fatiar um lote quebrado seria "inventar uma
  quantidade quebrada pra ajustar valor", que é a regra proibida.
- Um produto com origem **inteira** nunca vira quebrado, nem em `meta` (que já
  floreia por unidade) nem em `percentual`/`fixo` (o `floor` de `give` garante
  isso).

`origemInteira[codigo]` é decidido uma vez, a partir do `estoque` inicial de
cada produto (`Number.isInteger`), e passado para `give`, `metaFill` e
`splitEqual`.

## Ordem de aplicação (fixa)
1. `fixo` · 2. `percentual` · 3. `meta` · 4. `igual`
Cada etapa usa o `avail` já reduzido pelas anteriores.

### 1. Fixa (produto → cliente)
```
give(regra.cliente, regra.codigo, avail[regra.codigo] * regra.pct/100)
```

### 2. Percentual por produto
```
para cada codigo no escopo(regra):        // escopo = selecionados ou todos
    give(regra.cliente, codigo, avail[codigo] * regra.pct/100)
```

### 3. Meta de valor  (aproxima, arredonda pra cima, overshoot mínimo)
```
metaFill(codigos, avail, pu, alvo, origemInteira):
    take = {}; valor = 0
    // passo 1: preenche por baixo, PU decrescente (consome os caros primeiro)
    para c em codigos ordenados por pu desc:
        room = alvo - valor
        se room <= 0: break
        restante = avail[c] - take[c]
        se origemInteira[c]:
            n = min( floor(room / pu[c]), restante )
        senão:
            // parcela indivisível: só entra se ela inteira couber no espaço
            n = (restante > 0 e restante*pu[c] <= room) ? restante : 0
        se n > 0: take[c] += n; valor += n*pu[c]
    // passo 2: arredonda PRA CIMA com o menor PU disponível (overshoot mínimo)
    enquanto valor < alvo:
        cand = codigos com (avail[c]-take[c])>0, ordenados por pu ASC
        se cand vazio: break            // estoque acabou: fica abaixo, não força
        c = cand[0]
        passo = origemInteira[c] ? 1 : (avail[c] - take[c])   // quebrada: tudo de uma vez
        take[c] += passo; valor += passo*pu[c]
    retorna take
// resultado: valor >= alvo por uma diferença mínima, OU o máximo possível
// um código de origem quebrada nunca aparece fatiado em `take` — só inteiro (tudo) ou ausente (nada)
```
Validado: alvo R$ 5.000 → R$ 5.000,43 · alvo R$ 10.000 → R$ 10.000,17 ·
produto caro sem estoque → pega tudo, não alcança (não força).

### 4. Divisão igual do restante (com variação proposital)
```
splitEqual(clientes, avail, variacao, origemInteira):
    para cada codigo com avail>0:
        a = avail[codigo]; n = |clientes|
        se não origemInteira[codigo]:
            dá `a` inteiro pra um único cliente sorteado; avail[codigo] = 0
            continua                      // parcela indivisível: não fatia entre clientes
        base = floor(a/n); resto = a - base*n
        dá base a todos; distribui o resto 1 a 1 (rotação aleatória do início)
        avail[codigo] = 0                       // 100% distribuído
    // variação: move `variacao` unidades avulsas entre clientes (só entre códigos de origem inteira)
    repita `variacao` vezes:
        escolhe codigo (origem inteira) aleatório; doador com saldo>0; recebedor != doador
        move 1 unidade do doador para o recebedor   // total por produto intacto
```
A variação muda o **valor das notas** sem criar/perder estoque. Só clientes
marcados participam (um cliente com meta pode ficar de fora da divisão do resto).

## Sobra
```
leftover[codigo] = avail[codigo]   para todo avail[codigo] > 0
```
Nunca atribuída sozinha. A operadora manda para um cliente (o que só faz
`alloc[cliente][codigo] += leftover[codigo]`) ou deixa em "Não distribuído".

## Invariantes (testar sempre)
1. Para todo produto: `estoque_inicial == distribuído + disponível`.
2. `avail[codigo] >= 0` sempre (nunca negativo).
3. Produto que zerou continua na lista com quantidade 0.
4. Nenhuma alocação ultrapassa o estoque inicial.
5. Na divisão igual, a soma por produto entre os clientes = disponível daquele
   produto naquele momento (nada perdido, nada criado).
6. Meta: `valor >= alvo` (overshoot) OU `valor == valor_máximo_possível` quando o
   estoque não alcança.
7. Quantidade distribuída de um código com origem inteira nunca é fracionária.
8. Quantidade distribuída de um código com origem quebrada só é `0` ou o valor
   exato que veio na importação — nunca uma fração calculada dele.

## Exportação (.xlsx)
- Aba **"Controle geral":** Código, Produto, Estoque inicial, Distribuído,
  Disponível, PU saída, Valor disponível (todos os produtos).
- **Uma aba por cliente:** Código, Produto, Quantidade, PU saída, Valor total +
  linha TOTAL.
- Aba **"Sobra":** apenas saldo > 0.
- Nome de aba sanitizado (sem `\\ / ? * [ ] :`, ≤ 31 chars, único).

## Exportação pelo template do cliente
Além do `.xlsx` de controle acima, existe uma exportação **um arquivo por
cliente**, no molde oficial fornecido pela operadora
(`src/assets/template-pedido-cliente.xlsx`): Código · Quantidade · Valor
Unitário (PU), com as linhas de instrução do topo do molde preservadas e o
dado começando na 5ª linha do arquivo. `src/io/exportTemplate.ts` carrega o
molde e só preenche as células de dado — não reconstrói a planilha do zero —
preservando estrutura, mescla de células, ordem de colunas e formato numérico
já presentes no arquivo. Limitação conhecida do SheetJS (build usada pelo
projeto): cor de preenchimento de célula (fundo) não sobrevive à
leitura+escrita — o restante da formatação (número, mescla, texto) sim. Se um
dia o molde mudar, basta substituir esse arquivo.
