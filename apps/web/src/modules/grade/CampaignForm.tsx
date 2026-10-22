'use client';

import { lazy, Suspense, useActionState, useEffect, useMemo, useState } from 'react';
import { saveCampaignAction } from '@/app/dashboard/campaigns/actions';
import { formatBusinessTarget } from '@/lib/grid-target';
import { spacingOptions, type DistanceUnit } from '@/lib/grid-preferences';
import type { GridScheduleFrequency } from '@/lib/db';
import { CAMPAIGN_GRID_SIZES, MAX_CAMPAIGN_KEYWORDS, normalizeKeywords, type GridCampaign } from './campaigns-shared';
import { estimateCampaign } from './estimate';
import {
  DEFAULT_GRID_DEPTH, DEFAULT_GRID_DEVICE, GRID_DEPTH_OPTIONS, GRID_DEVICE_LABELS, GRID_DEVICES, type GridDevice,
} from './grid-config';
import { formatBrl } from '@/modules/custos/budget-shared';
import { gridGeometryKey } from './inactive-points';
import { LANGUAGES } from '@/lib/geo-options';

const MapPicker = lazy(() => import('@/app/dashboard/local-finder/MapPicker'));

const days = [['Domingo', 0], ['Segunda-feira', 1], ['Terça-feira', 2], ['Quarta-feira', 3], ['Quinta-feira', 4], ['Sexta-feira', 5], ['Sábado', 6]] as const;

type Props = {
  campaign: GridCampaign | null;
  /** Settings defaults, or values prefilled from the URL (?new=1&keywords=…&target=…&center=…). */
  defaults: { center: string; language: string; target: string; keywords?: string[] };
  distanceUnit: DistanceUnit;
  /** Exchange rate and the client's monthly cap, to show the estimate in reais. */
  budget: { brlPerUsd: number; clientCapBrl: number | null; clientSpentBrl: number };
  /** Inactive points of the campaign's saved grid. */
  inactivePoints: string[];
};

const field = 'nexo-input min-w-0 w-full px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky';
const label = 'nexo-label mb-1.5 block';

