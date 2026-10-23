import { describe, expect, it } from 'vitest';
import { adviceFor, setupSteps, type OwnerSummary } from './advice';

const map = {
  campaignId: 'c1', campaignName: 'Odonto', keywordCount: 3, avgPosition: 6, shareOfVoice: 30,
  avgPositionDelta: 0, shareOfVoiceDelta: 0, lastRunTs: 1000,
};
const reviews = { profiles: 1, total: 120, avgRating: 4.6, last30Days: 5, unansweredNegatives: 0 };
const base: OwnerSummary = { campaigns: 1, map, reviews, paymentPending: false };
const ids = (summary: Partial<OwnerSummary>) => adviceFor({ ...base, ...summary }).map((item) => item.id);

describe('adviceFor', () => {
  it('has nothing to nag about when things are fine', () => {
    expect(ids({})).toEqual([]);
  });

  it('starts a new owner with the map and the review monitor', () => {
    expect(ids({ campaigns: 0, map: null, reviews: null })).toEqual(['campanha', 'monitor']);
  });

  it('puts unanswered bad reviews and pending payment first', () => {
    const result = ids({ paymentPending: true, reviews: { ...reviews, unansweredNegatives: 2 }, map: { ...map, avgPosition: 14 } });
    expect(result.slice(0, 2)).toEqual(['pagamento', 'responder']);
    expect(result).toContain('visibilidade');
    expect(adviceFor({ ...base, reviews: { ...reviews, unansweredNegatives: 2 } })[0].title).toBe('Responda 2 avaliações negativas');
  });

  it('warns about a drop and celebrates a gain', () => {
    expect(ids({ map: { ...map, avgPositionDelta: 3 } })).toEqual(['queda']);
    expect(ids({ map: { ...map, shareOfVoiceDelta: 8 } })).toEqual(['subiu']);
  });

  it('suggests asking for reviews when few arrive', () => {
    expect(ids({ reviews: { ...reviews, last30Days: 0 } })).toEqual(['pedir']);
  });

  it('keeps the list short', () => {
    const many = adviceFor({ campaigns: 1, paymentPending: true, reviews: { ...reviews, unansweredNegatives: 1, last30Days: 0 }, map: { ...map, avgPosition: 15, avgPositionDelta: 4 } });
    expect(many).toHaveLength(4);
  });
});

describe('setupSteps', () => {
  it('ticks the steps already done', () => {
    expect(setupSteps({ campaigns: 0, map: null, reviews: null, paymentPending: false }).every((step) => !step.done)).toBe(true);
    expect(setupSteps(base).every((step) => step.done)).toBe(true);
    expect(setupSteps({ ...base, map: { ...map, lastRunTs: null } }).find((step) => step.id === 'medicao')?.done).toBe(false);
  });
});
