import { describe, expect, it } from 'vitest';
import { RANK_TIERS, rankStyle, rankTier } from './rank-scale';

describe('rankTier', () => {
  it('splits ranks into the Nexo bands', () => {
    expect([1, 3, 4, 10, 11, 20, 21].map(rankTier)).toEqual(['top', 'top', 'mid', 'mid', 'low', 'low', 'none']);
  });

  it('treats missing or invalid ranks as not found', () => {
    expect([null, undefined, 0, -1, Number.NaN].map(rankTier)).toEqual(['none', 'none', 'none', 'none', 'none']);
  });

  it('uses dark text on the ice pin and white on the solid blues', () => {
    expect(rankStyle(1).text).toBe('#030508');
    expect(rankStyle(5).text).toBe('#ffffff');
    expect(rankStyle(15).text).toBe('#ffffff');
    expect(RANK_TIERS.top.glow).not.toBe('');
  });
});
