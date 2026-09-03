# 06 · Registro de decisões

Decisões travadas com a operadora, com o motivo — para não reabrir depois.

## D1 · Variação proposital na divisão igual
As notas **não podem sair idênticas** (parece artificial). Divide igual e
embaralha ~10–15 itens **aleatórios** entre os clientes; **100% distribuído**.
Não há cliente que precise receber mais. O que importa é o **valor das notas**
ficar diferente (exemplo dela: R$ 23k / 25k / 28k / 24k em vez de 4× R$ 25k).

## D2 · Meta de valor
Aproximada, **sempre arredonda pra cima** (pedir 5.000 pode fechar 5.050, 5.100).
Se faltar para bater, adiciona mais uma unidade e passa da meta. Overshoot pelo
**menor valor possível** (usa produtos de menor PU no fim). **Nunca ultrapassa o
estoque**; se não alcança, pega tudo e fica abaixo (não força).

## D3 · "Valor máximo NF" das planilhas
Tratado como **alvo aproximado** (pode passar), por padrão — confirmado pelo
Rocon. Se algum cliente tiver **teto real**, isso vira marcação por cliente (Fase 2).

## D4 · Ordem das regras
fixa → percentual → meta → divisão do restante, cada uma consumindo o saldo.

## D5 · Arredondamento e saldo
Unidades inteiras; nunca ultrapassa o disponível. Sobra permanece disponível.
**Estoque zerado permanece zerado** (nunca negativo, nunca forçado); produto
zerado continua visível com 0. Precisa acompanhar inicial / distribuído /
disponível dinamicamente.

## D6 · Duas visões de estoque
Controle geral (todos, com zerados) + Saldo para utilização (só > 0, para o
cliente de sobra).

## D7 · Sobra
Sem destino automático. Sistema mostra o que restou; a operadora decide (manda
para um cliente ou deixa em "Não distribuído" para a próxima rodada).

## D8 · Mapeamento de colunas
Detecção automática dos equivalentes ("Ref. Mercadoria" = "Código"), confirmação
quando incerto, e **memória do padrão por cliente**.

## D9 · Matching
Por **código** como caminho principal (confiável na operação real). Por **nome**
só como reforço, com confirmação, porque os nomes divergem muito.

## D10 · Stack / privacidade
**100% local, sem servidor.** Dados comerciais de importação não saem da máquina.
Protótipo em HTML único + SheetJS; sistema em web local (ver doc 07).

## D11 · Nome
"Rateia" (nome de trabalho). De *ratear* — dividir um total, em quantidade ou
valor, entre várias partes.
