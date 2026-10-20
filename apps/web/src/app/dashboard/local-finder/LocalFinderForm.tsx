'use client';

import { useState, lazy, Suspense } from 'react';
import { LANGUAGES } from '@/lib/geo-options';
import { formatBusinessTarget } from '@/lib/grid-target';
import { formatDistance, spacingOptions, type DistanceUnit } from '@/lib/grid-preferences';
import { useGridPreferences } from './GridPreferences';

const MapPicker = lazy(() => import('./MapPicker'));

interface Props {
  defaults: {
    keyword: string;
    location: string;
    locationCoordinate: string;
    defaultCenter: string;
    language: string;
    device: string;
    os: string;
    depth: string;
    minRating: string;
    timeFilter: string;
    gridMode?: boolean;
    forceGridMode?: boolean;
    gridSize?: string;
    spacingKm?: string;
    gridTarget?: string;
    queueMode?: string;
  };
}

// DataForSEO Local Finder SERP API pricing (checked against their pricing page — they revise this periodically).
type QueueMode = 'live' | 'priority' | 'standard';

const QUEUE_MODES: { value: QueueMode; label: string; costPerPoint: number; wait: string }[] = [
  { value: 'live', label: 'Live', costPerPoint: 0.002, wait: 'Trava a página' },
  { value: 'priority', label: 'Prioritária', costPerPoint: 0.0012, wait: '~1 min em média, em segundo plano' },
  { value: 'standard', label: 'Padrão', costPerPoint: 0.0006, wait: '5–45 min, em segundo plano' },
];

// Live requests are throttled to 6 in flight; each point currently takes ~8-10s on DataForSEO's side.
const LIVE_SECONDS_PER_BATCH = 9;
const LIVE_CONCURRENCY = 6;

function formatCost(n: number) {
  return `US$ ${n.toFixed(4).replace('.', ',')}`;
}

function formatLiveDuration(totalPoints: number) {
  const seconds = Math.ceil(totalPoints / LIVE_CONCURRENCY) * LIVE_SECONDS_PER_BATCH;
  if (seconds < 60) return `~${seconds}s`;
  return `~${Math.ceil(seconds / 60)} min`;
}

function GridPreview({ size, spacingKm, unit }: { size: number; spacingKm: number; unit: DistanceUnit }) {
  const half = Math.floor(size / 2);
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <div
        className="inline-grid gap-1"
        style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
      >
        {Array.from({ length: size * size }).map((_, i) => {
          const row = Math.floor(i / size);
          const col = i % size;
          const isCenter = row === half && col === half;
          return (
            <div
              key={i}
              className={`rounded-sm ${isCenter ? 'bg-nexo-blue ring-2 ring-nexo-border-strong' : 'bg-white/10'}`}
              style={{ width: Math.max(12, 48 / size), height: Math.max(12, 48 / size) }}
            />
          );
        })}
      </div>
      <p className="text-[10px] text-nexo-faint font-medium">
        {size}×{size} pontos · espaçamento de {formatDistance(spacingKm, unit)} · cobertura de ~{formatDistance((size - 1) * spacingKm, unit, 1)}
      </p>
    </div>
  );
}

