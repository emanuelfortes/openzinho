'use client';

import { useEffect, useRef, useState } from 'react';
import type { GridPoint } from '@/lib/db';
import type { PinStyle } from '@/lib/grid-preferences';
import { RANK_TIERS, rankStyle, rankTier, type RankTierStyle } from '@/lib/rank-scale';
import { competitorKey } from './grid-insights';
import { useGridPreferences } from './GridPreferences';

interface Props {
  points: GridPoint[];
  gridSize: number;
  target: string;
  /** When set, markers show this competitor's rank at each point instead of the target's. */
  highlightKey?: string;
  highlightName?: string;
  /** Previous snapshot, used to show the per-marker movement in timeline mode. */
  previousPoints?: GridPoint[] | null;
  /** A stable DOM id allows the PDF export to capture this exact map. */
  captureId?: string;
}

const MONO = 'var(--font-geist-mono),ui-monospace,monospace';
const GAIN_COLOR = '#c2e0ff';
const LOSS_COLOR = '#fca5a5';

function popupRankColor(rank: number): string {
  const tier = rankTier(rank);
  return tier === 'none' ? 'rgba(194,224,255,.45)' : tier === 'low' ? '#7fa8f0' : RANK_TIERS[tier].swatch;
}

function buildPopupHtml(point: GridPoint, target: string, highlightKey?: string): string {
  const items = point.items ?? [];

  const itemRows = items.slice(0, 20).map((item) => {
    const isHighlighted = !item.is_target && !!highlightKey && competitorKey(item) === highlightKey;
    const nameStyle = item.is_target
      ? 'font-weight:500;color:#c2e0ff'
      : isHighlighted
        ? 'font-weight:500;color:#4da2ff'
        : 'font-weight:400;color:rgba(234,242,255,.85)';
    const stars = item.rating_value != null
      ? `<span style="color:#f5a524;font-size:10px">★</span><span style="font-size:10px;color:rgba(234,242,255,.5)"> ${item.rating_value.toFixed(1).replace('.', ',')}${item.rating_votes != null ? ` (${item.rating_votes.toLocaleString('pt-BR')})` : ''}</span>`
      : '';
    const rowBg = item.is_target
      ? 'background:rgba(194,224,255,.08);border-left:2px solid #c2e0ff;padding-left:5px;margin-left:-5px;border-radius:2px;'
      : isHighlighted
        ? 'background:rgba(77,162,255,.12);border-left:2px solid #4da2ff;padding-left:5px;margin-left:-5px;border-radius:2px;'
        : '';
    const mapsHref = item.cid
      ? `https://www.google.com/maps?cid=${item.cid}`
      : `https://www.google.com/maps/search/${encodeURIComponent(item.title)}`;
    const mapsLink = `<a href="${mapsHref}" target="_blank" rel="noopener noreferrer" style="font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:0.08em;color:#4da2ff;text-decoration:none;white-space:nowrap;margin-top:2px;display:inline-block">Maps ↗</a>`;
    return `
      <div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid rgba(77,162,255,.1);${rowBg}">
        <span style="font-size:12px;font-weight:500;font-family:${MONO};min-width:24px;color:${popupRankColor(item.rank_group)}">#${item.rank_group}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;${nameStyle};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px">${item.title}</div>
          ${item.domain ? `<div style="font-size:10px;color:rgba(234,242,255,.45);margin-top:1px">${item.domain}</div>` : ''}
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            ${stars ? `<div style="margin-top:1px">${stars}</div>` : ''}
            ${mapsLink}
          </div>
        </div>
      </div>`;
  }).join('');

  const emptyMsg = items.length === 0
    ? '<p style="color:rgba(234,242,255,.45);font-size:12px;margin:8px 0">Nenhum resultado neste ponto.</p>'
    : '';

  return `
    <div style="font-family:var(--font-geist-sans),system-ui,sans-serif;min-width:230px;max-width:260px">
      <p style="font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.08em;color:rgba(234,242,255,.45);margin:0 0 6px">
        Alvo: <span style="color:#eaf2ff">${target}</span>
      </p>
      ${itemRows}${emptyMsg}
    </div>`;
}

/**
 * Bulky 5-point star in a 100×100 viewBox. The inner radius is fatter than a classic star
 * (0.52 vs 0.38) and the stroke uses round joins to soften the tips — clip-path can't round
 * polygon corners, hence SVG.
 */
const STAR_PATH = (() => {
  const cx = 50, cy = 53, outer = 44, inner = 23;
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  });
  return `M${pts.join('L')}Z`;
})();

const BADGE_BASE = `position:absolute;left:50%;transform:translateX(-50%);border-radius:99px;background:rgba(3,5,8,.92);border:1px solid rgba(77,162,255,.4);font-family:${MONO};font-weight:500;white-space:nowrap`;

