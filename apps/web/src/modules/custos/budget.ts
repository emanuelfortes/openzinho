// Monthly spending caps per client (project) and across all clients, in reais.
// Spend is what DataForSEO reported for every tool this calendar month; the cap
// stops Geo-grid runs (scheduled and manual) until the next month.
import { deleteSetting, getProjects, getSetting, getSpendByTool, runInProjectScope, setSetting } from '@/lib/db';
import { DEFAULT_BRL_PER_USD, evaluateBudget, type BudgetSettings, type BudgetStatus } from './budget-shared';

export * from './budget-shared';

const KEYS = {
  rate: 'nexo-brl-per-usd',
  globalCap: 'nexo-global-cap-brl',
  clientCap: (projectId: string) => `nexo-client-cap-brl:${projectId}`,
};

const positive = (value: string | null): number | null => {
  const number = value === null ? NaN : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

export function getBudgetSettings(): BudgetSettings {
  return {
    brlPerUsd: positive(getSetting(KEYS.rate)) ?? DEFAULT_BRL_PER_USD,
    globalCapBrl: positive(getSetting(KEYS.globalCap)),
  };
}

export function saveBudgetSettings(settings: { brlPerUsd: number | null; globalCapBrl: number | null }): void {
  if (settings.brlPerUsd) setSetting(KEYS.rate, String(settings.brlPerUsd)); else deleteSetting(KEYS.rate);
  if (settings.globalCapBrl) setSetting(KEYS.globalCap, String(settings.globalCapBrl)); else deleteSetting(KEYS.globalCap);
}

export function getClientCapBrl(projectId: string): number | null {
  return positive(getSetting(KEYS.clientCap(projectId)));
}

export function saveClientCapBrl(projectId: string, capBrl: number | null): void {
  if (capBrl) setSetting(KEYS.clientCap(projectId), String(capBrl)); else deleteSetting(KEYS.clientCap(projectId));
}

export function monthStart(now = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

function monthLabel(now: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(now);
}

/** Known DataForSEO cost of one client this month, in US dollars. */
export function clientSpentUsd(projectId: string, now = new Date()): number {
  return runInProjectScope(projectId, () =>
    getSpendByTool(monthStart(now), now.getTime() + 1).reduce((sum, tool) => sum + tool.knownCost, 0));
}

/**
 * Month-to-date spend of every client, read once. The worker adds what it posts during a
 * pass instead of re-reading every project database before each run.
 */
export class BudgetTracker {
  private readonly settings = getBudgetSettings();
  private readonly spent: Map<string, number>;
  private readonly label: string;

  constructor(now = new Date()) {
    this.label = monthLabel(now);
    this.spent = new Map(getProjects().map((project) => [project.id, clientSpentUsd(project.id, now)]));
  }

  status(projectId: string): BudgetStatus {
    return evaluateBudget({
      monthLabel: this.label,
      brlPerUsd: this.settings.brlPerUsd,
      clientSpentUsd: this.spent.get(projectId) ?? 0,
      clientCapBrl: getClientCapBrl(projectId),
      globalSpentUsd: [...this.spent.values()].reduce((sum, value) => sum + value, 0),
      globalCapBrl: this.settings.globalCapBrl,
    });
  }

  add(projectId: string, usd: number): void {
    this.spent.set(projectId, (this.spent.get(projectId) ?? 0) + usd);
  }
}

export function getBudgetStatus(projectId: string, now = new Date()): BudgetStatus {
  return new BudgetTracker(now).status(projectId);
}

/** Runs skipped this month because a cap was reached, shown next to the warning. */
export function recordSkippedRun(projectId: string, now = new Date()): void {
  const key = `nexo-budget-skipped:${projectId}`;
  const month = `${now.getFullYear()}-${now.getMonth() + 1}`;
  const [storedMonth, count] = (getSetting(key) ?? '').split('|');
  setSetting(key, `${month}|${storedMonth === month ? Number(count || 0) + 1 : 1}`);
}

export function skippedRunsThisMonth(projectId: string, now = new Date()): number {
  const month = `${now.getFullYear()}-${now.getMonth() + 1}`;
  const [storedMonth, count] = (getSetting(`nexo-budget-skipped:${projectId}`) ?? '').split('|');
  return storedMonth === month ? Number(count || 0) : 0;
}
