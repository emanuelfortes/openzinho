# Prompt para Claude Code — Rebranding Nexo

Cole o texto abaixo no Claude Code, na raiz do repositório `openzinho`. Antes, copie a pasta `integracao/` baixada para a raiz do repo.

---

Estamos fazendo o rebranding do projeto para **Nexo**. A referência visual está em `integracao/` (leia `README-INTEGRACAO.md` e `globals.nexo.css` primeiro). Direção: fundo quase preto `#030508`, feixes verticais de luz azul no topo, painéis em glassmorphism (`rgba(255,255,255,0.03)` + borda `rgba(77,162,255,0.2)` + `backdrop-filter: blur(12px)`), cantos retos (4–6px), fonte Geist em pesos 300/400/500 (nunca 700/900), labels em caixa-alta com `letter-spacing: 0.08em`, paleta monocromática azul: `#1f6bff` (primária), `#4da2ff` (sky), `#c2e0ff` (ice, destaques), `#1246b8` (navy). Toda a interface em **português do Brasil**.

Faça em commits separados, nesta ordem:

## 1. Marca
- Trocar todas as ocorrências de "SEO Playground" e "legends-geogrid" por "Nexo" (código, README, `package.json`, `CloudronManifest.json`, metadados em `layout.tsx`, textos de PDF em `lib/brand*`).
- `lib/brand.ts`: `DEFAULT_BRAND_COLOR = '#1f6bff'`.
- Logo em `Sidebar.tsx` e `AuthShell.tsx`: substituir o ícone SVG por uma barra `8×20px`, `border-radius:2px`, `background:linear-gradient(180deg,#c2e0ff,#1f6bff)`, seguida do texto `NEXO` (peso 500, `letter-spacing:0.1em`).
- Gerar novo `favicon.svg` / `favicon.ico` com essa barra sobre fundo `#030508`.

## 2. Tokens globais
- Substituir `apps/web/src/app/globals.css` por `integracao/globals.nexo.css`. Manter `@import "tailwindcss"` e o `@custom-variant dark`.
- Em `layout.tsx` (root), forçar `className="dark"` no `<html>` e carregar Geist com `weight: ['300','400','500','600']`.
- Remover `ThemeToggle` do header (Nexo é dark-only) ou deixá-lo oculto.

## 3. Shell (`app/dashboard/layout.tsx`, `Sidebar.tsx`, header)
- Wrapper: `relative flex h-dvh bg-[var(--nexo-bg)] text-[var(--nexo-text)] overflow-hidden`, com `<div className="nexo-beams" />` como primeiro filho.
- Sidebar: `bg-[rgba(3,5,8,.6)] backdrop-blur-xl border-r border-[var(--nexo-border)]`; títulos de seção em `.nexo-section`; links com `.nexo-nav-link` e `aria-current="page"` no ativo (barra esquerda `#c2e0ff`, fundo `rgba(31,107,255,.18)`).
- Header: `h-14 border-b border-[var(--nexo-border)] bg-[rgba(3,5,8,.5)] backdrop-blur-xl`; `BalanceBadge` em mono `#c2e0ff` com borda `rgba(77,162,255,.35)`.
- Botão primário = branco com texto `#030508` (`.nexo-btn-primary`); botão de ação secundária azul (`.nexo-btn-accent`); ghost com borda branca 30% (`.nexo-btn-ghost`).

## 4. Páginas
Para cada `page.tsx` em `app/dashboard/**` e componentes associados:
- Substituir `bg-white dark:bg-slate-900 rounded-2xl/3xl border-slate-200 shadow-*` por `nexo-panel`.
- `h1`: `nexo-h1` (peso 300, `tracking -0.03em`, 40px). Subtítulo em `text-[var(--nexo-text-dim)]`.
- Labels `text-[10px] font-black uppercase tracking-widest text-slate-400` → `nexo-label`.
- Títulos de card `text-xs font-black uppercase text-slate-400` → `nexo-section`.
- Métricas grandes: `nexo-metric` + `font-mono` quando numérico.
- Inputs/selects/textarea: `nexo-input`; **sempre** `min-w-0 w-full`.
- Controles segmentados (agendamento, dispositivo, unidade, etc.): `.nexo-seg` com `aria-selected`.
- Tabelas: wrapper `overflow-x-auto`, `thead` em caixa-alta 10px.
- Grids de duas colunas (`xl:grid-cols-3`, `[1fr_280px]`, etc.) → `grid-cols-[repeat(auto-fit,minmax(320px,1fr))]` para refluir em telas estreitas.
- Estados de erro: borda `rgba(229,72,77,.4)`, texto `#fca5a5`. Avisos: `#f5a524`/`#fcd38d`. Sucesso/alvo: `#c2e0ff` (não verde).
- Remover emojis (`🎯` etc.) dos estados vazios.

## 5. Geo-grid (`local-finder/GridMap.tsx`, `geo-grid`, `lib/grid-preferences*`)
Escala monocromática azul dos pins:
- 1–3 → fundo `#c2e0ff`, texto `#030508`, `box-shadow: 0 0 18px rgba(194,224,255,.6)`
- 4–10 → `#4da2ff`, texto branco
- 11–20 → `#1246b8`, texto branco
- 20+ / não encontrado → `rgba(77,162,255,.1)` com borda `rgba(77,162,255,.4)`, texto `rgba(194,224,255,.45)`
Fonte dos pins em mono. Atualizar legenda e as cores do export PDF.

## 6. Tradução para pt-BR
Traduzir toda a UI (nav em `lib/nav.ts`, páginas, componentes, mensagens de erro, textos de PDF). Manter nomes de produto/API (DataForSEO, SERP, Rank Tracker, Geo-Grid, Local Finder, Backlinks). Usar `toLocaleString('pt-BR')` e `toLocaleDateString('pt-BR')` onde houver `en-GB`/`en-US`.

## 7. Studio (`src/` + `index.html`)
Aplicar o mesmo visual à landing/Studio: nav superior (sem sidebar), hero centralizado com `h1` "Domine o grid." em peso 300 ~120px com `text-shadow: 0 0 60px rgba(77,162,255,.6)`, feixes de luz no fundo, painéis glass, pins na escala azul acima. Trocar o texto para pt-BR e o nome para Nexo.

Ao final: rode `npm run lint` e `npm run build` em `apps/web`, corrija erros, e me devolva um resumo por commit do que mudou.
