import { withProjectScope } from '@/lib/db';
import { getCredentials } from '@/lib/db';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import SearchForm from '@/components/SearchForm';

interface ContentBlock {
  type?: string;
  content?: string;
  level?: number;
}

interface ContentInfo {
  content_quality_score?: number;
  sentence_count?: number;
  word_count?: number;
  character_count?: number;
  automated_readability_index?: number;
  coleman_liau_index?: number;
}

interface ParsedPage {
  url?: string;
  title?: string;
  description?: string;
  content?: {
    plain_text?: string;
    title?: string;
    description?: string;
    blocks?: ContentBlock[];
  };
  content_info?: ContentInfo;
  meta?: { title?: string; description?: string; robots?: string; canonical?: string };
  page_category?: Array<{ code?: number; name?: string; confidence?: number }>;
}

interface SearchParams { url?: string }

async function fetchContentParsing(url: string, login: string, pass: string): Promise<{ result?: ParsedPage; error?: string }> {
  return callDataForSeoFirst<ParsedPage>('on_page/content_parsing/live', { url }, { login, pass }, 30_000);
}

const BLOCK_STYLES: Record<string, { tag: string; cls: string }> = {
  title:     { tag: 'h1', cls: 'text-2xl font-medium text-nexo-text mb-3' },
  heading_1: { tag: 'h1', cls: 'text-xl font-medium text-nexo-text mt-6 mb-2' },
  heading_2: { tag: 'h2', cls: 'text-lg font-medium text-nexo-text mt-5 mb-2' },
  heading_3: { tag: 'h3', cls: 'text-base font-medium text-nexo-dim mt-4 mb-1' },
  heading_4: { tag: 'h4', cls: 'text-sm font-medium text-nexo-dim mt-3 mb-1' },
  paragraph: { tag: 'p',  cls: 'text-sm text-nexo-dim leading-relaxed mb-2' },
  list_item: { tag: 'li', cls: 'text-sm text-nexo-dim leading-relaxed ml-4 list-disc' },
};

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className={`rounded-nexo-lg border px-4 py-3 ${accent ?? 'bg-white/[0.02] border-nexo-border'}`}>
      <p className="nexo-label mb-1">{label}</p>
      <p className="text-lg font-medium text-nexo-text">{value}</p>
      {sub && <p className="text-[11px] text-nexo-faint mt-0.5">{sub}</p>}
    </div>
  );
}

function scoreLabel(score?: number) {
  if (score == null) return null;
  if (score >= 80) return { label: 'Boa', cls: 'text-nexo-ice' };
  if (score >= 50) return { label: 'Média', cls: 'text-nexo-warn-text' };
  return { label: 'Fraca', cls: 'text-nexo-danger-text' };
}

