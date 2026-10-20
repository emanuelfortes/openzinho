import { withProjectScope } from '@/lib/db';
import type { Metadata } from 'next';
import Studio from '@/modules/studio/Studio';

export const metadata: Metadata = { title: 'Studio · Nexo' };

// The Studio only replays saved proof scans and a modeled demo: no project data, no API spend.
async function StudioPage() {
  return <Studio />;
}

export default withProjectScope(StudioPage);
