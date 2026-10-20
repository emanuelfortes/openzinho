import { NextResponse } from 'next/server';
import { hasNewerStableVersion, normalizeVersion, releaseSummary } from '@/lib/release';

// Nexo has its own releases: the notice stays off until UPDATE_CHECK_REPO names that repository
// (owner/name). It never points at the upstream SEO Playground, whose versions are not Nexo's.
const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;
const CHECK_INTERVAL_SECONDS = 60 * 60 * 12;

// Next.js requires the exported route config to be statically analyzable.
export const revalidate = 43200;

type GitHubRelease = {
  tag_name: string;
  html_url: string;
  body: string | null;
  published_at: string | null;
  prerelease: boolean;
  draft: boolean;
};

export async function GET() {
  const current = normalizeVersion(process.env.APP_VERSION ?? process.env.NEXT_PUBLIC_APP_VERSION);

  // Platforms that ship their own updates (e.g. the Cloudron package) turn the in-app notice off.
  const repo = process.env.UPDATE_CHECK_REPO?.trim() ?? '';
  if (process.env.UPDATE_CHECK_DISABLED?.trim().toLowerCase() === 'true' || !REPO_PATTERN.test(repo)) {
    return NextResponse.json({ current, latest: null, hasUpdate: false });
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/releases/latest`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        next: { revalidate: CHECK_INTERVAL_SECONDS },
      }
    );

    if (!res.ok) {
      return NextResponse.json({ current, latest: null, hasUpdate: false });
    }

    const data = await res.json() as GitHubRelease;
    const latest = normalizeVersion(data.tag_name);
    const hasUpdate = !data.draft && !data.prerelease && hasNewerStableVersion(current, latest);

    return NextResponse.json({
      current,
      latest,
      hasUpdate,
      release: latest ? {
        version: latest,
        url: data.html_url,
        notes: releaseSummary(data.body),
        publishedAt: data.published_at,
      } : null,
    });
  } catch {
    return NextResponse.json({ current, latest: null, hasUpdate: false });
  }
}
