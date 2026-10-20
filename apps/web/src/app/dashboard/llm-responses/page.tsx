import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import {
  getCredentials,
  getLlmResponseHistory, saveLlmResponseSearch, getLlmResponseResult,
  type LlmResponseEntry,
} from '@/lib/db';
import { PLATFORM_LABELS, DEFAULT_MODEL_BY_PLATFORM, isValidPlatform, type LlmPlatform } from '@/lib/llm-options';
import { stableSearchId } from '@/lib/dedupe';
import { fetchLlmResponse, type LlmResponseResult, type ResponseItem } from '@/lib/llm-responses';
import { extractAnswerText } from '@/lib/prompt-mentions';
import MarkdownAnswer from '@/components/MarkdownAnswer';
import LlmResponseForm from './LlmResponseForm';
import HistorySidebar from '@/components/HistorySidebar';

interface SearchParams {
  platform?: string;
  model?: string;
  user_prompt?: string;
  system_message?: string;
  web_search?: string;
  country_code?: string;
  history_id?: string;
}

// ---- UI helpers ----

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ResponseText({ items }: { items?: ResponseItem[] }) {
  const messageItems = (items ?? []).filter((it) => it.type !== 'reasoning');
  if (messageItems.length === 0) return <p className="text-sm text-nexo-faint">No response text.</p>;

  const allAnnotations = messageItems.flatMap((it) => it.sections ?? []).flatMap((s) => s.annotations ?? []);

  const answerMarkdown = extractAnswerText(messageItems);

  return (
    <div className="space-y-4">
      <MarkdownAnswer>{answerMarkdown}</MarkdownAnswer>
      {allAnnotations.length > 0 && (
        <div>
          <p className="nexo-label mb-1.5">Sources</p>
          <div className="flex flex-wrap gap-1.5">
            {allAnnotations.map((a, ai) => (
              <a
                key={ai}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                title={a.title ?? a.url}
                className="text-[11px] text-nexo-sky bg-nexo-blue/10 border border-nexo-border-strong px-2 py-0.5 rounded-md hover:bg-nexo-blue/15 transition-colors max-w-[220px] truncate"
              >
                {a.title ?? a.url}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/[0.02] rounded-nexo border border-nexo-border px-3 py-2">
      <p className="text-[9px] font-medium uppercase tracking-widest text-nexo-faint">{label}</p>
      <p className="text-sm font-medium text-nexo-text tabular-nums">{value}</p>
    </div>
  );
}

// ---- Page ----

async function LlmResponsesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const platform: LlmPlatform = isValidPlatform(params.platform ?? '') ? (params.platform as LlmPlatform) : 'chat_gpt';
  const model = (params.model ?? DEFAULT_MODEL_BY_PLATFORM[platform]).trim();
  const prompt = (params.user_prompt ?? '').trim();
  const systemMessage = (params.system_message ?? '').trim();
  const webSearch = params.web_search === 'on';
  const countryCode = (params.country_code ?? '').trim();

  let result: LlmResponseResult | null = null;
  let cost: number | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: LlmResponseEntry | null = null;

  if (historyId) {
    const saved = getLlmResponseResult<LlmResponseResult>(historyId);
    if (saved) {
      result = saved;
      isFromHistory = true;
      activeEntry = getLlmResponseHistory().find((e) => e.id === historyId) ?? null;
    } else {
      error = 'Search no longer available.';
    }
  }

  const hasQuery = !!(historyId || prompt);

  if (!historyId && prompt) {
    const dedupeId = stableSearchId(['llm-responses', platform, model, prompt, systemMessage, webSearch, countryCode]);
    const cached = getLlmResponseResult<LlmResponseResult>(dedupeId);

    if (cached) {
      result = cached;
      const cachedEntry = getLlmResponseHistory().find((e) => e.id === dedupeId);
      cost = cachedEntry?.cost;
    } else if (!creds) {
      error = 'DataForSEO credentials missing. Configure them in Settings.';
    } else {
      const res = await fetchLlmResponse(platform, prompt, model, webSearch, countryCode, systemMessage, creds);
      result = res.result ?? null;
      cost = res.cost;
      error = res.error ?? null;

      if (!error && result) {
        const entry: LlmResponseEntry = {
          id: dedupeId,
          ts: Date.now(),
          platform,
          model,
          prompt,
          webSearch,
          cost,
        };
        saveLlmResponseSearch(entry, result);
      }
    }
  }

  const history = getLlmResponseHistory();
  const displayPlatform = (isFromHistory && activeEntry ? activeEntry.platform : platform) as LlmPlatform;
  const displayModel = isFromHistory && activeEntry ? activeEntry.model : model;
  const displayPrompt = isFromHistory && activeEntry ? activeEntry.prompt : prompt;

  const historyItems = history.map((entry) => {
    const isActive = entry.id === historyId;
    return (
      <a key={entry.id} href={`/dashboard/llm-responses?history_id=${entry.id}#results`}
        className={`flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entry.prompt}</p>
          <p className="text-[11px] text-nexo-faint mt-0.5">
            {PLATFORM_LABELS[entry.platform] ?? entry.platform} · {entry.model}
            {entry.cost !== undefined ? ` · $${entry.cost.toFixed(5)}` : ''}
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-nexo-faint">{formatDate(entry.ts)}</span>
      </a>
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">AI Prompt Test</h1>
        <p className="text-sm text-nexo-faint mt-1">Ask ChatGPT, Claude, Gemini or Perplexity a question and see exactly what they answer — with sources.</p>
      </div>

      {!creds && (
        <div className="bg-nexo-warn/10 border border-nexo-warn/40 text-nexo-warn-text text-sm rounded-nexo-lg px-4 py-3">
          DataForSEO credentials missing. Configure them in{' '}
          <a href="/dashboard/settings" className="underline font-semibold">settings</a>.
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-6">
          <LlmResponseForm
            disabled={!creds}
            defaults={{ platform, model, prompt, systemMessage, webSearch, countryCode }}
          />

          {error && <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{error}</div>}

          {hasQuery && !error && result && (
            <div id="results" className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
              <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="nexo-section bg-nexo-blue/10 border border-nexo-border-strong px-2 py-0.5 rounded-md">
                    {PLATFORM_LABELS[displayPlatform] ?? displayPlatform}
                  </span>
                  <span className="text-xs font-mono text-nexo-dim">{result.model_name ?? displayModel}</span>
                  {isFromHistory && <span className="nexo-section bg-nexo-blue/10 px-2 py-0.5 rounded-md">History</span>}
                </div>
                {cost !== undefined && <span className="text-[10px] font-mono text-nexo-faint">cost: ${cost.toFixed(5)}</span>}
              </div>

              <div className="px-6 py-5 space-y-5">
                <div>
                  <p className="nexo-label mb-1.5">Prompt</p>
                  <p className="text-sm font-semibold text-nexo-text">{displayPrompt}</p>
                </div>

                <div>
                  <p className="nexo-label mb-1.5">Response</p>
                  <ResponseText items={result.items} />
                </div>

                {(result.fan_out_queries?.length ?? 0) > 0 && (
                  <div>
                    <p className="nexo-label mb-1.5">Related queries</p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.fan_out_queries!.map((q, qi) => (
                        <span key={qi} className="text-[11px] text-nexo-dim bg-nexo-surface-2 px-2 py-0.5 rounded-md">
                          {q.keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-nexo-border">
                  <StatChip label="Input tokens" value={(result.input_tokens ?? 0).toLocaleString('en-GB')} />
                  <StatChip label="Output tokens" value={(result.output_tokens ?? 0).toLocaleString('en-GB')} />
                  {result.reasoning_tokens !== undefined && (
                    <StatChip label="Reasoning tokens" value={result.reasoning_tokens.toLocaleString('en-GB')} />
                  )}
                  <StatChip label="Web search" value={result.web_search ? 'Yes' : 'No'} />
                </div>
              </div>
            </div>
          )}

          {!hasQuery && !error && (
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-6 py-16 text-center">
              <p className="text-nexo-faint text-sm">Ask a question above to see how an AI model actually answers it.</p>
              <p className="text-nexo-faint text-xs mt-1">Powered by DataForSEO LLM Responses API.</p>
            </div>
          )}
        </div>

        {history.length > 0 && (
          <HistorySidebar title="History" items={historyItems} />
        )}
      </div>
    </div>
  );
}

export default withProjectScope(LlmResponsesPage);
