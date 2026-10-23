export const dynamic = 'force-dynamic';

import { getProjects } from '@/lib/db';
import { requireAdmin, resolveProjectForUser } from '@/lib/access';
import ProjectsManager from './ProjectsManager';

/** Admin-only (middleware and requireAdmin): every business on the platform. */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const user = await requireAdmin();
  const { edit } = await searchParams;
  const activeProject = resolveProjectForUser(user);
  return <ProjectsManager projects={getProjects()} activeProjectId={activeProject?.id ?? ''} editingProjectId={edit} />;
}
