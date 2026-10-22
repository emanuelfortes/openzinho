import type { ComponentType } from 'react';
import {
  LayoutDashboard, Search, Globe, Settings, MapPin, FileSearch2,
  TrendingUp, Link2, Users, BarChart2, Activity, GitMerge, Clock, FolderKanban, Anchor,
  Gauge, Lightbulb, BrainCircuit, Star, Flame, Cpu, ShieldCheck, Grid3X3,
  Sparkles, Target, Layers, Network, LineChart, Tag, ScanText,
  History, Copy, BarChart3, BookOpen, Server, Bot, Radar, Eye, Waypoints, Megaphone, Wallet, CalendarCheck, Unlink, Trophy, Telescope,
} from 'lucide-react';

// Single source of truth for the tool list: the Sidebar and the Dashboard home both render from it.

export interface NavItem {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  desc: string;
  exact?: boolean;
}

export type NavColor = 'blue' | 'violet' | 'indigo' | 'emerald' | 'orange' | 'pink' | 'yellow' | 'slate';

export interface NavSection {
  /** Stable id, stored in the sidebar collapsed-state cookie. */
  key: string;
  label: string;
  color: NavColor;
  items: NavItem[];
}

// Grouped by task rather than by DataForSEO API.
export const NAV_SECTIONS: NavSection[] = [
  {
    key: 'overview',
    label: 'Visão geral',
    color: 'blue',
    items: [
      { name: 'Painel', href: '/dashboard', icon: LayoutDashboard, desc: 'Todas as ferramentas em um só lugar', exact: true },
      { name: 'Rank Tracker', href: '/dashboard/rank-tracker', icon: Activity, desc: 'Acompanhe a posição das palavras-chave ao longo do tempo' },
    ],
  },
  {
    key: 'keywords',
    label: 'Palavras-chave',
    color: 'indigo',
    items: [
      { name: 'Visão geral', href: '/dashboard/keyword-overview', icon: BarChart2, desc: 'Volume e métricas por palavra-chave' },
      { name: 'Ideias', href: '/dashboard/keyword-ideas', icon: Sparkles, desc: 'Ideias de palavras-chave a partir de um termo-semente, com intenção' },
      { name: 'Relacionadas', href: '/dashboard/related-keywords', icon: Lightbulb, desc: 'Sugestões de palavras-chave relacionadas' },
      { name: 'Volume e CPC', href: '/dashboard/keyword-data', icon: Search, desc: 'Volume de buscas e CPC no Google Ads e no Bing' },
      { name: 'Dificuldade', href: '/dashboard/keyword-difficulty', icon: Gauge, desc: 'Pontuação de dificuldade de SEO em massa' },
      { name: 'Intenção de busca', href: '/dashboard/search-intent', icon: Target, desc: 'Classifique palavras-chave por intenção de busca' },
      { name: 'Principais buscas', href: '/dashboard/top-searches', icon: Flame, desc: 'Palavras-chave mais buscadas em um mercado' },
    ],
  },
  {
    key: 'domains',
    label: 'Domínios',
    color: 'violet',
    items: [
      { name: 'Palavras ranqueadas', href: '/dashboard/ranked-keywords', icon: TrendingUp, desc: 'Palavras-chave em que um domínio ranqueia' },
      { name: 'Concorrentes', href: '/dashboard/competitors', icon: Users, desc: 'Domínios que disputam as mesmas SERPs' },
      { name: 'Interseção de domínios', href: '/dashboard/domain-intersection', icon: GitMerge, desc: 'Palavras-chave em comum entre dois domínios' },
      { name: 'Interseção de páginas', href: '/dashboard/page-intersection', icon: Layers, desc: 'Palavras-chave em comum entre várias páginas' },
      { name: 'Histórico de ranking', href: '/dashboard/historical-rank', icon: Clock, desc: 'Evolução do ranking ao longo do tempo' },
      { name: 'Subdomínios', href: '/dashboard/subdomains', icon: Network, desc: 'Subdomínios ordenados por tráfego orgânico' },
      { name: 'Estimativa de tráfego', href: '/dashboard/traffic-estimation', icon: LineChart, desc: 'Tráfego orgânico em massa para uma lista de domínios' },
      { name: 'Tecnologias', href: '/dashboard/domain-analytics/technologies', icon: Cpu, desc: 'Tecnologias usadas pelos domínios' },
      { name: 'Whois', href: '/dashboard/domain-analytics/whois', icon: ShieldCheck, desc: 'Dados de registro do domínio' },
      { name: 'Categorias', href: '/dashboard/domain-analytics/categories', icon: Tag, desc: 'Categorias temáticas de um domínio' },
    ],
  },
  {
    key: 'backlinks',
    label: 'Backlinks',
    color: 'emerald',
    items: [
      { name: 'Backlinks', href: '/dashboard/backlinks', icon: Link2, desc: 'Lista de links recebidos', exact: true },
      { name: 'Domínios de referência', href: '/dashboard/backlinks/referring-domains', icon: FolderKanban, desc: 'Domínios que apontam para você' },
      { name: 'Backlinks quebrados', href: '/dashboard/backlinks/broken', icon: Unlink, desc: 'Links para páginas 4xx/5xx que dá para recuperar' },
      { name: 'Âncoras', href: '/dashboard/backlinks/anchors', icon: Anchor, desc: 'Textos âncora em uso' },
      { name: 'Redes de referência', href: '/dashboard/backlinks/referring-networks', icon: Server, desc: 'Sub-redes de IP que enviam backlinks' },
      { name: 'Interseção de páginas', href: '/dashboard/backlinks/page-intersection', icon: Copy, desc: 'Páginas que apontam para vários alvos' },
      { name: 'Interseção de domínios', href: '/dashboard/backlinks/domain-intersection', icon: BookOpen, desc: 'Domínios que apontam para você e para um concorrente' },
      { name: 'Histórico', href: '/dashboard/backlinks/history', icon: History, desc: 'Evolução dos backlinks ao longo do tempo' },
      { name: 'Backlinks em massa', href: '/dashboard/backlinks/bulk-backlinks', icon: BarChart3, desc: 'Resumo de backlinks para uma lista de domínios' },
      { name: 'Domínios de ref. em massa', href: '/dashboard/backlinks/bulk-referring-domains', icon: Layers, desc: 'Domínios de referência para uma lista de domínios' },
    ],
  },
  {
    key: 'serp-local',
    label: 'SERP e local',
    color: 'orange',
    items: [
      { name: 'Studio', href: '/dashboard/studio', icon: Telescope, desc: 'Demonstração interativa com uma varredura real salva' },
      { name: 'Verificador de SERP', href: '/dashboard/serp', icon: Globe, desc: 'Resultados orgânicos do Google em tempo real' },
      { name: 'Local Finder', href: '/dashboard/local-finder', icon: MapPin, desc: 'Resultados do pacote local em qualquer local' },
      { name: 'Ranking Geo-Grid', href: '/dashboard/geo-grid', icon: Grid3X3, desc: 'Mapa de calor do ranking em uma grade de pontos' },
      { name: 'Campanhas de grade', href: '/dashboard/campaigns', icon: CalendarCheck, desc: 'Várias palavras-chave em uma grade agendada' },
      { name: 'Painel de clientes', href: '/dashboard/clientes', icon: Users, desc: 'Todas as campanhas de todos os clientes, em lista e mapa' },
    ],
  },
  {
    key: 'ai',
    label: 'IA',
    color: 'pink',
    items: [
      { name: 'Otimização para IA', href: '/dashboard/ai-optimization', icon: BrainCircuit, desc: 'Visibilidade em respostas geradas por IA' },
      { name: 'Visibilidade em IA', href: '/dashboard/ai-visibility', icon: Eye, desc: 'Com que frequência os LLMs mencionam um domínio ou marca' },
      { name: 'Teste de prompt em IA', href: '/dashboard/llm-responses', icon: Bot, desc: 'Veja o que ChatGPT, Claude e Gemini respondem' },
      { name: 'Palavras-chave em IA', href: '/dashboard/ai-keyword-data', icon: Radar, desc: 'Volume de palavras-chave em ferramentas de IA' },
      { name: 'Query Fan-Out', href: '/dashboard/query-fan-out', icon: Waypoints, desc: 'Subconsultas ocultas por trás das respostas de IA' },
      { name: 'Monitor de prompts', href: '/dashboard/prompt-tracker', icon: CalendarCheck, desc: 'Execute prompts de novo e acompanhe menções à marca ao longo do tempo' },
    ],
  },
  {
    key: 'business',
    label: 'Negócio',
    color: 'yellow',
    items: [
      { name: 'Avaliações do Google', href: '/dashboard/google-reviews', icon: Star, desc: 'Avaliações do Google e metas de nota' },
      { name: 'Ritmo de avaliações', href: '/dashboard/review-velocity', icon: Trophy, desc: 'Compare concorrentes locais pelo ritmo de avaliações e respostas' },
      { name: 'Menções na web', href: '/dashboard/web-mentions', icon: Megaphone, desc: 'Menções à marca e sentimento na web' },
    ],
  },
  {
    key: 'site-audit',
    label: 'Auditoria do site',
    color: 'slate',
    items: [
      { name: 'On-page', href: '/dashboard/on-page', icon: FileSearch2, desc: 'Rastreamento do site, auditoria instantânea de páginas, microdados' },
      { name: 'Análise de conteúdo', href: '/dashboard/on-page/content-parsing', icon: ScanText, desc: 'Extraia e estruture o conteúdo de uma página' },
    ],
  },
];

// Pinned at the bottom of the sidebar, outside the filter
export const NAV_FOOTER: NavItem[] = [
  { name: 'Gastos', href: '/dashboard/spending', icon: Wallet, desc: 'Quanto suas chamadas à DataForSEO custam, por ferramenta' },
  { name: 'Configurações', href: '/dashboard/settings', icon: Settings, desc: 'Credenciais e identidade dos relatórios' },
];
