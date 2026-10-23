import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { selectProjectAction } from '../projects/actions';
import { allowedProjects, requireUser } from '@/lib/access';
import OverviewMap from '@/modules/grade/OverviewMap';
import { distinctValues, filterOverview, listCampaignOverview, parseOverviewFilters, type CampaignOverviewRow } from '@/modules/grade/overview';

type SearchParams = Record<string, string | string[] | undefined>;

const fieldCls = 'nexo-input min-w-0 w-full px-3 py-2 text-sm outline-none focus:border-nexo-sky';

function Delta({ value, unit = '', lowerIsBetter = false }: { value: number | null; unit?: string; lowerIsBetter?: boolean }) {
  if (value === null) return <span className="text-nexo-faint">—</span>;
  if (value === 0) return <span className="text-nexo-faint">0</span>;
  const good = lowerIsBetter ? value < 0 : value > 0;
  return <span className={good ? 'text-nexo-ice' : 'text-nexo-danger-text'}>{value > 0 ? '+' : ''}{value.toLocaleString('pt-BR')}{unit}</span>;
}

function formatDate(ts: number | null) {
  return ts ? new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : 'Nunca';
}

function Row({ row }: { row: CampaignOverviewRow }) {
  return (
    <tr className="border-b border-nexo-border last:border-0">
      <td className="py-2.5 pr-3">
        <p className="font-medium text-nexo-text">{row.projectName}</p>
        <p className="text-[11px] text-nexo-faint">{row.campaignName} · {row.keywordCount} {row.keywordCount === 1 ? 'palavra' : 'palavras'}{row.active ? '' : ' · pausada'}</p>
        {row.tags.length > 0 && (
          <p className="mt-1 flex flex-wrap gap-1">
            {row.tags.map((tag) => <Link key={tag} href={`/dashboard/clientes?etiqueta=${encodeURIComponent(tag)}`} className="rounded-[3px] border border-nexo-border-strong px-1.5 text-[10px] text-nexo-sky hover:text-white">{tag}</Link>)}
          </p>
        )}
      </td>
      <td className="py-2.5 pr-3 text-nexo-dim">{row.owner || '—'}</td>
      <td className="py-2.5 pr-3 text-right font-mono text-nexo-ice">{row.avgPosition?.toLocaleString('pt-BR') ?? '—'}</td>
      <td className="py-2.5 pr-3 text-right font-mono"><Delta value={row.avgPositionDelta} lowerIsBetter /></td>
      <td className="py-2.5 pr-3 text-right font-mono text-nexo-ice">{row.shareOfVoice !== null ? `${row.shareOfVoice.toLocaleString('pt-BR')}%` : '—'}</td>
      <td className="py-2.5 pr-3 text-right font-mono"><Delta value={row.shareOfVoiceDelta} unit=" pp" /></td>
      <td className="py-2.5 pr-3 text-nexo-dim">{formatDate(row.lastRunTs)}</td>
      <td className="py-2.5 text-right">
        <form action={selectProjectAction}>
          <input type="hidden" name="id" value={row.projectId} />
          <input type="hidden" name="return_to" value="/dashboard/campaigns" />
          <button type="submit" className="nexo-section hover:text-white">Abrir</button>
        </form>
      </td>
    </tr>
  );
}

async function ClientesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const filters = parseOverviewFilters(params);
  // Subscribers only see their own businesses; admins see everyone.
  const all = listCampaignOverview(allowedProjects(await requireUser()));
  const rows = filterOverview(all, filters);
  const tags = distinctValues(all, (row) => row.tags);
  const owners = distinctValues(all, (row) => [row.owner]);
  const markers = rows.flatMap((row) => (row.center ? [{ id: row.campaignId, lat: row.center.lat, lng: row.center.lng, label: `${row.projectName} · ${row.campaignName}`, avgPosition: row.avgPosition }] : []));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">Painel de clientes</h1>
        <p className="mt-2 max-w-2xl text-sm text-nexo-dim">
          Todas as campanhas de grade de todos os clientes, com a posição média e o Share of Voice da última varredura de cada palavra-chave e a variação contra a anterior.
        </p>
      </div>

      <form method="get" className="nexo-panel grid gap-3 p-4 grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
        <label className="space-y-1">
          <span className="nexo-label block">Busca</span>
          <input name="q" defaultValue={filters.q} placeholder="Cliente ou campanha" className={fieldCls} />
        </label>
        <label className="space-y-1">
          <span className="nexo-label block">Etiqueta</span>
          <select name="etiqueta" defaultValue={filters.tag} className={fieldCls}>
            <option value="">Todas</option>
            {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="nexo-label block">Responsável</span>
          <select name="responsavel" defaultValue={filters.owner} className={fieldCls}>
            <option value="">Todos</option>
            {owners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="nexo-label block">Ordenar por</span>
          <select name="ordem" defaultValue={filters.sort} className={fieldCls}>
            <option value="nome">Nome do cliente</option>
            <option value="posicao">Melhor posição média</option>
            <option value="sov">Maior Share of Voice</option>
            <option value="variacao">Maior queda primeiro</option>
          </select>
        </label>
        <div className="flex items-end gap-3">
          <button type="submit" className="nexo-btn-accent px-4 py-2.5">Aplicar</button>
          <Link href="/dashboard/clientes" className="nexo-label pb-2.5 hover:text-white">Limpar</Link>
        </div>
      </form>

      {all.length === 0 ? (
        <div className="nexo-panel px-6 py-10 text-center text-sm text-nexo-dim">
          Nenhuma campanha ainda. Crie a primeira em <Link href="/dashboard/campaigns" className="text-nexo-sky hover:text-white">Campanhas de grade</Link>.
        </div>
      ) : (
        <>
          <OverviewMap markers={markers} />
          <section className="nexo-panel overflow-x-auto p-4">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead>
                <tr className="border-b border-nexo-border">
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Responsável</th>
                  <th className="py-2 pr-3 text-right">Posição média</th>
                  <th className="py-2 pr-3 text-right">Variação</th>
                  <th className="py-2 pr-3 text-right">Share of Voice</th>
                  <th className="py-2 pr-3 text-right">Variação</th>
                  <th className="py-2 pr-3">Última varredura</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => <Row key={`${row.projectId}:${row.campaignId}`} row={row} />)}
              </tbody>
            </table>
            {rows.length === 0 && <p className="py-6 text-center text-sm text-nexo-faint">Nenhuma campanha com estes filtros.</p>}
          </section>
          <p className="text-xs text-nexo-faint">
            {rows.length} de {all.length} {all.length === 1 ? 'campanha' : 'campanhas'}. “Abrir” troca o projeto ativo para o cliente e leva às campanhas dele.
          </p>
        </>
      )}
    </div>
  );
}

export default withProjectScope(ClientesPage);
