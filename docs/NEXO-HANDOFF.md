# Nexo: estado do trabalho e próximos passos

Documento de passagem entre máquinas. Atualizado em 23/10/2026 (painel do dono do negócio, commit `5df46c9`).

## Nosso fluxo de trabalho

Vale para qualquer máquina e para o Claude Code.

1. **Ao começar:** `git pull origin main`, depois ler este arquivo (a parte "Onde paramos" logo abaixo) e o [ROADMAP-NEXO.html](ROADMAP-NEXO.html).
2. **Pedido ao Claude Code:** "leia docs/NEXO-HANDOFF.md e o roadmap e siga do próximo passo". Ele confere o código antes de assumir que algo está feito.
3. **Uma etapa por vez:** o Claude propõe o próximo passo, você diz "siga", ele faz, testa e mostra o resultado.
4. **Conferência antes de subir:** em `apps/web`, rodar `npx tsc --noEmit`, `npx eslint` nos arquivos mexidos, `npx vitest run` e `npx next build`. Mudança de tela também é testada no app rodando, com login ligado e um banco descartável (`AUTH_ENABLED=true DB_PATH=<pasta temporária>/smoke.db npx next dev -p 31xx`), nunca no banco de verdade.
5. **Subir:** commit e push direto na `main` depois de cada etapa conferida (só você trabalha no repositório).
6. **Registrar:** a cada etapa, marcar o item no bloco `ROADMAP` do roadmap (`s:'ok'`). Ao trocar de máquina, atualizar "Onde paramos" aqui.
7. **Segredos:** tokens e senhas (Mercado Pago, DataForSEO, SMTP, Google) ficam só no `.env` de cada máquina ou servidor, nunca no chat nem no git. O `.env` não vai no push: em máquina nova, copie `apps/web/.env.example` e preencha. O banco SQLite também não vai; cada máquina tem os próprios dados.
8. **Interface:** tudo em Next.js, em português do Brasil, tema escuro e paleta Nexo (classes `nexo-*` do Tailwind). Código novo vai em `apps/web/src/modules/`.

## Onde paramos (23/10/2026)

O modelo é **assinatura self-service**: o dono do negócio tem a própria conta, paga a mensalidade e usa sozinho. A equipe Nexo é administradora e pode cadastrar o perfil do cliente.

Feito nesta rodada:
- contas isoladas: administrador e cliente, com cada cliente vendo só o próprio negócio (`lib/access.ts`, `/dashboard/usuarios`);
- planos por negócio (Básico R$ 45, Intermediário R$ 59, Completo R$ 79), com limites de grade, palavras, frequência e teto de gasto; uma assinatura suspensa pausa as varreduras (`/dashboard/assinaturas`);
- alertas e relatório mensal enviados ao cliente de cada negócio;
- cobrança recorrente pelo Mercado Pago, pronta e **desligada** até configurar o token (veja [COBRANCA-MERCADOPAGO.md](COBRANCA-MERCADOPAGO.md));
- painel do dono do negócio: ao entrar, o cliente vê o mapa, as avaliações, os primeiros passos e "o que melhorar agora" (`modules/painel`). O administrador continua com a lista de ferramentas.

Testes: 524 passando no `apps/web`.

Próximos passos:
- **Dependem de você:**
  - pôr o token de teste do Mercado Pago no `.env`, para testar a cobrança;
  - pedir acesso à API do Google Business Profile (leva de 1 a 4 semanas);
  - escolher o provedor de IA para os rascunhos de resposta e de posts;
  - contratar servidor e domínio para publicar.
- **Dá para fazer sem nada externo:** convite e recuperação de senha por e-mail.
- **Mais adiante:** PostgreSQL, quando houver mais de um servidor.

## Histórico

Daqui para baixo fica o registro das rodadas anteriores (rebranding e 22/10).

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
| 4. Páginas | Feito | ver git log |
| 5. Pins do Geo-grid | Feito | ver git log |
| 6. Tradução pt-BR | Feito | ver git log |
| 7. Studio | Feito, em Next.js | ver git log |

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

Resultado (feito):
- O codemod rodou em 138 arquivos. A regra de sombra foi corrigida: antes ela apagava também a variável JS `shadow` em `GridMap.tsx`.
- Chips do painel inicial monocromáticos (laranja e amarelo viraram gelo, não cor de aviso).
- Corrigido texto branco sobre fundo gelo (badges que eram verdes).
- O cartão de saldo das Configurações e a barra "Start analysis" do Review Velocity eram contêineres escuros que o codemod tratou como botão; viraram `nexo-panel`.
- `nexo-seg` no modo do AI Visibility, na granularidade do Review Velocity e nas abas do Broken Backlinks. Agendamento, dispositivo e unidade são `<select>` ou cartões, não segmentados.
- Tabelas sem rolagem horizontal ganharam `overflow-x-auto`.
- Emoji removido do Rank Tracker.
- `tsc`, `lint`, `build` e 290 testes passam. No Windows, 7 arquivos de teste falham só na limpeza da pasta temporária (`EPERM` no `rmSync` com o SQLite aberto); já acontecia antes.

Observação: a cor do texto vence `nexo-label` no CSS compilado, então botões com `nexo-label` e cor explícita ficam legíveis.

