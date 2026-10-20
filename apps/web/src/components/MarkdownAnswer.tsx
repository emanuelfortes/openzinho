import type { ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Renders LLM answers as markdown (headings, lists, bold, tables, links). Raw HTML in the answer is
// not rendered: react-markdown escapes it by default, which keeps model output from injecting markup.

const components: Components = {
  h1: ({ children }) => <h3 className="text-base font-medium text-nexo-text mt-4 first:mt-0">{children}</h3>,
  h2: ({ children }) => <h4 className="text-sm font-medium text-nexo-text mt-4 first:mt-0">{children}</h4>,
  h3: ({ children }) => <h5 className="text-sm font-medium text-nexo-text mt-3 first:mt-0">{children}</h5>,
  h4: ({ children }) => <h5 className="text-sm font-medium text-nexo-text mt-3 first:mt-0">{children}</h5>,
  p: ({ children }) => <p className="text-sm text-nexo-dim leading-relaxed my-2 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-medium text-nexo-text">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1 text-sm text-nexo-dim">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1 text-sm text-nexo-dim">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-nexo-border pl-3 my-2 text-nexo-dim">{children}</blockquote>,
  code: ({ children }) => <code className="rounded bg-nexo-surface-2 px-1 py-0.5 text-[12px] font-mono text-nexo-text">{children}</code>,
  pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-nexo bg-nexo-surface-2 p-3 text-[12px] font-mono">{children}</pre>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-nexo-sky underline underline-offset-2 break-words">{children}</a>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-nexo border border-nexo-border">
      <table className="w-full text-xs text-left">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="nexo-label bg-white/[0.02]">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 font-medium">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 align-top border-t border-nexo-border text-nexo-dim">{children}</td>,
};

export default function MarkdownAnswer({ children }: { children: string | ReactNode }) {
  if (typeof children !== 'string') return <div>{children}</div>;
  return (
    <div className="min-w-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{children}</ReactMarkdown>
    </div>
  );
}
