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
    { value: 'search_volume', label: 'Search Volume' },
    { value: 'keywords_for_site', label: 'Keywords For Site' },
    { value: 'keywords_for_keywords', label: 'Keywords For Keywords' },
    { value: 'ad_traffic_by_keywords', label: 'Ad Traffic By Keywords' },
  ],
  bing: [
    { value: 'search_volume', label: 'Search Volume' },
    { value: 'keywords_for_site', label: 'Keywords For Site' },
    { value: 'keywords_for_keywords', label: 'Keywords For Keywords' },
    { value: 'keyword_performance', label: 'Keyword Performance' },
  ],
};

const SORT_BY_OPTIONS: Record<SE, { value: string; label: string }[]> = {
  google_ads: [
    { value: 'relevance', label: 'Relevance' },
    { value: 'search_volume', label: 'Search Volume' },
    { value: 'competition_index', label: 'Competition Index' },
    { value: 'low_top_of_page_bid', label: 'Low Top of Page Bid' },
    { value: 'high_top_of_page_bid', label: 'High Top of Page Bid' },
  ],
  bing: [
    { value: 'relevance', label: 'Relevance' },
    { value: 'search_volume', label: 'Search Volume' },
    { value: 'cpc', label: 'CPC' },
    { value: 'competition', label: 'Competition' },
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
            Search Engine
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
            Type
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
            Keywords <span className="text-nexo-faint normal-case font-normal">(one per line, max 1000)</span>
          </label>
          <textarea
            name="keywords"
            defaultValue={defaults.keywords}
            rows={5}
            placeholder={"plumber paris\nelectrician london\nheating engineer manchester"}
            className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky font-mono resize-y"
          />
        </div>
      )}

      {needsTarget && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="nexo-label block mb-1.5">
              Target <span className="text-nexo-faint normal-case font-normal">(domain or URL)</span>
            </label>
            <input
              type="text"
              name="target"
              defaultValue={defaults.target}
              placeholder="example.com or https://example.com/page"
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
            />
          </div>
          <div>
            <label className="nexo-label block mb-1.5">
              Target Type
            </label>
            <select
              name="target_type"
              defaultValue={defaults.targetType || 'site'}
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
            >
              <option value="site">Site (whole domain)</option>
              <option value="page">Page (exact URL)</option>
            </select>
          </div>
        </div>
      )}

      {/* Location + Language */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="nexo-label block mb-1.5">
            Location {isBing && <span className="text-nexo-danger-text">*</span>}
          </label>
          <LocationPicker
            name="location"
            defaultValue={defaults.location || 'France'}
            placeholder="e.g. France, Paris"
            className="w-full px-4 py-2.5 border border-nexo-border rounded-nexo-lg text-sm text-nexo-text placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-nexo-sky bg-nexo-surface"
          />
        </div>
        <div>
          <label className="nexo-label block mb-1.5">
            Language {isBing && <span className="text-nexo-danger-text">*</span>}
          </label>
          <input
            type="text"
            name="language"
            defaultValue={defaults.language || 'French'}
            placeholder="e.g. French, English"
            className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
          />
        </div>
      </div>

      {/* Date range + Sort By */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="nexo-label block mb-1.5">Date From</label>
          <input
            type="date"
            name="date_from"
            defaultValue={defaults.dateFrom}
            className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
          />
        </div>
        <div>
          <label className="nexo-label block mb-1.5">Date To</label>
          <input
            type="date"
            name="date_to"
            defaultValue={defaults.dateTo}
            className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
          />
        </div>
        <div>
          <label className="nexo-label block mb-1.5">Sort By</label>
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
            <label className="nexo-label block mb-1.5">Device</label>
            <select
              name="device"
              defaultValue={defaults.device || 'all'}
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
            >
              <option value="all">All</option>
              <option value="desktop">Desktop</option>
              <option value="mobile">Mobile</option>
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
          <span className="text-sm text-nexo-dim font-medium">Search Partners</span>
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
            <span className="text-sm text-nexo-dim font-medium">Include Adult Keywords</span>
          </label>
        )}
      </div>

      <button
        type="submit"
        className="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-ice transition-colors"
      >
        Search
      </button>
    </form>
  );
}
