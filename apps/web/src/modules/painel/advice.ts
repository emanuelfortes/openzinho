// What the business owner should do next, from the numbers of their own business. Pure.

export interface MapSummary {
  campaignId: string;
  campaignName: string;
  keywordCount: number;
  avgPosition: number | null;
  shareOfVoice: number | null;
  avgPositionDelta: number | null;
  shareOfVoiceDelta: number | null;
  lastRunTs: number | null;
}

export interface ReviewSummary {
  profiles: number;
  total: number;
  avgRating: number | null;
  last30Days: number;
  /** 1 to 3 stars in the last 90 days without an owner reply. */
  unansweredNegatives: number;
}

export interface OwnerSummary {
  campaigns: number;
  map: MapSummary | null;
  reviews: ReviewSummary | null;
  /** Billing is on and the business has not paid yet. */
  paymentPending: boolean;
}

export type AdviceTone = 'urgente' | 'importante' | 'dica';

export interface Advice {
  id: string;
  tone: AdviceTone;
  title: string;
  detail: string;
  href: string;
  action: string;
}

/** Most urgent first; at most `limit` items so the list stays short. */
export function adviceFor(summary: OwnerSummary, limit = 4): Advice[] {
  const items: Advice[] = [];
  const { map, reviews } = summary;

  if (summary.paymentPending) {
    items.push({ id: 'pagamento', tone: 'urgente', title: 'Conclua a assinatura', detail: 'O pagamento da assinatura ainda não foi confirmado.', href: '/dashboard/conta', action: 'Ver assinatura' });
  }
  if (reviews && reviews.unansweredNegatives > 0) {
    const n = reviews.unansweredNegatives;
    items.push({
      id: 'responder', tone: 'urgente', title: `Responda ${n} ${n === 1 ? 'avaliação negativa' : 'avaliações negativas'}`,
      detail: 'Clientes leem as respostas: responder com educação mostra que você se importa e pode recuperar a nota.',
      href: '/dashboard/monitor-de-avaliacoes', action: 'Ver avaliações',
    });
  }
  if (summary.campaigns === 0) {
    items.push({
      id: 'campanha', tone: 'importante', title: 'Descubra como você aparece no mapa',
      detail: 'Crie uma campanha com as buscas que seus clientes fazem para ver sua posição em cada ponto do bairro.',
      href: '/dashboard/sugestao-de-palavras', action: 'Sugerir palavras-chave',
    });
  } else if (map && map.lastRunTs === null) {
    items.push({ id: 'aguardando', tone: 'dica', title: 'Sua primeira varredura está a caminho', detail: 'Os resultados aparecem aqui assim que a primeira medição terminar.', href: '/dashboard/campaigns', action: 'Ver campanha' });
  }
  if (map && map.avgPositionDelta !== null && map.avgPositionDelta >= 2) {
    items.push({
      id: 'queda', tone: 'importante', title: 'Você caiu no mapa desde a última medição',
      detail: `A posição média piorou ${map.avgPositionDelta.toLocaleString('pt-BR')} posições. Veja quais concorrentes passaram à sua frente.`,
      href: `/dashboard/campaigns/${map.campaignId}/relatorio`, action: 'Abrir relatório',
    });
  }
  if (map && map.avgPosition !== null && map.avgPosition > 10) {
    items.push({
      id: 'visibilidade', tone: 'importante', title: 'Pouca gente te encontra fora do seu quarteirão',
      detail: 'Na média você está fora dos 10 primeiros. Fotos novas, avaliações recentes e categorias certas no perfil do Google ajudam a subir.',
      href: `/dashboard/campaigns/${map.campaignId}/relatorio`, action: 'Ver onde melhorar',
    });
  }
  if (!reviews) {
    items.push({
      id: 'monitor', tone: 'importante', title: 'Acompanhe suas avaliações do Google',
      detail: 'Ative o monitor e receba um e-mail sempre que chegar uma avaliação de 1 a 3 estrelas.',
      href: '/dashboard/monitor-de-avaliacoes', action: 'Ativar monitor',
    });
  } else if (reviews.last30Days < 2) {
    items.push({
      id: 'pedir', tone: 'dica', title: 'Peça mais avaliações',
      detail: 'Poucas avaliações novas no último mês. Use o link e o QR code para pedir a todos os clientes, sem oferecer brinde.',
      href: '/dashboard/pedido-de-avaliacao', action: 'Abrir kit de avaliações',
    });
  }
  if (map && map.shareOfVoiceDelta !== null && map.shareOfVoiceDelta >= 5) {
    items.push({ id: 'subiu', tone: 'dica', title: 'Sua presença no mapa cresceu', detail: `Seu Share of Voice subiu ${map.shareOfVoiceDelta.toLocaleString('pt-BR')} pontos desde a última medição.`, href: `/dashboard/campaigns/${map.campaignId}/relatorio`, action: 'Ver detalhes' });
  }

  const order: Record<AdviceTone, number> = { urgente: 0, importante: 1, dica: 2 };
  return items.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, limit);
}

export interface SetupStep {
  id: string;
  title: string;
  done: boolean;
  href: string;
}

/** The first-steps checklist, shown until everything is set up. */
export function setupSteps(summary: OwnerSummary): SetupStep[] {
  return [
    { id: 'palavras', title: 'Escolher as buscas que importam para o seu negócio', done: summary.campaigns > 0, href: '/dashboard/sugestao-de-palavras' },
    { id: 'campanha', title: 'Criar a campanha de mapa', done: summary.campaigns > 0, href: '/dashboard/campaigns?new=1' },
    { id: 'medicao', title: 'Receber a primeira medição', done: summary.map?.lastRunTs != null, href: '/dashboard/campaigns' },
    { id: 'avaliacoes', title: 'Ativar o monitor de avaliações', done: summary.reviews !== null, href: '/dashboard/monitor-de-avaliacoes' },
  ];
}
