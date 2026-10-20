'use client';

import { useEffect, useRef, useState } from 'react';

type Status = 'loading' | 'ready' | 'fallback';

// Google's favicon service never truly fails: for unknown domains it answers with a 16×16 generic globe
// (with a 404 status that browsers still render). Anything that small would be upscaled into a blurry
// blob, so we treat it as "no favicon" and render a crisp monogram instead.
const MIN_FAVICON_SIZE = 32;

const MONOGRAM_COLORS = [
  'bg-nexo-blue text-nexo-sky',
  'bg-nexo-blue text-nexo-sky',
  'bg-nexo-ice text-nexo-ice',
  'bg-nexo-warn text-nexo-warn-text',
  'bg-nexo-danger text-nexo-danger-text',
  'bg-nexo-blue text-nexo-sky',
  'bg-nexo-blue text-nexo-sky',
  'bg-nexo-blue text-nexo-sky',
];

function monogramFor(domain: string) {
  const name = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
  const letter = name.match(/[a-z0-9]/)?.[0]?.toUpperCase() ?? '?';
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return { letter, color: MONOGRAM_COLORS[Math.abs(hash) % MONOGRAM_COLORS.length] };
}

function Monogram({ domain, className }: { domain: string; className: string }) {
  const { letter, color } = monogramFor(domain);
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center overflow-hidden rounded-nexo ${color} ${className}`}>
      {/* SVG text scales with the tile, so the letter stays proportional at every size. */}
      <svg viewBox="0 0 24 24" className="h-full w-full">
        <text x="12" y="12" dy="0.35em" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor" fontFamily="inherit">
          {letter}
        </text>
      </svg>
    </span>
  );
}

export default function ProjectFavicon({ domain, className = 'h-7 w-7' }: { domain: string; className?: string }) {
  const [status, setStatus] = useState<Status>('loading');
  const imgRef = useRef<HTMLImageElement>(null);

  const evaluate = (img: HTMLImageElement) => setStatus(img.naturalWidth < MIN_FAVICON_SIZE ? 'fallback' : 'ready');

  useEffect(() => {
    setStatus('loading');
    // A cached image can finish loading before hydration, in which case onLoad never fires.
    const img = imgRef.current;
    if (img?.complete) {
      if (img.naturalWidth === 0) setStatus('fallback');
      else evaluate(img);
    }
  }, [domain]);

  if (!domain || status === 'fallback') return <Monogram domain={domain} className={className} />;

  const faviconUrl = `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(`https://${domain}`)}&sz=64`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={faviconUrl}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setStatus('fallback')}
      onLoad={(event) => evaluate(event.currentTarget)}
      className={`shrink-0 rounded-nexo bg-nexo-surface-2 object-contain transition-opacity ${status === 'ready' ? 'opacity-100' : 'opacity-0'} ${className}`}
    />
  );
}