function starMarkerHtml(size: number, fontSize: number, style: RankTierStyle, label: string, isCenter: boolean, movement = '', movementColor = GAIN_COLOR): string {
  // The center point loses its dashed border as a star, so a white halo keeps the "grid center" cue.
  const halo = isCenter
    ? `<path d="${STAR_PATH}" fill="white" stroke="white" stroke-width="20" stroke-linejoin="round"/>`
    : '';
  return `
    <div style="
      position:relative;width:${size}px;height:${size}px;
      cursor:pointer;transition:transform 0.1s;
      filter:drop-shadow(0 0 8px rgba(194,224,255,.6));
    " onmouseenter="this.style.transform='scale(1.12)'" onmouseleave="this.style.transform='scale(1)'">
      <!-- z-index:0 overrides Leaflet's ".leaflet-map-pane svg { z-index: 200 }", which would hide the label -->
      <svg viewBox="0 0 100 100" width="${size}" height="${size}" style="position:absolute;inset:0;z-index:0;overflow:visible">
        ${halo}
        <path d="${STAR_PATH}" fill="${style.fill}" stroke="${style.fill}" stroke-width="8" stroke-linejoin="round"/>
      </svg>
      <div style="
        position:absolute;inset:0;z-index:1;padding-top:${Math.round(size * 0.06)}px;
        display:flex;align-items:center;justify-content:center;
        font-size:${fontSize}px;font-weight:500;color:${style.text};
        font-family:${MONO};
      ">${label}</div>
      ${movement ? `<span style="${BADGE_BASE};bottom:-5px;z-index:2;padding:1px 3px;font-size:9px;line-height:11px;color:${movementColor}">${movement}</span>` : ''}
    </div>`;
}

/** Marker and label sizes for a grid, per pin style. Circles and dots leave more of the basemap visible. */
function markerMetrics(gridSize: number, pinStyle: PinStyle) {
  const cellPx = gridSize <= 3 ? 52 : gridSize <= 5 ? 44 : gridSize <= 7 ? 38 : 32;
  const fontSize = gridSize <= 5 ? 15 : 13;
  if (pinStyle === 'circle') return { size: Math.round(cellPx * 0.9), fontSize: fontSize - 1, starScale: 1.3 };
  if (pinStyle === 'dot') return { size: Math.max(22, Math.round(cellPx * 0.6)), fontSize: gridSize <= 5 ? 11 : 10, starScale: 1.45 };
  return { size: cellPx, fontSize, starScale: 1.3 };
}

function shapeMarkerHtml(pinStyle: PinStyle, size: number, fontSize: number, style: RankTierStyle, label: string, isCenter: boolean, movement: string, movementColor: string): string {
  const round = pinStyle !== 'square';
  const radius = round ? '50%' : `${Math.round(size * 0.18)}px`;
  // The faint "not found" pin keeps its own outline; the solid tiers get a thin dark ring for busy tiles.
  const border = isCenter
    ? `border: ${pinStyle === 'dot' ? 2 : 3}px dashed rgba(194,224,255,0.9);`
    : style.border
      ? `border: ${style.border.replace(/^1px/, pinStyle === 'dot' ? '1px' : '1.5px')};`
      : `border: ${pinStyle === 'dot' ? 1 : 1.5}px solid rgba(3,5,8,0.55);`;
  // "Not found" pins sit on a dark wash so the faint fill stays readable over light map tiles.
  const background = style.border ? `linear-gradient(${style.fill},${style.fill}),rgba(3,5,8,.72)` : style.fill;
  const shadow = style.glow || (pinStyle === 'dot' ? '0 1px 4px rgba(0,0,0,0.45)' : '0 2px 8px rgba(0,0,0,0.45)');
  // Movement badges shrink with dots so they don't outweigh the pin itself.
  const badgeSize = pinStyle === 'dot' ? 'bottom:-6px;padding:0 2px;font-size:7.5px;line-height:9px;' : 'bottom:-7px;padding:1px 3px;font-size:9px;line-height:11px;';
  const badge = movement
    ? `<span style="${BADGE_BASE};${badgeSize}color:${movementColor}">${movement}</span>`
    : '';
  return `<div style="position:relative;box-sizing:border-box;width:${size}px;height:${size}px;background:${background};border-radius:${radius};display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;font-weight:500;color:${style.text};font-family:${MONO};${border}box-shadow:${shadow};cursor:pointer;transition:transform 0.1s" onmouseenter="this.style.transform='scale(1.12)'" onmouseleave="this.style.transform='scale(1)'"><span>${label}</span>${badge}</div>`;
}

/** Resolves the rank to display at a point, given whether a competitor is being highlighted. */
function pointRank(point: GridPoint, highlightKey?: string): number | null {
  if (!highlightKey) return point.rank;
  const match = (point.items ?? []).find((i) => !i.is_target && competitorKey(i) === highlightKey);
  return match ? match.rank_group : null;
}

