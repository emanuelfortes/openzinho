'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Calculator, Loader2, MapPin, Search } from 'lucide-react';
import LocationPicker from '@/components/LocationPicker';
import { LANGUAGES } from '@/lib/geo-options';
import { formatBrl } from '@/modules/custos/budget-shared';
import { formatUsdPrecise } from './estimate';
import type { EstimateResponse, RawResearchForm } from './service';

interface BusinessHit {
  title: string;
  address: string;
  cid: string;
  domain: string;
  category: string;
}

interface Props {
  defaultLocation: string;
  defaultLanguage: string;
  /** "lat,lng" of the project, used to search businesses near it; otherwise the country code. */
  searchCoordinate: string | null;
  searchLocationCode: number;
  estimateAction: (form: RawResearchForm) => Promise<EstimateResponse | { error: string }>;
  executeAction: (form: RawResearchForm, confirmedUsd: number) => Promise<{ id: string } | { error: string }>;
}

const INPUT = 'nexo-input w-full px-4 py-2.5 rounded-nexo-lg text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky';

export default function PalavrasForm({ defaultLocation, defaultLanguage, searchCoordinate, searchLocationCode, estimateAction, executeAction }: Props) {
  const router = useRouter();
  const [business, setBusiness] = useState('');
  const [cid, setCid] = useState('');
  const [website, setWebsite] = useState('');
  const [location, setLocation] = useState(defaultLocation);
  const [language, setLanguage] = useState(LANGUAGES.some((l) => l.value === defaultLanguage) ? defaultLanguage : 'Portuguese');
  const [mapsProbe, setMapsProbe] = useState(true);
  const [hits, setHits] = useState<BusinessHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const form: RawResearchForm = { business, cid, website, location, language, mapsProbe };
  // Any change invalidates the estimate: the user must estimate again before paying.
  const edit = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setEstimate(null); setError(null); };

  async function searchBusiness() {
    if (!business.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch('/api/business-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: business, language, ...(searchCoordinate ? { location_coordinate: searchCoordinate } : { location_code: searchLocationCode }) }),
      });
      const data = await res.json() as { results?: BusinessHit[]; error?: string };
      if (data.error) setError(data.error);
      setHits(data.results ?? []);
    } catch {
      setError('A busca de empresas falhou.');
    } finally {
      setSearching(false);
    }
  }

  function pick(hit: BusinessHit) {
    setBusiness(hit.title);
    setCid(hit.cid);
    if (hit.domain && !website) setWebsite(`https://${hit.domain}`);
    setHits(null);
    setEstimate(null);
  }

  function runEstimate() {
    setError(null);
    startTransition(async () => {
      const res = await estimateAction(form);
      if ('error' in res) { setError(res.error); setEstimate(null); } else setEstimate(res);
    });
  }

  function runResearch() {
    if (!estimate) return;
    setError(null);
    startTransition(async () => {
      const res = await executeAction(form, estimate.estimate.totalUsd);
      if ('error' in res) setError(res.error);
      else router.push(`/dashboard/sugestao-de-palavras?id=${encodeURIComponent(res.id)}`);
    });
  }

  return (
    <div className="nexo-panel rounded-nexo-lg p-6 space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="nexo-label mb-1.5 block" htmlFor="palavras-business">Empresa</label>
          <div className="flex gap-2">
            <input
              id="palavras-business"
              value={business}
              onChange={(e) => { edit(setBusiness)(e.target.value); setCid(''); }}
              placeholder="Nome da empresa, link do Google Maps ou cid:123…"
              className={INPUT}
            />
            <button type="button" onClick={searchBusiness} disabled={searching || !business.trim()} className="nexo-btn-ghost nexo-label flex shrink-0 items-center gap-2 rounded-nexo-lg px-4 disabled:opacity-50">
              {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Buscar no Maps
            </button>
          </div>
          <p className="mt-1 text-[11px] text-nexo-faint">
            {cid ? `Perfil escolhido: CID ${cid}.` : 'A busca no Maps é opcional e custa cerca de US$ 0,002 por busca (não entra na estimativa abaixo).'}
          </p>
          {hits && (
            <div className="mt-2 divide-y divide-nexo-border rounded-nexo-lg border border-nexo-border">
              {hits.length === 0 && <p className="px-4 py-3 text-sm text-nexo-faint">Nenhuma empresa encontrada.</p>}
              {hits.map((hit) => (
                <button key={hit.cid} type="button" onClick={() => pick(hit)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-white/[0.04]">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-nexo-sky" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-nexo-text">{hit.title}</span>
                    <span className="block truncate text-[11px] text-nexo-faint">{[hit.category, hit.address, hit.domain].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="md:col-span-2">
          <label className="nexo-label mb-1.5 block" htmlFor="palavras-site">Site</label>
          <input id="palavras-site" value={website} onChange={(e) => edit(setWebsite)(e.target.value)} placeholder="https://exemplo.com.br (se vazio, usa o site do perfil)" className={INPUT} />
        </div>
        <div>
          <label className="nexo-label mb-1.5 block">Local</label>
          <LocationPicker name="location" defaultValue={defaultLocation} onChange={edit(setLocation)} className={INPUT} scope="serp" />
        </div>
        <div>
          <label className="nexo-label mb-1.5 block" htmlFor="palavras-language">Idioma</label>
          <select id="palavras-language" value={language} onChange={(e) => edit(setLanguage)(e.target.value)} className={INPUT}>
            {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
        <label className="flex items-start gap-2 text-sm text-nexo-dim md:col-span-2">
          <input type="checkbox" checked={mapsProbe} onChange={(e) => edit(setMapsProbe)(e.target.checked)} className="mt-1" />
          <span>
            Sondar o Google Maps com as consultas escolhidas (opcional, US$ 0,002 por consulta). Mostra se o Maps devolve empresas do ramo e onde a empresa aparece.
          </span>
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={runEstimate} disabled={pending} className="nexo-btn-ghost nexo-label flex items-center gap-2 rounded-nexo-lg px-5 py-2.5 disabled:opacity-50">
          {pending && !estimate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calculator className="h-3.5 w-3.5" />}
          1. Estimar
        </button>
      </div>

      {error && <div role="alert" className="rounded-nexo-lg border border-nexo-danger/40 bg-nexo-danger/10 px-4 py-3 text-sm text-nexo-danger-text">{error}</div>}

      {estimate && (
        <div className="space-y-4 rounded-nexo-lg border border-nexo-border p-4">
          <p className="nexo-section">Chamadas que vão rodar</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="nexo-label pb-2 pr-4 font-normal">Etapa</th>
                  <th className="nexo-label pb-2 pr-4 font-normal">Endpoint</th>
                  <th className="nexo-label pb-2 pr-4 text-right font-normal">Até</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-nexo-border">
                {estimate.estimate.lines.map((line) => (
                  <tr key={line.key}>
                    <td className="py-2 pr-4 align-top">
                      <span className="text-nexo-text">{line.label}</span>
                      <span className="block text-[11px] text-nexo-faint">{line.note}</span>
                    </td>
                    <td className="py-2 pr-4 align-top font-mono text-[11px] text-nexo-dim">{line.endpoint}{line.quantity > 1 ? ` × ${line.quantity}` : ''}</td>
                    <td className="py-2 pr-4 text-right align-top font-mono tabular-nums text-nexo-ice">{formatUsdPrecise(line.usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-nexo-text">
            Estimativa total: <span className="font-mono text-nexo-ice">{formatUsdPrecise(estimate.estimate.totalUsd)}</span>
            {' '}≈ <span className="font-mono text-nexo-ice">{formatBrl(estimate.estimate.totalUsd * estimate.brlPerUsd)}</span>
            <span className="text-nexo-faint"> (câmbio {estimate.brlPerUsd.toLocaleString('pt-BR')})</span>
          </p>
          <p className="text-[11px] text-nexo-faint">
            Estimativa indicativa, pela tabela pública da DataForSEO. Não é um limite aplicado pela DataForSEO: o valor cobrado é o que ela informar em cada tarefa e fica registrado em Gastos.
          </p>
          {estimate.existing && (
            <p className="rounded-nexo-lg border border-nexo-border bg-nexo-blue/10 px-4 py-2.5 text-sm text-nexo-ice">
              Já existe uma pesquisa igual de {new Date(estimate.existing.ts).toLocaleDateString('pt-BR')}.{' '}
              <a className="underline underline-offset-2" href={`/dashboard/sugestao-de-palavras?id=${encodeURIComponent(estimate.existing.id)}`}>Abrir sem pagar de novo</a>
            </p>
          )}
          {estimate.blockReason && <div role="alert" className="rounded-nexo-lg border border-nexo-danger/40 bg-nexo-danger/10 px-4 py-3 text-sm text-nexo-danger-text">{estimate.blockReason}</div>}
          {!estimate.hasCredentials && <div className="rounded-nexo-lg border border-nexo-warn/40 bg-nexo-warn/10 px-4 py-3 text-sm text-nexo-warn-text">Credenciais da DataForSEO ausentes. Configure-as em Configurações.</div>}
          <button
            type="button"
            onClick={runResearch}
            disabled={pending || !!estimate.blockReason || !estimate.hasCredentials}
            className="nexo-btn-primary nexo-label flex items-center gap-2 rounded-nexo-lg px-5 py-2.5 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            2. Pesquisar (até {formatUsdPrecise(estimate.estimate.totalUsd)})
          </button>
        </div>
      )}
    </div>
  );
}
