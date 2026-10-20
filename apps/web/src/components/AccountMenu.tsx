'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { authClient } from '@/lib/auth-client';

export default function AccountMenu({ email }: { email: string }) {
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    window.location.assign('/login');
  }

  return (
    <div className="flex items-center gap-2 text-xs text-nexo-dim">
      <span className="hidden sm:inline max-w-48 truncate" title={email}>{email}</span>
      <button type="button" onClick={signOut} disabled={pending} title="Sair" aria-label="Sair"
        className="rounded-nexo p-2 text-nexo-faint hover:bg-white/[0.04] hover:text-white disabled:opacity-60 transition-colors">
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
