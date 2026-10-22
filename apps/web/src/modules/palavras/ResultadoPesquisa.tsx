import Link from 'next/link';
import { Rocket } from 'lucide-react';
import { formatBrl } from '@/modules/custos/budget-shared';
import CopiarPalavras from './CopiarPalavras';
import { formatUsdPrecise } from './estimate';
import { campaignHref } from './shared';
import type { Evidence, EvidenceKind, ResearchResult, Strength } from './types';

export const EVIDENCE_LABELS: Record<EvidenceKind, string> = {
  gbp_categoria_principal: 'Categoria principal',
  gbp_categoria_adicional: 'Categoria adicional',
  gbp_descricao: 'Descrição do perfil',
  site_titulo: 'Título do site',
  site_meta: 'Meta description',
  site_h1: 'H1 do site',
  site_h2: 'H2 do site',
  site_link: 'Página do site',
  volume: 'Volume',
  maps: 'Sondagem no Maps',
};

const STRENGTH: Record<Strength, string> = { forte: 'Evidência forte', media: 'Evidência média', fraca: 'Evidência fraca' };
const MEASURED: Set<EvidenceKind> = new Set(['volume', 'maps']);

function Chip({ evidence }: { evidence: Evidence }) {
  const measured = MEASURED.has(evidence.kind);
  return (
    <span
      title={evidence.source}
      className={`inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] ${measured ? 'border-nexo-sky/40 bg-nexo-blue/10 text-nexo-ice' : 'border-nexo-border text-nexo-dim'}`}
    >
      <span className="shrink-0 text-nexo-faint">{EVIDENCE_LABELS[evidence.kind]}:</span>
      <span className="truncate">{evidence.quote}</span>
    </span>
  );
}

const INTENT: Record<string, string> = { commercial: 'comercial', transactional: 'transacional', informational: 'informacional', navigational: 'navegacional' };

