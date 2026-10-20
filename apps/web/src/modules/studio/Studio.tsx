'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowUpRight, CalendarCheck, Download, Grid3X3, RotateCcw } from 'lucide-react';
import { RANK_TIER_ORDER, RANK_TIERS } from '@/lib/rank-scale';
import {
  MODELED_CAMPAIGN, QUEUE_LABELS, SIMULATION_SIZES, STUDIO_KEYWORD, STUDIO_LOCATION, STUDIO_TARGET,
  competitorPressure, formatUsd, scanCost, scoreTier, studioGrid, studioMetrics,
  type StudioDataset, type StudioQueue, type StudioShape,
} from './data';
import StudioMap, { rankLabel, type StudioView } from './StudioMap';

const DATASETS: Array<{ value: StudioDataset; label: string }> = [
  { value: 'proof17', label: 'Prova salva 17 x 17' },
  { value: 'proof5', label: 'Prova salva 5 x 5' },
  { value: 'simulation', label: 'Demo modelada' },
];

const VIEWS: Array<{ value: StudioView; label: string }> = [
  { value: 'pins', label: 'Pins de posição' },
  { value: 'heat', label: 'Mapa de calor' },
  { value: 'evidence', label: 'Evidências' },
];

const SCORE_STYLE: Record<ReturnType<typeof scoreTier>, string> = {
  good: 'bg-nexo-ice text-nexo-bg',
  mid: 'bg-nexo-sky text-white',
  low: 'bg-nexo-navy text-white',
  none: 'border border-nexo-border-strong text-nexo-faint',
};