export default function CampaignForm({ campaign, defaults, distanceUnit, budget, inactivePoints }: Props) {
  const [state, formAction, pending] = useActionState(saveCampaignAction, undefined);
  const [center, setCenter] = useState(campaign?.center ?? defaults.center);
  const [target, setTarget] = useState(campaign?.target ?? defaults.target);
  const [language, setLanguage] = useState(campaign?.language ?? defaults.language);
  const [gridSize, setGridSize] = useState(campaign?.grid_size ?? 7);
  const [spacingKm, setSpacingKm] = useState(campaign?.spacing_km ?? 0.5);
  const [keywords, setKeywords] = useState(campaign?.keywords.join('\n') ?? defaults.keywords?.join('\n') ?? '');
  const [device, setDevice] = useState<GridDevice>(campaign?.device ?? DEFAULT_GRID_DEVICE);
  const [depth, setDepth] = useState(campaign?.depth ?? DEFAULT_GRID_DEPTH);
  const [frequency, setFrequency] = useState<GridScheduleFrequency>(campaign?.frequency ?? 'biweekly');
  const [queueMode, setQueueMode] = useState<'standard' | 'priority'>(campaign?.queue_mode ?? 'standard');
  const [timeZone, setTimeZone] = useState(campaign?.time_zone ?? 'UTC');

  useEffect(() => {
    if (!campaign) setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  }, [campaign]);

  const keywordCount = normalizeKeywords(keywords.split(/\r?\n/)).length;
  // Inactive points belong to a grid; they stop applying once the center, size or spacing changes.
  const sameGrid = campaign !== null
    && gridGeometryKey({ center, grid_size: gridSize, spacing_km: spacingKm }) === gridGeometryKey(campaign);
  const inactiveCount = sameGrid ? inactivePoints.length : 0;
  const estimate = useMemo(
    () => estimateCampaign({ gridSize, keywordCount, frequency, queueMode, inactivePoints: inactiveCount, depth }),
    [gridSize, keywordCount, frequency, queueMode, inactiveCount, depth],
  );
  const usesWeekday = frequency === 'weekly' || frequency === 'biweekly';
  const perMonthBrl = estimate.perMonthUsd * budget.brlPerUsd;
  const overCap = budget.clientCapBrl !== null && perMonthBrl > budget.clientCapBrl;

  return (
    <form action={formAction} className="space-y-5">
      {campaign && <input type="hidden" name="id" value={campaign.id} />}
      <input type="hidden" name="time_zone" value={timeZone} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="campaign-name">Nome da campanha</label>
          <input id="campaign-name" name="name" required defaultValue={campaign?.name ?? ''} placeholder="ex.: Clínica Sorriso · Aldeota" className={field} />
        </div>
        <div>
          <label className={label} htmlFor="campaign-target">Empresa a acompanhar</label>
          <input id="campaign-target" name="target" required value={target} onChange={(event) => setTarget(event.target.value)} placeholder="Escolha no mapa ou digite um nome ou domínio" className={field} />
        </div>
      </div>

      <div>
        <label className={label}>Centro da grade</label>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-nexo-lg bg-nexo-surface-2" />}>
          <MapPicker
            coordinate={center}
            onChange={setCenter}
            showGrid={!!center}
            gridSize={gridSize}
            spacingKm={spacingKm}
            distanceUnit={distanceUnit}
            language={language}
            onBusinessSelect={(business) => setTarget(formatBusinessTarget(business.title, business.cid))}
          />
        </Suspense>
        <input name="center" value={center} onChange={(event) => setCenter(event.target.value)} placeholder="Clique no mapa ou digite lat,lng" className={`${field} mt-2 font-mono`} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={label} htmlFor="campaign-size">Tamanho da grade</label>
          <select id="campaign-size" name="grid_size" value={gridSize} onChange={(event) => setGridSize(Number(event.target.value))} className={field}>
            {CAMPAIGN_GRID_SIZES.map((size) => <option key={size} value={size}>{size}×{size} ({size * size} pontos)</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="campaign-spacing">Espaçamento ({distanceUnit})</label>
          <select id="campaign-spacing" name="spacing_km" value={spacingKm} onChange={(event) => setSpacingKm(Number(event.target.value))} className={field}>
            {spacingOptions(distanceUnit, spacingKm).map((option) => <option key={option.km} value={option.km}>{option.label}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="campaign-language">Idioma</label>
          <select id="campaign-language" name="language" value={language} onChange={(event) => setLanguage(event.target.value)} className={field}>
            {/* Values are the language names DataForSEO expects; labels are shown in each language. */}
            {!LANGUAGES.some((option) => option.value === language) && <option value={language}>{language}</option>}
            {LANGUAGES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className={label} id="campaign-device-label">Dispositivo</span>
          <input type="hidden" name="device" value={device} />
          <div className="nexo-seg" role="group" aria-labelledby="campaign-device-label">
            {GRID_DEVICES.map((option) => (
              <button key={option} type="button" onClick={() => setDevice(option)} aria-pressed={device === option}
                className={`transition-colors hover:text-white ${device === option ? 'active' : ''}`}>
                {GRID_DEVICE_LABELS[option]}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-nexo-faint">O Google mostra resultados locais diferentes no celular e no computador.</p>
        </div>
        <div>
          <label className={label} htmlFor="campaign-depth">Profundidade · resultados verificados por ponto</label>
          <select id="campaign-depth" name="depth" value={depth} onChange={(event) => setDepth(Number(event.target.value))} className={field}>
            {GRID_DEPTH_OPTIONS.map((option) => <option key={option} value={option}>{option === DEFAULT_GRID_DEPTH ? `${option} (padrão)` : option}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-nexo-faint">Acima de 20, a empresa é encontrada mesmo em posições mais baixas. Mudar dispositivo ou profundidade inicia novas linhas do tempo.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="campaign-tags">Etiquetas · separadas por vírgula</label>
          <input id="campaign-tags" name="tags" defaultValue={campaign?.tags?.join(', ') ?? ''} placeholder="Aldeota, odontologia, plano completo" className={field} />
        </div>
        <div>
          <label className={label} htmlFor="campaign-owner">Responsável</label>
          <input id="campaign-owner" name="owner" defaultValue={campaign?.owner ?? ''} placeholder="Quem cuida deste cliente" className={field} />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="campaign-keywords">Palavras-chave · uma por linha, até {MAX_CAMPAIGN_KEYWORDS}</label>
        <textarea id="campaign-keywords" name="keywords" rows={4} value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder={'dentista\nclareamento dental\nimplante dentário'} className={field} />
        <p className={`mt-1 text-[11px] ${keywordCount > MAX_CAMPAIGN_KEYWORDS ? 'text-nexo-danger-text' : 'text-nexo-faint'}`}>
          {keywordCount} {keywordCount === 1 ? 'palavra-chave' : 'palavras-chave'}. Cada uma é um monitor próprio, com sua própria linha do tempo.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label className={label} htmlFor="campaign-frequency">Frequência</label>
          <select id="campaign-frequency" name="frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as GridScheduleFrequency)} className={field}>
            <option value="daily">Diário</option>
            <option value="weekly">Semanal</option>
            <option value="biweekly">Quinzenal</option>
            <option value="monthly">Mensal</option>
          </select>
        </div>
        <div>
          {frequency === 'monthly' ? (
            <>
              <label className={label} htmlFor="campaign-month-day">Dia</label>
              <select id="campaign-month-day" name="month_day" defaultValue={campaign?.month_day ?? 1} className={field}>
                {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>Dia {day}</option>)}
              </select>
            </>
          ) : (
            <>
              <label className={label} htmlFor="campaign-weekday">Dia da semana</label>
              <select id="campaign-weekday" name="weekday" defaultValue={campaign?.weekday ?? 1} disabled={!usesWeekday} className={`${field} disabled:opacity-40`}>
                {days.map(([name, value]) => <option key={value} value={value}>{name}</option>)}
              </select>
            </>
          )}
        </div>
        <div>
          <label className={label} htmlFor="campaign-time">Horário</label>
          <input id="campaign-time" name="time_of_day" type="time" defaultValue={campaign?.time_of_day ?? '03:00'} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="campaign-queue">Fila</label>
          <select id="campaign-queue" name="queue_mode" value={queueMode} onChange={(event) => setQueueMode(event.target.value as 'standard' | 'priority')} className={field}>
            <option value="standard">Padrão</option>
            <option value="priority">Prioritária</option>
          </select>
        </div>
      </div>

      <div className="rounded-nexo-lg border border-nexo-border-strong bg-nexo-blue/10 px-4 py-3 text-xs text-nexo-dim">
        <p className="nexo-section">Custo estimado no DataForSEO</p>
        <p className="mt-1">
          <b className="tabular-nums">{estimate.pointsPerRun.toLocaleString('pt-BR')}</b> pontos por execução × <b className="tabular-nums">{estimate.runsPerMonth.toFixed(1).replace('.', ',')}</b> execuções por mês ≈{' '}
          <b className="tabular-nums text-nexo-text">{formatBrl(perMonthBrl)}/mês</b>
          <span className="text-nexo-faint"> (US$ {estimate.perMonthUsd.toFixed(2).replace('.', ',')} · {formatBrl(estimate.perRunUsd * budget.brlPerUsd)} por execução)</span>
        </p>
        {budget.clientCapBrl !== null && (
          <p className={`mt-1 ${overCap ? 'text-nexo-warn-text' : 'text-nexo-faint'}`}>
            {overCap
              ? `Sozinha, esta campanha passa do teto mensal do cliente (${formatBrl(budget.clientCapBrl)}); ela vai pausar antes do fim do mês.`
              : `Teto mensal do cliente: ${formatBrl(budget.clientCapBrl)}, com ${formatBrl(budget.clientSpentBrl)} já gastos neste mês.`}
          </p>
        )}
        <p className="mt-1 text-[10px] text-nexo-faint">
          {inactiveCount > 0 && <>{inactiveCount} {inactiveCount === 1 ? 'ponto desligado nesta grade não entra' : 'pontos desligados nesta grade não entram'} na conta. </>}
          {campaign ? 'Desligue pontos sobre mar, rio ou parque pelo link “Pontos” no cartão da campanha. ' : 'Depois de criar a campanha, você pode desligar pontos sobre mar, rio ou parque. '}
          Estimativa indicativa pelo preço de tabela por ponto (o mesmo em qualquer profundidade), com o dólar a {formatBrl(budget.brlPerUsd)}; o DataForSEO cobra o que ele informa, e cada execução registra seu custo real. Fuso horário: {timeZone.replace(/_/g, ' ')}.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs font-semibold text-nexo-dim">
          <input type="checkbox" name="active" defaultChecked={campaign?.active ?? true} className="h-4 w-4 rounded border-nexo-border" />
          Ativa (execuções agendadas ligadas)
        </label>
        <div className="flex items-center gap-3">
          {state?.error && <p className="text-xs font-semibold text-nexo-danger-text">{state.error}</p>}
          <a href="/dashboard/campaigns" className="nexo-label hover:text-white">Cancelar</a>
          <button type="submit" disabled={pending} className="rounded-nexo-lg bg-nexo-blue px-4 py-2.5 text-xs font-medium uppercase tracking-widest text-white transition-colors hover:bg-nexo-sky disabled:opacity-50">
            {pending ? 'Salvando…' : campaign ? 'Salvar campanha' : 'Criar campanha'}
          </button>
        </div>
      </div>
    </form>
  );
}