async function ContentParsingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const rawUrl = params.url?.trim() ?? '';

  let result: ParsedPage | null = null;
  let error: string | null = null;

  if (rawUrl) {
    const url = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
    if (!creds) {
      error = 'Credenciais da DataForSEO ausentes. Configure-as em Configurações.';
    } else {
      const r = await fetchContentParsing(url, creds.login, creds.pass);
      if (r.error) error = r.error;
      else result = r.result ?? null;
    }
  }

  const blocks = result?.content?.blocks ?? [];
  const info = result?.content_info;
  const sc = scoreLabel(info?.content_quality_score);

  return (
    <div className="space-y-6">
      <div>
        <div className="nexo-label flex items-center gap-2 mb-1">
          <a href="/dashboard/on-page" className="hover:text-white transition-colors">On-page</a>
          <span className="text-nexo-text">/</span>
          <span className="text-nexo-dim">Análise de conteúdo</span>
        </div>
        <h1 className="nexo-h1">Análise de conteúdo</h1>
        <p className="text-sm text-nexo-faint mt-1">Extraia e estruture todo o conteúdo de uma URL: títulos, parágrafos, legibilidade e categorias.</p>
      </div>

      <SearchForm className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4" btnLabel="Analisar página" btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-ice transition-colors" disabled={!creds}>
        <div>
          <label className="nexo-label block mb-1.5">URL da página</label>
          <input type="text" name="url" defaultValue={rawUrl} placeholder="https://exemplo.com.br/pagina" required
            className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky font-mono" />
        </div>
        {!creds && (
          <p className="text-xs text-nexo-warn-text">Configure as credenciais da DataForSEO em Configurações para usar esta ferramenta.</p>
        )}
      </SearchForm>

      {error && <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{error}</div>}

      {result && (
        <div className="space-y-6">

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {info?.word_count != null && <StatCard label="Palavras" value={info.word_count.toLocaleString('pt-BR')} />}
            {info?.sentence_count != null && <StatCard label="Frases" value={info.sentence_count} />}
            {info?.content_quality_score != null && (
              <StatCard
                label="Nota de qualidade"
                value={`${info.content_quality_score.toFixed(0)} ${sc?.label ?? ''}`}
                accent={info.content_quality_score >= 80 ? 'bg-nexo-ice/10 border-nexo-ice/30' : info.content_quality_score >= 50 ? 'bg-nexo-warn/10 border-nexo-warn/40' : 'bg-nexo-danger/10 border-nexo-danger/40'}
              />
            )}
            {info?.automated_readability_index != null && (
              <StatCard label="Legibilidade (ARI)" value={info.automated_readability_index.toFixed(1)} sub="nível escolar" />
            )}
          </div>

          {/* Meta */}
          {result.meta && (
            <div id="results" className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
              <div className="px-6 py-4 border-b border-nexo-border">
                <h2 className="nexo-label">Metadados</h2>
              </div>
              <div className="p-6 space-y-3 text-sm">
                {result.meta.title && (
                  <div>
                    <span className="nexo-label block mb-1">Título</span>
                    <p className="text-nexo-text font-medium">{result.meta.title}</p>
                  </div>
                )}
                {result.meta.description && (
                  <div>
                    <span className="nexo-label block mb-1">Descrição</span>
                    <p className="text-nexo-dim">{result.meta.description}</p>
                  </div>
                )}
                <div className="flex gap-4 flex-wrap pt-1">
                  {result.meta.robots && (
                    <div>
                      <span className="nexo-label block mb-0.5">Robots</span>
                      <code className="text-xs font-mono text-nexo-dim">{result.meta.robots}</code>
                    </div>
                  )}
                  {result.meta.canonical && (
                    <div className="min-w-0">
                      <span className="nexo-label block mb-0.5">Canonical</span>
                      <a href={result.meta.canonical} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-mono text-nexo-sky hover:underline truncate block max-w-xs">{result.meta.canonical}</a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Categories */}
          {result.page_category && result.page_category.length > 0 && (
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6">
              <h2 className="nexo-label mb-3">Categorias da página</h2>
              <div className="flex gap-2 flex-wrap">
                {result.page_category.map((cat, i) => (
                  <span key={i} className="text-[11px] font-semibold px-3 py-1 rounded-full bg-nexo-blue/10 text-nexo-sky border border-nexo-border-strong">
                    {cat.name ?? cat.code}
                    {cat.confidence != null && <span className="ml-1 text-nexo-sky">{(cat.confidence * 100).toFixed(0)}%</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Content blocks */}
          {blocks.length > 0 && (
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
              <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between">
                <h2 className="nexo-label">Estrutura do conteúdo</h2>
                <span className="text-[11px] text-nexo-faint">{blocks.length} {blocks.length === 1 ? 'bloco' : 'blocos'}</span>
              </div>
              <div className="p-6 max-h-[600px] overflow-y-auto scrollbar-thin">
                {blocks.map((block, i) => {
                  const style = BLOCK_STYLES[block.type ?? ''];
                  if (!style || !block.content) return null;
                  return (
                    <div key={i} className={style.cls}>{block.content}</div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default withProjectScope(ContentParsingPage);
