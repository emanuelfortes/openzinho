// Recorded-shape fixtures for tests (no real provider calls). Values are synthetic.
import type { GbpProfile } from './types';

export const GBP_FIXTURE: GbpProfile = {
  title: 'Clínica Sorriso Feliz',
  category: 'Dentista',
  additionalCategories: ['Clínica odontológica', 'Ortodontista', 'Implantodontista'],
  description: 'Clínica com implante dentário, clareamento dental e ortodontia em São Paulo.',
  url: 'https://sorrisofeliz.com.br/',
  domain: 'sorrisofeliz.com.br',
  address: 'Rua Exemplo, 100 - Pinheiros, São Paulo - SP',
  cid: '1234567890123',
};

export const HOMEPAGE_HTML = `<!doctype html><html><head>
<title>Clínica Sorriso Feliz | Dentista em São Paulo - Implantes e Clareamento</title>
<meta name="description" content="Dentista em Pinheiros: implante dentário, clareamento dental, lentes de contato dental.">
<script>var x = "<h2>não é cabeçalho</h2>";</script>
</head><body>
<nav>
  <a href="/">Início</a>
  <a href="/servicos/implante-dentario">Implante dentário</a>
  <a href="/servicos/clareamento">Clareamento dental</a>
  <a href="/servicos/lentes-de-contato-dental">Lentes de contato dental</a>
  <a href="/contato">Fale conosco</a>
  <a href="https://instagram.com/sorriso">Instagram</a>
</nav>
<h1>Dentistas em São Paulo</h1>
<h2>Implantes dentários</h2>
<h2>Clareamento</h2>
<h2>Ortodontia</h2>
<h2>Nossa equipe</h2>
<h2>Bem-vindo à Clínica Sorriso Feliz</h2>
</body></html>`;

/** Wraps a result like DataForSEO's `tasks[0].result`. */
export function overviewResult(volumes: Record<string, number | null>, intents: Record<string, string> = {}) {
  return [{
    items: Object.entries(volumes).map(([keyword, volume]) => ({
      keyword,
      keyword_info: { search_volume: volume, competition_level: 'HIGH' },
      search_intent_info: { main_intent: intents[keyword] ?? 'commercial' },
    })),
  }];
}

export function gbpResult(profile: GbpProfile) {
  return [{
    items: [{
      type: 'google_business_info',
      title: profile.title,
      category: profile.category,
      additional_categories: profile.additionalCategories,
      description: profile.description,
      url: profile.url,
      domain: profile.domain,
      address: profile.address,
      cid: profile.cid,
    }],
  }];
}

export function mapsResult(cidAt: number | null, count = 10) {
  return [{
    items: Array.from({ length: count }, (_, i) => ({
      type: 'maps_search',
      title: i + 1 === cidAt ? 'Clínica Sorriso Feliz' : `Concorrente ${i + 1}`,
      cid: i + 1 === cidAt ? '1234567890123' : String(1000 + i),
      category: i % 3 === 0 ? 'Clínica odontológica' : 'Dentista',
    })),
  }];
}