export default function GridMap({ points, gridSize, target, highlightKey, highlightName, previousPoints, captureId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const markerLayerRef = useRef<import('leaflet').LayerGroup | null>(null);
  const boundsSignatureRef = useRef<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const { pinStyle } = useGridPreferences();

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let isMounted = true;

    import('leaflet').then((L) => {
      if (!isMounted || !containerRef.current || mapRef.current) return;

      // Fix bundler icon paths
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      // The basemap is intentionally initialized only once. Snapshot changes use
      // the marker layer below, keeping the exact same geographic context in view.
      const map = L.map(containerRef.current!, { zoomControl: true }).setView([0, 0], 2);
      mapRef.current = map;
      leafletRef.current = L;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
        crossOrigin: true,
        // See MapPicker: keep the Referer that OSM's tile usage policy asks for behind strict proxies.
        referrerPolicy: 'strict-origin-when-cross-origin',
      }).addTo(map);
      markerLayerRef.current = L.layerGroup().addTo(map);
      setMapReady(true);
    });

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const markerLayer = markerLayerRef.current;
    if (!mapReady || !L || !map || !markerLayer) return;

    const geoPoints = points.filter((point) => point.lat != null && point.lng != null);
    if (geoPoints.length === 0) return;
    const half = Math.floor(gridSize / 2);
    const previousByPoint = new Map((previousPoints ?? []).map((point) => [`${point.row}:${point.col}`, point]));
    const { size, fontSize, starScale } = markerMetrics(gridSize, pinStyle);

    // Only the dynamic layer changes when selecting a different date.
    markerLayer.clearLayers();
    geoPoints.forEach((point) => {
      const isCenter = point.row === half && point.col === half;
      const rank = pointRank(point, highlightKey);
      const style = rankStyle(rank);
      const label = rank != null ? String(rank) : '—';
      const before = pointRank(previousByPoint.get(`${point.row}:${point.col}`) ?? { ...point, rank: null }, highlightKey);
      const movement = before === null && rank === null ? ''
        : before === null ? 'novo'
          : rank === null ? 'saiu'
            : before - rank === 0 ? ''
              : `${before - rank > 0 ? '+' : ''}${before - rank}`;
      const movementColor = before === null || (rank !== null && before > rank) ? GAIN_COLOR : LOSS_COLOR;
      const markerPx = rank === 1 ? Math.round(size * starScale) : size;
      const html = rank === 1
        ? starMarkerHtml(markerPx, fontSize, style, label, isCenter, movement, movementColor)
        : shapeMarkerHtml(pinStyle, size, fontSize, style, label, isCenter, movement, movementColor);
      const icon = L.divIcon({ html, className: '', iconSize: [markerPx, markerPx], iconAnchor: [markerPx / 2, markerPx / 2] });
      const marker = L.marker([point.lat!, point.lng!], { icon }).addTo(markerLayer);
      marker.bindPopup(buildPopupHtml(point, target, highlightKey), {
        maxWidth: 260, maxHeight: 240, className: 'grid-popup', autoPan: true, keepInView: true,
        autoPanPadding: [28, 28], closeButton: true, closeOnClick: true,
      });
    });

    const signature = geoPoints.map((point) => `${point.lat}:${point.lng}`).join('|');
    if (boundsSignatureRef.current !== signature) {
      boundsSignatureRef.current = signature;
      map.fitBounds(L.latLngBounds(geoPoints.map((point) => [point.lat!, point.lng!] as [number, number])), { padding: [48, 48] });
    }
  }, [mapReady, points, gridSize, target, highlightKey, previousPoints, pinStyle]);

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossOrigin="" />
      <style>{`
        .grid-popup .leaflet-popup-content-wrapper {
          border-radius: 6px;
          background: #06090f;
          color: #eaf2ff;
          border: 1px solid rgba(77,162,255,0.35);
          box-shadow: 0 8px 24px rgba(0,0,0,0.5);
          padding: 0;
        }
        .grid-popup .leaflet-popup-content {
          margin: 12px 14px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(77,162,255,0.3) transparent;
        }
        .grid-popup .leaflet-popup-content::-webkit-scrollbar {
          width: 4px;
        }
        .grid-popup .leaflet-popup-content::-webkit-scrollbar-thumb {
          background: rgba(77,162,255,0.3);
          border-radius: 4px;
        }
        .grid-popup .leaflet-popup-tip {
          background: #06090f;
          border: 1px solid rgba(77,162,255,0.35);
        }
        .grid-popup a.leaflet-popup-close-button {
          color: rgba(234,242,255,0.6);
        }
      `}</style>
      <div id={captureId} className="relative bg-nexo-surface-2">
        {highlightKey && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-nexo-blue text-white text-[11px] font-medium uppercase tracking-widest px-3 py-1.5 rounded-full">
            Exibindo: {highlightName ?? 'concorrente'}
          </div>
        )}
        <div
          ref={containerRef}
          className="w-full rounded-nexo-lg overflow-hidden border border-nexo-border"
          style={{ height: 520 }}
        />
      </div>
    </>
  );
}
