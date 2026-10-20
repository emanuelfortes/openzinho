import type { DistanceUnit, GridPreferences, PinStyle } from '@/lib/grid-preferences';
import { rankStyle } from '@/lib/rank-scale';

const UNIT_OPTIONS: { value: DistanceUnit; label: string; detail: string }[] = [
  { value: 'km', label: 'Quilômetros', detail: '0,5 · 1 · 2 · 3 · 5 · 10 km' },
  { value: 'mi', label: 'Milhas', detail: '0,25 · 0,5 · 1 · 2 · 3 · 5 mi' },
];

const PIN_OPTIONS: { value: PinStyle; label: string; detail: string }[] = [
  { value: 'square', label: 'Quadrados', detail: 'Clássico, rótulos maiores' },
  { value: 'circle', label: 'Círculos', detail: 'Arredondados, mais mapa visível' },
  { value: 'dot', label: 'Pontos pequenos', detail: 'Compactos, máximo de mapa visível' },
];

// Sample ranks for the 3×3 preview; the middle one is the grid center.
const PREVIEW = ['2', '5', '12', '4', '3', '9', '18', '24', '—'].map((rank) => ({ rank, style: rankStyle(Number(rank) || null) }));

const PIN_PREVIEW_STYLE: Record<PinStyle, { size: number; radius: string; font: number; ring: string }> = {
  square: { size: 22, radius: '5px', font: 9, ring: '1.5px solid rgba(3,5,8,0.55)' },
  circle: { size: 20, radius: '50%', font: 8, ring: '1.5px solid rgba(3,5,8,0.55)' },
  dot: { size: 14, radius: '50%', font: 6.5, ring: '1px solid rgba(3,5,8,0.55)' },
};

// A faint street pattern so the preview shows how much of the basemap each style leaves visible.
const MAP_BACKGROUND = [
  'linear-gradient(90deg, transparent 47%, #fde68a 47%, #fde68a 53%, transparent 53%)',
  'linear-gradient(0deg, transparent 30%, #ffffff 30%, #ffffff 34%, transparent 34%)',
  'linear-gradient(0deg, transparent 70%, #ffffff 70%, #ffffff 73%, transparent 73%)',
  'linear-gradient(90deg, transparent 18%, #ffffff 18%, #ffffff 21%, transparent 21%)',
  'linear-gradient(90deg, transparent 80%, #ffffff 80%, #ffffff 83%, transparent 83%)',
  'linear-gradient(135deg, #e9efe4 0%, #eef2f6 55%, #e5ecf3 100%)',
].join(', ');

function PinPreview({ style }: { style: PinStyle }) {
  const pin = PIN_PREVIEW_STYLE[style];
  return (
    <div className="grid h-24 place-items-center rounded-nexo-lg border border-nexo-border" style={{ background: MAP_BACKGROUND }} aria-hidden="true">
      <div className="grid grid-cols-3 gap-x-4 gap-y-3">
        {PREVIEW.map((point, index) => (
          <span
            key={index}
            className="grid place-items-center font-mono font-medium"
            style={{
              width: pin.size, height: pin.size, borderRadius: pin.radius, background: point.style.border ? `linear-gradient(${point.style.fill},${point.style.fill}),rgba(3,5,8,.72)` : point.style.fill,
              color: point.style.text, fontSize: pin.font,
              border: index === 4 ? '1.5px dashed rgba(194,224,255,0.9)' : point.style.border || pin.ring,
              boxShadow: point.style.glow || '0 1px 4px rgba(0,0,0,0.3)',
            }}
          >
            {point.rank}
          </span>
        ))}
      </div>
    </div>
  );
}

const cardCls = 'block cursor-pointer rounded-nexo-lg border border-nexo-border bg-nexo-surface p-3 transition-all hover:border-nexo-border peer-checked:border-nexo-sky peer-checked:ring-1 peer-checked:ring-nexo-sky peer-focus-visible:ring-1 peer-focus-visible:ring-nexo-sky';

export default function GridPreferenceFields({ initial }: { initial: GridPreferences }) {
  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="nexo-label ml-1 mb-2">Unidade de distância</legend>
        <div className="grid grid-cols-2 gap-3">
          {UNIT_OPTIONS.map((option) => (
            <label key={option.value} className="relative">
              <input type="radio" name="grid_distance_unit" value={option.value} defaultChecked={initial.distanceUnit === option.value} className="peer sr-only" />
              <span className={cardCls}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-nexo-text">{option.label}</span>
                  <span className="font-mono text-xs font-medium text-nexo-faint">{option.value}</span>
                </span>
                <span className="mt-1 block text-[11px] text-nexo-faint">{option.detail}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 ml-1 text-[11px] text-nexo-faint">As opções de espaçamento, as distâncias e os relatórios em PDF usam esta unidade. Os monitores existentes mantêm a grade exata.</p>
      </fieldset>

      <fieldset>
        <legend className="nexo-label ml-1 mb-2">Estilo dos pinos no mapa</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PIN_OPTIONS.map((option) => (
            <label key={option.value} className="relative">
              <input type="radio" name="grid_pin_style" value={option.value} defaultChecked={initial.pinStyle === option.value} className="peer sr-only" />
              <span className={cardCls}>
                <PinPreview style={option.value} />
                <span className="mt-2.5 block text-sm font-medium text-nexo-text">{option.label}</span>
                <span className="block text-[11px] text-nexo-faint">{option.detail}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 ml-1 text-[11px] text-nexo-faint">A posição #1 mantém a estrela em todos os estilos.</p>
      </fieldset>
    </div>
  );
}
