type OrganicMetrics = {
  count?: number;
  pos_1?: number;
  pos_2_3?: number;
  pos_4_10?: number;
  pos_11_20?: number;
  pos_21_30?: number;
  pos_31_40?: number;
  pos_41_50?: number;
  pos_51_60?: number;
  pos_61_70?: number;
  pos_71_80?: number;
  pos_81_90?: number;
  pos_91_100?: number;
};

type Point = {
  year: number;
  month: number;
  metrics: { organic?: OrganicMetrics };
};

type Band = {
  key: string;
  label: string;
  color: string;
  value: (metrics: OrganicMetrics) => number;
};

const bands: Band[] = [
  { key: 'top-1', label: '#1', color: '#eaf2ff', value: (m) => m.pos_1 ?? 0 },
  { key: 'top-3', label: '#2–3', color: '#c2e0ff', value: (m) => m.pos_2_3 ?? 0 },
  { key: 'top-10', label: '#4–10', color: '#4da2ff', value: (m) => m.pos_4_10 ?? 0 },
  { key: 'top-20', label: '#11–20', color: '#1f6bff', value: (m) => m.pos_11_20 ?? 0 },
  { key: 'top-50', label: '#21–50', color: '#1246b8', value: (m) => (m.pos_21_30 ?? 0) + (m.pos_31_40 ?? 0) + (m.pos_41_50 ?? 0) },
  { key: 'top-100', label: '#51–100', color: '#16305f', value: (m) => (m.pos_51_60 ?? 0) + (m.pos_61_70 ?? 0) + (m.pos_71_80 ?? 0) + (m.pos_81_90 ?? 0) + (m.pos_91_100 ?? 0) },
];

function formatMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function displayPercent(value: number) {
  return `${value >= 10 ? Math.round(value) : value.toFixed(1).replace('.', ',')}%`;
}

function displayVolume(value: number) {
  return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export default function RankDistributionChart({ points }: { points: Point[] }) {
  const width = 820;
  const height = 272;
  const left = 42;
  const right = 52;
  const top = 16;
  const bottom = 34;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const x = (index: number) => points.length === 1 ? left + plotWidth / 2 : left + (index / (points.length - 1)) * plotWidth;
  const y = (value: number) => top + plotHeight * (1 - value / 100);
  const distributions = points.map((point) => {
    const metrics = point.metrics.organic ?? {};
    const counts = bands.map((band) => band.value(metrics));
    // `count` is the API's Top-100 total. Use the sum as a fallback for older
    // cached responses that may not include it, keeping the visual a true 100% split.
    const total = metrics.count || counts.reduce((sum, count) => sum + count, 0);
    return { counts, total, percentages: counts.map((count) => (count / (total || 1)) * 100) };
  });
  const values = distributions.map((distribution) => distribution.percentages);
  const totals = distributions.map((distribution) => distribution.total);
  const maxTotal = Math.max(...totals, 1);
  const volumeY = (value: number) => top + plotHeight * (1 - value / maxTotal);
  const volumePath = totals.map((total, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${volumeY(total).toFixed(1)}`).join(' ');
  const tickIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  const areaPath = (bandIndex: number) => {
    const lower = values.map((pointValues) => pointValues.slice(0, bandIndex).reduce((sum, value) => sum + value, 0));
    const upper = values.map((pointValues, index) => lower[index] + pointValues[bandIndex]);
    const topEdge = upper.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
    const bottomEdge = lower.slice().reverse().map((value, reverseIndex) => `L${x(points.length - 1 - reverseIndex).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
    return `${topEdge} ${bottomEdge} Z`;
  };

  return (
    <section className="bg-nexo-surface border border-nexo-border rounded-nexo-lg p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="nexo-section">Composição da SERP</p>
          <h2 className="mt-1 text-base font-medium tracking-tight text-nexo-text">Distribuição de posições ao longo do tempo</h2>
          <p className="mt-1 text-xs text-nexo-dim">As áreas coloridas mostram a distribuição de posições; a linha azul acompanha o total de palavras-chave ranqueadas.</p>
        </div>
        <div className="flex max-w-md flex-wrap justify-end gap-x-3 gap-y-1.5 text-[10px] font-medium text-nexo-dim">
          <span className="inline-flex items-center gap-1.5 text-nexo-sky"><i className="h-0.5 w-3 bg-nexo-blue" />Palavras-chave ranqueadas</span>
          {bands.map((band) => <span key={band.key} className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm" style={{ backgroundColor: band.color }} />{band.label}</span>)}
        </div>
      </div>

      <div className="mt-5 overflow-x-auto rounded-nexo-lg bg-white/[0.02] p-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[620px] h-auto w-full" role="img" aria-label="Distribuição mensal de posições e total de palavras-chave ranqueadas">
          {[0, 25, 50, 75, 100].map((tick) => (
            <g key={tick}>
              <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} stroke="currentColor" strokeOpacity="0.10" />
              <text x={left - 8} y={y(tick) + 3} textAnchor="end" fontSize="9" fill="currentColor" opacity="0.5">{tick}%</text>
              <text x={width - right + 8} y={y(tick) + 3} textAnchor="start" fontSize="9" fill="currentColor" opacity="0.58">{displayVolume((maxTotal * tick) / 100)}</text>
            </g>
          ))}
          {points.length === 1
            ? bands.map((band, bandIndex) => {
              const lower = values[0].slice(0, bandIndex).reduce((sum, value) => sum + value, 0);
              const upper = lower + values[0][bandIndex];
              return <rect key={band.key} x={x(0) - 34} y={y(upper)} width="68" height={y(lower) - y(upper)} fill={band.color}><title>{`${band.label}: ${displayPercent(values[0][bandIndex])}`}</title></rect>;
            })
            : bands.map((band, index) => <path key={band.key} d={areaPath(index)} fill={band.color} fillOpacity="0.88" stroke="white" strokeOpacity="0.45" strokeWidth="1"><title>{band.label}</title></path>)}
          {totals.length > 1 && <path d={volumePath} fill="none" stroke="#4da2ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
          {points.map((point, index) => {
            const step = points.length > 1 ? plotWidth / (points.length - 1) : 68;
            const leftEdge = Math.max(left, x(index) - step / 2);
            const rightEdge = Math.min(width - right, x(index) + step / 2);
            const tooltip = `${displayVolume(totals[index])} palavras-chave ranqueadas; ${bands.map((band, bandIndex) => `${band.label}: ${displayPercent(values[index][bandIndex])}`).join('; ')}`;
            return (
              <g key={`${point.year}-${point.month}`}>
                <line x1={x(index)} x2={x(index)} y1={top} y2={height - bottom} stroke="currentColor" strokeOpacity="0.08" />
                <circle cx={x(index)} cy={volumeY(totals[index])} r="3.5" fill="#030508" stroke="#4da2ff" strokeWidth="2" />
                <rect x={leftEdge} y={top} width={rightEdge - leftEdge} height={plotHeight} fill="transparent"><title>{`${formatMonth(point.year, point.month)} — ${tooltip}`}</title></rect>
              </g>
            );
          })}
          {tickIndexes.map((index) => <text key={index} x={x(index)} y={height - 11} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} fontSize="9" fill="currentColor" opacity="0.58">{formatMonth(points[index].year, points[index].month)}</text>)}
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[10px] text-nexo-faint"><span>Escala à esquerda: participação por posição.</span><span>Escala à direita: palavras-chave ranqueadas.</span><span>Passe o mouse sobre um mês para ver a distribuição detalhada e o volume.</span></div>
    </section>
  );
}
