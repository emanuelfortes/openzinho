'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { saveInactivePointsAction } from '@/app/dashboard/grid-points/actions';
import { generateGridCoords } from '@/app/dashboard/local-finder/grid-api';
import { formatBrl } from '@/modules/custos/budget-shared';
import { pointKey } from './metrics';
import { PRICE_PER_POINT_USD } from './estimate';

type Props = {
  center: string;
  gridSize: number;
  spacingKm: number;
  inactive: string[];
  brlPerUsd: number;
};

const COLORS = { active: '#4da2ff', inactive: 'rgba(77,162,255,0.1)', selected: '#c2e0ff' };

function markerHtml(state: 'active' | 'inactive', selected: boolean, isCenter: boolean): string {
  const background = selected ? COLORS.selected : state === 'active' ? COLORS.active : COLORS.inactive;
  const ring = selected ? '0 0 0 3px #030508, 0 0 14px rgba(194,224,255,0.7)' : '0 0 0 2px #030508';
  const border = state === 'inactive' && !selected ? 'border:1px solid rgba(77,162,255,0.6);' : isCenter ? 'border:2px dashed #030508;' : '';
  const glyph = selected ? '✓' : state === 'inactive' ? '✕' : '';
  const color = selected ? '#030508' : state === 'inactive' ? 'rgba(194,224,255,0.8)' : '#fff';
  return `<div style="width:26px;height:26px;border-radius:9999px;background:${background};box-shadow:${ring};${border}display:flex;align-items:center;justify-content:center;color:${color};font:500 13px/1 ui-monospace,monospace;cursor:pointer">${glyph}</div>`;
}

/** Tap points to select them, then turn them off (or back on) and save. */
export default function GridPointSelector({ center, gridSize, spacingKm, inactive, brlPerUsd }: Props) {
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

  // A saved change ends the selection.
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
      const icon = L.divIcon({
        html: markerHtml(inactiveSet.has(key) ? 'inactive' : 'active', selected.has(key), coord.row === half && coord.col === half),
        className: '', iconSize: [26, 26], iconAnchor: [13, 13],
      });
      L.marker([coord.lat, coord.lng], { icon, keyboard: false, title: `Linha ${coord.row + 1}, coluna ${coord.col + 1}` })
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
  const savingPerRun = inactiveSet.size * PRICE_PER_POINT_USD.standard * brlPerUsd;

  return (
    <div>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossOrigin="" />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs text-nexo-dim">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: COLORS.active }} /> Ativos · <b className="font-mono font-medium text-nexo-ice">{total - inactiveSet.size}</b></span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border border-nexo-sky/60 bg-nexo-blue/10" /> Desligados · <b className="font-mono font-medium text-nexo-ice">{inactiveSet.size}</b></span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: COLORS.selected }} /> Selecionados</span>
        </div>
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => setSelected(new Set(coords.map(pointKey).filter((key) => !inactiveSet.has(key))))} className="nexo-section hover:text-white">Selecionar ativos</button>
          {inactiveSet.size > 0 && (
            <button type="button" onClick={() => setSelected(new Set(inactiveSet))} className="nexo-section hover:text-white">Selecionar desligados</button>
          )}
        </div>
      </div>

      <div ref={containerRef} className="w-full overflow-hidden rounded-nexo-lg border border-nexo-border" style={{ height: 'min(65vh, 560px)' }} />

      <form action={formAction} className="mt-3 flex flex-wrap items-center gap-3">
        <input type="hidden" name="center" value={center} />
        <input type="hidden" name="grid_size" value={gridSize} />
        <input type="hidden" name="spacing_km" value={spacingKm} />
        <span className="font-mono text-sm text-nexo-ice">{selected.size}</span>
        <span className="text-xs text-nexo-dim">{selected.size === 1 ? 'ponto selecionado' : 'pontos selecionados'}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {selected.size > 0 && (
            <button type="button" onClick={() => setSelected(new Set())} className="nexo-btn-ghost px-3 py-2">Limpar seleção</button>
          )}
          <button
            type="submit" name="points" value={JSON.stringify([...inactiveSet].filter((key) => !selected.has(key)))}
            disabled={pending || selectedInactive.length === 0}
            className="nexo-btn-ghost px-3 py-2 disabled:opacity-40"
          >
            Religar {selectedInactive.length || ''}
          </button>
          <button
            type="submit" name="points" value={JSON.stringify([...inactiveSet, ...selectedActive])}
            disabled={pending || selectedActive.length === 0 || wouldDisableAll}
            className="nexo-btn-primary px-4 py-2 disabled:opacity-40"
          >
            {pending ? 'Salvando…' : `Desligar ${selectedActive.length || ''}`}
          </button>
        </div>
      </form>

      {wouldDisableAll && selectedActive.length > 0 && <p className="mt-2 text-xs text-nexo-warn-text">Mantenha pelo menos um ponto ativo.</p>}
      {state?.error && <p className="mt-2 text-xs text-nexo-danger-text">{state.error}</p>}
      {state?.savedAt && !pending && selected.size === 0 && (
        <p className="mt-2 rounded-nexo-lg border border-nexo-ice/30 bg-nexo-ice/10 px-3 py-2 text-xs text-nexo-ice">
          Salvo. {state.inactive} {state.inactive === 1 ? 'ponto fica desligado' : 'pontos ficam desligados'} em todas as palavras-chave desta grade, a partir da próxima varredura.
        </p>
      )}

      <p className="mt-3 text-xs leading-relaxed text-nexo-faint">
        Toque nos pontos que caem no mar, num rio ou num parque. Pontos desligados não são enviados à DataForSEO e saem das métricas,
        o que economiza cerca de {formatBrl(savingPerRun)} por palavra-chave a cada varredura na fila padrão.
      </p>
    </div>
  );
}