export default function ResultadoPesquisa({ result, ts, brlPerUsd }: { result: ResearchResult; ts: number; brlPerUsd: number }) {
  const { selection } = result;
  const queries = selection.selected.map((t) => t.query);
  const target = result.website?.url ?? result.input.website ?? '';
  const campaignTarget = target || result.gbp?.title || result.input.business;
  const name = result.gbp?.title || result.input.business || target;

  return (
    <div id="resultado" className="space-y-6">
      <div className="nexo-panel rounded-nexo-lg p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="nexo-section">Pesquisa salva</p>
            <h2 className="mt-1 truncate text-lg font-medium text-nexo-text">{name}</h2>
            <p className="mt-1 text-[11px] text-nexo-faint">
              {new Date(ts).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })} · {result.input.location} · {result.input.language}
              {' '}· custo informado pela DataForSEO: {formatUsdPrecise(result.totalCostUsd)} ({formatBrl(result.totalCostUsd * brlPerUsd)})
            </p>
          </div>
          {queries.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <CopiarPalavras text={queries.join('\n')} />
              <Link href={campaignHref(queries, campaignTarget)} className="nexo-btn-primary nexo-label flex items-center gap-2 rounded-nexo-lg px-4 py-2.5">
                <Rocket className="h-3.5 w-3.5" />
                Criar campanha com estas palavras
              </Link>
            </div>
          )}
        </div>
        <p className="mt-4 text-sm text-nexo-dim">{selection.coverage}</p>
        {selection.fewerReason && (
          <div className="mt-3 rounded-nexo-lg border border-nexo-warn/40 bg-nexo-warn/10 px-4 py-3 text-sm text-nexo-warn-text">
            <span className="font-medium">{selection.scope === 'focado' ? 'Estudo focado. ' : 'Sem temas. '}</span>
            {selection.fewerReason}
          </div>
        )}
      </div>

      {selection.selected.length > 0 && (
        <div className="space-y-3">
          <h3 className="nexo-label">Temas escolhidos (uma consulta por tema)</h3>
          {selection.selected.map((theme, index) => (
            <div key={theme.id} className="nexo-panel rounded-nexo-lg p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] text-nexo-faint">Tema {index + 1} · {STRENGTH[theme.strength]}</p>
                  <p className="mt-0.5 font-mono text-base text-nexo-text">{theme.query}</p>
                </div>
                <div className="text-right">
                  <p className="nexo-metric font-mono text-xl tabular-nums">{theme.volume === null ? '—' : theme.volume.toLocaleString('pt-BR')}</p>
                  <p className="text-[11px] text-nexo-faint">
                    buscas/mês{theme.intent ? ` · intenção ${INTENT[theme.intent] ?? theme.intent}` : ''}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-sm text-nexo-dim">{theme.reason}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {theme.evidence.map((e, i) => <Chip key={`${e.kind}-${i}`} evidence={e} />)}
              </div>
              {theme.variants.length > 0 && (
                <p className="mt-2 text-[11px] text-nexo-faint">Variações no mesmo tema: {theme.variants.join(', ')}</p>
              )}
              {theme.probe && theme.probe.status === 'ok' && theme.probe.topCategories.length > 0 && (
                <p className="mt-1 text-[11px] text-nexo-faint">Categorias mais comuns no Maps: {theme.probe.topCategories.join(', ')}</p>
              )}
              {theme.probe?.status === 'erro' && <p className="mt-1 text-[11px] text-nexo-danger-text">Sondagem no Maps falhou: {theme.probe.error}</p>}
            </div>
          ))}
          <p className="text-[11px] text-nexo-faint">
            Chips azuis são medições (volume, Maps); os demais são evidências de oferta lidas no perfil e no site. A escolha é uma hipótese de estudo:
            só a grade mede a posição real em cada ponto.
          </p>
        </div>
      )}

      {(selection.dropped.length > 0 || result.rejected.length > 0) && (
        <div className="nexo-panel overflow-hidden rounded-nexo-lg">
          <div className="border-b border-nexo-border px-6 py-4"><h3 className="nexo-label">Deixados de fora e por quê</h3></div>
          <div className="divide-y divide-nexo-border">
            {selection.dropped.map((d) => (
              <div key={`d-${d.query}`} className="px-6 py-3">
                <p className="text-sm text-nexo-text">{d.query} <span className="text-[11px] text-nexo-faint">· {STRENGTH[d.strength]}{d.volume !== null ? ` · ${d.volume.toLocaleString('pt-BR')} buscas/mês` : ''}</span></p>
                <p className="text-[11px] text-nexo-faint">{d.reason}</p>
              </div>
            ))}
            {result.rejected.map((r) => (
              <div key={`r-${r.text}`} className="px-6 py-3">
                <p className="text-sm text-nexo-dim">{r.text}</p>
                <p className="text-[11px] text-nexo-faint">{r.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="nexo-panel rounded-nexo-lg p-5">
          <h3 className="nexo-label">Evidências lidas</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div><dt className="text-[11px] text-nexo-faint">Perfil do Google</dt><dd className="text-nexo-dim">{result.gbp ? [result.gbp.title, result.gbp.category, ...result.gbp.additionalCategories].filter(Boolean).join(' · ') : 'Não encontrado'}</dd></div>
            {result.gbp?.address && <div><dt className="text-[11px] text-nexo-faint">Endereço</dt><dd className="text-nexo-dim">{result.gbp.address}</dd></div>}
            <div>
              <dt className="text-[11px] text-nexo-faint">Site{result.website ? ` (${result.website.via === 'direto' ? 'leitura direta' : 'on_page/instant_pages'})` : ''}</dt>
              <dd className="break-words text-nexo-dim">
                {result.website ? `${result.website.title ?? 'Sem título'} · ${result.website.h1.length} H1 · ${result.website.h2.length} H2 · ${result.website.links.length} páginas de serviço` : 'Não lido'}
              </dd>
            </div>
          </dl>
        </div>
        <div className="nexo-panel rounded-nexo-lg p-5">
          <h3 className="nexo-label">Chamadas e limitações</h3>
          <ul className="mt-3 space-y-1 text-[11px] text-nexo-dim">
            {result.sources.map((s, i) => (
              <li key={i} className="font-mono">
                {s.status === 'ok' ? 'ok' : s.status === 'erro' ? 'erro' : 'pulado'} · {s.endpoint}{s.costUsd !== null ? ` · ${formatUsdPrecise(s.costUsd)}` : ''}{s.message ? ` · ${s.message}` : ''}
              </li>
            ))}
          </ul>
          {result.limitations.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-4 text-[11px] text-nexo-faint">
              {result.limitations.map((l) => <li key={l}>{l}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
