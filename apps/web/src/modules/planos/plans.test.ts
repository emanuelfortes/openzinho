import { describe, expect, it } from 'vitest';
import { describePlan, parsePlanId, planViolation, PLANS } from './plans';

const ok = { gridSize: 5, keywordCount: 3, frequency: 'monthly' as const, queueMode: 'standard', device: 'desktop', depth: 20 };

describe('planViolation', () => {
  it('accepts a setup inside the plan', () => {
    expect(planViolation(PLANS.basico, ok)).toBeNull();
    expect(planViolation(PLANS.completo, { ...ok, gridSize: 9, keywordCount: 5, frequency: 'weekly' })).toBeNull();
  });

  it('refuses a bigger grid, more keywords or a faster schedule than the plan', () => {
    expect(planViolation(PLANS.basico, { ...ok, gridSize: 7 })).toContain('até 5×5');
    expect(planViolation(PLANS.intermediario, { ...ok, keywordCount: 4 })).toContain('até 3 palavras-chave');
    expect(planViolation(PLANS.basico, { ...ok, frequency: 'biweekly' })).toContain('frequência mensal');
    expect(planViolation(PLANS.completo, { ...ok, frequency: 'daily' })).toContain('mensal, quinzenal, semanal');
  });

  it('keeps paid extras for the team to enable', () => {
    expect(planViolation(PLANS.completo, { ...ok, queueMode: 'live' })).toContain('liberadas pela equipe');
    expect(planViolation(PLANS.completo, { ...ok, device: 'mobile' })).toContain('celular');
    expect(planViolation(PLANS.completo, { ...ok, depth: 50 })).toContain('Profundidade');
  });
});

describe('helpers', () => {
  it('parses plan ids', () => {
    expect(parsePlanId('completo')).toBe('completo');
    expect(parsePlanId('premium')).toBeNull();
  });

  it('describes a plan in plain words', () => {
    expect(describePlan(PLANS.intermediario)).toBe('grade até 7×7, até 3 palavras-chave, frequência mensal, quinzenal, IA para responder avaliações');
  });
});
