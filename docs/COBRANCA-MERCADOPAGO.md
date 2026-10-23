# Cobrança recorrente pelo Mercado Pago

A cobrança já está pronta no código e fica **desligada** até você configurar o token. Sem o token, nada aparece para os clientes e a situação das assinaturas continua sendo mudada à mão na tela **Assinaturas**.

## Como funciona

1. Cada negócio é uma assinatura. O preço vem do plano do negócio (Básico R$ 45, Intermediário R$ 59, Completo R$ 79), em **Assinaturas**.
2. O cliente clica em **Assinar com Mercado Pago**, em "Minha conta" ou na tela de assinatura suspensa. O administrador também pode gerar o link em **Assinaturas** e enviar por e-mail ou WhatsApp.
3. O Nexo cria uma assinatura mensal no Mercado Pago, com o id do negócio como referência, e leva o cliente à página de pagamento do Mercado Pago. **O Nexo não vê nem guarda dados de cartão.**
4. A cada mudança, o Mercado Pago avisa o Nexo em `/api/webhooks/mercadopago`. O Nexo relê a situação na API do Mercado Pago, e por isso um aviso falso não consegue ativar nada.
   - Assinatura **autorizada** ou cobrança **aprovada**: a assinatura fica **Ativa**.
   - Assinatura **pausada** ou **cancelada**, ou uma cobrança que o Mercado Pago desistiu de tentar: a assinatura fica **Suspensa**. As varreduras automáticas param e o cliente vê o aviso com o botão para regularizar.
   - Cobranças ainda em nova tentativa não mudam nada.
5. Cada evento fica no histórico da coluna "Pagamento" em Assinaturas.

A cobrança automática todo mês é feita no **cartão de crédito**, que é o meio confirmado na documentação de assinaturas do Mercado Pago. Pix e boleto não ficaram confirmados para a recorrência automática. Se você quiser oferecer esses meios, isso precisa de cobrança avulsa mensal, que ainda não existe no Nexo.

## Passo a passo

### 1. Testar (nada é cobrado)

1. No [painel de desenvolvedores do Mercado Pago](https://www.mercadopago.com.br/developers/panel), crie uma aplicação do tipo pagamentos online e assinaturas.
2. Em **Credenciais → Teste**, copie o **Access Token**, que começa com `TEST-`.
3. No `.env` do `apps/web` (ou do servidor), coloque:
   ```
   MERCADOPAGO_ACCESS_TOKEN=TEST-...
   ```
4. Reinicie o Nexo. A tela **Assinaturas** passa a mostrar a coluna "Pagamento" e avisa que está em ambiente de teste.
5. Para os avisos chegarem, o Nexo precisa estar num endereço público (veja `docs/DEPLOY-NEXO.md`). Em **Suas integrações → Notificações / Webhooks**:
   - cadastre `https://SEU-DOMINIO/api/webhooks/mercadopago`;
   - marque os eventos de **Assinaturas** (planos, assinaturas e pagamentos autorizados);
   - salve e copie a **assinatura secreta** para o `.env`:
   ```
   MERCADOPAGO_WEBHOOK_SECRET=...
   ```
6. Faça uma assinatura de teste com uma conta compradora de teste e os cartões de teste do Mercado Pago. Confira em Assinaturas se a situação mudou para **Ativa**.

### 2. Cobrar de verdade

1. Em **Credenciais → Produção**, copie o Access Token (`APP_USR-...`) e troque no `.env`.
2. Confira se o endereço dos avisos e a assinatura secreta são os de produção.
3. Defina `NEXO_PUBLIC_URL` com o endereço público. É para lá que o cliente volta depois de pagar.
4. Reinicie e faça uma assinatura real de valor baixo para conferir o fluxo inteiro.

## Variáveis

| Variável | Para quê |
|---|---|
| `MERCADOPAGO_ACCESS_TOKEN` | Liga a cobrança. `TEST-` é o ambiente de teste e `APP_USR-` é cobrança real. Nunca coloque no git. |
| `MERCADOPAGO_WEBHOOK_SECRET` | Confere a assinatura (`x-signature`) de cada aviso. Sem ela, os avisos ainda são aceitos, porque o Nexo sempre relê a situação no Mercado Pago, mas configure-a em produção. |
| `NEXO_PUBLIC_URL` | Endereço para onde o cliente volta depois do pagamento. |

## O que conferir no ambiente de teste antes de ir para produção

Partes da documentação do Mercado Pago só foram lidas em resumo. No primeiro teste, confira:

- se a assinatura criada com `status: pending` devolve o link de pagamento (`init_point`) e se a página aceita pagar sem conta no Mercado Pago;
- os nomes exatos dos eventos de aviso que chegam (o Nexo trata `subscription_preapproval` e `subscription_authorized_payment`);
- a situação que a assinatura assume depois de cobranças recusadas e das novas tentativas do Mercado Pago;
- se o cancelamento usa `cancelled` ou `canceled` (o Nexo aceita os dois na leitura).

## Onde está no código

| Arquivo | O que faz |
|---|---|
| `apps/web/src/modules/cobranca/mercadopago.ts` | Chamadas à API, conferência da assinatura digital e tradução das situações. |
| `apps/web/src/modules/cobranca/billing.ts` | Guarda a cobrança de cada negócio, cria o link e aplica os avisos à assinatura. |
| `apps/web/src/modules/cobranca/actions.ts` | Botões "Assinar" (cliente) e "Gerar link" (administrador). |
| `apps/web/src/app/api/webhooks/mercadopago/route.ts` | Recebe os avisos. |
