'use client';

import { useState } from 'react';
import LocationPicker from '@/components/LocationPicker';
import { labsLanguagesFor } from '@/lib/geo-options';

interface Props {
  defaultPlatform: string;
  defaultLimit: string;
  defaultLocation: string;
  defaultLanguage: string;
}

const FIELD_CLASS = 'w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white dark:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed';

const CHAT_GPT_LANGUAGE_OPTIONS = [{ value: 'English', label: 'English' }];

export default function FanOutTargetingFields({ defaultPlatform, defaultLimit, defaultLocation, defaultLanguage }: Props) {
  const [platform, setPlatform] = useState(defaultPlatform);
  const [location, setLocation] = useState(defaultLocation);
  const [language, setLanguage] = useState(defaultLanguage);
  const isChatGpt = platform === 'chat_gpt';

  // Each country only supports a fixed subset of languages for Google AI (see labsLanguagesFor) —
  // ChatGPT is locked to English regardless of location, so it skips that filtering entirely.
  const languageOptions = isChatGpt ? CHAT_GPT_LANGUAGE_OPTIONS : labsLanguagesFor(location);
  const selectedLanguage = isChatGpt
    ? 'English'
    : languageOptions.some((l) => l.value === language) ? language : languageOptions[0]?.value ?? language;

  return (
    <>
      <div>
        <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Platform</label>
        <select
          name="platform"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className={FIELD_CLASS}
        >
          <option value="google">Google AI</option>
          <option value="chat_gpt">ChatGPT</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Mentions checked per seed</label>
        <select name="limit" defaultValue={defaultLimit} className={FIELD_CLASS}>
          {[10, 20, 50, 100].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Location</label>
        {/* Remounted on toggle (via key) so LocationPicker's internal text state — seeded once
            from defaultValue — picks up "United States" instead of keeping whatever was typed. */}
        <LocationPicker
          key={isChatGpt ? 'us-locked' : 'user'}
          name="location"
          defaultValue={isChatGpt ? 'United States' : defaultLocation}
          onChange={setLocation}
          disabled={isChatGpt}
          className={FIELD_CLASS}
          scope="labs"
        />
        {isChatGpt && <p className="text-[11px] text-slate-400 mt-1">Always United States for ChatGPT — DataForSEO only supports ChatGPT mentions for that market.</p>}
      </div>

      <div>
        <label className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1.5">Language</label>
        <select
          name="language"
          value={selectedLanguage}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={isChatGpt}
          className={FIELD_CLASS}
        >
          {languageOptions.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        {isChatGpt && <p className="text-[11px] text-slate-400 mt-1">Always English for ChatGPT — DataForSEO only supports ChatGPT mentions in that language.</p>}
      </div>
    </>
  );
}
