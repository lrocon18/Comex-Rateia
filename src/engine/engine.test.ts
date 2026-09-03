import { describe, it, expect } from 'vitest';
import type { Produto, Regra } from '@/types';
import { compute } from './distribute';
import { metaFill } from './meta';
import { splitEqual } from './equal';
import { distributedMap } from './selectors';
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

describe('metaFill — doc 04 §3 / doc 06 D2', () => {
  it('alvo R$ 5.000 fecha em R$ 5.000,43 (validado no protótipo)', () => {
    const avail = Object.fromEntries(MAINO.map((s) => [s.codigo, s.estoque]));
    const { value } = metaFill(
      MAINO.map((s) => s.codigo),
      avail,
      puOf(MAINO),
      5000,
    );
    expect(Number(value.toFixed(2))).toBe(5000.43);
  });

  it('alvo R$ 10.000 fecha em R$ 10.000,17 (validado no protótipo)', () => {
    const avail = Object.fromEntries(MAINO.map((s) => [s.codigo, s.estoque]));
    const { value } = metaFill(
      MAINO.map((s) => s.codigo),
      avail,
      puOf(MAINO),
      10000,
    );
    expect(Number(value.toFixed(2))).toBe(10000.17);
  });

  it('overshoot: value >= alvo quando o estoque alcança', () => {
    const avail = Object.fromEntries(MAINO.map((s) => [s.codigo, s.estoque]));
    const { value } = metaFill(MAINO.map((s) => s.codigo), avail, puOf(MAINO), 5000);
    expect(value).toBeGreaterThanOrEqual(5000);
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
      true,
    );
    expect(value).toBeLessThanOrEqual(5000);
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
