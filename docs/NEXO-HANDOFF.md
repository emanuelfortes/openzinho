# Nexo: estado do trabalho e próximos passos

Documento de passagem para continuar o rebranding em outra máquina. Atualizado em 19/10/2026.

## Como começar na máquina nova

```bash
git pull origin main
cd apps/web
npm ci
npm run dev        # app em http://localhost:3000 (sobe o worker junto)
```

Para o Claude Code: peça para ler `docs/PROMPT-CLAUDE-CODE.md` e este arquivo, e continuar do passo 4.

## Rebranding (docs/PROMPT-CLAUDE-CODE.md)

Referências visuais: `docs/Nexo Dashboard.dc.html`, `docs/Nexo Studio.dc.html` e `docs/Rebranding com sete modelos.zip` (contém `integracao/globals.nexo.css` e `README-INTEGRACAO.md`).

| Passo | Situação | Commit |
|---|---|---|
| 1. Marca | Feito | `5c47e5c` |
| 2. Tokens globais (Tailwind v4) | Feito | `10d8bb8` |
| 3. Shell (layout, sidebar, header, login) | Feito | `4d95a8f` |
| 4. Páginas | **Falta**; script pronto | – |
| 5. Pins do Geo-grid | **Falta** | – |
| 6. Tradução pt-BR | **Falta** | – |
| 7. Studio (`src/` + `index.html` na raiz) | **Falta** | – |

O pedido é um commit por passo, nesta ordem, e no fim rodar `npm run lint` e `npm run build` em `apps/web`.

### Decisões já tomadas

- **Tailwind em vez de CSS global.** O `globals.nexo.css` da referência trazia um bloco de sobrescritas com `!important`. Ele **não** foi usado: os tokens estão no `@theme` de [apps/web/src/app/globals.css](../apps/web/src/app/globals.css), os componentes estão como `@utility` e as páginas devem receber as classes novas direto (passo 4).
  - Classes disponíveis: `bg-nexo-bg`, `bg-nexo-surface`, `bg-nexo-surface-2`, `border-nexo-border`, `border-nexo-border-strong`, `text-nexo-text`, `text-nexo-dim`, `text-nexo-faint`, `text-nexo-blue` / `sky` / `ice` / `navy`, `nexo-danger(-text)`, `nexo-warn(-text)`, `rounded-nexo` (4px), `rounded-nexo-lg` (6px).
  - Componentes: `nexo-panel`, `nexo-h1`, `nexo-label`, `nexo-section`, `nexo-metric`, `nexo-input`, `nexo-btn-primary`, `nexo-btn-accent`, `nexo-btn-ghost`, `nexo-seg`, `nexo-pin`, `nexo-pin-top` / `mid` / `low` / `none`, `nexo-nav-link`, `nexo-beams`.
- **Tema só escuro.** `<html class="dark">` é fixo e o ThemeToggle foi removido. As classes `dark:*` que restam nas páginas não têm mais função e saem no passo 4.
- **Nome que ficou igual, de propósito:**
  - a atribuição MIT no LICENSE, no THIRD_PARTY_NOTICES e nos READMEs;
  - o arquivo do banco `seo-playground.db`, para não perder dados;
  - o canal interno do ProjectSync;
  - a checagem de atualização, que aponta para o repositório upstream;
  - as imagens Docker e o CloudronVersions.json, que é histórico do upstream;
  - os caminhos `~/.config/legends-geogrid` e o `consumer="legends-geogrid"` da dependência legends-dataforseo;
  - o banner em PNG dos relatórios Python, que ainda é o do legends.
- **Link de afiliado da DataForSEO.** O link é do Paul Massen (autor do SEO Playground), então o texto dele credita o projeto original em vez de dizer "apoie o Nexo".
- **Cor padrão da marca nos PDFs:** `#1f6bff`. O cálculo de contraste do cabeçalho usa uma tinta escura separada (`REPORT_INK`).

### Passo 4: páginas

O script está em [apps/web/scripts/nexo-codemod.mjs](../apps/web/scripts/nexo-codemod.mjs).

```bash
cd apps/web
node scripts/nexo-codemod.mjs src --dry   # só conta: "138 of 212 files would change"
node scripts/nexo-codemod.mjs src         # grava
```

O que ele faz:
- remove todas as classes `dark:*`;
- troca as cores:
  - `slate`/`gray` viram os tokens neutros;
  - os tons de azul viram `nexo-blue`/`sky`/`ice`;
  - verde vira `nexo-ice` (sucesso agora é gelo, não verde);
  - vermelho vira `nexo-danger`/`danger-text`;
  - âmbar e laranja viram `nexo-warn`/`warn-text`;
- transforma o botão `bg-slate-900` + `text-white` em botão branco com texto `#030508`;
- troca `font-black`/`font-bold` por `font-medium`, deixa os cantos em 4/6px e remove as sombras;
- transforma rótulos pequenos em caixa-alta em `nexo-label` (ou `nexo-section`, quando são azuis);
- transforma `h1` em `nexo-h1`, e números grandes (`text-2xl` + `tabular-nums`) em `nexo-metric font-mono`;
- coloca `nexo-input min-w-0 w-full` em `input`, `select`, `textarea` e nas constantes `inputCls`/`fieldCls`;
- troca as grades com colunas fixas em px e `xl:grid-cols-3` por `grid-cols-[repeat(auto-fit,minmax(320px,1fr))]`.

