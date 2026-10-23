import { NextResponse } from 'next/server';
import { requestUser, resolveProjectForUser } from '@/lib/access';

export const dynamic = 'force-dynamic';

/** Lets an open tab notice that this user's active business was switched from another window. */
export async function GET() {
  const user = await requestUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const project = resolveProjectForUser(user);
  if (!project) return NextResponse.json({ error: 'Sem negócio' }, { status: 404 });
  return NextResponse.json({ id: project.id, name: project.name });
}
