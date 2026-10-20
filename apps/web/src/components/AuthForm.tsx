'use client';

import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';

const MIN_PASSWORD_LENGTH = 10;

const inputClass =
  'nexo-input min-w-0 w-full px-3 py-2 text-sm placeholder:text-nexo-faint focus:outline-none focus:ring-2 focus:ring-nexo-sky';

export default function AuthForm({ mode, next }: { mode: 'login' | 'setup'; next: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isSetup = mode === 'setup';

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (isSetup) {
      if (password.length < MIN_PASSWORD_LENGTH) return setError(`Use pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      if (password !== confirm) return setError('As duas senhas não coincidem.');
    }
    setPending(true);
    const result = isSetup
      ? await authClient.signUp.email({ email, password, name: email.split('@')[0] || 'Admin' })
      : await authClient.signIn.email({ email, password });
    if (result.error) {
      setError(isSetup ? (result.error.message ?? 'Não foi possível criar a conta.') : 'E-mail ou senha incorretos.');
      setPending(false);
      return;
    }
    // Full navigation so the new session cookie is sent with the very next request.
    window.location.assign(next);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-xs font-medium text-nexo-dim">E-mail</label>
        <input id="email" type="email" required autoFocus autoComplete="username" value={email}
          onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="voce@exemplo.com" />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-xs font-medium text-nexo-dim">Senha</label>
        <input id="password" type="password" required autoComplete={isSetup ? 'new-password' : 'current-password'}
          minLength={isSetup ? MIN_PASSWORD_LENGTH : undefined} value={password}
          onChange={(e) => setPassword(e.target.value)} className={inputClass} />
      </div>
      {isSetup && (
        <div className="space-y-1.5">
          <label htmlFor="confirm" className="block text-xs font-medium text-nexo-dim">Confirmar senha</label>
          <input id="confirm" type="password" required autoComplete="new-password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
          <p className="text-xs text-nexo-faint">Pelo menos {MIN_PASSWORD_LENGTH} caracteres.</p>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-nexo-danger-text">{error}</p>}
      <button type="submit" disabled={pending}
        className="w-full rounded-nexo bg-nexo-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nexo-sky disabled:opacity-60 transition-colors">
        {pending ? 'Aguarde…' : isSetup ? 'Criar conta' : 'Entrar'}
      </button>
    </form>
  );
}
