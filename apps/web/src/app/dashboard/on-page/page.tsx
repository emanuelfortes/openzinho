import Link from 'next/link';
import { FileSearch2, Globe, Code2, Link2, Package, Tags, EyeOff, ScanText } from 'lucide-react';

const tools = [
  {
    name: 'Auditoria do site',
    description: 'Rastreamento completo do site: nota geral, todas as páginas, problemas de SEO, SSL, CMS, sitemap e links quebrados.',
    href: '/dashboard/on-page/site-audit',
    icon: Globe,
    badge: 'Assíncrono',
    badgeCls: 'text-nexo-sky bg-nexo-blue/10 border-nexo-border-strong',
  },
  {
    name: 'Páginas instantâneas',
    description: 'Auditoria on-page completa de uma URL: metadados, desempenho, verificações de SEO e métricas de conteúdo.',
    href: '/dashboard/on-page/instant-pages',
    icon: FileSearch2,
    badge: 'Ao vivo',
    badgeCls: 'text-nexo-ice bg-nexo-ice/10 border-nexo-ice/30',
  },
  {
    name: 'Microdados',
    description: 'Valide os dados estruturados JSON-LD e Microdata (schema.org) de uma página.',
    href: '/dashboard/on-page/microdata',
    icon: Code2,
    badge: 'Assíncrono',
    badgeCls: 'text-nexo-sky bg-nexo-blue/10 border-nexo-border-strong',
  },
  {
    name: 'Análise de conteúdo',
    description: 'Extraia e estruture todo o texto de uma URL: títulos, parágrafos e contagem de palavras.',
    href: '/dashboard/on-page/content-parsing',
    icon: ScanText,
    badge: 'Ao vivo',
    badgeCls: 'text-nexo-ice bg-nexo-ice/10 border-nexo-ice/30',
  },
];

const auditTabs = [
  {
    name: 'Links',
    description: 'Todos os links encontrados no rastreamento: internos, externos, quebrados e nofollow.',
    href: '/dashboard/on-page/site-audit',
    icon: Link2,
    note: 'Selecione uma auditoria concluída → aba Links',
  },
  {
    name: 'Recursos',
    description: 'Imagens, scripts e folhas de estilo: tamanho, status HTTP e tempo de carregamento.',
    href: '/dashboard/on-page/site-audit',
    icon: Package,
    note: 'Selecione uma auditoria concluída → aba Recursos',
  },
  {
    name: 'Tags duplicadas',
    description: 'Páginas que compartilham tags de título ou descrição idênticas.',
    href: '/dashboard/on-page/site-audit',
    icon: Tags,
    note: 'Selecione uma auditoria concluída → aba Tags dup.',
  },
  {
    name: 'Não indexáveis',
    description: 'Páginas excluídas da indexação: noindex, canonical, 4xx e redirecionamentos.',
    href: '/dashboard/on-page/site-audit',
    icon: EyeOff,
    note: 'Selecione uma auditoria concluída → aba Não indexáveis',
  },
];

export default function OnPageHub() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="nexo-h1">On-page</h1>
        <p className="text-sm text-nexo-faint mt-1">Ferramentas de análise on-page pela API OnPage da DataForSEO.</p>
      </div>

      <div>
        <p className="nexo-label mb-3">Ferramentas independentes</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link key={tool.href + tool.name} href={tool.href}
                className="group bg-nexo-surface rounded-nexo-lg border border-nexo-border p-5 hover:border-nexo-border transition-all">
                <div className="flex items-start justify-between mb-3">
                  <Icon className="h-5 w-5 text-nexo-faint group-hover:text-nexo-sky transition-colors" />
                  <span className={`text-[10px] font-medium uppercase tracking-widest px-2 py-0.5 rounded-md border ${tool.badgeCls}`}>{tool.badge}</span>
                </div>
                <h2 className="text-sm font-medium text-nexo-text group-hover:text-nexo-sky transition-colors mb-1">{tool.name}</h2>
                <p className="text-xs text-nexo-dim leading-relaxed">{tool.description}</p>
              </Link>
            );
          })}
        </div>
      </div>

      <div>
        <p className="nexo-label mb-3">Baseadas em rastreamento (dentro da Auditoria do site)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {auditTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <Link key={tab.name} href={tab.href}
                className="group bg-nexo-surface rounded-nexo-lg border border-nexo-border p-5 hover:border-nexo-border transition-all">
                <Icon className="h-5 w-5 text-nexo-faint group-hover:text-nexo-sky transition-colors mb-3" />
                <h2 className="text-sm font-medium text-nexo-text group-hover:text-nexo-sky transition-colors mb-1">{tab.name}</h2>
                <p className="text-xs text-nexo-dim leading-relaxed mb-2">{tab.description}</p>
                <p className="text-[10px] text-nexo-faint font-mono">{tab.note}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
