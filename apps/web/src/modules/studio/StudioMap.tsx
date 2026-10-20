'use client';

import { useEffect, useRef, useState } from 'react';
import { RANK_TIERS, rankStyle, rankTier } from '@/lib/rank-scale';
import type { StudioPoint } from './data';

export type StudioView = 'pins' | 'heat' | 'evidence';

interface Props {
  points: StudioPoint[];
  gridSize: number;
  view: StudioView;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Changing it re-fits the map to the grid. */
  resetKey: number;
}

const MONO = 'var(--font-geist-mono),ui-monospace,monospace';

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export function rankLabel(rank: number | null): string {
  return rank === null || rank > 20 ? '20+' : String(rank);
}

function pinHtml(point: StudioPoint, size: number, selected: boolean): string {
  const style = rankStyle(point.rank);
  const background = style.border ? `linear-gradient(${style.fill},${style.fill}),rgba(3,5,8,.72)` : style.fill;
  const border = selected ? '2px solid #ffffff' : style.border || '1.5px solid rgba(3,5,8,0.55)';
  const label = rankLabel(point.rank);
  const font = label.length > 2 ? Math.round(size * 0.36) : Math.round(size * 0.44);
  return `<div style="box-sizing:border-box;width:${size}px;height:${size}px;border-radius:50%;background:${background};border:${border};color:${style.text};display:flex;align-items:center;justify-content:center;font:500 ${font}px ${MONO};box-shadow:${style.glow || '0 1px 4px rgba(0,0,0,0.45)'};cursor:pointer">${label}</div>`;
}

function evidenceHtml(point: StudioPoint): string {
  const items = point.topThree.map((name, index) => `<div style="display:flex;gap:8px;padding:3px 0"><span style="font-family:${MONO};color:#4da2ff;min-width:14px">${index + 1}</span><span>${escapeHtml(name)}</span></div>`).join('');
  return `<div style="font-family:var(--font-geist-sans),system-ui,sans-serif;font-size:12px;min-width:200px">
    <p style="margin:0 0 6px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:rgba(234,242,255,.45)">Ponto ${escapeHtml(point.id)} · posição ${rankLabel(point.rank)}</p>
    <p style="margin:0 0 6px;color:#c2e0ff">${escapeHtml(point.topResult)}</p>
    ${items}
  </div>`;
}

/** Pin diameter in px; dense grids get smaller pins so they do not overlap. */
function pinSize(gridSize: number): number {
  return gridSize <= 7 ? 30 : gridSize <= 11 ? 24 : gridSize <= 15 ? 19 : 16;
}

export default function StudioMap({ points, gridSize, view, selectedId, onSelect, resetKey }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const layerRef = useRef<import('leaflet').LayerGroup | null>(null);
  const heatRef = useRef<import('leaflet').Layer | null>(null);
  const fittedRef = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let mounted = true;
    import('leaflet').then((L) => {
      if (!mounted || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: true }).setView([30.2497, -97.7491], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
        crossOrigin: true,
        // Same as GridMap: keep the Referer that OSM's tile usage policy asks for behind strict proxies.
        referrerPolicy: 'strict-origin-when-cross-origin',
      }).addTo(map);
      mapRef.current = map;
      leafletRef.current = L;
      layerRef.current = L.layerGroup().addTo(map);
      setReady(true);
    });
    return () => {
      mounted = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer || points.length === 0) return;

    layer.clearLayers();
    if (heatRef.current) {
      map.removeLayer(heatRef.current);
      heatRef.current = null;
    }

    if (view === 'heat') {
      // Radial blobs on one canvas: brighter where the business ranks higher.
      const Heat = L.Layer.extend({
        onAdd(this: { _canvas: HTMLCanvasElement; _map: import('leaflet').Map; _draw: () => void }, m: import('leaflet').Map) {
          this._map = m;
          this._canvas = L.DomUtil.create('canvas', 'studio-heat') as HTMLCanvasElement;
          this._canvas.style.pointerEvents = 'none';
          m.getPanes().overlayPane.appendChild(this._canvas);
          m.on('moveend zoomend resize viewreset', this._draw, this);
          this._draw();
        },
        onRemove(this: { _canvas: HTMLCanvasElement; _draw: () => void }, m: import('leaflet').Map) {
          m.off('moveend zoomend resize viewreset', this._draw, this);
          L.DomUtil.remove(this._canvas);
        },
        _draw(this: { _canvas: HTMLCanvasElement; _map: import('leaflet').Map }) {
          const m = this._map;
          const topLeft = m.containerPointToLayerPoint([0, 0]);
          const size = m.getSize();
          const ratio = window.devicePixelRatio || 1;
          this._canvas.width = Math.round(size.x * ratio);
          this._canvas.height = Math.round(size.y * ratio);
          this._canvas.style.width = `${size.x}px`;
          this._canvas.style.height = `${size.y}px`;
          L.DomUtil.setPosition(this._canvas, topLeft);
          const ctx = this._canvas.getContext('2d');
          if (!ctx) return;
          ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
          ctx.clearRect(0, 0, size.x, size.y);
          ctx.globalCompositeOperation = 'lighter';
          for (const point of points) {
            const p = m.latLngToLayerPoint([point.lat, point.lng]);
            const x = p.x - topLeft.x;
            const y = p.y - topLeft.y;
            const radius = point.rank === null ? 30 : Math.max(20, 46 - point.rank * 1.5);
            const [r, g, b] = RANK_TIERS[rankTier(point.rank)].pdfFill;
            const alpha = point.rank === null ? 0.18 : 0.75;
            const gradient = ctx.createRadialGradient(x, y, 1, x, y, radius);
            gradient.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
            gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
          }
        },
      });
      heatRef.current = new Heat().addTo(map);
    } else {
      const size = pinSize(gridSize);
      for (const point of points) {
        const selected = point.id === selectedId;
        const px = selected ? size + 6 : size;
        const icon = L.divIcon({ html: pinHtml(point, px, selected), className: '', iconSize: [px, px], iconAnchor: [px / 2, px / 2] });
        const marker = L.marker([point.lat, point.lng], { icon, zIndexOffset: selected ? 1000 : 0 }).addTo(layer);
        marker.on('click', () => onSelectRef.current(point.id));
        if (view === 'evidence') marker.bindPopup(evidenceHtml(point), { className: 'studio-popup', maxWidth: 260 });
      }
    }

    const signature = `${points.length}:${points[0].id}:${points[0].lat}:${resetKey}`;
    if (fittedRef.current !== signature) {
      fittedRef.current = signature;
      map.fitBounds(L.latLngBounds(points.map((point) => [point.lat, point.lng] as [number, number])), { padding: [32, 32], maxZoom: 15 });
    }
  }, [ready, points, gridSize, view, selectedId, resetKey]);

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossOrigin="" />
      <style>{`
        .studio-popup .leaflet-popup-content-wrapper { border-radius: 6px; background: #06090f; color: #eaf2ff; border: 1px solid rgba(77,162,255,0.35); box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
        .studio-popup .leaflet-popup-tip { background: #06090f; border: 1px solid rgba(77,162,255,0.35); }
        .studio-popup a.leaflet-popup-close-button { color: rgba(234,242,255,0.6); }
      `}</style>
      <div ref={containerRef} className="h-115 w-full overflow-hidden rounded-nexo-lg border border-nexo-border sm:h-135" aria-label="Mapa interativo de posições no Google Maps" />
    </>
  );
}
