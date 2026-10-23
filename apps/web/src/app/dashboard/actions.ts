'use server'

import { saveCredentials } from '@/lib/db';
import { requireAdmin } from '@/lib/access';
import { revalidatePath } from 'next/cache';

export async function saveCredentialsAction(formData: FormData) {
  // The DataForSEO account is the platform's; /dashboard is open to subscribers, so check here too.
  await requireAdmin();
  const login = formData.get('login');
  const password = formData.get('password');
  if (!login || !password || typeof login !== 'string' || typeof password !== 'string') return;
  saveCredentials(login, password);
  revalidatePath('/dashboard');
}