Ele **não** toca nos testes, nem em `lib/brand*`, `report-pdf-blocks`, `review-report-pdf` e `map-capture`.

Depois de rodar, ainda falta:
1. Revisar o diff e as telas principais. Os botões e chips coloridos do painel inicial (`lib/nav.ts`, `NavColor`) podem precisar de ajuste manual, já que o laranja e o amarelo viram cor de aviso.
2. Remover o emoji 🎯 do estado vazio em `app/dashboard/rank-tracker/page.tsx`, perto da linha 191.
3. Trocar à mão os controles segmentados (agendamento, dispositivo, unidade) por `nexo-seg` com `aria-selected`.
4. Conferir as tabelas: o wrapper deve ter `overflow-x-auto` e o `thead` já está em caixa-alta 10px pelo `@layer base`.
5. Rodar `npx tsc --noEmit`, `npm run lint`, `npx vitest run` e `npm run build`.

### Passo 5: pins do Geo-grid

Escala azul monocromática:
- 1 a 3 → `#c2e0ff`, texto `#030508`, brilho `0 0 18px rgba(194,224,255,.6)`;
- 4 a 10 → `#4da2ff`, texto branco;
- 11 a 20 → `#1246b8`, texto branco;
- mais de 20 ou não encontrado → `rgba(77,162,255,.1)`, borda `rgba(77,162,255,.4)`, texto `rgba(194,224,255,.45)`.

A fonte dos pins é mono.

Onde mudar:
- `app/dashboard/local-finder/GridMap.tsx`: `rankColor`, `rankTextColor`, o HTML do popup (cores claras pensadas para fundo branco) e o texto do pin, que hoje é sempre branco;
- `GridResults.tsx`: `rankColor` e a legenda;
- `GridPdfExportButton.tsx`: `rankColor` em RGB, usado no PDF;
- `GridPositionTrend.tsx`;
- `settings/GridPreferenceFields.tsx`: a prévia;
- `historical-rank/RankDistributionChart.tsx`;
- `modules/grade/GradeMetricsPanel.tsx`: as faixas;
- `MapPicker.tsx`: os pontos da prévia.

### Passo 6: tradução para pt-BR

- Traduzir toda a interface: `lib/nav.ts`, as páginas, os componentes, as mensagens de erro e os textos de PDF.
- Manter os nomes de produto e de API: DataForSEO, SERP, Rank Tracker, Geo-Grid, Local Finder, Backlinks.
- Trocar `en-GB` e `en-US` por `pt-BR` em `toLocaleString` e `Intl.DateTimeFormat`, e usar `<html lang="pt-BR">` em `app/layout.tsx`.
- Atenção: `pdfText()` em `GridPdfExportButton.tsx` remove os acentos (as fontes padrão do PDF são WinAnsi). Os textos em pt-BR saem sem acento no PDF, a menos que se embuta uma fonte.
- São cerca de 150 arquivos `.tsx`. Dá para dividir por pasta entre vários agentes.

### Passo 7: Studio

Arquivos: `index.html`, `src/main.js` e `src/styles.css` na raiz (Vite, sem React).
- Navegação superior, sem sidebar.
- Hero centralizado com o `h1` "Domine o grid." em peso 300, cerca de 120px, com `text-shadow: 0 0 60px rgba(77,162,255,.6)`.
- Feixes de luz no fundo, painéis de vidro e pins na escala azul do passo 5.
- Textos em pt-BR e nome Nexo.
- Os links para o GitHub do legends-geogrid ficam só como atribuição.
- Referência visual: `docs/Nexo Studio.dc.html`.

## Avisos sobre o ambiente

- **Python:** a máquina anterior não tinha Python, então os testes Python (`pnpm test` na raiz, 271 testes) **não rodaram** depois do passo 1. O passo 1 mudou textos em `tools/strategy_report.py`, `tools/study_proposal.py` e `tools/local_heatmap_poc.py`, e a asserção em `tests/test_strategy_report.py` passou a esperar `Nexo`. Rode `pnpm test` na máquina nova.
- **Tempo dos testes:** os do `apps/web` podem estourar o limite de 5 s em discos lentos ou no OneDrive. A primeira abertura de banco carrega as tabelas da DataForSEO. Se acontecer, rode `npx vitest run --testTimeout=30000`.
- **Tipos antigos:** se `tsc` reclamar de `.next/types/...` de uma página que não existe, apague a pasta `.next`.
- **Quebras de linha:** alguns arquivos usam CRLF. Scripts de substituição com várias linhas precisam levar isso em conta.

## Roteiro do produto (depois do rebranding)

Plano da Fase 1, sem a API do Google:
1. seo-playground em `apps/web` ✓;
2. métricas da grade ✓;
3. campanhas com várias palavras e frequência quinzenal/mensal ✓;
4. pontos inativos (mar, rio) — revertido, refazer quando for a hora;
5. estimativa em R$ e teto de gasto por cliente;
6. ponte com as ferramentas Python (sugestão de palavras, relatório estratégico);
7. PDF mensal com comparação ao mês anterior.

Código novo vai em `apps/web/src/modules/`, mexendo o mínimo no código do seo-playground. SQLite segue na Fase 1; migrar para PostgreSQL antes de liberar equipe e vários usuários. Pedir o acesso à API do Google Business Profile, que demora de 1 a 4 semanas.
