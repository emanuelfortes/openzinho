'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RankTrackerQueueStatus({ count }: { count: number }) {
  const router = useRouter();

  useEffect(() => {
    if (count === 0) return;
    const timer = window.setInterval(() => router.refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [count, router]);

  if (count === 0) return null;
  return (
    <div className="flex items-center gap-2 rounded-nexo-lg bg-nexo-warn/10 px-3 py-2 text-[10px] font-medium text-nexo-warn-text ring-1 ring-nexo-warn/40">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-nexo-warn" aria-hidden="true" />
      {count} Standard check{count !== 1 ? 's' : ''} queued — results refresh automatically.
    </div>
  );
}
