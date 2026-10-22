import { describe, expect, it } from 'vitest';
import { evaluateBudget } from '@/modules/custos/budget-shared';
import { budgetBlockReason, ENDPOINTS, estimateResearch, PRICES_USD } from './estimate';
import { MAX_DEMAND_PHRASES, MAX_THEMES } from './themes';

const status = (spentUsd: number, capBrl: number | null, globalCapBrl: number | null = null) => evaluateBudget({
  monthLabel: 'outubro de 2026', brlPerUsd: 5.6, clientSpentUsd: spentUsd, clientCapBrl: capBrl, globalSpentUsd: spentUsd, globalCapBrl,
});

describe('estimateResearch', () => {
  it('lists every call with its endpoint and sums the worst case', () => {
    const estimate = estimateResearch({ hasBusiness: true, hasWebsite: true, mapsProbe: true });
    expect(estimate.lines.map((l) => l.endpoint)).toEqual([ENDPOINTS.gbp, ENDPOINTS.site, ENDPOINTS.demand, ENDPOINTS.maps]);
    const expected = PRICES_USD.gbp + PRICES_USD.instantPage + PRICES_USD.demandTask + PRICES_USD.demandKeyword * MAX_DEMAND_PHRASES + PRICES_USD.mapsTask * MAX_THEMES;
    expect(estimate.totalUsd).toBeCloseTo(expected, 6);
    expect(estimate.totalUsd).toBeCloseTo(0.028525, 6);
  });

  it('drops the optional Maps probe and the GBP call when not needed', () => {
    const estimate = estimateResearch({ hasBusiness: false, hasWebsite: true, mapsProbe: false });
    expect(estimate.lines.map((l) => l.key)).toEqual(['site', 'demanda']);
    expect(estimate.totalUsd).toBeCloseTo(0.013125, 6);
  });
});

describe('budgetBlockReason', () => {
  it('allows runs under the caps', () => {
    expect(budgetBlockReason(status(1, 100), 0.03)).toBeNull();
    expect(budgetBlockReason(status(1, null), 0.03)).toBeNull();
  });

  it('blocks when a cap is reached or the estimate would pass it', () => {
    expect(budgetBlockReason(status(20, 100), 0.03)).toMatch(/teto mensal deste cliente/);
    expect(budgetBlockReason(status(17.85, 100), 0.03)).toMatch(/passaria do teto mensal deste cliente/);
    expect(budgetBlockReason(status(17.85, null, 100), 0.03)).toMatch(/todos os clientes/);
  });
});
