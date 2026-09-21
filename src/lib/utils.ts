import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/** PU de saída, com até 4 casas decimais (como no Maino). */
export function formatCurrency4(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Quantidade de produto: normalmente inteira, mas mostra as casas decimais
 * quando o valor já veio quebrado da origem (doc 04 §exceção) — nunca
 * arredonda 1,6 pra "2" na tela.
 */
export function formatQuantity(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}
