// Budget rules and formatting, safe for client components.

/** Reais per US dollar, IOF included. The spec's reference value. */
export const DEFAULT_BRL_PER_USD = 5.6;
/** Share of a cap that turns the warning on. */
export const WARN_RATIO = 0.8;

export interface BudgetSettings {
  brlPerUsd: number;
  /** Monthly cap across every client, in reais. Null = no cap. */
  globalCapBrl: number | null;
}

export interface BudgetStatus {
  monthLabel: string;
  brlPerUsd: number;
  clientSpentBrl: number;
  clientCapBrl: number | null;
  globalSpentBrl: number;
  globalCapBrl: number | null;
  /** True once a cap is reached: scheduled and manual grid runs stop until next month. */
  blocked: boolean;
  /** True from 80% of a cap. */
  warning: boolean;
  reason: string | null;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBrl(value: number): string {
  return brl.format(value);
}

/** Parses "1.234,56", "1234.56" or "R$ 80" into a positive number, or null when blank or invalid. */
export function parseMoney(raw: string | null | undefined): number | null {
  const text = (raw ?? '').replace(/[^\d,.-]/g, '').trim();
  if (!text) return null;
  // Brazilian format when a comma is the last separator.
  const normalized = text.lastIndexOf(',') > text.lastIndexOf('.')
    ? text.replace(/\./g, '').replace(',', '.')
    : text.replace(/,/g, '');
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

export function evaluateBudget(input: {
  monthLabel: string;
  brlPerUsd: number;
  clientSpentUsd: number;
  clientCapBrl: number | null;
  globalSpentUsd: number;
  globalCapBrl: number | null;
}): BudgetStatus {
  const clientSpentBrl = input.clientSpentUsd * input.brlPerUsd;
  const globalSpentBrl = input.globalSpentUsd * input.brlPerUsd;
  const clientBlocked = input.clientCapBrl !== null && clientSpentBrl >= input.clientCapBrl;
  const globalBlocked = input.globalCapBrl !== null && globalSpentBrl >= input.globalCapBrl;
  const near = (spent: number, cap: number | null) => cap !== null && spent >= cap * WARN_RATIO;
  const reason = clientBlocked
    ? `O teto mensal deste cliente (${formatBrl(input.clientCapBrl!)}) foi atingido: ${formatBrl(clientSpentBrl)} gastos em ${input.monthLabel}.`
    : globalBlocked
      ? `O teto mensal de todos os clientes (${formatBrl(input.globalCapBrl!)}) foi atingido: ${formatBrl(globalSpentBrl)} gastos em ${input.monthLabel}.`
      : null;
  return {
    monthLabel: input.monthLabel,
    brlPerUsd: input.brlPerUsd,
    clientSpentBrl,
    clientCapBrl: input.clientCapBrl,
    globalSpentBrl,
    globalCapBrl: input.globalCapBrl,
    blocked: clientBlocked || globalBlocked,
    warning: !clientBlocked && !globalBlocked && (near(clientSpentBrl, input.clientCapBrl) || near(globalSpentBrl, input.globalCapBrl)),
    reason,
  };
}
