import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import { getCredentials, getCurrentProject, getSetting } from '@/lib/db';
import BudgetFields from '@/modules/custos/BudgetFields';
import AutomationFields from '@/modules/jobs/AutomationFields';
import { getBudgetStatus } from '@/modules/custos/budget';
import { getBrandSettings } from '@/lib/brand-server';
import { DEFAULT_BRAND_COLOR, normalizeHexColor } from '@/lib/brand';
import { updateSettings, deleteCredentials } from './actions';
import BrandIdentityFields from './BrandIdentityFields';
import GridPreferenceFields from './GridPreferenceFields';
import { getGridPreferences } from '@/lib/grid-preferences-server';

interface DFUserResponse {
  tasks?: Array<{
    result?: Array<{
      money?: { balance?: number };
    }>;
  }>;
}

const inputCls = 'nexo-input min-w-0 w-full px-5 py-4 focus:ring-4 focus:ring-nexo-sky outline-none transition-all font-medium';

async function SettingsPage() {
  const creds = getCredentials();
  // Raw values: blank fields stay blank so the defaults remain visible as placeholders.
  const brandName = getSetting('brand_name') ?? '';
  const brandFooter = getSetting('brand_footer') ?? '';
  const brandColor = normalizeHexColor(getSetting('brand_color')) ?? DEFAULT_BRAND_COLOR;
  const resolvedBrand = getBrandSettings();
  const brandLogo = resolvedBrand.logo;
  const brandStyle = resolvedBrand;
  const gridPreferences = getGridPreferences();

  let balance = 0;
  let status = 'NÃO CONECTADO';

  if (creds) {
    try {
      const auth = btoa(`${creds.login}:${creds.pass}`);
      const res = await fetch('https://api.dataforseo.com/v3/appendix/user_data', {
        headers: { Authorization: `Basic ${auth}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json() as DFUserResponse;
        balance = data.tasks?.[0]?.result?.[0]?.money?.balance ?? 0;
        status = 'CONECTADO';
      } else {
        status = `ERRO ${res.status}`;
      }
    } catch {
      status = 'ERRO DE CONEXÃO';
    }
  }

  const connected = status === 'CONECTADO';

  return (
    <div className="max-w-2xl space-y-8 pb-12">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="nexo-h1">Configurações</h1>
          <p className="text-nexo-dim text-sm mt-1 font-medium">Gerenciamento da API do DataForSEO</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-[10px] font-medium tracking-widest border ${
          connected
            ? 'bg-nexo-ice/10 border-nexo-ice/30 text-nexo-ice'
            : 'bg-nexo-danger/10 border-nexo-danger/40 text-nexo-danger-text'
        }`}>
          {status}
        </div>
      </div>

      {/* Balance Card */}
      <div className="nexo-panel p-10 relative overflow-hidden border-nexo-border-strong">
        <div className="relative z-10">
          <p className="nexo-label">Total de créditos disponíveis</p>
          <div className="mt-4 flex items-center gap-4">
            <span className="nexo-metric text-6xl font-mono leading-none">{balance.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' })}</span>
            <div className="h-10 w-px bg-nexo-border-strong mx-2" />
            <span className="text-nexo-faint text-xs font-medium leading-tight">SALDO<br />EM USD</span>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="bg-nexo-surface border border-nexo-border rounded-nexo-lg p-1">
        <div className="bg-white/[0.02] rounded-nexo p-8">
          <form action={updateSettings} className="space-y-8">
            {/* API Credentials */}
            <div>
              <p className="nexo-label mb-4">Credenciais da API</p>
              {!creds && (
                <aside className="mb-6 border-l-2 border-nexo-sky bg-nexo-blue/10 px-4 py-3.5">
                  <p className="text-xs font-medium text-nexo-text">Ainda não usa o DataForSEO?</p>
                  <p className="mt-1 text-xs leading-relaxed text-nexo-dim">
                    <a href="https://try.dataforseo.com/nrjev32kinaz" target="_blank" rel="noreferrer" className="font-medium text-nexo-sky underline decoration-nexo-border-strong underline-offset-2 transition-colors hover:text-white">Crie uma conta por este link ↗</a>
                    {' '}para apoiar o desenvolvimento contínuo do SEO Playground, o projeto open source em que o Nexo se baseia, sem custo extra para você.
                  </p>
                  <p className="mt-1.5 text-[10px] font-medium text-nexo-dim">Link de afiliado — posso receber uma comissão se você se tornar cliente.</p>
                </aside>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="nexo-label ml-1">Usuário da API</label>
                  <input name="login" type="text" defaultValue={creds?.login || ''} className={inputCls} />
                </div>
                <div className="space-y-2">
                  <label className="nexo-label ml-1">Senha da API</label>
                  <input name="password" type="password" className={inputCls} />
                  {creds && <p className="text-[10px] text-nexo-ice ml-1">Senha salva. Deixe em branco para mantê-la.</p>}
                </div>
              </div>
            </div>

            <div className="border-t border-nexo-border" />

            {/* White-label report identity */}
            <div>
              <p className="nexo-label mb-1">Relatórios com sua marca</p>
              <p className="text-xs text-nexo-faint mb-6">Aplicado a todo PDF que você exportar. Deixe o nome em branco para usar Nexo.</p>
              <BrandIdentityFields
                initialName={brandName}
                initialColor={brandColor}
                initialFooter={brandFooter}
                initialStyle={brandStyle}
                currentLogo={brandLogo}
              />
            </div>

            <div className="border-t border-nexo-border" />

            {/* Monthly spending caps */}
            <div>
              <p className="nexo-label mb-1">Custos e limites</p>
              <p className="text-xs text-nexo-faint mb-6">Valores em reais, com teto mensal por cliente e para todos os clientes juntos.</p>
              <BudgetFields projectName={getCurrentProject().name} status={getBudgetStatus(getCurrentProject().id)} />
            </div>

            <div className="border-t border-nexo-border" />

            {/* Alerts, e-mail and daily jobs */}
            <div>
              <p className="nexo-label mb-1">Avisos e tarefas automáticas</p>
              <p className="text-xs text-nexo-faint mb-6">Quem recebe alertas e relatórios, e o que o worker faz todos os dias.</p>
              <AutomationFields />
            </div>

            <div className="border-t border-nexo-border" />

            {/* Geo-grid display preferences */}
            <div>
              <p className="nexo-label mb-1">Geo-Grid</p>
              <p className="text-xs text-nexo-faint mb-6">Como o monitor Geo-Grid exibe distâncias e pinos de posição.</p>
              <GridPreferenceFields initial={gridPreferences} />
            </div>

            <button type="submit" className="w-full bg-nexo-blue text-white py-5 rounded-nexo-lg font-medium uppercase text-xs tracking-[0.2em] hover:bg-nexo-sky transition-all active:scale-[0.98]">
              Salvar configurações
            </button>
          </form>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-nexo-danger/10 border border-nexo-danger/40 rounded-nexo-lg p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="max-w-md">
          <h2 className="text-nexo-danger-text font-medium text-xs uppercase tracking-widest mb-1">Zona de perigo</h2>
          <p className="text-xs text-nexo-danger-text font-medium leading-relaxed">Remove as credenciais armazenadas localmente.</p>
        </div>
        <form action={deleteCredentials}>
          <button type="submit" className="px-6 py-3 bg-nexo-surface border border-nexo-danger/40 text-nexo-danger-text text-[10px] font-medium uppercase tracking-widest rounded-nexo-lg hover:bg-nexo-danger/80 hover:text-white transition-all">
            Desconectar
          </button>
        </form>
      </div>
    </div>
  );
}

export default withProjectScope(SettingsPage);
