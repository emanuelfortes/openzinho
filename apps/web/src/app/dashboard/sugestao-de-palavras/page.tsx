import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import { getCurrentProject, getSetting } from '@/lib/db';
import { LABS_LOCATIONS, toLabsCountry } from '@/lib/geo-options';
import { getBudgetSettings } from '@/modules/custos/budget';
import { formatUsdPrecise } from '@/modules/palavras/estimate';
import { getPesquisa, listPesquisas } from '@/modules/palavras/palavras-db';
import PalavrasForm from '@/modules/palavras/PalavrasForm';
import ResultadoPesquisa from '@/modules/palavras/ResultadoPesquisa';
import { DEFAULT_LOCATION } from '@/modules/palavras/service';
import { estimarPesquisaAction, executarPesquisaAction, ocultarPesquisaAction } from './actions';

interface SearchParams {
  id?: string;
}

async function SugestaoDePalavrasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const project = getCurrentProject();
  const defaultLocation = getSetting('default_location') || DEFAULT_LOCATION;
  const defaultLanguage = getSetting('default_language') || 'Portuguese';
  const coordinate = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?/.test(project.defaultCoordinates) ? project.defaultCoordinates : null;
  const country = toLabsCountry(defaultLocation);
  const locationCode = LABS_LOCATIONS.find((l) => l.name === country)?.code ?? 2076;
  const { brlPerUsd } = getBudgetSettings();

  const active = params.id ? getPesquisa(params.id) : null;
  const history = listPesquisas();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">Sugestão de palavras-chave</h1>
        <p className="mt-1 max-w-3xl text-sm text-nexo-faint">
          A partir do perfil público no Google, do site e do volume de buscas, sugerimos de 3 a 5 temas distintos, com uma consulta representativa
          cada e as evidências de cada escolha. Sinônimos, plurais e variações ficam no mesmo tema.
        </p>
      </div>

      <PalavrasForm
        defaultLocation={defaultLocation}
        defaultLanguage={defaultLanguage}
        searchCoordinate={coordinate}
        searchLocationCode={locationCode}
        estimateAction={estimarPesquisaAction}
        executeAction={executarPesquisaAction}
      />

      {params.id && !active && (
        <div className="rounded-nexo-lg border border-nexo-danger/40 bg-nexo-danger/10 px-4 py-3 text-sm text-nexo-danger-text">Esta pesquisa não está mais disponível.</div>
      )}
      {active && <ResultadoPesquisa result={active} ts={active.ts} brlPerUsd={brlPerUsd} />}

      {history.length > 0 && (
        <div className="nexo-panel overflow-hidden rounded-nexo-lg">
          <div className="border-b border-nexo-border px-6 py-4"><h2 className="nexo-label">Pesquisas anteriores</h2></div>
          <div className="divide-y divide-nexo-border">
            {history.map((entry) => (
              <div key={entry.id} className={`flex items-center gap-4 px-6 py-3 ${entry.id === active?.id ? 'bg-nexo-blue/10' : ''}`}>
                <a href={`/dashboard/sugestao-de-palavras?id=${encodeURIComponent(entry.id)}#resultado`} className="min-w-0 flex-1 hover:opacity-80">
                  <p className={`truncate text-sm ${entry.id === active?.id ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entry.business}</p>
                  <p className="mt-0.5 truncate text-[11px] text-nexo-faint">
                    {entry.location} · {entry.themeCount === 1 ? '1 tema' : `${entry.themeCount} temas`}
                    {entry.scope === 'focado' ? ' (focado)' : ''}
                    {entry.cost !== null ? ` · ${formatUsdPrecise(entry.cost)}` : ''}
                  </p>
                </a>
                <span className="shrink-0 text-[11px] text-nexo-faint">{new Date(entry.ts).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <form action={ocultarPesquisaAction}>
                  <input type="hidden" name="id" value={entry.id} />
                  <button type="submit" className="text-[11px] text-nexo-faint hover:text-nexo-danger-text" title="Remove da lista; o custo continua em Gastos">Ocultar</button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default withProjectScope(SugestaoDePalavrasPage);
