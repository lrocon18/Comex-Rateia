import { describe, it, expect } from 'vitest';
import type { Produto, Regra } from '@/types';
import { compute } from './distribute';
import { distribuirPedido, metaFill } from './meta';
import { quantidadePermitida, quantidadesPermitidas, minimoPositivo } from './granularity';
import { splitEqual } from './equal';
import { clientePodeRedistribuirTeto, distributedMap } from './selectors';
import mainoRaw from '@/fixtures/maino.json';

const MAINO = mainoRaw as Produto[];

/** PRNG determinístico (mulberry32) para tornar os testes reproduzíveis. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const puOf = (stock: Produto[]) =>
  Object.fromEntries(stock.map((s) => [s.codigo, s.pu]));

describe('compute — invariantes do doc 04', () => {
  const rules: Regra[] = [
    { id: 'r1', tipo: 'quantidade', cliente: 'Gabriel', codigo: 'WM1-60', qtd: 100 },
    { id: 'r2', tipo: 'fixo', cliente: 'Gabriel', codigo: '46025', pct: 100 },
    { id: 'r3', tipo: 'percentual', cliente: 'Rafael', pct: 50, scope: 'all', codigos: [] },
    { id: 'r4', tipo: 'meta', cliente: 'Ana', valor: 5000, scope: 'all', codigos: [], tetoReal: false },
    { id: 'r5', tipo: 'igual', clientes: ['Gabriel', 'Rafael', 'Ana'], variacao: 12 },
  ];
  const clients = ['Gabriel', 'Rafael', 'Ana'];
  const result = compute(MAINO, clients, rules, mulberry32(42));
  const dist = distributedMap(MAINO, result);

  it('1. estoque_inicial == distribuído + disponível (por produto)', () => {
    for (const s of MAINO) {
      expect(dist[s.codigo] + result.availFinal[s.codigo]).toBe(s.estoque);
    }
  });

  it('2. avail >= 0 sempre (nunca negativo)', () => {
    for (const c in result.availFinal) expect(result.availFinal[c]).toBeGreaterThanOrEqual(0);
  });

  it('3. produto que zerou continua na lista com quantidade 0', () => {
    expect(Object.keys(result.availFinal).length).toBe(MAINO.length);
    for (const s of MAINO) expect(result.availFinal[s.codigo]).toBeTypeOf('number');
  });

  it('4. nenhuma alocação ultrapassa o estoque inicial', () => {
    for (const s of MAINO) expect(dist[s.codigo]).toBeLessThanOrEqual(s.estoque);
  });

  it('6. leftover só contém saldo > 0', () => {
    for (const c in result.leftover) expect(result.leftover[c]).toBeGreaterThan(0);
  });

  it('divisão igual: 100% do estoque é distribuído (nada sobra)', () => {
    // com uma regra "igual" sem escopo, todo o saldo restante deve zerar
    expect(Object.keys(result.leftover).length).toBe(0);
  });
});

describe('splitEqual — invariante 5 (conservação por produto)', () => {
  it('soma por produto entre clientes == disponível daquele momento', () => {
    const avail = { A: 10, B: 7, C: 1 };
    const antes = { ...avail };
    const clients = ['x', 'y', 'z'];
    const res = splitEqual(clients, avail, 0, mulberry32(1));
    for (const c of Object.keys(antes)) {
      const soma = clients.reduce((s, cl) => s + (res[cl][c] || 0), 0);
      expect(soma).toBe(antes[c as keyof typeof antes]);
    }
  });

  it('variação move unidades sem criar/perder estoque', () => {
    const avail = { A: 10, B: 7, C: 5 };
    const antes = { ...avail };
    const clients = ['x', 'y', 'z'];
    const res = splitEqual(clients, avail, 15, mulberry32(7));
    for (const c of Object.keys(antes)) {
      const soma = clients.reduce((s, cl) => s + (res[cl][c] || 0), 0);
      expect(soma).toBe(antes[c as keyof typeof antes]);
    }
  });
});

describe('metaFill — orçamento sobre o conjunto inteiro', () => {
  it('rateia o alvo por todos os produtos, não escolhe um subconjunto até somar o valor', () => {
    // 10 SKUs × 100 un. × R$ 10 = R$ 10.000. Alvo R$ 4.500 → 45% de cada um.
    const codigos = Array.from({ length: 10 }, (_, i) => `P${i}`);
    const avail = Object.fromEntries(codigos.map((c) => [c, 100]));
    const pu = Object.fromEntries(codigos.map((c) => [c, 10]));
    const { take, value } = metaFill(codigos, avail, pu, 4500);

    const usados = codigos.filter((c) => (take[c] || 0) > 0);
    expect(usados).toHaveLength(10);
    for (const c of codigos) expect(take[c]).toBe(45);
    expect(value).toBe(4500);
  });

  it('alvo R$ 45 mil em conjunto de 71 itens usa todos, não só os mais caros', () => {
    const n = 71;
    const codigos = Array.from({ length: n }, (_, i) => `C${i}`);
    const avail = Object.fromEntries(codigos.map((c) => [c, 20]));
    const pu = Object.fromEntries(codigos.map((c, i) => [c, i < 12 ? 200 : 20]));

    const { take, value, solicitado } = metaFill(codigos, avail, pu, 45000);
    const usados = codigos.filter((c) => (take[c] || 0) > 0);
    expect(usados.length).toBe(n);
    expect(Math.abs(value - solicitado)).toBeLessThan(200);
    for (const c of codigos) expect(Number.isInteger(take[c])).toBe(true);
  });

  it('quando o valor exato é inatingível, fica no mais próximo permitido (não inventa decimal)', () => {
    // PU 3: 10 não é múltiplo. 9 fica a 1, 12 a 2 → escolhe 9.
    const { take, value } = metaFill(['A'], { A: 10 }, { A: 3 }, 10);
    expect(take.A).toBe(3);
    expect(value).toBe(9);
    expect(Number.isInteger(take.A)).toBe(true);
  });

  it('pedido por percentual aplica a fração em cada item do conjunto', () => {
    const codigos = ['A', 'B', 'C'];
    const avail = { A: 100, B: 100, C: 100 };
    const pu = { A: 10, B: 10, C: 10 };
    const { take, value, solicitado } = distribuirPedido({
      codigos,
      avail,
      pu,
      pct: 45,
    });
    expect(solicitado).toBe(1350);
    expect(value).toBe(1350);
    expect(take.A).toBe(45);
    expect(take.B).toBe(45);
    expect(take.C).toBe(45);
  });

  it('produto caro sem estoque: pega tudo e fica abaixo (não força)', () => {
    const avail = { X: 2 };
    const { take, value } = metaFill(['X'], avail, { X: 1000 }, 10000);
    expect(take.X).toBe(2); // pega tudo
    expect(value).toBe(2000); // máximo possível
    expect(value).toBeLessThan(10000); // não força
  });

  it('tetoReal: nunca ultrapassa o alvo (pula o overshoot)', () => {
    const avail = Object.fromEntries(MAINO.map((s) => [s.codigo, s.estoque]));
    const { value } = metaFill(
      MAINO.map((s) => s.codigo),
      avail,
      puOf(MAINO),
      5000,
      {},
      true,
    );
    expect(value).toBeLessThanOrEqual(5000);
  });

  it('cobre todos os SKUs listados antes de empilhar quantidade num item gordo', () => {
    const pequenos = Array.from({ length: 20 }, (_, i) => `P${i}`);
    const codigos = ['GORDO', ...pequenos];
    const avail = { GORDO: 500, ...Object.fromEntries(pequenos.map((c) => [c, 1])) };
    const pu = Object.fromEntries(codigos.map((c) => [c, 10]));
    // total R$ 5.200; alvo alto (R$ 4.000) — o gordo sozinho fecharia a nota
    const { take, value } = metaFill(codigos, avail, pu, 4000);
    for (const c of pequenos) expect(take[c]).toBeGreaterThanOrEqual(1);
    expect(take.GORDO).toBeGreaterThan(0);
    expect(value).toBeGreaterThan(0);
    const usados = codigos.filter((c) => (take[c] || 0) > 0);
    expect(usados).toHaveLength(codigos.length);
  });

  it('não tira produto da nota no refino para aproximar o valor', () => {
    const { take } = metaFill(['A', 'B', 'C'], { A: 1, B: 1, C: 1 }, { A: 100, B: 100, C: 1 }, 150);
    expect(take.A).toBeGreaterThanOrEqual(1);
    expect(take.B).toBeGreaterThanOrEqual(1);
    expect(take.C).toBeGreaterThanOrEqual(1);
  });

  it('marca cliente para redistribuir só se passou do valor com 100% dos SKUs', () => {
    const rules: Regra[] = [
      { id: '1', tipo: 'meta', cliente: 'WM', valor: 150, scope: 'sel', codigos: ['A', 'B', 'C'], tetoReal: false },
    ];
    const cheio = {
      alloc: { WM: { A: 1, B: 1, C: 1 } },
      leftover: {},
      availFinal: {},
      notas: { WM: { solicitado: 150, valor: 201, diferenca: 51, diferencaPct: 34 } },
    };
    expect(clientePodeRedistribuirTeto(cheio, rules, 'WM')).toBe(true);
    const teto = {
      ...cheio,
      alloc: { WM: { A: 1, C: 1 } },
      notas: { WM: { solicitado: 150, valor: 101, diferenca: -49, diferencaPct: -32.6 } },
    };
    expect(clientePodeRedistribuirTeto(teto, rules, 'WM')).toBe(false);
  });
});

describe('granularidade da origem', () => {
  it('origem inteira só admite inteiros até o disponível', () => {
    expect(quantidadesPermitidas(4, false)).toEqual([0, 1, 2, 3, 4]);
  });

  it('origem 1,6 admite 0, 1 e 1,6 — nunca 0,3', () => {
    expect(quantidadesPermitidas(1.6, true)).toEqual([0, 1, 1.6]);
    expect(quantidadePermitida(0.3, 1.6, true)).toBe(false);
    expect(quantidadePermitida(1.6, 1.6, true)).toBe(true);
  });

  it('mínimo positivo é 1 na origem inteira e o original se a origem é < 1', () => {
    expect(minimoPositivo(4, false)).toBe(1);
    expect(minimoPositivo(1.6, true)).toBe(1);
    expect(minimoPositivo(0.4, true)).toBe(0.4);
  });
});

describe('metaFill — origem quebrada', () => {
  it('100% do item com 1,6 na origem distribui 1,6', () => {
    const { take, value } = distribuirPedido({
      codigos: ['A'],
      avail: { A: 1.6 },
      pu: { A: 100 },
      origemQuebrada: { A: true },
      pct: 100,
    });
    expect(take.A).toBe(1.6);
    expect(value).toBeCloseTo(160, 6);
  });

  it('pode usar a parte inteira (1) da origem 1,6, nunca um decimal novo', () => {
    const { take } = metaFill(['A', 'B'], { A: 1.6, B: 10 }, { A: 100, B: 10 }, 260, { A: false, B: true });
    expect(take.A === undefined || take.A === 0 || take.A === 1 || take.A === 1.6).toBe(true);
    expect(Number.isInteger(take.B)).toBe(true);
    if (take.A != null && take.A !== 1.6) expect(Number.isInteger(take.A)).toBe(true);
  });

  it('alvo pequeno não inventa 0,5 de um item de R$ 100', () => {
    const { take, value } = metaFill(['A'], { A: 1.6 }, { A: 100 }, 50, { A: false }, true);
    expect(take.A ?? 0).toBe(0);
    expect(value).toBe(0);
  });

  it('nunca gera uma quantidade quebrada nova quando a origem é inteira', () => {
    const avail = { A: 7 };
    const pu = { A: 10 };
    const { take } = metaFill(['A'], avail, pu, 55, { A: true });
    expect(Number.isInteger(take.A)).toBe(true);
  });
});

describe('compute — ordem das regras consome o saldo', () => {
  it('fixo aloca primeiro; percentual pega do que sobrou', () => {
    const stock: Produto[] = [{ codigo: 'A', produto: 'p', estoque: 100, pu: 1 }];
    const rules: Regra[] = [
      { id: '1', tipo: 'fixo', cliente: 'G', codigo: 'A', pct: 100 },
      { id: '2', tipo: 'percentual', cliente: 'R', pct: 50, scope: 'all', codigos: [] },
    ];
    const r = compute(stock, ['G', 'R'], rules, mulberry32(1));
    expect(r.alloc['G']['A']).toBe(100); // fixo levou tudo
    expect(r.alloc['R']).toBeUndefined(); // não sobrou nada para o percentual
  });

  it('quantidade explícita nunca ultrapassa o saldo', () => {
    const stock: Produto[] = [{ codigo: 'A', produto: 'p', estoque: 5, pu: 1 }];
    const rules: Regra[] = [
      { id: '1', tipo: 'quantidade', cliente: 'G', codigo: 'A', qtd: 999 },
    ];
    const r = compute(stock, ['G'], rules, mulberry32(1));
    expect(r.alloc['G']['A']).toBe(5);
    expect(r.availFinal['A']).toBe(0);
  });
});

describe('compute — exceção de origem fracionária (doc 04)', () => {
  it('fixo 100% de um produto com origem quebrada preserva a fração original', () => {
    const stock: Produto[] = [{ codigo: 'A', produto: 'p', estoque: 1.6, pu: 10 }];
    const rules: Regra[] = [{ id: '1', tipo: 'fixo', cliente: 'G', codigo: 'A', pct: 100 }];
    const r = compute(stock, ['G'], rules, mulberry32(1));
    expect(r.alloc['G']['A']).toBe(1.6);
    expect(r.availFinal['A']).toBe(0);
  });

  it('produto com origem inteira nunca vira quebrado, mesmo com pct fracionário', () => {
    const stock: Produto[] = [{ codigo: 'A', produto: 'p', estoque: 7, pu: 10 }];
    const rules: Regra[] = [{ id: '1', tipo: 'percentual', cliente: 'G', pct: 50, scope: 'all', codigos: [] }];
    const r = compute(stock, ['G'], rules, mulberry32(1));
    expect(r.alloc['G']['A']).toBe(3); // floor(7*0.5) = 3, nunca 3.5
    expect(Number.isInteger(r.alloc['G']['A'])).toBe(true);
  });

  it('meta de valor usando um produto de origem quebrada: leva tudo ou nada, nunca fatia', () => {
    const stock: Produto[] = [
      { codigo: 'A', produto: 'p', estoque: 1.6, pu: 100 },
      { codigo: 'B', produto: 'q', estoque: 50, pu: 10 },
    ];
    const rules: Regra[] = [{ id: '1', tipo: 'meta', cliente: 'G', valor: 500, scope: 'all', codigos: [], tetoReal: false }];
    const r = compute(stock, ['G'], rules, mulberry32(1));
    const q = r.alloc['G']['A'];
    if (q != null) {
      expect(q === 1.6 || Number.isInteger(q)).toBe(true);
      expect(q).toBeLessThanOrEqual(1.6);
    }
    expect(Number.isInteger(r.alloc['G']['B'])).toBe(true);
  });

  it('divisão igual: código de origem quebrada vai inteiro para um único cliente, não é fatiado', () => {
    const stock: Produto[] = [{ codigo: 'A', produto: 'p', estoque: 1.6, pu: 10 }];
    const rules: Regra[] = [{ id: '1', tipo: 'igual', clientes: ['G', 'R'], variacao: 0 }];
    const r = compute(stock, ['G', 'R'], rules, mulberry32(1));
    const soma = (r.alloc['G']?.['A'] || 0) + (r.alloc['R']?.['A'] || 0);
    expect(soma).toBe(1.6);
    // vai inteiro para um só: nenhum dos dois tem uma fatia parcial
    const valores = [r.alloc['G']?.['A'] || 0, r.alloc['R']?.['A'] || 0];
    expect(valores.some((v) => v === 1.6)).toBe(true);
    expect(valores.some((v) => v > 0 && v !== 1.6)).toBe(false);
  });
});
