'use client';

import { useActionState, useEffect, useState } from 'react';
import { Copy, Link2 } from 'lucide-react';
import type { ShareLinkState } from './share-actions';
import type { ShareTokenInfo } from './share-tokens';

type Props = {
  campaignId: string;
  links: ShareTokenInfo[];
  createAction: (previous: ShareLinkState, formData: FormData) => Promise<ShareLinkState>;
  revokeAction: (formData: FormData) => Promise<void>;
};

const KIND_LABEL: Record<ShareTokenInfo['kind'], string> = {
  manual: 'Link do painel',
  email: 'Link do e-mail mensal (troca a cada envio)',
};

function formatWhen(ts: number): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts));
}

export default function ShareLinkPanel({ campaignId, links, createAction, revokeAction }: Props) {
  const [state, formAction, pending] = useActionState(createAction, { status: 'idle' });
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => setCopied(false), [state]);

  const created = state.status === 'created' ? state : null;
  const url = created ? `${created.base ?? origin}${created.path}` : null;
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="nexo-panel space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="nexo-section flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> Link de visualização</p>
          <p className="mt-1 max-w-xl text-xs text-nexo-dim">
            Quem tiver o link vê este relatório sem login, somente leitura, sem trocar de projeto nem executar nada. Gerar um novo link desativa o anterior do painel.
          </p>
        </div>
        <form action={formAction}>
          <input type="hidden" name="campaign_id" value={campaignId} />
          <button type="submit" disabled={pending} className="nexo-btn-accent px-3 py-2.5 disabled:opacity-60">
            {pending ? 'Gerando…' : links.some((link) => link.kind === 'manual') ? 'Gerar novo link' : 'Gerar link'}
          </button>
        </form>
      </div>

      {state.status === 'error' && <p className="text-xs text-nexo-danger-text">{state.message}</p>}
      {url && (
        <div className="space-y-1.5 rounded-nexo bg-nexo-blue/10 p-3">
          <p className="text-[11px] font-medium text-nexo-sky">Copie agora: o link completo só aparece esta vez (guardamos apenas um resumo criptográfico dele).</p>
          <div className="flex items-center gap-2">
            <input readOnly value={url} onFocus={(event) => event.currentTarget.select()} className="nexo-input min-w-0 flex-1 px-2 py-1.5 font-mono text-[11px]" />
            <button type="button" onClick={copy} className="nexo-btn-ghost inline-flex items-center gap-1.5 px-2.5 py-1.5">
              <Copy className="h-3 w-3" /> {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          {!created?.base && <p className="text-[11px] text-nexo-faint">Endereço montado a partir deste navegador. Defina NEXO_PUBLIC_URL para links e e-mails com o endereço público.</p>}
        </div>
      )}

      {links.length > 0 ? (
        <ul className="divide-y divide-nexo-border text-xs">
          {links.map((link) => (
            <li key={link.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-nexo-dim">
                {KIND_LABEL[link.kind] ?? link.kind} · criado em {formatWhen(link.created_at)}
                {link.last_used_at ? ` · último acesso em ${formatWhen(link.last_used_at)}` : ' · nunca acessado'}
              </span>
              <form action={revokeAction}>
                <input type="hidden" name="campaign_id" value={campaignId} />
                <input type="hidden" name="id" value={link.id} />
                <button type="submit" className="nexo-label hover:text-nexo-danger-text">Revogar</button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-nexo-faint">Nenhum link ativo.</p>
      )}
    </section>
  );
}
