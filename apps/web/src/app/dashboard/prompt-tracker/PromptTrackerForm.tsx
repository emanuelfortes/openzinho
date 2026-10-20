'use client';

import { useState } from 'react';
import PendingButton from '@/components/PendingButton';
import { PLATFORMS, MODELS_BY_PLATFORM, DEFAULT_MODEL_BY_PLATFORM, type LlmPlatform } from '@/lib/llm-options';

const FIELD = 'w-full px-4 py-2.5 border border-nexo-border rounded-nexo-lg text-sm text-nexo-text placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-nexo-sky';
const LABEL = 'nexo-label block mb-1.5';

export default function PromptTrackerForm({ action }: { action: (formData: FormData) => Promise<void> }) {
  const [platform, setPlatform] = useState<LlmPlatform>('chat_gpt');
  const [model, setModel] = useState<string>(DEFAULT_MODEL_BY_PLATFORM.chat_gpt);
  const [webSearch, setWebSearch] = useState(true);
  const [brand, setBrand] = useState('');
  const [domain, setDomain] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isPerplexity = platform === 'perplexity';

  function handlePlatformChange(next: LlmPlatform) {
    setPlatform(next);
    setModel(DEFAULT_MODEL_BY_PLATFORM[next]);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (!brand.trim() && !domain.trim()) {
      event.preventDefault();
      setError('Enter a brand name, a domain, or both to look for in the answers.');
      return;
    }
    setError(null);
  }

  return (
    <form
      action={action}
      onSubmit={handleSubmit}
      className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4"
    >
      <div>
        <label className={LABEL}>
          Prompt <span className="text-nexo-faint font-normal normal-case tracking-normal">(max 500 chars)</span>
        </label>
        <textarea
          name="user_prompt"
          rows={3}
          maxLength={500}
          required
          placeholder="e.g. What is the best plumber in Paris for emergency repairs?"
          className={`${FIELD} resize-y`}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>Platform</label>
          <select name="platform" value={platform} onChange={(e) => handlePlatformChange(e.target.value as LlmPlatform)} className={FIELD}>
            {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL}>Model</label>
          <input
            type="text"
            name="model"
            list="prompt-tracker-models"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            required
            className={FIELD}
          />
          <datalist id="prompt-tracker-models">
            {MODELS_BY_PLATFORM[platform].map((m) => <option key={m} value={m} />)}
          </datalist>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={LABEL}>Brand to look for</label>
          <input
            type="text"
            name="brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="e.g. Acme Plumbing"
            className={FIELD}
          />
        </div>
        <div>
          <label className={LABEL}>Domain to look for</label>
          <input
            type="text"
            name="domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="e.g. acme-plumbing.com"
            className={FIELD}
          />
        </div>
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
          <label className={LABEL}>
            Web search country <span className="text-nexo-faint font-normal normal-case tracking-normal">(optional, ISO code)</span>
          </label>
          <input type="text" name="country_code" maxLength={2} placeholder="e.g. FR, US" className={`${FIELD} uppercase`} />
        </div>
      </div>

      {error && <p className="text-xs font-semibold text-nexo-danger-text">{error}</p>}

      <PendingButton
        type="submit"
        className="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-sky transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        pendingChildren="Saving…"
      >
        Track this prompt
      </PendingButton>
    </form>
  );
}
