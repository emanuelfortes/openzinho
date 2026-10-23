import Link from 'next/link';
import GridThumbnail from '@/modules/grade/GridThumbnail';
import { adviceFor, setupSteps, type AdviceTone } from './advice';
import type { OwnerHomeData } from './summary';

const toneStyle: Record<AdviceTone, { label: string; badge: string }> = {
  urgente: { label: 'Agora', badge: 'bg-nexo-ice/15 text-nexo-ice' },
  importante: { label: 'Importante', badge: 'bg-nexo-blue/15 text-nexo-sky' },
  dica: { label: 'Dica', badge: 'bg-white/[0.04] text-nexo-dim' },
};

const number = (value: number, digits = 1) => value.toLocaleString('pt-BR', { maximumFractionDigits: digits });

function Delta({ value, lowerIsBetter, unit }: { value: number | null; lowerIsBetter: boolean; unit: string }) {
  if (value === null || value === 0) return null;
  const better = lowerIsBetter ? value < 0 : value > 0;
  return (
    <span className={`text-xs ${better ? 'text-nexo-ice' : 'text-nexo-faint'}`}>
      {better ? 'melhorou' : 'piorou'} {number(Math.abs(value))} {unit}
    </span>
  );
}

function Metric({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div>
      <p className="nexo-label">{label}</p>
      <p className="nexo-metric mt-1">{value}</p>
      {children}
    </div>
  );
}

export default function OwnerHome({ businessName, data }: { businessName: string; data: OwnerHomeData }) {
  const advice = adviceFor(data);
  const steps = setupSteps(data);
  const pendingSteps = steps.filter((step) => !step.done).length;
  const { map, reviews } = data;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="nexo-h1">{businessName}</h1>
        <p className="mt-1 text-sm text-nexo-faint">Como seu negócio está no Google e o que fazer agora.</p>
      </div>

      {pendingSteps > 0 && (
        <section className="nexo-panel p-6">
          <h2 className="nexo-section">Primeiros passos</h2>
          <p className="mt-1 text-sm text-nexo-dim">{steps.length - pendingSteps} de {steps.length} feitos.</p>
          <ol className="mt-4 space-y-2">
            {steps.map((step, index) => (
              <li key={step.id} className="flex items-center gap-3 text-sm">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] ${step.done ? 'bg-nexo-ice/15 text-nexo-ice' : 'border border-nexo-border text-nexo-faint'}`}>
                  {step.done ? '✓' : index + 1}
                </span>
                {step.done
                  ? <span className="text-nexo-faint line-through">{step.title}</span>
                  : <Link href={step.href} className="text-nexo-text hover:text-nexo-sky">{step.title}</Link>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {advice.length > 0 && (
        <section>
          <h2 className="nexo-section mb-3">O que melhorar agora</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {advice.map((item) => (
              <div key={item.id} className="nexo-panel flex flex-col gap-2 p-5">
                <span className={`self-start rounded-full px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.2em] ${toneStyle[item.tone].badge}`}>{toneStyle[item.tone].label}</span>
                <p className="font-medium text-nexo-text">{item.title}</p>
                <p className="text-sm text-nexo-dim">{item.detail}</p>
                <Link href={item.href} className="nexo-btn-ghost mt-auto self-start px-3 py-1.5 text-xs">{item.action}</Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <section className="nexo-panel p-6">
          <h2 className="nexo-section">Como estou no mapa</h2>
          {!map ? (
            <p className="mt-3 text-sm text-nexo-dim">Você ainda não tem uma campanha. Crie uma para ver sua posição em cada ponto do bairro.</p>
          ) : map.lastRunTs === null ? (
            <p className="mt-3 text-sm text-nexo-dim">A campanha <strong className="font-medium text-nexo-text">{map.campaignName}</strong> foi criada. A primeira medição aparece aqui quando terminar.</p>
          ) : (
            <div className="mt-4 flex flex-wrap items-start gap-6">
              {data.thumbnail && (
                <div className="space-y-1">
                  <GridThumbnail results={data.thumbnail.results} gridSize={data.thumbnail.gridSize} size={120} />
                  <p className="max-w-[120px] truncate text-[11px] text-nexo-faint">{data.thumbnail.keyword}</p>
                </div>
              )}
              <div className="grid flex-1 grid-cols-2 gap-4">
                <Metric label="Posição média" value={map.avgPosition === null ? '—' : `${number(map.avgPosition)}º`}>
                  <Delta value={map.avgPositionDelta} lowerIsBetter unit="posições" />
                </Metric>
                <Metric label="Share of Voice" value={map.shareOfVoice === null ? '—' : `${number(map.shareOfVoice)}%`}>
                  <Delta value={map.shareOfVoiceDelta} lowerIsBetter={false} unit="pontos" />
                </Metric>
                <p className="col-span-2 text-xs text-nexo-faint">
                  {map.campaignName} · {map.keywordCount} {map.keywordCount === 1 ? 'busca' : 'buscas'} · medido em {new Date(map.lastRunTs).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            {map
              ? <Link href={`/dashboard/campaigns/${map.campaignId}/relatorio`} className="nexo-btn-primary px-3 py-1.5 text-xs">Relatório do mês</Link>
              : <Link href="/dashboard/campaigns?new=1" className="nexo-btn-primary px-3 py-1.5 text-xs">Criar campanha</Link>}
            <Link href="/dashboard/campaigns" className="nexo-btn-ghost px-3 py-1.5 text-xs">Todas as campanhas</Link>
          </div>
        </section>

        <section className="nexo-panel p-6">
          <h2 className="nexo-section">Minhas avaliações</h2>
          {!reviews ? (
            <p className="mt-3 text-sm text-nexo-dim">O monitor está desligado. Ligue para acompanhar as avaliações do seu perfil e ser avisado das negativas.</p>
          ) : (
            <div className="mt-4 grid grid-cols-3 gap-4">
              <Metric label="Nota média" value={reviews.avgRating === null ? '—' : `${number(reviews.avgRating)} ★`} />
              <Metric label="Últimos 30 dias" value={String(reviews.last30Days)} />
              <Metric label="Sem resposta" value={String(reviews.unansweredNegatives)}>
                <span className="text-xs text-nexo-faint">negativas</span>
              </Metric>
              <p className="col-span-3 text-xs text-nexo-faint">
                {reviews.total} {reviews.total === 1 ? 'avaliação acompanhada' : 'avaliações acompanhadas'} em {reviews.profiles} {reviews.profiles === 1 ? 'perfil' : 'perfis'}.
              </p>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/dashboard/monitor-de-avaliacoes" className="nexo-btn-primary px-3 py-1.5 text-xs">{reviews ? 'Ver avaliações' : 'Ligar monitor'}</Link>
            <Link href="/dashboard/pedido-de-avaliacao" className="nexo-btn-ghost px-3 py-1.5 text-xs">Pedir avaliações</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