### Passo 5: pins do Geo-grid (feito)

A escala fica num só lugar: [apps/web/src/lib/rank-scale.ts](../apps/web/src/lib/rank-scale.ts) (`rankTier`, `rankStyle`, `RANK_TIERS`), com testes.
- 1 a 3 → `#c2e0ff`, texto `#030508`, brilho; 4 a 10 → `#4da2ff`; 11 a 20 → `#1246b8`; mais de 20 ou não encontrado → `rgba(77,162,255,.1)` com borda, sobre um fundo escuro para ser legível em cima do mapa claro.
- Fonte mono nos pins. O selo de variação é escuro, com ganho em gelo e perda em `#fca5a5`. O popup do mapa está em tema escuro.
- Usam a escala: `GridMap`, legenda e grade de reserva do `GridResults`, PDF (grade de reserva e legenda; o mapa do PDF é uma captura do `GridMap`), prévia em Configurações, `GradeMetricsPanel`, `GridPositionTrend`, `RankDistributionChart` e `MapPicker`.
- Pendente, fora do Geo-grid: cores hex fixas em gráficos SVG de outros módulos (Google Reviews, Rank Tracker `KeywordRow`, Backlinks History, Historical Rank, mapa do Review Velocity). O codemod só trata classes Tailwind.

### Passo 6: tradução para pt-BR (feito)

Regra do projeto: tudo em Next.js e toda a interface em português do Brasil. Termos em [docs/GLOSSARIO-PTBR.md](GLOSSARIO-PTBR.md).
- Interface, erros que chegam à tela, PDF e Excel traduzidos; datas e números em `pt-BR`; dólar exibido como "US$ 1.234,56". CSV, chaves, valores enviados à DataForSEO e nomes de idioma/local da API continuam como a API espera (por exemplo `Portuguese`, `Brazil`).
- PDF com acentos: `pdfSafeText` mantém as letras Latin-1 do WinAnsi; não precisou embutir fonte.
- Padrões do Brasil: local `Brazil`, idioma `Portuguese` e mapa centrado em São Paulo, no lugar de França/Paris/inglês. O ChatGPT segue `English`/Estados Unidos porque a API só aceita isso.
- Projeto inicial de bancos novos: "Projeto padrão". Bancos existentes mantêm o nome gravado.
- Aviso de atualização: desligado por padrão. Só liga com `UPDATE_CHECK_REPO=dono/repositorio` apontando para os releases do Nexo; nunca consulta o SEO Playground original.
- Menu com nomes curtos dentro de cada seção (Visão geral, Ideias, Volume e CPC…); títulos das páginas e Gastos mantêm o nome completo.
- Pendente: o `seo-playground.db` e textos de lib que vêm crus da API (mensagens de status da DataForSEO) continuam em inglês.

### Passo 7: Studio (feito, em Next.js)

Decisão: o Studio virou uma ferramenta do painel (`/dashboard/studio`, seção SERP e local), não uma página pública. O Vite da raiz (`index.html`, `src/main.js`, `src/styles.css`) ficou como estava e não faz parte do produto.
- Código em [apps/web/src/modules/studio/](../apps/web/src/modules/studio/): `data.ts` (prova salva 17 x 17 e 5 x 5 em JSON enxuto, demo modelada, métricas, custo), `StudioMap.tsx` (Leaflet com pins, mapa de calor e evidências na escala azul) e `Studio.tsx`. Testes em `data.test.ts` conferem as métricas registradas da prova (64 fora do top 20, 34,6% no top 3, média 4,97).
- O planejador em lote não mostra mais o comando Python: calcula verificações e custo e leva a "Criar campanha" (`/dashboard/campaigns`).
- A campanha modelada da lista de palavras-chave usa exemplos brasileiros e é marcada como não real.
- Pendente: no celular a barra lateral do painel fica sempre aberta e cobre o conteúdo (vem do layout original, vale para todas as páginas).

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

## Rodada de 22/10/2026 (estado atual no roadmap)

O acompanhamento item a item agora fica em [docs/ROADMAP-NEXO.html](ROADMAP-NEXO.html). Nesta rodada entraram:
- tarefas diárias do worker (`/api/cron/jobs`): backup às 03h, monitor de avaliações às 07h e relatório mensal às 08h do dia 1;
- e-mail por SMTP configurado no ambiente e lista de destinatários em Configurações;
- deploy pronto: `apps/web/docker-compose.nexo.yml` e [docs/DEPLOY-NEXO.md](DEPLOY-NEXO.md);
- campanhas com dispositivo e profundidade, gasto do mês em R$ e relatório mensal com PDF e link secreto (`/r/<token>`);
- kit de pedido de avaliação, monitor com alerta de 1 a 3 estrelas e métricas de resposta;
- sugestão de palavras-chave a partir do site e do perfil;
- menu em gaveta no celular, gráficos na paleta Nexo, erros da DataForSEO em português, banner Nexo nos relatórios Python;
- Next.js 15.5.28 (correção de segurança) e nodemailer 10.

Testes: `npx vitest run --testTimeout=30000` em `apps/web` e `.venv\Scripts\python.exe -m unittest discover -s tests` na raiz (Python 3.12 criado com `uv` no disco F).
