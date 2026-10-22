import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import {
  getCredentials, getSetting,
  getReviewsTasks, getReviewsTaskResult, getReviewsTaskMeta, updateReviewsTask,
  type ReviewsTask,
} from '@/lib/db';
import { submitReviewsTaskAction } from './actions';
import { getBrandSettings } from '@/lib/brand-server';
import PendingButton from '@/components/PendingButton';
import HistorySidebar from '@/components/HistorySidebar';
import LocationPicker from '@/components/LocationPicker';
import DownloadCsvButton from './DownloadCsvButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import ExportExcelButton from '@/components/ExportExcelButton';
import ReportPdfExportButton from '@/components/ReportPdfExportButton';
import { CheckCircle, Clock, AlertCircle } from 'lucide-react';
import ReviewFiltersForm from '@/modules/avaliacoes/ReviewFilters';
import { filterReviews, parseReviewFilters } from '@/modules/avaliacoes/filter';
import { formatDuration, formatReplyDelay, MINUTES_PER_REPLY, replyMetrics } from '@/modules/avaliacoes/metrics';
import { estimateMonthlyUsd, defaultDepth, FREQUENCIES } from '@/modules/avaliacoes/monitor';
import { findMonitoredByKey, listingKey } from '@/modules/avaliacoes/monitor-db';
import { parseCid, parsePlaceId } from '@/modules/avaliacoes/request-kit';
import { monitorFromTaskAction } from '../monitor-de-avaliacoes/actions';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReviewRating {
  value?: number;
  votes_count?: number;
  rating_max?: number;
}

interface Review {
  type?: string;
  rating?: ReviewRating;
  review_text?: string;
  original_review_text?: string;
  timestamp?: string;
  time_ago?: string;
  profile_name?: string;
  profile_url?: string;
  local_guide?: boolean;
  reviews_count?: number;
  owner_answer?: string;
  owner_time_ago?: string;
  owner_timestamp?: string;
  review_id?: string;
  review_url?: string;
}

interface PopularHour {
  hour: number;
  value: number;
}

interface BusinessMeta {
  place_id?: string;
  cid?: string;
  title?: string;
  category?: string;
  additional_categories?: string[];
  description?: string;
  address?: string;
  phone?: string;
  website?: string;
  url?: string;
  rating?: { value?: number; votes_count?: number };
  popular_times?: PopularHour[];
  popular_times_by_day?: Record<string, PopularHour[]>;
  total_count?: number;
}

interface SearchParams {
  id?: string;
  nota?: string;
  resposta?: string;
  periodo?: string;
  q?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function StarRow({ value, max = 5 }: { value: number; max?: number }) {
  const full = Math.round(value);
  return (
    <span className="inline-flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < full ? 'text-nexo-warn-text' : 'text-nexo-text'} style={{ fontSize: '0.85em' }}>★</span>
      ))}
    </span>
  );
}

// ─── Distribution chart ───────────────────────────────────────────────────────

