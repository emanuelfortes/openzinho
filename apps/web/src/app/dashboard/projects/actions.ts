'use server';

import { createProject, deleteProject, updateProject } from '@/lib/db';
import { forgetProject, requireAdmin, requireUser, selectProjectForUser } from '@/lib/access';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

function projectInput(formData: FormData) {
  return {
    name: String(formData.get('name') ?? ''),
    domain: String(formData.get('domain') ?? ''),
    defaultLocation: String(formData.get('default_location') ?? ''),
    defaultLanguage: String(formData.get('default_language') ?? ''),
    defaultCoordinates: String(formData.get('default_coordinates') ?? ''),
    rankTrackerDepth: String(formData.get('rank_tracker_depth') ?? '100'),
  };
}

function refreshProjects() {
  revalidatePath('/dashboard', 'layout');
  revalidatePath('/dashboard/projects');
  revalidatePath('/dashboard/settings');
}

/**
 * Switching projects keeps the current tool open. Only the path is kept: query strings
 * point at the previous project's history entries and domains.
 */
function returnPath(formData: FormData) {
  const path = String(formData.get('return_to') ?? '');
  return /^\/dashboard(\/[a-z0-9-]+)*$/.test(path) ? path : '/dashboard';
}

// Creating, editing and deleting businesses is for platform admins; a subscriber only switches
// between the businesses linked to their account.

export async function createProjectAction(formData: FormData) {
  const user = await requireAdmin();
  const project = createProject(projectInput(formData));
  selectProjectForUser(user, project.id);
  refreshProjects();
  redirect('/dashboard');
}

export async function updateProjectAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  if (!id) throw new Error('Projeto não encontrado.');
  updateProject(id, projectInput(formData));
  refreshProjects();
}

export async function selectProjectAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '');
  selectProjectForUser(user, id);
  refreshProjects();
  redirect(returnPath(formData));
}

export async function deleteProjectAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  deleteProject(id);
  forgetProject(id);
  refreshProjects();
  redirect('/dashboard/projects');
}
