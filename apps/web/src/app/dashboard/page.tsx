import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import { getCredentials } from '@/lib/db';
import { saveCredentialsAction } from './actions';
import Link from 'next/link';
import { NAV_SECTIONS, NAV_FOOTER, type NavColor } from '@/lib/nav';

// Same list as the sidebar, minus the Dashboard link itself; Spending and Settings close the page
const sections = [
  ...NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => i.href !== '/dashboard') })),
  { key: 'account', label: 'Conta', color: 'slate' as NavColor, items: NAV_FOOTER },
].filter((s) => s.items.length > 0);

const colorMap: Record<NavColor, { badge: string; icon: string; hover: string }> = {
  blue:    { badge: 'bg-nexo-blue/10 text-nexo-sky', icon: 'text-nexo-sky', hover: 'hover:border-nexo-border-strong' },
  violet:  { badge: 'bg-nexo-blue/10 text-nexo-sky', icon: 'text-nexo-sky', hover: 'hover:border-nexo-border-strong' },
  emerald: { badge: 'bg-nexo-ice/10 text-nexo-ice', icon: 'text-nexo-ice', hover: 'hover:border-nexo-ice/40' },
  orange:  { badge: 'bg-nexo-ice/10 text-nexo-ice', icon: 'text-nexo-ice', hover: 'hover:border-nexo-ice/40' },
  pink:    { badge: 'bg-nexo-blue/10 text-nexo-sky', icon: 'text-nexo-sky', hover: 'hover:border-nexo-border-strong' },
  yellow:  { badge: 'bg-nexo-ice/10 text-nexo-ice', icon: 'text-nexo-ice', hover: 'hover:border-nexo-ice/40' },
  slate:   { badge: 'bg-white/[0.04] text-nexo-dim', icon: 'text-nexo-faint', hover: 'hover:border-nexo-border-strong' },
  indigo:  { badge: 'bg-nexo-blue/10 text-nexo-sky', icon: 'text-nexo-sky', hover: 'hover:border-nexo-border-strong' },
};

async function DashboardPage() {
  const creds = getCredentials();

  if (!creds) {
    return (
      <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-10 max-w-lg mx-auto mt-10">
        <h2 className="text-2xl font-medium text-nexo-text mb-2 tracking-tight">Login no DataForSEO</h2>
        <p className="text-nexo-dim text-sm mb-8">Digite suas credenciais da API do DataForSEO para começar. Elas ficam armazenadas só localmente.</p>
        <form action={saveCredentialsAction} className="space-y-4">
          <div>
            <label className="nexo-label block mb-1.5">Login da API</label>
            <input type="text" name="login" required className="nexo-input min-w-0 w-full px-4 py-3 text-sm focus:ring-2 focus:ring-nexo-sky outline-none transition-all" />
          </div>
          <div>
            <label className="nexo-label block mb-1.5">Senha da API</label>
            <input type="password" name="password" required className="nexo-input min-w-0 w-full px-4 py-3 text-sm focus:ring-2 focus:ring-nexo-sky outline-none transition-all" />
          </div>
          <button type="submit" className="w-full bg-nexo-blue text-white font-medium uppercase text-xs tracking-widest py-3.5 rounded-nexo-lg hover:bg-nexo-sky transition-colors">
            Salvar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="nexo-h1">Painel</h1>
        <p className="text-sm text-nexo-faint mt-1">Escolha uma ferramenta para começar.</p>
      </div>

      {sections.map((section) => {
        const c = colorMap[section.color];
        return (
          <div key={section.key}>
            <div className="flex items-center gap-3 mb-4">
              <span className={`text-[9px] font-medium uppercase tracking-[0.2em] px-2.5 py-1 rounded-full ${c.badge}`}>
                {section.label}
              </span>
              <div className="h-px flex-1 bg-nexo-border" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group flex items-start gap-4 p-4 rounded-nexo-lg border border-nexo-border bg-nexo-surface transition-all duration-150 ${c.hover}`}
                  >
                    <div className={`mt-0.5 shrink-0 ${c.icon}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-widest text-nexo-text leading-tight group-hover:text-inherit truncate">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-nexo-faint mt-1 leading-snug">
                        {item.desc}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default withProjectScope(DashboardPage);