function DistributionChart({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) return null;

  const buckets = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => {
      const v = r.rating?.value ?? 0;
      return v >= star - 0.5 && v < star + 0.5;
    }).length,
  }));
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  const barColors = ['bg-nexo-ice', 'bg-nexo-ice', 'bg-nexo-warn', 'bg-nexo-warn', 'bg-nexo-danger'];

  return (
    <div className="space-y-2.5">
      {buckets.map(({ star, count }, i) => (
        <div key={star} className="flex items-center gap-3">
          <span className="text-xs font-medium text-nexo-dim w-5 text-right">{star}</span>
          <span className="text-nexo-warn-text text-sm">★</span>
          <div className="flex-1 bg-nexo-surface-2 rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColors[i]}`}
              style={{ width: `${(count / maxCount) * 100}%` }}
            />
          </div>
          <span className="text-xs tabular-nums text-nexo-dim font-semibold w-8 text-right">{count}</span>
          <span className="text-xs tabular-nums text-nexo-faint w-9">
            {reviews.length > 0 ? `${((count / reviews.length) * 100).toFixed(0)}%` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Monthly chart ────────────────────────────────────────────────────────────

function MonthlyChart({ reviews }: { reviews: Review[] }) {
  const monthMap: Record<string, number> = {};
  for (const r of reviews) {
    if (!r.timestamp) continue;
    try {
      const d = new Date(r.timestamp);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap[key] = (monthMap[key] ?? 0) + 1;
    } catch { /* skip */ }
  }

  const entries = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length < 2) {
    return <p className="text-sm text-nexo-faint py-4 text-center">Dados insuficientes para exibir o gráfico mensal.</p>;
  }

  const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const W = 600, H = 160;
  const PAD = { top: 12, right: 10, bottom: 24, left: 32 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const maxVal = Math.max(...entries.map(([, v]) => v), 1);
  const n = entries.length;
  const step = chartW / n;
  const barW = Math.max(6, Math.floor(step * 0.65));
  const yTicks = [0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: `${H}px` }}>
      {/* Gridlines + y labels */}
      {yTicks.map((f) => {
        const y = PAD.top + chartH * (1 - f);
        return (
          <g key={f}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="rgba(77,162,255,.14)" strokeWidth="1" />
            <text x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize="9" fill="rgba(234,242,255,.5)">{Math.round(maxVal * f)}</text>
          </g>
        );
      })}

      {/* Bars */}
      {entries.map(([month, count], i) => {
        const barH = Math.max(2, (count / maxVal) * chartH);
        const cx = PAD.left + i * step + step / 2;
        const x = cx - barW / 2;
        const y = PAD.top + chartH - barH;
        const [year, mStr] = month.split('-');
        const monthIdx = parseInt(mStr, 10) - 1;
        const label = `${MONTHS[monthIdx]} ${year}`;

        return (
          <g key={month}>
            {/* Invisible wider hit area — native browser tooltip via <title> child */}
            <rect x={PAD.left + i * step} y={PAD.top} width={step} height={chartH} fill="transparent">
              <title>{`${label}: ${count} ${count !== 1 ? 'avaliações' : 'avaliação'}`}</title>
            </rect>
            <rect x={x} y={y} width={barW} height={barH} rx="3" fill="#1f6bff" opacity="0.9">
              <title>{`${label}: ${count} ${count !== 1 ? 'avaliações' : 'avaliação'}`}</title>
            </rect>
            {barH > 16 && (
              <text x={cx} y={y + barH - 4} textAnchor="middle" fontSize="8" fill="#eaf2ff" fontWeight="500">
                {count}
              </text>
            )}
            {/* Month initial under every bar */}
            <text x={cx} y={H - PAD.bottom + 13} textAnchor="middle" fontSize="9" fill="rgba(234,242,255,.5)">
              {MONTHS[monthIdx][0]}
            </text>
          </g>
        );
      })}

      {/* Axis line */}
      <line x1={PAD.left} y1={PAD.top + chartH} x2={W - PAD.right} y2={PAD.top + chartH} stroke="rgba(77,162,255,.2)" strokeWidth="1" />
    </svg>
  );
}

// ─── Average rating gauge ─────────────────────────────────────────────────────

function RatingGauge({ avg, total }: { avg: number; total: number }) {
  const R = 54, cx = 70, cy = 70;
  const startAngle = -210, endAngle = 30;
  const range = endAngle - startAngle;
  const fillAngle = startAngle + range * (avg / 5);

  function polar(cx: number, cy: number, r: number, deg: number) {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function arc(r: number, from: number, to: number) {
    const s = polar(cx, cy, r, from);
    const e = polar(cx, cy, r, to);
    const large = to - from > 180 ? 1 : 0;
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  }

  const strokeColor = avg >= 4.5 ? '#c2e0ff' : avg >= 4 ? '#4da2ff' : avg >= 3 ? '#f5a524' : '#e5484d';

  // Number + labels are rendered as HTML (not SVG <text>) so they always paint
  // reliably regardless of web-font weight loading quirks in some browsers.
  return (
    <div className="relative w-36 shrink-0">
      <svg viewBox="0 0 140 104" className="w-full h-auto">
        <path d={arc(R, startAngle, endAngle)} fill="none" stroke="rgba(77,162,255,.15)" strokeWidth="10" strokeLinecap="round" />
        <path d={arc(R, startAngle, fillAngle)} fill="none" stroke={strokeColor} strokeWidth="10" strokeLinecap="round" />
      </svg>
      <div
        className="absolute left-0 right-0 flex flex-col items-center pointer-events-none"
        style={{ top: '60%', transform: 'translateY(-50%)' }}
      >
        <span className="nexo-metric font-mono text-2xl leading-none tabular-nums">{avg.toFixed(1)}</span>
        <span className="text-[9px] text-nexo-faint mt-1">de 5</span>
        <span className="text-[9px] text-nexo-faint">{total} {total === 1 ? 'avaliação' : 'avaliações'}</span>
      </div>
    </div>
  );
}

// ─── Goal calculator ──────────────────────────────────────────────────────────

function GoalCalculator({ reviews }: { reviews: Review[] }) {
  const ratings = reviews.map((r) => r.rating?.value ?? 0).filter((v) => v > 0);
  if (ratings.length < 2) return null;

  const n = ratings.length;
  const sum = ratings.reduce((a, b) => a + b, 0);
  const avg = sum / n;

  // Google displays the average rounded to one decimal, rounding the .x5 case
  // DOWN (4.74 → 4.7, 4.75 → 4.7, 4.76 → 4.8). So a value displays as T when it
  // sits in (T − 0.05, T + 0.05]. To make Google *show* a target rating you only
  // need the true average to cross that lower threshold (T − 0.05) — not to
  // literally reach T. Pre-round to kill float noise on the .x5 boundary.
  const displayedTenths = Math.ceil(Math.round(avg * 1000) / 100 - 0.5); // current rating ×10, as Google shows it
  const displayed = displayedTenths / 10;

  // Displayed milestones strictly above the current displayed rating, up to 5.0.
  const targetsTenths: number[] = [];
  for (let t = displayedTenths + 1; t <= 50; t++) {
    targetsTenths.push(t);
  }

  if (targetsTenths.length === 0) return (
    <p className="text-xs text-nexo-dim">Já exibe 5,0★: não há nota mais alta a alcançar.</p>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-nexo-dim">
        Média atual: <strong className="text-nexo-dim">{avg.toFixed(2).replace('.', ',')}★</strong>{' '}
        (o Google mostra <strong className="text-nexo-dim">{displayed.toFixed(1).replace('.', ',')}★</strong>), com base em{' '}
        <strong className="text-nexo-dim">{n}</strong> avaliações coletadas. Supõe que todas as novas avaliações sejam{' '}
        <strong className="text-nexo-dim">5★</strong>; as contagens alcançam a nota que o Google exibiria.
      </p>

      <div className="overflow-x-auto rounded-nexo-lg border border-nexo-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/[0.02] border-b border-nexo-border">
              <th className="nexo-label text-left px-4 py-2.5">Nota alvo</th>
              <th className="nexo-label text-right px-4 py-2.5">Avaliações 5★ necessárias</th>
              <th className="nexo-label text-right px-4 py-2.5 hidden sm:table-cell">Total de avaliações depois</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-nexo-border">
            {targetsTenths.map((t) => {
              const target = t / 10;
              // Min true average that still displays as `target` is just above (target − 0.05).
              const threshold = (t - 0.5) / 10;
              // Need (sum + 5k) / (n + k) > threshold  ⇒  k > (threshold·n − sum) / (5 − threshold).
              const raw = (threshold * n - sum) / (5 - threshold);
              const needed = Math.max(0, Math.floor(raw + 1e-9) + 1);
              // Colour-code by how many are needed
              const easy = needed <= 10;
              const medium = needed <= 50;
              return (
                <tr key={t} className="hover:bg-white/[0.04] transition-colors">
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-nexo-text">{target.toFixed(1).replace('.', ',')}</span>
                    <span className="text-nexo-warn-text ml-1">★</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`font-medium tabular-nums text-base ${easy ? 'text-nexo-ice' : medium ? 'text-nexo-sky' : 'text-nexo-dim'}`}>
                      {needed > 0 ? needed.toLocaleString('pt-BR') : '0'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-nexo-faint tabular-nums hidden sm:table-cell">
                    {(n + needed).toLocaleString('pt-BR')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Text with line breaks ────────────────────────────────────────────────────

function TextWithBreaks({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/<br\s*\/?>/gi);
  return (
    <span className={className}>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {part}
        </span>
      ))}
    </span>
  );
}

// ─── Business info card ───────────────────────────────────────────────────────

function BusinessInfoCard({ meta }: { meta: BusinessMeta }) {
  const hasInfo = meta.place_id || meta.category || meta.description || meta.address || meta.phone || meta.website || meta.url || (meta.additional_categories && meta.additional_categories.length > 0);
  if (!hasInfo) return null;

  return (
    <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
      <div className="px-6 py-4 border-b border-nexo-border">
        <h2 className="nexo-label">Dados da empresa</h2>
      </div>
      <div className="px-6 py-5 space-y-3">
        {meta.category && (
          <div className="flex items-start gap-3">
            <span className="nexo-label w-32 shrink-0 pt-0.5">Categoria principal</span>
            <span className="text-sm font-semibold text-nexo-text">{meta.category}</span>
          </div>
        )}
        {meta.additional_categories && meta.additional_categories.length > 0 && (
          <div className="flex items-start gap-3">
            <span className="nexo-label w-32 shrink-0 pt-0.5">Também em</span>
            <div className="flex flex-wrap gap-1.5">
              {meta.additional_categories.map((c, i) => (
                <span key={i} className="text-xs text-nexo-dim bg-nexo-surface-2 border border-nexo-border px-2 py-0.5 rounded-nexo">{c}</span>
              ))}
            </div>
          </div>
        )}
        {meta.description && (
          <div className="flex items-start gap-3">
            <span className="nexo-label w-32 shrink-0 pt-0.5">Descrição</span>
            <p className="text-sm text-nexo-dim leading-relaxed">{meta.description}</p>
          </div>
        )}
        {meta.address && (
          <div className="flex items-start gap-3">
            <span className="nexo-label w-32 shrink-0 pt-0.5">Endereço</span>
            <span className="text-sm text-nexo-dim">{meta.address}</span>
          </div>
        )}
        {meta.phone && (
          <div className="flex items-start gap-3">
            <span className="nexo-label w-32 shrink-0 pt-0.5">Telefone</span>
            <span className="text-sm text-nexo-dim">{meta.phone}</span>
          </div>
        )}
        {(meta.website || meta.url) && (
          <div className="flex items-start gap-3">
            <span className="nexo-label w-32 shrink-0 pt-0.5">Site</span>
            <a href={meta.website ?? meta.url} target="_blank" rel="noopener noreferrer" className="text-sm text-nexo-sky hover:underline truncate max-w-xs">{meta.website ?? meta.url}</a>
          </div>
        )}
        {meta.place_id && (
          <div className="flex items-start gap-3">
            <span className="nexo-label w-32 shrink-0 pt-0.5">Place ID</span>
            <span className="text-xs font-mono text-nexo-dim bg-white/[0.02] border border-nexo-border px-2 py-0.5 rounded select-all">{meta.place_id}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Popular times chart (single day) ────────────────────────────────────────

const DAY_LABELS: Record<string, string> = {
  monday: 'Seg', tuesday: 'Ter', wednesday: 'Qua', thursday: 'Qui',
  friday: 'Sex', saturday: 'Sáb', sunday: 'Dom', today: 'Hoje',
};
const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function PopularTimesDay({ dayKey, hours }: { dayKey: string; hours: PopularHour[] }) {
  if (!hours || hours.length === 0) return null;

  const sorted = [...hours].sort((a, b) => a.hour - b.hour);
  const maxVal = Math.max(...sorted.map((h) => h.value), 1);
  const W = 260, H = 72;
  const PAD = { top: 8, right: 4, bottom: 20, left: 4 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const n = sorted.length;
  const step = chartW / n;
  const barW = Math.max(4, step - 2);

  const peakHour = sorted.reduce((best, h) => h.value > best.value ? h : best, sorted[0]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-1">
        <span className="nexo-label">{DAY_LABELS[dayKey] ?? dayKey}</span>
        {peakHour.value > 0 && (
          <span className="text-[10px] text-nexo-faint">Pico às {peakHour.hour}h</span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: `${H}px` }}>
        {sorted.map((h, i) => {
          const barH = Math.max(2, (h.value / maxVal) * chartH);
          const cx = PAD.left + i * step + step / 2;
          const x = cx - barW / 2;
          const y = PAD.top + chartH - barH;
          const isEvery3 = h.hour % 3 === 0;
          const isPeak = h.hour === peakHour.hour;
          return (
            <g key={h.hour}>
              <rect {...({ x: PAD.left + i * step, y: PAD.top, width: step, height: chartH, fill: 'transparent', title: `${h.hour}h: ${h.value}%` } as React.SVGProps<SVGRectElement>)} />
              <rect x={x} y={y} width={barW} height={barH} rx="2"
                fill={isPeak ? '#c2e0ff' : h.value > 60 ? '#4da2ff' : '#1246b8'}
              />
              {isEvery3 && (
                <text x={cx} y={H - PAD.bottom + 12} textAnchor="middle" fontSize="8" fill="rgba(234,242,255,.5)">{h.hour}</text>
              )}
            </g>
          );
        })}
        <line x1={PAD.left} y1={PAD.top + chartH} x2={W - PAD.right} y2={PAD.top + chartH} stroke="rgba(77,162,255,.2)" strokeWidth="1" />
      </svg>
    </div>
  );
}

function PopularTimesByDaySection({ byDay }: { byDay: Record<string, PopularHour[]> }) {
  const days = DAY_ORDER.filter((d) => byDay[d] && byDay[d].length > 0);
  if (days.length === 0) return null;

  return (
    <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
      <div className="px-6 py-4 border-b border-nexo-border">
        <h2 className="nexo-label">Horários de pico por dia</h2>
        <p className="text-[11px] text-nexo-faint mt-0.5">Passe o mouse sobre uma barra para ver a hora e o nível de movimento.</p>
      </div>
      <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {days.map((day) => (
          <PopularTimesDay key={day} dayKey={day} hours={byDay[day]} />
        ))}
      </div>
    </div>
  );
}

// ─── Task status badge ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ReviewsTask['status'] }) {
  if (status === 'ready') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-widest text-nexo-ice bg-nexo-ice/10 border border-nexo-ice/30 px-2 py-0.5 rounded-nexo">
      <CheckCircle className="w-2.5 h-2.5" /> Pronto
    </span>
  );
  if (status === 'error') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-widest text-nexo-danger-text bg-nexo-danger/10 border border-nexo-danger/40 px-2 py-0.5 rounded-nexo">
      <AlertCircle className="w-2.5 h-2.5" /> Erro
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-widest text-nexo-warn-text bg-nexo-warn/10 border border-nexo-warn/40 px-2 py-0.5 rounded-nexo">
      <Clock className="w-2.5 h-2.5" /> Pendente
    </span>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white/[0.02] rounded-nexo-lg border border-nexo-border px-4 py-3">
      <p className="nexo-label mb-1">{label}</p>
      <p className="text-lg font-medium text-nexo-text">{value}</p>
      {sub && <p className="text-[11px] text-nexo-faint mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

async function GoogleReviewsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const defaultLocation = getSetting('default_location') || 'Brazil';
  const defaultLanguage = getSetting('default_language') || 'Portuguese';
  const brand = getBrandSettings();
  const brandName = brand.name;
  const brandLogoUrl = brand.logo ?? undefined;

  // Auto-poll: check tasks_ready on every load and fetch ready tasks
  if (creds) {
    try {
      const auth = btoa(`${creds.login}:${creds.pass}`);
      const readyRes = await fetch('https://api.dataforseo.com/v3/business_data/google/reviews/tasks_ready', {
        headers: { Authorization: `Basic ${auth}` },
        cache: 'no-store',
      });
      if (readyRes.ok) {
        const readyData = await readyRes.json() as {
          tasks?: Array<{ result?: Array<{ id: string }> }>;
        };
        const readyIds = new Set((readyData?.tasks?.[0]?.result ?? []).map((r) => r.id));

        const pendingTasks = getReviewsTasks().filter((t) => t.status === 'pending');
        for (const pt of pendingTasks) {
          if (!readyIds.has(pt.id)) continue;

          const getRes = await fetch(
            `https://api.dataforseo.com/v3/business_data/google/reviews/task_get/${pt.id}`,
            { headers: { Authorization: `Basic ${auth}` }, cache: 'no-store' },
          );
          if (!getRes.ok) continue;

          const getData = await getRes.json() as {
            cost?: number;
            tasks?: Array<{
              status_code?: number;
              cost?: number;
              result_count?: number;
              result?: Array<{
                items?: Review[];
                items_count?: number;
                total_count?: number;
                place_id?: string;
                cid?: string;
                title?: string;
                category?: string;
                additional_categories?: string[];
                description?: string;
                address?: string;
                phone?: string;
                website?: string;
                url?: string;
                rating?: { value?: number; votes_count?: number };
                popular_times?: PopularHour[];
                popular_times_by_day?: Record<string, PopularHour[]>;
              }>;
            }>;
          };

          const task = getData?.tasks?.[0];
          if (!task || task.status_code !== 20000) continue;

          const resultData = task.result?.[0];
          const items = resultData?.items ?? [];
          const resultCount = resultData?.total_count ?? task.result_count ?? items.length;
          // Prefer task-level cost; fall back to top-level; pass undefined if 0 so COALESCE keeps task_post cost
          const cost = task.cost || getData.cost || undefined;

          const meta: BusinessMeta = {
            place_id: resultData?.place_id,
            cid: resultData?.cid,
            title: resultData?.title,
            category: resultData?.category,
            additional_categories: resultData?.additional_categories,
            description: resultData?.description,
            address: resultData?.address,
            phone: resultData?.phone,
            website: resultData?.website,
            url: resultData?.url,
            rating: resultData?.rating,
            popular_times: resultData?.popular_times,
            popular_times_by_day: resultData?.popular_times_by_day,
            total_count: resultData?.total_count,
          };

          updateReviewsTask(pt.id, 'ready', items, cost, resultCount, meta);
        }
      }
    } catch { /* silently ignore poll errors */ }
  }

  const tasks = getReviewsTasks();
  const activeId = params.id;
  const activeTask = activeId ? tasks.find((t) => t.id === activeId) ?? null : null;
  const reviews: Review[] = activeTask?.status === 'ready' ? (getReviewsTaskResult<Review>(activeTask.id) ?? []) : [];
  const meta: BusinessMeta | null = activeTask?.status === 'ready' ? getReviewsTaskMeta<BusinessMeta>(activeTask.id) : null;

  const reviewFilters = parseReviewFilters({ ...params });
  const filteredReviews = filterReviews(reviews, reviewFilters);

  const ratings = reviews.map((r) => r.rating?.value ?? 0).filter((v) => v > 0);
  const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  const fiveStarPct = ratings.length > 0 ? ((ratings.filter((v) => v >= 4.5).length / ratings.length) * 100).toFixed(0) : null;
  const positivePct = ratings.length > 0 ? ((ratings.filter((v) => v >= 4).length / ratings.length) * 100).toFixed(0) : null;
  const ownerRepliedCount = reviews.filter((r) => r.owner_answer).length;
  const ownerReplyPct = reviews.length > 0 ? ((ownerRepliedCount / reviews.length) * 100).toFixed(0) : null;

  const reviewsCsvData = reviews.slice(0, 100).map((r) => ({
    date: r.timestamp ?? r.time_ago ?? '',
    rating: r.rating?.value ?? '',
    author: r.profile_name ?? '',
    local_guide: r.local_guide ? 'sim' : 'não',
    review: (r.review_text ?? '').replace(/<br\s*\/?>/gi, ' '),
    owner_response: (r.owner_answer ?? '').replace(/<br\s*\/?>/gi, ' '),
  }));
  const reviewsCsvColumns = [
    { key: 'date', label: 'Data' },
    { key: 'rating', label: 'Nota' },
    { key: 'author', label: 'Autor' },
    { key: 'local_guide', label: 'Local Guide' },
    { key: 'review', label: 'Avaliação' },
    { key: 'owner_response', label: 'Resposta do proprietário' },
  ];
  const reviewsExcelData = reviews.map((r) => ({
    date: r.timestamp ?? r.time_ago ?? '', rating: r.rating?.value ?? '', author: r.profile_name ?? '',
    local_guide: r.local_guide ? 'Sim' : 'Não', author_review_count: r.reviews_count ?? '',
    review: (r.review_text ?? '').replace(/<br\s*\/?>/gi, '\n'),
    owner_response: (r.owner_answer ?? '').replace(/<br\s*\/?>/gi, '\n'), owner_reply_date: r.owner_time_ago ?? '',
  }));
  const reviewFileStem = (activeTask?.business || 'reviews').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  const distributionRows = [5, 4, 3, 2, 1].map((stars) => {
    const count = ratings.filter((value) => value >= stars - 0.5 && value < stars + 0.5).length;
    return [`${stars} ${stars === 1 ? 'estrela' : 'estrelas'}`, `${count} (${ratings.length ? Math.round((count / ratings.length) * 100) : 0}%)`] as [string, string];
  });

  const pendingCount = tasks.filter((t) => t.status === 'pending').length;

  const replies = replyMetrics(reviews);
  const metaPlaceId = parsePlaceId(meta?.place_id);
  const metaCid = parseCid(meta?.cid);
  const activeListingKey = activeTask ? listingKey({ placeId: metaPlaceId, cid: metaCid, keyword: activeTask.business, location: activeTask.location }) : null;
  const monitored = activeListingKey ? findMonitoredByKey(activeListingKey) : null;

  const historyItems = tasks.map((t) => {
    const isActive = t.id === activeId;
    return (
      <a
        key={t.id}
        href={t.status === 'ready' ? `/dashboard/google-reviews?id=${t.id}` : '#'}
        className={`flex items-start gap-3 px-5 py-3.5 transition-colors ${
          isActive ? 'bg-nexo-blue/10' : t.status === 'ready' ? 'hover:bg-white/[0.04] cursor-pointer' : 'cursor-default'
        }`}
      >
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>
            {t.business}
          </p>
          <p className="text-[11px] text-nexo-faint mt-0.5">
            {t.location} · {t.language} · {t.depth} avaliações · {formatDate(t.ts)}
            {t.resultCount ? ` · ${t.resultCount} ${t.resultCount === 1 ? 'resultado' : 'resultados'}` : ''}
            {t.cost !== undefined ? ` · US$ ${t.cost.toFixed(5).replace('.', ',')}` : ''}
          </p>
        </div>
        <StatusBadge status={t.status} />
      </a>
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="nexo-h1">Avaliações do Google</h1>
        <p className="text-sm text-nexo-faint mt-1">Analise as avaliações de uma empresa: distribuição, tendência mensal e metas de nota.</p>
      </div>

      {!creds && (
        <div className="bg-nexo-warn/10 border border-nexo-warn/40 text-nexo-warn-text text-sm rounded-nexo-lg px-4 py-3">
          Credenciais da DataForSEO ausentes. Configure-as em{' '}
          <a href="/dashboard/settings" className="underline font-semibold">Configurações</a>.
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-6">
      {/* Form */}
      <form action={submitReviewsTaskAction} className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="nexo-label block mb-1.5">Nome da empresa</label>
            <input
              type="text"
              name="keyword"
              required
              placeholder="ex.: Padaria Pão Quente São Paulo"
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
            />
          </div>
          <div>
            <label className="nexo-label block mb-1.5">Local</label>
            <LocationPicker
              name="location"
              defaultValue={defaultLocation}
              placeholder="ex.: Brazil, São Paulo"
              className="w-full px-4 py-2.5 border border-nexo-border rounded-nexo-lg text-sm text-nexo-text placeholder-white/30 bg-nexo-surface focus:outline-none focus:ring-2 focus:ring-nexo-sky"
            />
          </div>
          <div>
            <label className="nexo-label block mb-1.5">Idioma</label>
            <input
              type="text"
              name="language"
              defaultValue={defaultLanguage}
              placeholder="ex.: Portuguese"
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
            />
          </div>
          <div>
            <label className="nexo-label block mb-1.5">Profundidade</label>
            <select
              name="depth"
              defaultValue="100"
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
            >
              <option value="50">50 avaliações</option>
              <option value="100">100 avaliações</option>
              <option value="200">200 avaliações</option>
              <option value="500">500 avaliações</option>
            </select>
          </div>
          <div>
            <label className="nexo-label block mb-1.5">Ordenar por</label>
            <select
              name="sort_by"
              defaultValue="newest"
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
            >
              <option value="newest">Mais recentes</option>
              <option value="relevant">Mais relevantes</option>
              <option value="highest_rating">Nota mais alta</option>
              <option value="lowest_rating">Nota mais baixa</option>
            </select>
          </div>
        </div>
        <PendingButton
          type="submit"
          disabled={!creds}
          className="nexo-label w-full bg-white text-nexo-bg py-2.5 rounded-nexo-lg hover:bg-nexo-ice transition-colors disabled:opacity-40"
          pendingChildren="Enviando tarefa…"
          pendingClassName="w-full bg-white/30 text-white font-medium uppercase tracking-widest text-xs py-2.5 rounded-nexo-lg cursor-not-allowed"
        >
          Buscar avaliações
        </PendingButton>
      </form>

      {/* Pending indicator */}
      {pendingCount > 0 && (
        <div className="bg-nexo-warn/10 border border-nexo-warn/40 rounded-nexo-lg px-4 py-3 flex items-center gap-3 text-sm text-nexo-warn-text">
          <svg className="animate-spin w-4 h-4 shrink-0 text-nexo-warn-text" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span>
            <strong>{pendingCount}</strong> {pendingCount > 1 ? 'tarefas sendo processadas' : 'tarefa sendo processada'} pela DataForSEO.
            Recarregue a página para ver o andamento.
          </span>
        </div>
      )}

      {/* Results */}
      {activeTask && activeTask.status === 'ready' && reviews.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 border-y border-nexo-border py-3">
            <p className="nexo-label">Exportar relatório de reputação</p>
            <div className="flex items-center gap-3">
              <ReportPdfExportButton brandName={brandName} brandLogoUrl={brandLogoUrl} brandColor={brand.color} brandFooter={brand.footer} brandStyle={brand} filename={`${reviewFileStem}-reputation-report.pdf`}
                title="Relatório de avaliações do Google" subject={meta?.title || activeTask.business} generatedAt={activeTask.ts}
                metrics={[
                  { label: 'Nota média', value: avgRating?.toFixed(2).replace('.', ',') ?? '—', detail: 'de 5 estrelas' },
                  { label: 'Avaliações analisadas', value: String(reviews.length), detail: meta?.total_count ? `${meta.total_count} disponíveis` : undefined },
                  { label: 'Avaliações positivas', value: positivePct !== null ? `${positivePct}%` : '—', detail: '4 estrelas ou mais' },
                  { label: 'Respostas do proprietário', value: ownerReplyPct !== null ? `${ownerReplyPct}%` : '—', detail: `${ownerRepliedCount} ${ownerRepliedCount === 1 ? 'resposta' : 'respostas'}` },
                ]}
                sections={[
                  { title: 'Distribuição das notas', rows: distributionRows },
                  { title: 'Dados da empresa', rows: [[ 'Categoria', meta?.category ?? '—' ], [ 'Endereço', meta?.address ?? '—' ], [ 'Site', meta?.website ?? '—' ]].filter((row) => row[1] !== '—') as Array<[string, string]> },
                ]} />
              <ExportExcelButton filename={`${reviewFileStem}-reviews.xls`} sheets={[{
                name: 'Avaliações', columns: [
                  { key: 'date', label: 'Data' }, { key: 'rating', label: 'Nota' }, { key: 'author', label: 'Autor' },
                  { key: 'local_guide', label: 'Local Guide' }, { key: 'author_review_count', label: 'Avaliações do autor' },
                  { key: 'review', label: 'Avaliação' }, { key: 'owner_response', label: 'Resposta do proprietário' }, { key: 'owner_reply_date', label: 'Data da resposta do proprietário' },
                ], data: reviewsExcelData,
              }]} />
              <DownloadCsvButton reviews={reviews} filename={`${reviewFileStem}-reviews.csv`} />
            </div>
          </div>
          {/* Summary stats */}
          <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6">
            <div className="flex items-center gap-6 flex-wrap">
              {avgRating !== null && (
                <div className="shrink-0">
                  <RatingGauge avg={avgRating} total={reviews.length} />
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1 min-w-0">
                <StatCard label="Avaliações coletadas" value={reviews.length.toString()} />
                {avgRating !== null && (
                  <StatCard label="Nota média" value={avgRating.toFixed(2).replace('.', ',')} sub="de 5 estrelas" />
                )}
                {fiveStarPct !== null && (
                  <StatCard label="Avaliações 5★" value={`${fiveStarPct}%`} sub="4,5+ estrelas" />
                )}
                {positivePct !== null && (
                  <StatCard label="Positivas" value={`${positivePct}%`} sub="4+ estrelas" />
                )}
                {ownerReplyPct !== null && (
                  <StatCard label="Respostas do proprietário" value={`${ownerReplyPct}%`} sub={`${ownerRepliedCount} de ${reviews.length}`} />
                )}
                {activeTask.cost !== undefined && (
                  <StatCard label="Custo da API" value={`US$ ${activeTask.cost.toFixed(5).replace('.', ',')}`} />
                )}
              </div>
            </div>
          </div>

          {/* Owner replies */}
          <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
            <div className="px-6 py-4 border-b border-nexo-border">
              <h2 className="nexo-label">Respostas do proprietário</h2>
              <p className="text-[11px] text-nexo-faint mt-0.5">Calculado sobre as {reviews.length} avaliações coletadas nesta busca.</p>
            </div>
            <div className="px-6 py-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Taxa de resposta" value={replies.replyRate !== null ? `${replies.replyRate.toLocaleString('pt-BR')}%` : '—'} sub={`${replies.answered} de ${replies.total}`} />
              <StatCard label="Tempo mediano até responder" value={formatReplyDelay(replies.medianReplyHours)} sub={replies.timedReplies ? `${replies.timedReplies} ${replies.timedReplies === 1 ? 'resposta com data' : 'respostas com data'}` : 'sem datas de resposta'} />
              <StatCard label="Negativas sem resposta" value={String(replies.unansweredNegatives)} sub={`de ${replies.negatives} com 1 a 3 estrelas${replies.negativeReplyRate !== null ? ` · ${replies.negativeReplyRate.toLocaleString('pt-BR')}% respondidas` : ''}`} />
              <StatCard label="Tempo para zerar as pendentes" value={formatDuration(replies.backlogMinutes)} sub={`estimativa: ${MINUTES_PER_REPLY} min por resposta`} />
            </div>
            {replies.unansweredNegatives > 0 && (
              <div className="px-6 pb-5">
                <a href={`/dashboard/google-reviews?id=${activeTask.id}&nota=negativas&resposta=sem-resposta`} className="nexo-section hover:text-white">Ver as negativas sem resposta</a>
              </div>
            )}
          </div>

          {/* Monitoring and review requests */}
          <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-6 py-5 flex flex-col lg:flex-row gap-5 lg:items-end justify-between">
            {monitored ? (
              <p className="text-sm text-nexo-dim">
                Perfil monitorado ({monitored.frequency === 'diaria' ? 'diariamente' : 'semanalmente'}).{' '}
                <a href="/dashboard/monitor-de-avaliacoes" className="nexo-section hover:text-white">Abrir o monitor</a>
              </p>
            ) : (
              <form action={monitorFromTaskAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="task_id" value={activeTask.id} />
                <label className="block">
                  <span className="nexo-label block mb-1.5">Monitorar este perfil</span>
                  <select name="frequency" defaultValue="semanal" className="nexo-input px-3 py-2 text-sm">
                    {FREQUENCIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <PendingButton type="submit" className="nexo-btn-ghost px-3 py-2.5" pendingChildren="Salvando…">Monitorar</PendingButton>
                <p className="text-[11px] text-nexo-faint w-full">
                  Atualização automática com alerta por e-mail para avaliações novas de até 3 estrelas. Estimativa: {estimateMonthlyUsd('semanal', defaultDepth('semanal')).toLocaleString('pt-BR', { style: 'currency', currency: 'USD', minimumFractionDigits: 4 })} por mês (semanal) ou {estimateMonthlyUsd('diaria', defaultDepth('diaria')).toLocaleString('pt-BR', { style: 'currency', currency: 'USD', minimumFractionDigits: 4 })} (diária), respeitando o teto mensal. As avaliações desta busca viram a base, sem custo.
                  {!metaPlaceId && !metaCid && ' Sem place ID nem CID, a atualização busca pelo nome da empresa.'}
                </p>
              </form>
            )}
            {(metaPlaceId || metaCid) && (
              <a href={`/dashboard/pedido-de-avaliacao?tarefa=${activeTask.id}`} className="nexo-btn-accent px-3 py-2 shrink-0 text-center">Kit de pedido de avaliação</a>
            )}
          </div>

          {/* Business info */}
          {meta && <BusinessInfoCard meta={meta} />}

          {/* Distribution */}
          <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
            <div className="px-6 py-4 border-b border-nexo-border">
              <h2 className="nexo-label">Distribuição das notas</h2>
            </div>
            <div className="px-6 py-5">
              <DistributionChart reviews={reviews} />
            </div>
          </div>

          {/* Monthly chart */}
          <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
            <div className="px-6 py-4 border-b border-nexo-border">
              <h2 className="nexo-label">Avaliações por mês</h2>
              <p className="text-[11px] text-nexo-faint mt-0.5">Passe o mouse sobre uma barra para ver o mês e a contagem exata.</p>
            </div>
            <div className="px-6 py-4">
              <MonthlyChart reviews={reviews} />
            </div>
          </div>

          {/* Popular times by day */}
          {meta?.popular_times_by_day && <PopularTimesByDaySection byDay={meta.popular_times_by_day} />}

          {/* Popular times (current/live single snapshot) */}
          {meta?.popular_times && meta.popular_times.length > 0 && !meta.popular_times_by_day && (
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
              <div className="px-6 py-4 border-b border-nexo-border">
                <h2 className="nexo-label">Horários de pico</h2>
              </div>
              <div className="px-6 py-5">
                <PopularTimesDay dayKey="today" hours={meta.popular_times} />
              </div>
            </div>
          )}

          {/* Goal calculator */}
          <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
            <div className="px-6 py-4 border-b border-nexo-border">
              <h2 className="nexo-label">Meta de nota</h2>
              <p className="text-[11px] text-nexo-faint mt-0.5">Avaliações 5★ necessárias para cada aumento de 0,1.</p>
            </div>
            <div className="px-6 py-5">
              <GoalCalculator reviews={reviews} />
            </div>
          </div>

          {/* Reviews list */}
          <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
            <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between gap-3">
              <h2 className="nexo-label">Avaliações</h2>
              <div className="flex items-center gap-4">
                <span className="text-xs text-nexo-faint">{reviews.length} {reviews.length === 1 ? 'coletada' : 'coletadas'}</span>
                <CopyMarkdownButton data={reviewsCsvData} columns={reviewsCsvColumns} />
                <DownloadCsvButton
                  reviews={reviews}
                  filename={`${(activeTask.business || 'reviews').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()}-reviews.csv`}
                />
              </div>
            </div>
            <ReviewFiltersForm taskId={activeTask.id} filters={reviewFilters} shown={filteredReviews.length} total={reviews.length} />
            <div className="divide-y divide-nexo-border">
              {filteredReviews.length === 0 && (
                <div className="px-6 py-8 text-center text-sm text-nexo-faint">Nenhuma avaliação com estes filtros.</div>
              )}
              {filteredReviews.slice(0, 100).map((r, i) => (
                <div key={i} className="px-6 py-4 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.rating?.value !== undefined && <StarRow value={r.rating.value} />}
                    <span className="text-xs font-semibold text-nexo-dim">{r.profile_name ?? 'Anônimo'}</span>
                    {r.local_guide && (
                      <span className="nexo-section bg-nexo-blue/10 border border-nexo-border-strong px-1.5 py-0.5 rounded">
                        Local Guide
                      </span>
                    )}
                    {r.timestamp && (
                      <span className="text-[11px] text-nexo-faint ml-auto">{formatDateTime(r.timestamp)}</span>
                    )}
                    {!r.timestamp && r.time_ago && (
                      <span className="text-[11px] text-nexo-faint ml-auto">{r.time_ago}</span>
                    )}
                  </div>
                  {r.review_text && (
                    <p className="text-sm text-nexo-dim leading-relaxed">
                      <TextWithBreaks text={r.review_text} />
                    </p>
                  )}
                  {r.owner_answer && (
                    <div className="mt-2 ml-4 pl-3 border-l-2 border-nexo-border-strong">
                      <p className="nexo-section mb-0.5">Resposta do proprietário</p>
                      <p className="text-xs text-nexo-dim leading-relaxed">
                        <TextWithBreaks text={r.owner_answer} />
                      </p>
                    </div>
                  )}
                </div>
              ))}
              {filteredReviews.length > 100 && (
                <div className="px-6 py-4 text-center text-xs text-nexo-faint">
                  {filteredReviews.length - 100} avaliações a mais não exibidas. Use os filtros para encontrar as outras.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTask && activeTask.status === 'pending' && (
        <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-6 py-10 text-center text-sm text-nexo-faint">
          A tarefa está sendo processada pela DataForSEO. Recarregue a página em alguns segundos.
        </div>
      )}
        </div>

        {tasks.length > 0 && (
          <HistorySidebar title="Histórico" items={historyItems} />
        )}
      </div>
    </div>
  );
}

export default withProjectScope(GoogleReviewsPage);
