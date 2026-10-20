'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, PackageCheck, X } from 'lucide-react';

type UpdateCheck = {
  current: string | null;
  latest: string | null;
  hasUpdate: boolean;
  release: {
    version: string;
    url: string;
    notes: string;
    publishedAt: string | null;
  } | null;
};

export default function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateCheck | null>(null);

  useEffect(() => {
    fetch('/api/update-check')
      .then((r) => r.json())
      .then((data: UpdateCheck) => {
        if (!data.hasUpdate || !data.latest || localStorage.getItem(`release-dismissed:${data.latest}`)) return;
        setUpdate(data);
      })
      .catch(() => {});
  }, []);

  if (!update?.release || !update.latest) return null;
  const release = update.release;
  const latest = update.latest;

  function dismiss() {
    localStorage.setItem(`release-dismissed:${latest}`, '1');
    setUpdate(null);
  }

  return (
    <aside
      aria-label="Application update available"
      className="flex items-start justify-between gap-4 border-b border-nexo-sky bg-nexo-bg px-5 py-2.5 text-nexo-text sm:px-8"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-nexo-blue text-nexo-ice ring-1 ring-inset ring-nexo-sky">
          <PackageCheck size={14} aria-hidden="true" />
        </span>
        <div className="min-w-0 text-sm leading-5">
          <span className="font-medium text-white">Version {release.version} is available.</span>{' '}
          <span className="text-nexo-faint">You’re running {update.current ?? 'an unversioned build'}.</span>
          {release.notes && <span className="hidden text-nexo-faint lg:inline"> — {release.notes}</span>}
          <span className="ml-2 inline-flex items-center gap-1 whitespace-nowrap">
            <a
              href={release.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-nexo-ice underline decoration-nexo-border-strong underline-offset-4 transition-colors hover:text-nexo-ice hover:decoration-nexo-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexo-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-nexo-bg"
            >
              Release notes <ArrowUpRight className="inline-block -mt-0.5" size={13} aria-hidden="true" />
            </a>
            <a
              href="https://github.com/paulmassen/seo-playground#updating-a-release-installation"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-nexo-faint underline decoration-nexo-border-strong underline-offset-4 transition-colors hover:text-white hover:decoration-nexo-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexo-border-strong focus-visible:ring-offset-2 focus-visible:ring-offset-nexo-bg"
            >
              Update guide
            </a>
          </span>
        </div>
      </div>
      <button
        onClick={dismiss}
        aria-label={`Dismiss version ${release.version} update notification`}
        className="mt-0.5 shrink-0 rounded-md p-1 text-nexo-faint transition-colors hover:bg-nexo-bg/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexo-border-strong"
      >
        <X size={16} />
      </button>
    </aside>
  );
}
