'use client';

import { useEffect, useRef } from 'react';
import { rankStyle } from '@/lib/rank-scale';

export type OverviewMarker = { id: string; lat: number; lng: number; label: string; avgPosition: number | null };

const escape = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** One pin per campaign center, coloured by the campaign's average position. */
export default function OverviewMap({ markers }: { markers: OverviewMarker[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const signature = markers.map((marker) => `${marker.id}:${marker.avgPosition}`).join('|');

  useEffect(() => {
    if (!containerRef.current || markers.length === 0) return;
    let map: import('leaflet').Map | null = null;
    let cancelled = false;
    import('leaflet').then((L) => {
      if (cancelled || !containerRef.current) return;
      map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
        referrerPolicy: 'strict-origin-when-cross-origin',
      }).addTo(map);
      for (const marker of markers) {
        const style = rankStyle(marker.avgPosition === null ? null : Math.round(marker.avgPosition));
        const text = marker.avgPosition === null ? '—' : marker.avgPosition.toLocaleString('pt-BR');
        const html = `<div style="min-width:30px;height:30px;padding:0 6px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:${style.fill};color:${style.text};${style.border ? `border:${style.border};` : ''}box-shadow:0 0 0 2px #030508${style.glow ? `,${style.glow}` : ''};font:500 12px/1 ui-monospace,monospace">${text}</div>`;
        L.marker([marker.lat, marker.lng], { icon: L.divIcon({ html, className: '', iconSize: [30, 30], iconAnchor: [15, 15] }) })
          .bindTooltip(escape(marker.label), { direction: 'top', offset: [0, -14] })
          .addTo(map);
      }
      map.fitBounds(L.latLngBounds(markers.map((marker) => [marker.lat, marker.lng] as [number, number])).pad(0.2), { maxZoom: 13 });
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  // Redraw only when the set of markers or their values change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  if (markers.length === 0) return null;
  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossOrigin="" />
      <div ref={containerRef} className="h-80 w-full overflow-hidden rounded-nexo-lg border border-nexo-border" />
    </>
  );
}
