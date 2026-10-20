# Glossário pt-BR do Nexo

Referência única para traduzir a interface de `apps/web`. Toda a interface fica em português do Brasil.

## Regras

- Tom direto, com "você" implícito. Botões no infinitivo ou imperativo curto: "Salvar", "Adicionar", "Verificar agora".
- Caixa de frase: só a primeira letra maiúscula ("Palavras-chave relacionadas", não "Palavras-Chave Relacionadas").
- Rótulos em caixa-alta são feitos por CSS (`uppercase`, `nexo-label`). Escreva o texto em caixa normal.
- Datas e números: `'pt-BR'` em `toLocaleString`, `toLocaleDateString`, `Intl.DateTimeFormat` e `Intl.NumberFormat`. Valores em dólar: `toLocaleString('pt-BR', { style: 'currency', currency: 'USD' })` (sai "US$ 1.234,56"). Quando o código monta "$" + `toFixed(n)` à mão, use "US$ " e vírgula decimal só se for exibição; nunca mude CSV, JSON, valores de `input`, chaves, query strings nem o que é enviado à API.
- Não traduza: nomes de produto e de API (DataForSEO, Google, Google Maps, Google Business Profile, SERP, Geo-Grid, Local Finder, Rank Tracker, Backlinks, ChatGPT, Gemini, Perplexity, Claude), códigos e valores técnicos (`live`, `standard`, `priority`, `dofollow`, `nofollow`, `4xx`, `5xx`, `CID`, `URL`, `HTML`, `CSV`, `PDF`), nomes de colunas/chaves de dados, rotas, nomes de arquivos e identificadores de código.
- Não mude a lógica. Só textos visíveis: JSX, `placeholder`, `title`, `aria-label`, `alt`, mensagens de erro mostradas ao usuário, textos de PDF/Excel, `metadata` das páginas, rótulos em arrays de configuração (`label`, `desc`, `name` exibidos).
- Mensagens de erro lançadas no servidor que chegam à tela também são traduzidas. Logs de console podem ficar em inglês.
- Comentários de código ficam como estão.
- Plural: trate os dois casos ("1 palavra-chave" / "3 palavras-chave"); "s" condicional em inglês vira a forma completa em português.
- Se um teste verifica um texto traduzido, atualize o teste.

## Termos

| Inglês | Português |
|---|---|
| Dashboard | Painel |
| Project / Projects | Projeto / Projetos |
| Settings | Configurações |
| Spending | Gastos |
| Balance | Saldo |
| Credits | Créditos |
| Keyword(s) | Palavra(s)-chave |
| Keyword Overview | Visão geral de palavras-chave |
| Keyword Ideas | Ideias de palavras-chave |
| Related Keywords | Palavras-chave relacionadas |
| Keyword Data | Dados de palavras-chave |
| Keyword Difficulty | Dificuldade de palavras-chave |
| Search Intent | Intenção de busca |
| Search volume | Volume de buscas |
| Top Searches | Principais buscas |
| Ranked Keywords | Palavras-chave ranqueadas |
| Competitors | Concorrentes |
| Domain Intersection | Interseção de domínios |
| Page Intersection | Interseção de páginas |
| Historical Rank | Histórico de ranking |
| Subdomains | Subdomínios |
| Traffic Estimation | Estimativa de tráfego |
| Technologies | Tecnologias |
| Categories | Categorias |
| Referring Domains | Domínios de referência |
| Broken Backlinks | Backlinks quebrados |
| Anchors | Âncoras |
| Referring Networks | Redes de referência |
| History | Histórico |
| Bulk | Em massa |
| SERP Checker | Verificador de SERP |
| Geo-Grid Ranking | Ranking Geo-Grid |
| Grid Campaigns | Campanhas de grade |
| Monitor | Monitor |
| Snapshot | Varredura |
| Timeline | Linha do tempo |
| Grid | Grade |
| Grid size | Tamanho da grade |
| Spacing | Espaçamento |
| Center | Centro |
| Target | Alvo |
| Rank / Position | Posição |
| Average position | Posição média |
| Not found | Não encontrado |
| Top 3 / Top 10 | Top 3 / Top 10 |
| Share of Voice | Share of Voice |
| Schedule / Scheduled | Agendamento / Agendado |
| Daily / Weekly / Biweekly / Monthly | Diário / Semanal / Quinzenal / Mensal |
| Queue | Fila |
| Check / Check now | Verificação / Verificar agora |
| Run | Execução |
| Pending | Pendente |
| Ready | Pronto |
| Failed | Falhou |
| Location | Local |
| Language | Idioma |
| Device | Dispositivo |
| Desktop / Mobile | Desktop / Celular |
| Results | Resultados |
| Export | Exportar |
| Download PDF | Baixar PDF |
| Copy Markdown | Copiar Markdown |
| Save | Salvar |
| Delete | Excluir |
| Cancel | Cancelar |
| Add | Adicionar |
| Search | Buscar |
| Filter | Filtrar |
| Loading… | Carregando… |
| No data | Sem dados |
| Cost | Custo |
| Estimate | Estimativa |
| Reviews | Avaliações |
| Rating | Nota |
| Review Velocity | Ritmo de avaliações |
| Listing | Perfil (no Google) |
| Owner reply | Resposta do proprietário |
| Web Mentions | Menções na web |
| AI Visibility | Visibilidade em IA |
| AI Optimization | Otimização para IA |
| AI Prompt Test | Teste de prompt em IA |
| AI Keyword Data | Dados de palavras-chave em IA |
| Prompt Tracker | Monitor de prompts |
| Query Fan-Out | Query Fan-Out |
| Mention / Mentioned | Menção / Mencionado |
| Cited / Not cited | Citado / Não citado |
| Site Audit | Auditoria do site |
| On Page | On-page |
| Content Parsing | Análise de conteúdo |
| Instant Pages | Páginas instantâneas |
| Microdata | Microdados |
| Crawl | Rastreamento |
| Indexable / Non-indexable | Indexável / Não indexável |
| White-label reports | Relatórios com sua marca |
| Brand name | Nome da marca |
| Footer | Rodapé |
| Header | Cabeçalho |
| Credentials | Credenciais |
| Sign in / Sign out | Entrar / Sair |
| Update available | Atualização disponível |
| Release notes | Notas da versão |
| Favorites | Favoritos |
| Collapse all | Recolher tudo |
| Filter tools | Filtrar ferramentas |
