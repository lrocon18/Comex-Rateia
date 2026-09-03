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
    qtd = floor(qtd)
    qtd = min(qtd, avail[codigo])   // trava no saldo
    if qtd <= 0: return
    alloc[cliente][codigo] += qtd
    avail[codigo] -= qtd
```

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
metaFill(codigos, avail, pu, alvo):
    take = {}; valor = 0
    // passo 1: preenche por baixo, PU decrescente (consome os caros primeiro)
    para c em codigos ordenados por pu desc:
        room = alvo - valor
        se room <= 0: break
        n = min( floor(room / pu[c]), avail[c] - take[c] )
        se n > 0: take[c] += n; valor += n*pu[c]
    // passo 2: arredonda PRA CIMA com o menor PU disponível (overshoot mínimo)
    enquanto valor < alvo:
        cand = codigos com (avail[c]-take[c])>0, ordenados por pu ASC
        se cand vazio: break            // estoque acabou: fica abaixo, não força
        c = cand[0]; take[c] += 1; valor += pu[c]
    retorna take
// resultado: valor >= alvo por uma diferença mínima, OU o máximo possível
```
Validado: alvo R$ 5.000 → R$ 5.000,43 · alvo R$ 10.000 → R$ 10.000,17 ·
produto caro sem estoque → pega tudo, não alcança (não força).

### 4. Divisão igual do restante (com variação proposital)
```
splitEqual(clientes, avail, variacao):
    para cada codigo com avail>0:
        a = avail[codigo]; n = |clientes|
        base = floor(a/n); resto = a - base*n
        dá base a todos; distribui o resto 1 a 1 (rotação aleatória do início)
        avail[codigo] = 0                       // 100% distribuído
    // variação: move `variacao` unidades avulsas entre clientes
    repita `variacao` vezes:
        escolhe codigo aleatório; doador com saldo>0; recebedor != doador
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

## Exportação (.xlsx)
- Aba **"Controle geral":** Código, Produto, Estoque inicial, Distribuído,
  Disponível, PU saída, Valor disponível (todos os produtos).
- **Uma aba por cliente:** Código, Produto, Quantidade, PU saída, Valor total +
  linha TOTAL.
- Aba **"Sobra":** apenas saldo > 0.
- Nome de aba sanitizado (sem `\\ / ? * [ ] :`, ≤ 31 chars, único).
