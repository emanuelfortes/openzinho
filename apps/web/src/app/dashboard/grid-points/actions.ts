'use server';

import { runWithCurrentProject } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { setInactivePoints } from '@/modules/grade/inactive-points-db';

export type SavePointsState = { error?: string; savedAt?: number; inactive?: number } | undefined;

export async function saveInactivePointsAction(_previous: SavePointsState, formData: FormData): Promise<SavePointsState> {
  return runWithCurrentProject(async () => {
    const grid = {
      center: String(formData.get('center') ?? ''),
      grid_size: Number(formData.get('grid_size')),
      spacing_km: Number(formData.get('spacing_km')),
    };
    let points: string[];
    try {
      points = JSON.parse(String(formData.get('points') ?? '[]')) as string[];
    } catch {
      return { error: 'Could not read the selection.' };
    }
    try {
      const saved = setInactivePoints(grid, points);
      revalidatePath('/dashboard/geo-grid');
      revalidatePath('/dashboard/campaigns');
      revalidatePath('/dashboard/grid-points');
      return { savedAt: Date.now(), inactive: saved.size };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not save the points.' };
    }
  });
}
