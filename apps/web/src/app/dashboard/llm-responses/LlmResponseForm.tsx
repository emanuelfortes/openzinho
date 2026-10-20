'use client';

import { useState } from 'react';
import { PLATFORMS, MODELS_BY_PLATFORM, DEFAULT_MODEL_BY_PLATFORM, type LlmPlatform } from '@/lib/llm-options';

interface Props {
  defaults: {
    platform: LlmPlatform;
    model: string;
    prompt: string;
    systemMessage: string;
    webSearch: boolean;
    countryCode: string;
  };
  disabled?: boolean;
}

export default function LlmResponseForm({ defaults, disabled = false }: Props) {
  const [platform, setPlatform] = useState<LlmPlatform>(defaults.platform);
  const [model, setModel] = useState(defaults.model || DEFAULT_MODEL_BY_PLATFORM[defaults.platform]);
  const [webSearch, setWebSearch] = useState(defaults.webSearch);
  const [isLoading, setIsLoading] = useState(false);

  const isPerplexity = platform === 'perplexity';
  const modelSuggestions = MODELS_BY_PLATFORM[platform];

  function handlePlatformChange(next: LlmPlatform) {
    setPlatform(next);
    setModel(DEFAULT_MODEL_BY_PLATFORM[next]);
  }

  return (
    <form
      method="GET"
      className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4"
      onSubmit={() => { if (!disabled) setIsLoading(true); }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="nexo-label block mb-1.5">Platform</label>
          <select
            name="platform"
            value={platform}
            onChange={(e) => handlePlatformChange(e.target.value as LlmPlatform)}
            className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
          >
            {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className="nexo-label block mb-1.5">Model</label>
          <input
            type="text"
            name="model"
            list="model-suggestions"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            required
            className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
          />
          <datalist id="model-suggestions">
            {modelSuggestions.map((m) => <option key={m} value={m} />)}
          </datalist>
        </div>
      </div>

      <div>
        <label className="nexo-label block mb-1.5">
          Prompt <span className="text-nexo-faint font-normal normal-case tracking-normal">(max 500 chars)</span>
        </label>
        <textarea
          name="user_prompt"
          defaultValue={defaults.prompt}
          rows={4}
          maxLength={500}
          placeholder="e.g. What's the best plumber in Paris for emergency repairs?"
          required
          className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky transition-all resize-y"
        />
      </div>

      <div>
        <label className="nexo-label block mb-1.5">
          System message <span className="text-nexo-faint font-normal normal-case tracking-normal">(optional, max 500 chars)</span>
        </label>
        <input
          type="text"
          name="system_message"
          defaultValue={defaults.systemMessage}
          maxLength={500}
          placeholder="e.g. Answer as a local SEO expert."
          className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
        <div>
          {isPerplexity ? (
            <p className="text-[11px] text-nexo-faint pb-2.5">Perplexity always searches the live web.</p>
          ) : (
            <label className="relative flex items-center gap-2.5 cursor-pointer w-fit">
              <input
                type="checkbox"
                name="web_search"
                checked={webSearch}
                onChange={(e) => setWebSearch(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-white/10 rounded-full peer-checked:bg-nexo-blue transition-colors relative">
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-nexo-surface rounded-full transition-transform peer-checked:translate-x-4" />
              </div>
              <span className="nexo-label">Web search</span>
            </label>
          )}
        </div>
        <div>
          <label className="nexo-label block mb-1.5">
            Web search country <span className="text-nexo-faint font-normal normal-case tracking-normal">(optional, ISO code)</span>
          </label>
          <input
            type="text"
            name="country_code"
            defaultValue={defaults.countryCode}
            maxLength={2}
            placeholder="e.g. FR, US"
            className="nexo-input min-w-0 w-full px-4 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-nexo-sky"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={disabled || isLoading}
        className="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-sky transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Asking {PLATFORMS.find((p) => p.value === platform)?.label}…
          </span>
        ) : 'Ask'}
      </button>
    </form>
  );
}
