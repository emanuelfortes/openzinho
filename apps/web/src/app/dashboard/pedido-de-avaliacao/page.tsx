import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getReviewsTaskMeta, getReviewsTasks } from '@/lib/db';
import { getBrandSettings } from '@/lib/brand-server';
import type { ListingMeta } from '@/modules/avaliacoes/dataforseo';
import { listMonitored } from '@/modules/avaliacoes/monitor-db';
import { qrSvg } from '@/modules/avaliacoes/qr';
import { buildReviewLink, parseCid, parsePlaceId } from '@/modules/avaliacoes/request-kit';
import RequestKit from '@/modules/avaliacoes/RequestKit';

type SearchParams = Record<string, string | string[] | undefined>;

interface Source {
  value: string;
  title: string;
  placeId: string | null;
  cid: string | null;
  origin: string;
}

const fieldCls = 'nexo-input min-w-0 w-full px-3 py-2 text-sm outline-none focus:border-nexo-sky';
const one = (params: SearchParams, key: string) => {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value ?? '').trim();
};

/** Profiles already known: monitored ones and every ready search of Avaliações do Google, one per profile. */
function knownSources(): Source[] {
  const sources: Source[] = [];
  const seen = new Set<string>();
  const add = (source: Source) => {
    const key = source.placeId ?? source.cid ?? source.value;
    if (seen.has(key)) return;
    seen.add(key);
    sources.push(source);
  };
  for (const listing of listMonitored()) {
    add({ value: `m:${listing.id}`, title: listing.title, placeId: listing.placeId, cid: listing.cid, origin: 'monitorado' });
  }
  for (const task of getReviewsTasks()) {
    if (task.status !== 'ready') continue;
    const meta = getReviewsTaskMeta<ListingMeta>(task.id);
    const placeId = parsePlaceId(meta?.place_id);
    const cid = parseCid(meta?.cid);
    if (!placeId && !cid) continue;
    add({ value: `t:${task.id}`, title: meta?.title || task.business, placeId, cid, origin: new Date(task.ts).toLocaleDateString('pt-BR') });
  }
  return sources;
}

async function PedidoDeAvaliacaoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const sources = knownSources();
  const typed = one(params, 'place_id');
  const typedName = one(params, 'nome');
  const fromMonitor = one(params, 'monitorado');
  const fromTask = one(params, 'tarefa');
  const selectedValue = one(params, 'perfil') || (fromMonitor ? `m:${fromMonitor}` : fromTask ? `t:${fromTask}` : '');
  const selected = sources.find((source) => source.value === selectedValue) ?? null;

  const typedPlaceId = parsePlaceId(typed);
  const typedCid = typedPlaceId ? null : parseCid(typed);
  const link = selected
    ? buildReviewLink({ placeId: selected.placeId, cid: selected.cid })
    : typed ? buildReviewLink({ placeId: typedPlaceId, cid: typedCid }) : null;
  const business = selected?.title ?? (typedName || 'Nossa empresa');
  const qr = link ? await qrSvg(link.url) : null;
  const brand = getBrandSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">Pedido de avaliação</h1>
        <p className="text-sm text-nexo-faint mt-1">
          Link direto para o cliente avaliar no Google, QR code, mensagem de WhatsApp, e-mail e cartão para imprimir. Nada é enviado pelo Nexo: você copia ou abre no seu aplicativo.
        </p>
      </div>

      <form method="get" className="nexo-panel p-5 grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 items-end">
        <label className="block">
          <span className="nexo-label block mb-1.5">Perfil já buscado</span>
          <select name="perfil" defaultValue={selected?.value ?? ''} className={fieldCls}>
            <option value="">{sources.length ? 'Escolha um perfil' : 'Nenhum perfil buscado ainda'}</option>
            {sources.map((source) => (
              <option key={source.value} value={source.value}>
                {source.title} ({source.origin}{source.placeId ? '' : ', só CID'})
              </option>
            ))}
          </select>
        </label>
        <span className="nexo-label text-center pb-2.5">ou</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="nexo-label block mb-1.5">Place ID ou CID</span>
            <input name="place_id" defaultValue={selected ? '' : typed} placeholder="ex.: ChIJN1t_tDeuEmsRUsoyG83frY4" className={fieldCls} />
          </label>
          <label className="block">
            <span className="nexo-label block mb-1.5">Nome no cartão</span>
            <input name="nome" defaultValue={typedName} placeholder="ex.: Padaria Pão Quente" className={fieldCls} />
          </label>
        </div>
        <div className="lg:col-span-3 flex flex-wrap items-center gap-4">
          <button type="submit" className="nexo-btn-primary px-4 py-2.5">Montar kit</button>
          <p className="text-[11px] text-nexo-faint">
            O place ID aparece em <Link href="/dashboard/google-reviews" className="underline">Avaliações do Google</Link>, nos dados da empresa. Montar o kit não consulta a DataForSEO e não tem custo.
          </p>
        </div>
      </form>

      {typed && !selected && !link && (
        <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">
          Não reconhecemos esse identificador. Cole o place ID (ex.: ChIJ…), um link com placeid= ou o CID numérico.
        </div>
      )}

      {link && qr ? (
        <RequestKit key={link.url} business={business} link={link} qrSvg={qr} brand={{ name: brand.name, logo: brand.logo, color: brand.color }} />
      ) : selected ? (
        <div className="bg-nexo-warn/10 border border-nexo-warn/40 text-nexo-warn-text text-sm rounded-nexo-lg px-4 py-3">
          Este perfil foi cadastrado só pelo nome, sem place ID nem CID. Informe o place ID ao lado para montar o kit.
        </div>
      ) : !typed && (
        <div className="nexo-panel px-6 py-10 text-center text-sm text-nexo-faint">
          Escolha um perfil ou informe o place ID para montar o kit.
        </div>
      )}
    </div>
  );
}

export default withProjectScope(PedidoDeAvaliacaoPage);
