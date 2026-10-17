'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { saveInactivePointsAction } from '@/app/dashboard/grid-points/actions';
import { generateGridCoords } from '@/app/dashboard/local-finder/grid-api';
import { pointKey } from './metrics';
import { PRICE_PER_POINT_USD } from './estimate';

type Props = {
  center: string;
  gridSize: number;
  spacingKm: number;
  inactive: string[];
};

const COLORS = { active: '#2563eb', inactive: '#94a3b8', selected: '#f97316' };

function markerHtml(state: 'active' | 'inactive', selected: boolean, isCenter: boolean): string {
  const fill = state === 'active' ? COLORS.active : '#e2e8f0';
  const ring = selected ? `0 0 0 3px ${COLORS.selected}` : '0 0 0 2px #fff';
  const glyph = selected ? '✓' : state === 'inactive' ? '✕' : '';
  const color = state === 'active' || selected ? '#fff' : '#64748b';
  const background = selected ? COLORS.selected : fill;
  const border = isCenter ? 'border:2px dashed #fff;' : '';
  return `<div style="width:26px;height:26px;border-radius:9999px;background:${background};box-shadow:${ring},0 1px 3px rgba(0,0,0,.35);${border}display:flex;align-items:center;justify-content:center;color:${color};font:900 13px/1 system-ui;cursor:pointer">${glyph}</div>`;
}

/**
 * Gallery-style selection: tap points to select them, then confirm from the floating bar,
 * which stays on screen wherever the page is scrolled.
 */
export default function GridPointSelector({ center, gridSize, spacingKm, inactive }: Props) {
  const [state, formAction, pending] = useActionState(saveInactivePointsAction, undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const inactiveSet = useMemo(() => new Set(inactive), [inactive]);
  const [lat, lng] = center.split(',').map(Number);
  const coords = useMemo(() => generateGridCoords(lat, lng, gridSize, spacingKm), [lat, lng, gridSize, spacingKm]);
  const half = Math.floor(gridSize / 2);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const layerRef = useRef<import('leaflet').LayerGroup | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // A confirmed change ends the selection, like a photo gallery after deleting.
  useEffect(() => {
    if (state?.savedAt) setSelected(new Set());
  }, [state?.savedAt]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let mounted = true;
    import('leaflet').then((L) => {
      if (!mounted || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current, { zoomControl: true });
      mapRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
        // Keep the Referer that OSM's tile usage policy asks for behind strict proxies (see MapPicker).
        referrerPolicy: 'strict-origin-when-cross-origin',
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      map.fitBounds(L.latLngBounds(coords.map((coord) => [coord.lat, coord.lng] as [number, number])).pad(0.15));
      setMapReady(true);
    });
    return () => {
      mounted = false;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  // The grid geometry is fixed for this page; markers are redrawn below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = layerRef.current;
    if (!mapReady || !L || !layer) return;
    layer.clearLayers();
    for (const coord of coords) {
      const key = pointKey(coord);
      const isSelected = selected.has(key);
      const icon = L.divIcon({
        html: markerHtml(inactiveSet.has(key) ? 'inactive' : 'active', isSelected, coord.row === half && coord.col === half),
        className: '', iconSize: [26, 26], iconAnchor: [13, 13],
      });
      L.marker([coord.lat, coord.lng], { icon, keyboard: false, title: `Row ${coord.row + 1}, column ${coord.col + 1}` })
        .on('click', () => setSelected((current) => {
          const next = new Set(current);
          if (next.has(key)) next.delete(key); else next.add(key);
          return next;
        }))
        .addTo(layer);
    }
  }, [mapReady, coords, selected, inactiveSet, half]);

  const selectedActive = [...selected].filter((key) => !inactiveSet.has(key));
  const selectedInactive = [...selected].filter((key) => inactiveSet.has(key));
  const total = gridSize * gridSize;
  const wouldDisableAll = inactiveSet.size + selectedActive.length >= total;

  const nextAfterTurnOff = JSON.stringify([...inactiveSet, ...selectedActive]);
  const nextAfterTurnOn = JSON.stringify([...inactiveSet].filter((key) => !selected.has(key)));

  return (
    <div>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossOrigin="" />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: COLORS.active }} /> Active · {total - inactiveSet.size}</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border border-slate-300 bg-slate-200" /> Off · {inactiveSet.size}</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: COLORS.selected }} /> Selected</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest">
          <button type="button" onClick={() => setSelected(new Set(coords.map(pointKey).filter((key) => !inactiveSet.has(key))))} className="text-blue-600 hover:text-blue-800 dark:text-blue-400">Select all active</button>
          {inactiveSet.size > 0 && (
            <button type="button" onClick={() => setSelected(new Set(inactiveSet))} className="text-blue-600 hover:text-blue-800 dark:text-blue-400">Select all off</button>
          )}
        </div>
      </div>

      <div ref={containerRef} className="w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800" style={{ height: 'min(70vh, 600px)' }} />

      <p className="mt-2 text-[11px] text-slate-400">
        Tap points to select them. Points that are off are never sent to DataForSEO, which saves about ${(inactiveSet.size * PRICE_PER_POINT_USD.standard).toFixed(4)} per keyword per run (Standard queue).
      </p>
      {state?.savedAt && !pending && selected.size === 0 && (
        <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          Saved. {state.inactive} point{state.inactive === 1 ? ' is' : 's are'} off for every keyword on this grid, starting with the next run.
        </p>
      )}

      {/* Floating confirmation bar: visible whenever something is selected, wherever the page is scrolled. */}
      {selected.size > 0 && (
        <div className="fixed inset-x-4 bottom-4 z-[1100]sm:inset-x-auto sm:right-6 sm:bottom-6" role="region" aria-label="Selection actions">
          <form action={formAction} className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
            <input type="hidden" name="center" value={center} />
            <input type="hidden" name="grid_size" value={gridSize} />
            <input type="hidden" name="spacing_km" value={spacingKm} />
            <span className="mr-1 text-sm font-black tabular-nums text-slate-900 dark:text-white">{selected.size} selected</span>
            <button type="button" onClick={() => setSelected(new Set())} className="rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
              Cancel
            </button>
            {selectedInactive.length > 0 && (
              <button type="submit" name="points" value={nextAfterTurnOn} disabled={pending} className="rounded-xl border border-blue-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-900 dark:text-blue-300">
                Turn on {selectedInactive.length}
              </button>
            )}
            {selectedActive.length > 0 && (
              <button type="submit" name="points" value={nextAfterTurnOff} disabled={pending || wouldDisableAll} title={wouldDisableAll ? 'Keep at least one point active' : undefined} className="rounded-xl bg-orange-500 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-orange-600 disabled:opacity-50">
                {pending ? 'Saving…' : `Turn off ${selectedActive.length}`}
              </button>
            )}
            {state?.error && <p className="w-full text-[11px] font-semibold text-red-600">{state.error}</p>}
            {wouldDisableAll && <p className="w-full text-[11px] text-slate-400">Keep at least one point active.</p>}
          </form>
        </div>
      )}
    </div>
  );
}
