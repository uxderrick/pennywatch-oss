import { config } from '../config.js';

export function fmtCurrency(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtAmount(n: number): string {
  return `${config.currency} ${fmtCurrency(n)}`;
}

export function esc(s: string): string {
  return s.replace(/_/g, '\\_').replace(/\*/g, '\\*').replace(/\[/g, '\\[').replace(/`/g, '\\`');
}
