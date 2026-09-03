# Rateia

Ferramenta para **preparar a distribuição das notas de saída** de uma operação de
importação. Cruza o estoque exportado do Maino com o pedido do cliente, puxa o
PU de saída, distribui os produtos entre os clientes por regras, controla o
saldo e gera uma planilha pronta para emitir as notas.

> **Nome:** "Rateia" (nome de trabalho). De *ratear* — dividir um total, em
> quantidade ou valor, entre várias partes. É exatamente o que o sistema faz.

## O que ele NÃO faz (por design)
Não emite nota fiscal. A NF de entrada já é feita no Maino; o Rateia só organiza,
cruza, calcula e distribui, para depois a nota de saída ser emitida no Maino.

## Status
- **Fase 0 — concluída (protótipo funcional):** `prototipo/rateia-prototipo.html`.
  Abre no navegador, roda offline, sem servidor. Já vem com o estoque real do
  Maino carregado (76 produtos). Importa Maino, mostra o controle geral,
  distribui pelas 4 regras na ordem correta, mostra a sobra e exporta `.xlsx`.
- **Próximo:** transformar em sistema funcional e customizável — persistência
  entre sessões, perfis de cliente reutilizáveis e leitura automática da
  planilha do cliente. Ver `docs/05-roadmap.md`.

## Por onde começar (dev)
1. Leia `docs/01-contexto-e-visao.md` para entender o problema real.
2. Leia `docs/04-motor-de-distribuicao.md` — é o coração do sistema, com os
   algoritmos já validados no protótipo.
3. Abra `prototipo/rateia-prototipo.html` no navegador e mexa — é a Fase 0
   funcionando, serve de referência viva.
4. Stack sugerida em `docs/07-stack-e-arquitetura.md`.

## Mapa da pasta
```
rateia/
├── README.md
├── docs/
│   ├── 01-contexto-e-visao.md        # o problema, quem usa, por quê
│   ├── 02-especificacao-funcional.md # o que o sistema faz, feature a feature
│   ├── 03-formatos-de-dados.md       # formatos REAIS do Maino e do cliente
│   ├── 04-motor-de-distribuicao.md   # regras + algoritmos (validados)
│   ├── 05-roadmap.md                 # fases, feito e a fazer
│   ├── 06-registro-de-decisoes.md    # decisões travadas e o porquê
│   └── 07-stack-e-arquitetura.md     # stack sugerida e estrutura de projeto
├── prototipo/
│   └── rateia-prototipo.html         # Fase 0 funcionando (offline)
└── dados-exemplo/
    ├── maino.json                    # estoque real limpo (76 produtos)
    └── LEIAME.md
```

## Princípio inegociável
Dados comerciais de importação. **Tudo roda localmente, nada sai da máquina.**
Sem servidor, sem nuvem, sem enviar planilha pra lugar nenhum.
