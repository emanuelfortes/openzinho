'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, X } from 'lucide-react';

const CHANNEL = 'seo-playground-active-project';

/**
 * The active project is server-wide, not per tab. A tab still showing the previous
 * project would otherwise save searches and keywords into the newly active one, so
 * every tab follows a switch: instantly within this browser (BroadcastChannel), and
 * on focus for other browsers or devices.
 */
export default function ProjectSync({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  // When this tab last refreshed to follow another window; a switch made here shows no notice.
  const followedAt = useRef(0);
  const currentId = useRef(projectId);

  useEffect(() => {
    if (currentId.current !== projectId && Date.now() - followedAt.current < 10_000) setNotice(projectName);
    currentId.current = projectId;
  }, [projectId, projectName]);

  useEffect(() => {
    const follow = (activeId: string) => {
      if (activeId === currentId.current) return;
      followedAt.current = Date.now();
      router.refresh();
    };

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (event: MessageEvent<{ projectId?: string }>) => {
        if (event.data?.projectId) follow(event.data.projectId);
      };
      // Whatever this tab renders is the server's active project: stale tabs should follow it.
      channel.postMessage({ projectId });
    } catch {
      // Without BroadcastChannel, the focus check below still covers returning to a stale tab.
    }

    const checkOnFocus = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await fetch('/api/active-project', { cache: 'no-store' });
        if (!response.ok) return;
        const active = await response.json() as { id?: string };
        if (active.id) follow(active.id);
      } catch {
        // A failed check keeps the current page; the next focus retries.
      }
    };
    document.addEventListener('visibilitychange', checkOnFocus);
    window.addEventListener('focus', checkOnFocus);

    return () => {
      channel?.close();
      document.removeEventListener('visibilitychange', checkOnFocus);
      window.removeEventListener('focus', checkOnFocus);
    };
  }, [projectId, router]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 8_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;
  return (
    <div
      role="status"
      className="fixed bottom-5 right-5 z-50 flex max-w-sm items-start gap-3 rounded-nexo-lg border border-nexo-border-strong bg-nexo-surface px-4 py-3 text-sm"
    >
      <ArrowLeftRight className="mt-0.5 h-4 w-4 shrink-0 text-nexo-sky" aria-hidden="true" />
      <p className="text-nexo-dim">
        Now showing <span className="font-semibold text-nexo-text">{notice}</span>: the active project was switched in another window.
      </p>
      <button
        type="button"
        onClick={() => setNotice(null)}
        aria-label="Dismiss"
        className="-mr-1 shrink-0 rounded-md p-0.5 text-nexo-faint transition-colors hover:bg-white/[0.04] hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
