// Subscription plans of a business. Pure, safe for client components.
// Limits apply to subscribers; platform admins are never limited.
import type { GridScheduleFrequency } from '@/lib/db';

export type PlanId = 'basico' | 'intermediario' | 'completo';
export type PlanStatus = 'ativo' | 'teste' | 'suspenso';
export type AiLevel = 'nenhuma' | 'respostas' | 'completa';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  priceBrl: number;
  maxGridSize: number;
  maxKeywords: number;
  frequencies: GridScheduleFrequency[];
  ai: AiLevel;
  /** Default monthly DataForSEO cap of the business, in reais, when no explicit cap is set. */
  capBrl: number;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  basico: { id: 'basico', name: 'Básico', priceBrl: 45, maxGridSize: 5, maxKeywords: 3, frequencies: ['monthly'], ai: 'nenhuma', capBrl: 15 },
  intermediario: { id: 'intermediario', name: 'Intermediário', priceBrl: 59, maxGridSize: 7, maxKeywords: 3, frequencies: ['monthly', 'biweekly'], ai: 'respostas', capBrl: 25 },
  completo: { id: 'completo', name: 'Completo', priceBrl: 79, maxGridSize: 9, maxKeywords: 5, frequencies: ['monthly', 'biweekly', 'weekly'], ai: 'completa', capBrl: 40 },
};

export const PLAN_ORDER: PlanId[] = ['basico', 'intermediario', 'completo'];
export const DEFAULT_PLAN: PlanId = 'basico';

export const STATUS_LABEL: Record<PlanStatus, string> = { ativo: 'Ativa', teste: 'Em teste', suspenso: 'Suspensa' };

const FREQUENCY_LABEL: Record<GridScheduleFrequency, string> = { daily: 'diária', weekly: 'semanal', biweekly: 'quinzenal', monthly: 'mensal' };

export function parsePlanId(value: string | null | undefined): PlanId | null {
  return value && (PLAN_ORDER as string[]).includes(value) ? (value as PlanId) : null;
}

export function parsePlanStatus(value: string | null | undefined): PlanStatus | null {
  return value === 'ativo' || value === 'teste' || value === 'suspenso' ? value : null;
}

export interface PlanCheckInput {
  gridSize: number;
  keywordCount: number;
  frequency?: GridScheduleFrequency | null;
  queueMode?: string | null;
  device?: string | null;
  depth?: number | null;
}

/** First rule of the plan this setup breaks, as a message for the subscriber, or null. */
export function planViolation(plan: PlanDefinition, input: PlanCheckInput): string | null {
  const upgrade = ' Fale com o suporte para mudar de plano.';
  if (input.gridSize > plan.maxGridSize) {
    return `O plano ${plan.name} permite grades de até ${plan.maxGridSize}×${plan.maxGridSize}.${upgrade}`;
  }
  if (input.keywordCount > plan.maxKeywords) {
    return `O plano ${plan.name} permite até ${plan.maxKeywords} palavras-chave por campanha.${upgrade}`;
  }
  if (input.frequency && !plan.frequencies.includes(input.frequency)) {
    const allowed = plan.frequencies.map((frequency) => FREQUENCY_LABEL[frequency]).join(', ');
    return `O plano ${plan.name} permite frequência ${allowed}.${upgrade}`;
  }
  if (input.queueMode && input.queueMode !== 'standard') return 'A fila prioritária e a consulta ao vivo são liberadas pela equipe do Nexo.';
  if (input.device && input.device !== 'desktop') return 'A medição no celular é um extra liberado pela equipe do Nexo.';
  if (input.depth && input.depth > 20) return 'Profundidade acima de 20 resultados é um extra liberado pela equipe do Nexo.';
  return null;
}

export function describePlan(plan: PlanDefinition): string {
  const frequencies = plan.frequencies.map((frequency) => FREQUENCY_LABEL[frequency]).join(', ');
  const ai = plan.ai === 'nenhuma' ? 'sem IA' : plan.ai === 'respostas' ? 'IA para responder avaliações' : 'IA completa';
  return `grade até ${plan.maxGridSize}×${plan.maxGridSize}, até ${plan.maxKeywords} palavras-chave, frequência ${frequencies}, ${ai}`;
}
