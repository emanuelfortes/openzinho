'use client';

import { useState } from 'react';
import LocationPicker from '@/components/LocationPicker';

type SE = 'google_ads' | 'bing';
type SEType =
  | 'search_volume'
  | 'keywords_for_site'
  | 'keywords_for_keywords'
  | 'ad_traffic_by_keywords'
  | 'keyword_performance';

const SE_OPTIONS: { value: SE; label: string }[] = [
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'bing', label: 'Bing Ads' },
];

const SE_TYPES: Record<SE, { value: SEType; label: string }[]> = {
  google_ads: [
    { value: 'search_volume', label: 'Volume de buscas' },
    { value: 'keywords_for_site', label: 'Palavras-chave do site' },
    { value: 'keywords_for_keywords', label: 'Palavras-chave relacionadas' },
    { value: 'ad_traffic_by_keywords', label: 'Tráfego de anúncios por palavra-chave' },
  ],
  bing: [
    { value: 'search_volume', label: 'Volume de buscas' },
    { value: 'keywords_for_site', label: 'Palavras-chave do site' },
    { value: 'keywords_for_keywords', label: 'Palavras-chave relacionadas' },
    { value: 'keyword_performance', label: 'Desempenho de palavras-chave' },
  ],
};

const SORT_BY_OPTIONS: Record<SE, { value: string; label: string }[]> = {
  google_ads: [
    { value: 'relevance', label: 'Relevância' },
    { value: 'search_volume', label: 'Volume de buscas' },
    { value: 'competition_index', label: 'Índice de concorrência' },
    { value: 'low_top_of_page_bid', label: 'Lance mínimo topo da página' },
    { value: 'high_top_of_page_bid', label: 'Lance máximo topo da página' },
  ],
  bing: [
    { value: 'relevance', label: 'Relevância' },
    { value: 'search_volume', label: 'Volume de buscas' },
    { value: 'cpc', label: 'CPC' },
    { value: 'competition', label: 'Concorrência' },
  ],
};

interface Props {
  defaults: {
    se: string;
    seType: string;
    keywords: string;
    target: string;
    targetType: string;
    location: string;
    language: string;
    searchPartners: string;
    includeAdult: string;
    device: string;
    dateFrom: string;
    dateTo: string;
    sortBy: string;
  };
}

export default function KeywordDataForm({ defaults }: Props) {
  const [se, setSe] = useState<SE>((defaults.se as SE) || 'google_ads');
  const [seType, setSeType] = useState<SEType>((defaults.seType as SEType) || 'search_volume');

  const needsKeywords = ['search_volume', 'keywords_for_keywords', 'ad_traffic_by_keywords', 'keyword_performance'].includes(seType);
  const needsTarget = seType === 'keywords_for_site';
  const isBing = se === 'bing';
  const showDevice = isBing;
  const showIncludeAdult = se === 'google_ads';

  function handleSeChange(newSe: SE) {
    setSe(newSe);
    // Reset to first type of new SE
    setSeType(SE_TYPES[newSe][0].value);
  }

  return (
    <form method="GET" className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-6">
      {/* SE + SE Type */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="nexo-label block mb-1.5">
            Buscador
          </label>
          <select
            name="se"
            value={se}
            onChange={(e) => handleSeChange(e.target.value as SE)}
            className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
          >
            {SE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="nexo-label block mb-1.5">
            Tipo
          </label>
          <select
            name="se_type"
            value={seType}
            onChange={(e) => setSeType(e.target.value as SEType)}
            className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
          >
            {SE_TYPES[se].map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Keywords or Target */}
      {needsKeywords && (
        <div>
          <label className="nexo-label block mb-1.5">
            Palavras-chave <span className="text-nexo-faint normal-case font-normal">(uma por linha, máx. 1000)</span>
          </label>
          <textarea
            name="keywords"
            defaultValue={defaults.keywords}
            rows={5}
            placeholder={"encanador são paulo\neletricista rio de janeiro\ntécnico de aquecedor belo horizonte"}
            className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky font-mono resize-y"
          />
        </div>
      )}

      {needsTarget && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="nexo-label block mb-1.5">
              Alvo <span className="text-nexo-faint normal-case font-normal">(domínio ou URL)</span>
            </label>
            <input
              type="text"
              name="target"
              defaultValue={defaults.target}
              placeholder="exemplo.com ou https://exemplo.com/pagina"
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
            />
          </div>
          <div>
            <label className="nexo-label block mb-1.5">
              Tipo de alvo
            </label>
            <select
              name="target_type"
              defaultValue={defaults.targetType || 'site'}
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
            >
              <option value="site">Site (domínio inteiro)</option>
              <option value="page">Página (URL exata)</option>
            </select>
          </div>
        </div>
      )}

      {/* Location + Language */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="nexo-label block mb-1.5">
            Local {isBing && <span className="text-nexo-danger-text">*</span>}
          </label>
          <LocationPicker
            name="location"
            defaultValue={defaults.location || 'Brazil'}
            placeholder="ex.: Brasil, São Paulo"
            className="w-full px-4 py-2.5 border border-nexo-border rounded-nexo-lg text-sm text-nexo-text placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-nexo-sky bg-nexo-surface"
          />
        </div>
        <div>
          <label className="nexo-label block mb-1.5">
            Idioma {isBing && <span className="text-nexo-danger-text">*</span>}
          </label>
          <input
            type="text"
            name="language"
            defaultValue={defaults.language || 'Portuguese'}
            placeholder="ex.: Portuguese, English"
            className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
          />
        </div>
      </div>

      {/* Date range + Sort By */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="nexo-label block mb-1.5">Data inicial</label>
          <input
            type="date"
            name="date_from"
            defaultValue={defaults.dateFrom}
            className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
          />
        </div>
        <div>
          <label className="nexo-label block mb-1.5">Data final</label>
          <input
            type="date"
            name="date_to"
            defaultValue={defaults.dateTo}
            className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
          />
        </div>
        <div>
          <label className="nexo-label block mb-1.5">Ordenar por</label>
          <select
            name="sort_by"
            defaultValue={defaults.sortBy || 'relevance'}
            className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
          >
            {SORT_BY_OPTIONS[se].map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Device (Bing only) */}
      {showDevice && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="nexo-label block mb-1.5">Dispositivo</label>
            <select
              name="device"
              defaultValue={defaults.device || 'all'}
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
            >
              <option value="all">Todos</option>
              <option value="desktop">Desktop</option>
              <option value="mobile">Celular</option>
              <option value="tablet">Tablet</option>
            </select>
          </div>
        </div>
      )}

      {/* Checkboxes */}
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            name="search_partners"
            value="true"
            defaultChecked={defaults.searchPartners === 'true'}
            className="w-4 h-4 rounded border-nexo-border text-nexo-sky focus:ring-nexo-sky"
          />
          <span className="text-sm text-nexo-dim font-medium">Parceiros de pesquisa</span>
        </label>

        {showIncludeAdult && (
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              name="include_adult_keywords"
              value="true"
              defaultChecked={defaults.includeAdult === 'true'}
              className="w-4 h-4 rounded border-nexo-border text-nexo-sky focus:ring-nexo-sky"
            />
            <span className="text-sm text-nexo-dim font-medium">Incluir palavras-chave adultas</span>
          </label>
        )}
      </div>

      <button
        type="submit"
        className="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-ice transition-colors"
      >
        Buscar
      </button>
    </form>
  );
}
