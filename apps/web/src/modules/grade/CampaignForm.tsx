'use client';

import { lazy, Suspense, useActionState, useEffect, useMemo, useState } from 'react';
import { saveCampaignAction } from '@/app/dashboard/campaigns/actions';
import { formatBusinessTarget } from '@/lib/grid-target';
import { spacingOptions, type DistanceUnit } from '@/lib/grid-preferences';
import type { GridScheduleFrequency } from '@/lib/db';
import { CAMPAIGN_GRID_SIZES, MAX_CAMPAIGN_KEYWORDS, normalizeKeywords, type GridCampaign } from './campaigns-shared';
import { estimateCampaign } from './estimate';

const MapPicker = lazy(() => import('@/app/dashboard/local-finder/MapPicker'));

const days = [['Sunday', 0], ['Monday', 1], ['Tuesday', 2], ['Wednesday', 3], ['Thursday', 4], ['Friday', 5], ['Saturday', 6]] as const;

type Props = {
  campaign: GridCampaign | null;
  defaults: { center: string; language: string; target: string };
  distanceUnit: DistanceUnit;
};

const field = 'nexo-input min-w-0 w-full px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky';
const label = 'nexo-label mb-1.5 block';

export default function CampaignForm({ campaign, defaults, distanceUnit }: Props) {
  const [state, formAction, pending] = useActionState(saveCampaignAction, undefined);
  const [center, setCenter] = useState(campaign?.center ?? defaults.center);
  const [target, setTarget] = useState(campaign?.target ?? defaults.target);
  const [language, setLanguage] = useState(campaign?.language ?? defaults.language);
  const [gridSize, setGridSize] = useState(campaign?.grid_size ?? 7);
  const [spacingKm, setSpacingKm] = useState(campaign?.spacing_km ?? 0.5);
  const [keywords, setKeywords] = useState(campaign?.keywords.join('\n') ?? '');
  const [frequency, setFrequency] = useState<GridScheduleFrequency>(campaign?.frequency ?? 'biweekly');
  const [queueMode, setQueueMode] = useState<'standard' | 'priority'>(campaign?.queue_mode ?? 'standard');
  const [timeZone, setTimeZone] = useState(campaign?.time_zone ?? 'UTC');

  useEffect(() => {
    if (!campaign) setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  }, [campaign]);

  const keywordCount = normalizeKeywords(keywords.split(/\r?\n/)).length;
  const estimate = useMemo(
    () => estimateCampaign({ gridSize, keywordCount, frequency, queueMode }),
    [gridSize, keywordCount, frequency, queueMode],
  );
  const usesWeekday = frequency === 'weekly' || frequency === 'biweekly';

  return (
    <form action={formAction} className="space-y-5">
      {campaign && <input type="hidden" name="id" value={campaign.id} />}
      <input type="hidden" name="time_zone" value={timeZone} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="campaign-name">Campaign name</label>
          <input id="campaign-name" name="name" required defaultValue={campaign?.name ?? ''} placeholder="e.g. Clínica Sorriso · Aldeota" className={field} />
        </div>
        <div>
          <label className={label} htmlFor="campaign-target">Business to track</label>
          <input id="campaign-target" name="target" required value={target} onChange={(event) => setTarget(event.target.value)} placeholder="Pick on the map, or type a name or domain" className={field} />
        </div>
      </div>

      <div>
        <label className={label}>Grid center</label>
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
        <input name="center" value={center} onChange={(event) => setCenter(event.target.value)} placeholder="Click the map, or type lat,lng" className={`${field} mt-2 font-mono`} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={label} htmlFor="campaign-size">Grid size</label>
          <select id="campaign-size" name="grid_size" value={gridSize} onChange={(event) => setGridSize(Number(event.target.value))} className={field}>
            {CAMPAIGN_GRID_SIZES.map((size) => <option key={size} value={size}>{size}×{size} ({size * size} points)</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="campaign-spacing">Spacing ({distanceUnit})</label>
          <select id="campaign-spacing" name="spacing_km" value={spacingKm} onChange={(event) => setSpacingKm(Number(event.target.value))} className={field}>
            {spacingOptions(distanceUnit, spacingKm).map((option) => <option key={option.km} value={option.km}>{option.label}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="campaign-language">Language</label>
          <input id="campaign-language" name="language" value={language} onChange={(event) => setLanguage(event.target.value)} className={field} />
        </div>
      </div>

      <div>
        <label className={label} htmlFor="campaign-keywords">Keywords · one per line, up to {MAX_CAMPAIGN_KEYWORDS}</label>
        <textarea id="campaign-keywords" name="keywords" rows={4} value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder={'dentista\nclareamento dental\nimplante dentário'} className={field} />
        <p className={`mt-1 text-[11px] ${keywordCount > MAX_CAMPAIGN_KEYWORDS ? 'text-nexo-danger-text' : 'text-nexo-faint'}`}>
          {keywordCount} keyword{keywordCount === 1 ? '' : 's'}. Each one is its own monitor, with its own timeline.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label className={label} htmlFor="campaign-frequency">Frequency</label>
          <select id="campaign-frequency" name="frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as GridScheduleFrequency)} className={field}>
            <option value="daily">Every day</option>
            <option value="weekly">Every week</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Every month</option>
          </select>
        </div>
        <div>
          {frequency === 'monthly' ? (
            <>
              <label className={label} htmlFor="campaign-month-day">Day</label>
              <select id="campaign-month-day" name="month_day" defaultValue={campaign?.month_day ?? 1} className={field}>
                {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>Day {day}</option>)}
              </select>
            </>
          ) : (
            <>
              <label className={label} htmlFor="campaign-weekday">Weekday</label>
              <select id="campaign-weekday" name="weekday" defaultValue={campaign?.weekday ?? 1} disabled={!usesWeekday} className={`${field} disabled:opacity-40`}>
                {days.map(([name, value]) => <option key={value} value={value}>{name}</option>)}
              </select>
            </>
          )}
        </div>
        <div>
          <label className={label} htmlFor="campaign-time">Time</label>
          <input id="campaign-time" name="time_of_day" type="time" defaultValue={campaign?.time_of_day ?? '03:00'} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="campaign-queue">Queue</label>
          <select id="campaign-queue" name="queue_mode" value={queueMode} onChange={(event) => setQueueMode(event.target.value as 'standard' | 'priority')} className={field}>
            <option value="standard">Standard</option>
            <option value="priority">Priority</option>
          </select>
        </div>
      </div>

      <div className="rounded-nexo-lg border border-nexo-border-strong bg-nexo-blue/10 px-4 py-3 text-xs text-nexo-dim">
        <p className="nexo-section">Estimated DataForSEO cost</p>
        <p className="mt-1">
          <b className="tabular-nums">{estimate.pointsPerRun}</b> points per run × <b className="tabular-nums">{estimate.runsPerMonth.toFixed(1)}</b> runs a month ≈{' '}
          <b className="tabular-nums text-nexo-text">${estimate.perMonthUsd.toFixed(2)}/month</b>
          <span className="text-nexo-faint"> (${estimate.perRunUsd.toFixed(3)} per run)</span>
        </p>
        <p className="mt-1 text-[10px] text-nexo-faint">Advisory estimate at list price; DataForSEO bills what it reports, and each run stores its real cost. {timeZone.replace(/_/g, ' ')} time.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs font-semibold text-nexo-dim">
          <input type="checkbox" name="active" defaultChecked={campaign?.active ?? true} className="h-4 w-4 rounded border-nexo-border" />
          Active (scheduled runs on)
        </label>
        <div className="flex items-center gap-3">
          {state?.error && <p className="text-xs font-semibold text-nexo-danger-text">{state.error}</p>}
          <a href="/dashboard/campaigns" className="nexo-label hover:text-white">Cancel</a>
          <button type="submit" disabled={pending} className="rounded-nexo-lg bg-nexo-blue px-4 py-2.5 text-xs font-medium uppercase tracking-widest text-white transition-colors hover:bg-nexo-sky disabled:opacity-50">
            {pending ? 'Saving…' : campaign ? 'Save campaign' : 'Create campaign'}
          </button>
        </div>
      </div>
    </form>
  );
}