export default function LocalFinderForm({ defaults }: Props) {
  const isGrid = defaults.forceGridMode === true;

  const [device, setDevice] = useState(defaults.device || 'desktop');
  const [coordinate, setCoordinate] = useState(defaults.locationCoordinate || defaults.defaultCenter);
  const [isLoading, setIsLoading] = useState(false);
  const [gridSize, setGridSize] = useState(parseInt(defaults.gridSize ?? '5', 10));
  const [spacingKm, setSpacingKm] = useState(parseFloat(defaults.spacingKm ?? '1'));
  const [queueMode, setQueueMode] = useState<QueueMode>((defaults.queueMode as QueueMode) || 'live');
  const [language, setLanguage] = useState(defaults.language || 'Portuguese');
  const [gridTarget, setGridTarget] = useState(defaults.gridTarget ?? '');
  const { distanceUnit } = useGridPreferences();
  const spacingChoices = spacingOptions(distanceUnit, spacingKm);

  const osOptions =
    device === 'mobile'
      ? [{ value: 'android', label: 'Android' }, { value: 'ios', label: 'iOS' }]
      : [{ value: 'windows', label: 'Windows' }, { value: 'macos', label: 'macOS' }];

  const defaultOs = osOptions.some((o) => o.value === defaults.os) ? defaults.os : osOptions[0].value;

  return (
    <form method="GET" className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4" onSubmit={() => setIsLoading(true)}>
      {/* Keyword */}
      <div>
        <label className="nexo-label block mb-1.5">
          Palavra-chave a monitorar <span className="text-nexo-danger-text">*</span>
        </label>
        <input
          type="text"
          name="keyword"
          defaultValue={defaults.keyword}
          placeholder="ex.: encanador, restaurante italiano, dentista…"
          required
          className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky transition-all"
        />
      </div>

      {/* Language */}
      <div>
        <label className="nexo-label block mb-1.5">
          Idioma <span className="text-nexo-danger-text">*</span>
        </label>
        <select
          name="language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
        >
          {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </div>

      {/* Map */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="nexo-label block">
            {isGrid ? 'Local a monitorar (mapa)' : 'Local (mapa)'} <span className="text-nexo-danger-text">*</span>
          </label>
          {coordinate && (
            <button
              type="button"
              onClick={() => setCoordinate('')}
              className="nexo-label hover:text-nexo-danger-text transition-colors"
            >
              Limpar
            </button>
          )}
        </div>
        <div className="space-y-2">
          <Suspense fallback={<div className="h-64 rounded-nexo-lg bg-nexo-surface-2 animate-pulse" />}>
            <MapPicker
              coordinate={coordinate}
              onChange={setCoordinate}
              showGrid={isGrid && !!coordinate}
              gridSize={isGrid ? gridSize : undefined}
              spacingKm={isGrid ? spacingKm : undefined}
              distanceUnit={distanceUnit}
              language={language}
              onBusinessSelect={isGrid ? (business) => setGridTarget(formatBusinessTarget(business.title, business.cid)) : undefined}
            />
          </Suspense>
          <input
            type="text"
            name="location_coordinate"
            value={coordinate}
            onChange={(e) => setCoordinate(e.target.value)}
            placeholder="Clique no mapa para marcar um ponto — ou digite lat,lng"
            className="nexo-input min-w-0 w-full px-4 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-nexo-sky"
          />
          {coordinate && (
            <p className="text-[11px] text-nexo-sky">
              {isGrid ? 'A grade será centralizada neste ponto.' : 'Coordenadas ativas — a busca será centralizada neste ponto.'}
            </p>
          )}
        </div>
      </div>

      {isGrid ? (
        /* Grid-specific fields */
        <>
          {/* Target business */}
          <div>
            <label className="nexo-label block mb-1.5">
              Domínio ou empresa alvo <span className="text-nexo-danger-text">*</span>
            </label>
            <input
              type="text"
              name="grid_target"
              value={gridTarget}
              onChange={(e) => setGridTarget(e.target.value)}
              placeholder="Escolha um perfil do Google acima ou digite um domínio / nome da empresa"
              required
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky transition-all"
            />
            <p className="text-[11px] text-nexo-faint mt-1">Escolher um perfil na busca do mapa corresponde exatamente a esse perfil do Google. Um domínio corresponde com ou sem https:// e www; um nome corresponde parcialmente.</p>
          </div>

          {/* Grid size + spacing */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="nexo-label block mb-1.5">Tamanho da grade</label>
              <select
                name="grid_size"
                value={gridSize}
                onChange={(e) => setGridSize(parseInt(e.target.value, 10))}
                className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
              >
                <option value="3">3×3 (9 pontos)</option>
                <option value="5">5×5 (25 pontos)</option>
                <option value="7">7×7 (49 pontos)</option>
                <option value="9">9×9 (81 pontos)</option>
                <option value="11">11×11 (121 pontos)</option>
              </select>
            </div>
            <div>
              <label className="nexo-label block mb-1.5">Espaçamento ({distanceUnit})</label>
              {/* Values are always kilometres; only the labels follow the Settings distance unit. */}
              <select
                name="spacing_km"
                value={spacingKm}
                onChange={(e) => setSpacingKm(parseFloat(e.target.value))}
                className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
              >
                {spacingChoices.map((option) => <option key={option.km} value={option.km}>{option.label}</option>)}
              </select>
            </div>
          </div>

          {/* Grid preview */}
          <div className="bg-white/[0.02] rounded-nexo-lg border border-nexo-border p-4">
            <p className="nexo-label mb-2 text-center">Prévia da grade</p>
            <GridPreview size={gridSize} spacingKm={spacingKm} unit={distanceUnit} />
          </div>

          {/* Queue mode */}
          <div>
            <label className="nexo-label block mb-2">Modo da API</label>
            <input type="hidden" name="queue_mode" value={queueMode} />
            <div className="grid grid-cols-3 gap-2">
              {QUEUE_MODES.map((mode) => {
                const active = queueMode === mode.value;
                const totalPoints = gridSize * gridSize;
                const estCost = formatCost(totalPoints * mode.costPerPoint);
                return (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => setQueueMode(mode.value)}
                    className={`flex flex-col gap-0.5 px-3 py-2.5 rounded-nexo-lg border text-left transition-all ${
                      active
                        ? 'border-nexo-sky bg-nexo-blue/10'
                        : 'border-nexo-border bg-nexo-surface hover:border-nexo-border'
                    }`}
                  >
                    <span className={`text-xs font-medium ${active ? 'text-nexo-sky' : 'text-nexo-dim'}`}>
                      {mode.label}
                    </span>
                    <span className={`text-[10px] font-mono ${active ? 'text-nexo-sky' : 'text-nexo-faint'}`}>{estCost}</span>
                    <span className="text-[10px] text-nexo-faint">{mode.wait}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-nexo-faint mt-2">
              {queueMode === 'live' ? (
                <>Trava a página por {formatLiveDuration(gridSize * gridSize)} — o endpoint live do DataForSEO ficou mais lento, então grades grandes podem levar vários minutos.</>
              ) : queueMode === 'priority' ? (
                <>As tarefas entram na fila do DataForSEO com prioridade alta. A página se atualiza sozinha a cada 10 segundos até os resultados ficarem prontos.</>
              ) : (
                <>As tarefas entram na fila de processamento padrão em segundo plano. A página verifica a cada 30 segundos — ou você pode voltar mais tarde.</>
              )}
            </p>
          </div>
        </>
      ) : (
        /* Standard local finder fields */
        <>
          {/* Device / OS / Depth */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="nexo-label block mb-1.5">Dispositivo</label>
              <select
                name="device"
                value={device}
                onChange={(e) => setDevice(e.target.value)}
                className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
              >
                <option value="desktop">Desktop</option>
                <option value="mobile">Celular</option>
              </select>
            </div>
            <div>
              <label className="nexo-label block mb-1.5">Sistema</label>
              <select
                name="os"
                defaultValue={defaultOs}
                className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
              >
                {osOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="nexo-label block mb-1.5">Profundidade</label>
              <select
                name="depth"
                defaultValue={defaults.depth || '20'}
                className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="40">40</option>
                <option value="60">60</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="nexo-label block mb-1.5">Nota mínima</label>
              <select
                name="min_rating"
                defaultValue={defaults.minRating || ''}
                className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
              >
                <option value="">Sem filtro</option>
                <option value="3.5">3.5+</option>
                <option value="4">4.0+</option>
                <option value="4.5">4.5+</option>
              </select>
            </div>
            <div>
              <label className="nexo-label block mb-1.5">Filtro de horário</label>
              <select
                name="time_filter"
                defaultValue={defaults.timeFilter || ''}
                className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
              >
                <option value="">Nenhum</option>
                <option value="open_now">Aberto agora</option>
                <option value="24_hours">Aberto 24 horas</option>
              </select>
            </div>
          </div>
        </>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-ice transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            {isGrid ? 'Executando a grade…' : 'Buscando…'}
          </span>
        ) : (isGrid ? 'Criar monitor e executar' : 'Buscar')}
      </button>
    </form>
  );
}
