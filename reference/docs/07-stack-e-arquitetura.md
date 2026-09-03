# 07 · Stack e arquitetura (sugestão)

Sugestão, não imposição — o que otimiza para: **privacidade**, **zero infra** e
**facilidade de uso** por uma pessoa não técnica.

## Princípio: local-first
Tudo roda na máquina da operadora. Sem backend, sem nuvem. Isso resolve
privacidade (dados de importação) e custo (nada a hospedar) de uma vez.

## Stack recomendada
- **React + TypeScript + Vite** — SPA local. TypeScript ajuda muito num motor
  cheio de regras numéricas (menos erro de arredondamento/saldo).
- **SheetJS (`xlsx`)** — ler `.xls`/`.xlsx` (inclusive o `.xls` antigo do Mac) e
  **escrever** o `.xlsx` de saída, tudo no navegador.
- **Persistência: IndexedDB** via **Dexie** — salvar operações, perfis de cliente
  e mapeamentos de coluna localmente. (Não usar nada que envie dados para fora.)
- **UI:** o protótipo já define a identidade visual (workbench de dados, fontes
  IBM Plex, paleta fria com um teal de destaque). Dá para portar direto ou usar
  uma lib leve de componentes.

Alternativa se quiser um app instalável de verdade (Fase 3+): **Tauri** (empacota
a mesma web app como desktop, leve, offline). Electron também serve, mais pesado.

## Separação que vale a pena
Manter o **motor de distribuição puro** (funções sem UI, sem I/O), exatamente
como em `04-motor-de-distribuicao.md`. Assim dá para **testar as invariantes** com
testes unitários (Vitest) — o motor é onde um bug custa caro (nota errada).

## Estrutura de projeto sugerida
```
src/
├── engine/           # motor puro (testável, sem UI)
│   ├── distribute.ts # give, ordem das regras, compute()
│   ├── meta.ts       # metaFill (meta de valor)
│   ├── equal.ts      # splitEqual (divisão + variação)
│   └── engine.test.ts# invariantes do doc 04
├── io/
│   ├── importMaino.ts
│   ├── importCliente.ts  # parser do bloco de cabeçalho + tabela (doc 03)
│   ├── columnMap.ts      # detecção + memória de mapeamento por cliente
│   └── exportXlsx.ts
├── store/            # Dexie: operações, perfis de cliente, mapeamentos
├── ui/               # telas: Estoque, Distribuir, Resultado, Sobra
└── main.tsx
```

## Regras de ouro ao portar
1. Não quebrar as **invariantes** do doc 04 (há testes prontos para escrever).
2. **Nunca** enviar planilha/dado para rede. Sem `fetch` para fora.
3. Preservar o comportamento validado do protótipo (é a referência).