const pct = (value: number) => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
const num = (value: number, digits = 1) => value.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits });

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function exportCampaignCsv() {
  const rows = [
    ['empresa', 'local', 'palavra_chave', 'posicao_media', 'configuracao'],
    ...MODELED_CAMPAIGN.keywords.map((row) => [
      MODELED_CAMPAIGN.business, MODELED_CAMPAIGN.place, row.keyword,
      row.avgScore === null ? 'NR' : row.avgScore.toFixed(1), MODELED_CAMPAIGN.settings,
    ]),
  ];
  const blob = new Blob([rows.map((row) => row.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'nexo-campanha-modelada.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export default function Studio() {
  const [dataset, setDataset] = useState<StudioDataset>('proof17');
  const [gridSize, setGridSize] = useState(17);
  const [shape, setShape] = useState<StudioShape>('square');
  const [queue, setQueue] = useState<StudioQueue>('standard');
  const [view, setView] = useState<StudioView>('pins');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prospects, setProspects] = useState(1);
  const [resetKey, setResetKey] = useState(0);
  const [keywordIndex, setKeywordIndex] = useState(2);

  const grid = useMemo(() => studioGrid(dataset, gridSize, shape), [dataset, gridSize, shape]);
  const metrics = useMemo(() => studioMetrics(grid.points), [grid]);
  const pressure = useMemo(() => competitorPressure(grid.points), [grid]);
  const middle = Math.floor(grid.size / 2);
  const selected = grid.points.find((point) => point.id === selectedId)
    ?? grid.points.find((point) => point.row === middle && point.col === middle)
    ?? grid.points[0];
  const cost = scanCost(grid.points.length, queue);
  const isProof = dataset !== 'simulation';
  const selectedKeyword = MODELED_CAMPAIGN.keywords[keywordIndex];
  const found = MODELED_CAMPAIGN.keywords.filter((row) => row.avgScore !== null);
  const bestKeyword = [...found].sort((a, b) => (a.avgScore ?? 0) - (b.avgScore ?? 0))[0];

  function changeDataset(next: StudioDataset) {
    setDataset(next);
    setSelectedId(null);
    setProspects(next === 'simulation' ? 1 : 1000);
  }

  return (
    <div className="space-y-6">
      <header className="relative py-6 text-center">
        <div className="mb-6 flex flex-wrap justify-center gap-2">
          {[isProof ? 'Dados reais de posição pagos' : 'Dados de posição modelados', 'Mapa interativo', 'Relatórios por palavra-chave', `${formatUsd(cost, 3)} por varredura`].map((badge) => (
            <span key={badge} className="nexo-label rounded-full border border-nexo-border-strong px-3 py-1">{badge}</span>
          ))}
        </div>
        <h1 className="text-[clamp(3.5rem,9vw,7.5rem)] font-light leading-none tracking-[-0.04em] text-nexo-text [text-shadow:0_0_60px_rgba(77,162,255,.6)]">
          Domine o grid.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-nexo-dim">
          Pins de posição local interativos, visões de campanha, evidências salvas e a conta de prospecção no mesmo fluxo.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/dashboard/campaigns" className="nexo-btn-primary inline-flex items-center gap-2 px-5 py-3">
            <CalendarCheck className="h-3.5 w-3.5" /> Criar campanha
          </Link>
          <Link href="/dashboard/geo-grid" className="nexo-btn-ghost inline-flex items-center gap-2 px-5 py-3">
            <Grid3X3 className="h-3.5 w-3.5" /> Novo monitor Geo-Grid
          </Link>
        </div>
      </header>

      <section className="nexo-panel grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 p-5">
        <label className="block">
          <span className="nexo-label mb-1.5 block">Dataset</span>
          <select value={dataset} onChange={(event) => changeDataset(event.target.value as StudioDataset)} className="nexo-input min-w-0 w-full px-3 py-2 text-sm">
            {DATASETS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <div>
          <span className="nexo-label mb-1.5 block">Fila</span>
          <div className="nexo-seg" role="group" aria-label="Fila do DataForSEO">
            {(Object.keys(QUEUE_LABELS) as StudioQueue[]).map((item) => (
              <button key={item} type="button" aria-pressed={queue === item} onClick={() => setQueue(item)} className={`transition-colors hover:text-white ${queue === item ? 'active' : ''}`}>
                {QUEUE_LABELS[item]}
              </button>
            ))}
          </div>
        </div>
        <label className={`block ${isProof ? 'opacity-45' : ''}`}>
          <span className="nexo-label mb-1.5 block">Grade</span>
          <select value={isProof ? grid.size : gridSize} disabled={isProof} onChange={(event) => { setGridSize(Number(event.target.value)); setSelectedId(null); }} className="nexo-input min-w-0 w-full px-3 py-2 text-sm">
            {(isProof ? [grid.size] : SIMULATION_SIZES).map((size) => <option key={size} value={size}>{size} x {size}</option>)}
          </select>
        </label>
        <div className={isProof ? 'opacity-45' : ''}>
          <span className="nexo-label mb-1.5 block">Formato</span>
          <div className="nexo-seg" role="group" aria-label="Formato da grade">
            {([['square', 'Quadrado'], ['circle', 'Círculo']] as const).map(([value, label]) => (
              <button key={value} type="button" disabled={isProof} aria-pressed={shape === value} onClick={() => { setShape(value); setSelectedId(null); }} className={`transition-colors hover:text-white disabled:cursor-not-allowed ${shape === value ? 'active' : ''}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="nexo-panel flex flex-wrap items-end justify-between gap-6 p-6">
        <div className="max-w-2xl">
          <p className="nexo-section mb-2">Economia da varredura</p>
          <h2 className="text-xl font-light text-nexo-text">
            {grid.points.length.toLocaleString('pt-BR')} verificações de coordenada. Cerca de {formatUsd(cost, 4)} em dados da fila {QUEUE_LABELS[queue].toLowerCase()}.
          </h2>
          <p className="mt-2 text-sm text-nexo-dim">
            O Nexo mostra o fluxo, as evidências e o controle de gasto para você rodar grades sérias sem pagar o markup de uma plataforma a cada experimento.
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-xs">
          <a href="https://dataforseo.com/pricing/serp/google-maps-serp-api" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-nexo-sky hover:text-white">
            Verificar preços da API <ArrowUpRight className="h-3 w-3" />
          </a>
          <Link href="/dashboard/spending" className="text-nexo-sky hover:text-white">Ver gastos</Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [pct(metrics.top3Share), 'Cobertura no top 3'],
          [pct(metrics.top10Share), 'Cobertura no top 10'],
          [metrics.averageFound === null ? '—' : num(metrics.averageFound), 'Posição média (onde aparece)'],
          [metrics.notFound.toLocaleString('pt-BR'), 'Fora do top 20'],
        ].map(([value, label]) => (
          <article key={label} className="nexo-panel p-5">
            <p className="nexo-metric font-mono text-3xl">{value}</p>
            <p className="nexo-label mt-2">{label}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <div className="nexo-panel p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="nexo-seg" role="group" aria-label="Visualização do mapa">
                {VIEWS.map((item) => (
                  <button key={item.value} type="button" aria-pressed={view === item.value} onClick={() => setView(item.value)} className={`transition-colors hover:text-white ${view === item.value ? 'active' : ''}`}>
                    {item.label}
                  </button>
                ))}
              </div>
              <span className="nexo-label">{grid.points.length.toLocaleString('pt-BR')} coordenadas</span>
            </div>
            <div className="mb-4">
              <p className="nexo-section">{isProof ? 'Projeto de prova real paga' : 'Projeto demo modelado'}</p>
              <p className="mt-1 text-sm text-nexo-text">{STUDIO_TARGET} · “{STUDIO_KEYWORD}” · {STUDIO_LOCATION}</p>
              <p className="mt-1 text-xs text-nexo-faint">
                {grid.title}. {grid.source}{isProof ? ' O navegador reutiliza o recibo salvo e não gasta de novo.' : ''}
              </p>
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-4">
              {RANK_TIER_ORDER.map((tier) => (
                <span key={tier} className="inline-flex items-center gap-1.5 text-[11px] text-nexo-dim">
                  <i className="h-3 w-3 rounded-full" style={{ background: RANK_TIERS[tier].fill, border: RANK_TIERS[tier].border || undefined, boxShadow: RANK_TIERS[tier].glow || undefined }} />
                  {tier === 'none' ? 'Acima de 20' : `Posição ${RANK_TIERS[tier].label.replace('#', '').replace('-', '–')}`}
                </span>
              ))}
              <button type="button" onClick={() => setResetKey((key) => key + 1)} className="nexo-btn-ghost ml-auto inline-flex items-center gap-1.5 px-3 py-1.5">
                <RotateCcw className="h-3 w-3" /> Recentralizar
              </button>
            </div>
            <StudioMap points={grid.points} gridSize={grid.size} view={view} selectedId={selected?.id ?? null} onSelect={setSelectedId} resetKey={resetKey} />
            <p className="mt-2 text-[11px] text-nexo-faint">
              {view === 'evidence' ? 'Clique em um pin para abrir a evidência do ponto.' : view === 'heat' ? 'Mapa de calor: quanto mais claro, melhor a posição.' : 'Arraste para mover; role ou use os controles para dar zoom. Clique em um pin para ver o ponto.'}
            </p>
          </div>

          <div className="nexo-panel p-5">
            <p className="nexo-section mb-4">Planejador em lote</p>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
              <label className="block">
                <span className="nexo-label mb-1.5 block">Empresas (prospects)</span>
                <input type="number" min={1} step={1} value={prospects} onChange={(event) => setProspects(Math.max(1, Math.floor(Number(event.target.value) || 1)))} className="nexo-input min-w-0 w-full px-3 py-2 font-mono text-sm" />
              </label>
              <div>
                <p className="nexo-label mb-1.5">Grade</p>
                <p className="font-mono text-sm text-nexo-text">{grid.size} x {grid.size}</p>
              </div>
              <div>
                <p className="nexo-label mb-1.5">Verificações de coordenada</p>
                <p className="font-mono text-sm text-nexo-text">{(grid.points.length * prospects).toLocaleString('pt-BR')}</p>
              </div>
              <div>
                <p className="nexo-label mb-1.5">Custo estimado</p>
                <p className="nexo-metric font-mono text-xl">{formatUsd(cost * prospects)}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-nexo-border pt-4">
              <p className="max-w-md text-xs text-nexo-faint">Estimativa com o preço por ponto do DataForSEO; o valor cobrado é o que o provedor informar em cada execução.</p>
              <Link href="/dashboard/campaigns" className="nexo-btn-accent inline-flex items-center gap-2 px-4 py-2.5">
                <CalendarCheck className="h-3.5 w-3.5" /> Criar campanha
              </Link>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          <aside className="nexo-panel p-5">
            <p className="nexo-section mb-4">Coordenada selecionada</p>
            {selected && (
              <>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-nexo-faint">Posição</dt><dd className="font-mono text-nexo-ice">{rankLabel(selected.rank)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-nexo-faint">Ponto</dt><dd className="font-mono text-nexo-text">{selected.id}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-nexo-faint">Primeiro resultado</dt><dd className="text-right text-nexo-text">{selected.topResult}</dd></div>
                </dl>
                <p className="nexo-label mb-2 mt-5">Top 3 neste ponto</p>
                <ol className="space-y-1.5 text-sm">
                  {selected.topThree.map((name, index) => (
                    <li key={`${name}-${index}`} className="flex justify-between gap-3">
                      <span className={name === STUDIO_TARGET ? 'text-nexo-ice' : 'text-nexo-dim'}>{name}</span>
                      <span className="font-mono text-nexo-sky">{index + 1}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </aside>

          <aside className="nexo-panel p-5">
            <p className="nexo-section mb-4">Economia de prospecção</p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-nexo-faint">Pins por varredura</dt><dd className="font-mono text-nexo-text">{grid.points.length}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-nexo-faint">Custo por varredura</dt><dd className="font-mono text-nexo-text">{formatUsd(cost, 4)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-nexo-faint">1.000 varreduras</dt><dd className="font-mono text-nexo-ice">{formatUsd(cost * 1000)}</dd></div>
            </dl>
            <p className="mt-4 text-xs text-nexo-faint">
              Esta visão {grid.size} x {grid.size} na fila {QUEUE_LABELS[queue].toLowerCase()} custa cerca de {formatUsd(cost, 3)} por combinação de empresa e palavra-chave.
            </p>
          </aside>

          <aside className="nexo-panel p-5">
            <p className="nexo-section mb-4">Pressão da concorrência</p>
            <p className="mb-3 text-xs text-nexo-faint">Vezes em que cada empresa aparece no top 3 dos pontos.</p>
            <ul className="space-y-1.5 text-sm">
              {pressure.map(([name, count]) => (
                <li key={name} className="flex justify-between gap-3">
                  <span className={name === STUDIO_TARGET ? 'text-nexo-ice' : 'text-nexo-dim'}>{name}</span>
                  <span className="font-mono text-nexo-sky">{count}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <section className="nexo-panel p-5">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="nexo-section mb-2">Lista de varreduras por palavra-chave</p>
            <p className="text-sm text-nexo-dim">Campanha modelada: um pacote visual com cada palavra-chave, a posição média e a configuração da varredura. Não é uma varredura real.</p>
          </div>
          <button type="button" onClick={exportCampaignCsv} className="nexo-btn-ghost inline-flex items-center gap-2 px-4 py-2">
            <Download className="h-3.5 w-3.5" /> Exportar CSV
          </button>
        </div>
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            [String(MODELED_CAMPAIGN.keywords.length), 'Palavras-chave'],
            [String(MODELED_CAMPAIGN.keywords.length - found.length), 'Fora do ranking'],
            [found.length ? num(found.reduce((sum, row) => sum + (row.avgScore ?? 0), 0) / found.length) : '—', 'Posição média'],
            [bestKeyword?.keyword ?? '—', 'Melhor oportunidade'],
          ].map(([value, label]) => (
            <div key={label} className="rounded-nexo border border-nexo-border p-4">
              <p className="truncate font-mono text-lg text-nexo-ice">{value}</p>
              <p className="nexo-label mt-1">{label}</p>
            </div>
          ))}
        </div>
        <p className="mb-4 rounded-nexo border-l-2 border-nexo-ice bg-nexo-blue/10 px-4 py-3 text-sm text-nexo-dim">
          <b className="font-medium text-nexo-ice">{selectedKeyword.keyword}</b> · {MODELED_CAMPAIGN.business} precisa da prova no mapa, da posição média e de uma nota de abordagem em linguagem simples no mesmo relatório.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left">
                <th className="px-3 py-2 font-normal">Empresa</th>
                <th className="px-3 py-2 font-normal">Palavra-chave</th>
                <th className="px-3 py-2 font-normal">Posição média</th>
                <th className="px-3 py-2 font-normal">Configuração</th>
              </tr>
            </thead>
            <tbody>
              {MODELED_CAMPAIGN.keywords.map((row, index) => (
                <tr key={row.keyword} className={`cursor-pointer transition-colors hover:bg-white/[0.04] ${index === keywordIndex ? 'bg-nexo-blue/10' : ''}`} onClick={() => setKeywordIndex(index)}>
                  <td className="px-3 py-2.5">
                    <span className="block text-nexo-text">{MODELED_CAMPAIGN.business}</span>
                    <span className="block text-xs text-nexo-faint">{MODELED_CAMPAIGN.place}</span>
                  </td>
                  <td className="px-3 py-2.5 text-nexo-dim">{row.keyword}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex min-w-12 justify-center rounded-full px-2 py-0.5 font-mono text-xs ${SCORE_STYLE[scoreTier(row.avgScore)]}`}>
                      {row.avgScore === null ? 'NR' : num(row.avgScore)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-nexo-faint">{MODELED_CAMPAIGN.settings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="pb-4 text-center text-[11px] text-nexo-faint">
        Prova salva de {STUDIO_TARGET} (pizza, Austin, 2026). Baseado no legends-geogrid e no SEO Playground, ambos sob licença MIT.
      </p>
    </div>
  );
}
