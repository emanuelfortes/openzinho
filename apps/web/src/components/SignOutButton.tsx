'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

export default function SignOutButton() {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        window.location.assign('/login');
      }}
      className="nexo-btn-ghost px-4 py-2.5 disabled:opacity-60"
    >
      {pending ? 'Saindo…' : 'Sair'}
    </button>
  );
}
