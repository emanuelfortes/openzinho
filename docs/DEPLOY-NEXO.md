# Colocar o Nexo no ar

Guia para publicar o Nexo num servidor próprio (VPS), com login, HTTPS, backup diário e envio de e-mail. Tudo roda com Docker Compose a partir deste repositório.

## O que você precisa

- Um servidor Linux com Docker e o plugin Compose (por exemplo, uma VPS de 2 GB de RAM na Hetzner, Contabo ou Hostinger). Painéis como Coolify ou Dokploy também servem: eles usam o mesmo arquivo.
- Um domínio ou subdomínio (por exemplo, `painel.suaagencia.com.br`) com o DNS apontando para o IP do servidor.
- Sua conta DataForSEO (login e senha da API). Ela é cadastrada depois, em Configurações.
- Opcional: uma conta de envio de e-mail por SMTP (Google Workspace, Amazon SES, Brevo etc.) para alertas e relatórios.

## Passo a passo

1. No servidor, clone o repositório e entre na pasta do app:

   ```bash
   git clone https://github.com/emanuelfortes/openzinho.git
   cd openzinho/apps/web
   cp .env.example .env
   ```

2. Edite o `.env` e preencha a seção **Nexo**:
   - `NEXO_DOMAIN`, `NEXO_PUBLIC_URL` e `BETTER_AUTH_URL` com o seu endereço (`https://...`).
   - `SMTP_*`, se quiser e-mail.
   - O resto pode ficar como está.

3. Suba com HTTPS:

   ```bash
   docker compose -f docker-compose.nexo.yml --profile https up -d --build
   ```

   O Caddy emite e renova o certificado sozinho. Sem o perfil `https`, o app escuta só em `127.0.0.1:3000`, para você usar o seu próprio proxy.

4. Abra o endereço. A primeira visita pede para criar a conta de acesso; depois disso o cadastro fecha. Em seguida, vá em **Configurações**, informe as credenciais da DataForSEO, os tetos de gasto e os e-mails que recebem alertas.

## Atualizar

```bash
cd openzinho && git pull
cd apps/web && docker compose -f docker-compose.nexo.yml --profile https up -d --build
```

Os dados ficam no volume `nexo-data` e não são apagados na atualização.

## Backup

- Todo dia às 03h (fuso `NEXO_TIME_ZONE`), o Nexo copia todos os bancos para `/data/backups/AAAA-MM-DD/` dentro do volume e mantém os últimos `BACKUP_KEEP_DAYS` dias. O resultado aparece em **Configurações → Avisos e tarefas automáticas**.
- O backup fica no mesmo servidor. Copie a pasta para fora com regularidade (por exemplo, com `rclone` para um bucket ou outro servidor), senão uma falha de disco leva os dados e o backup juntos.
- Para restaurar: pare o app (`docker compose -f docker-compose.nexo.yml stop app worker`), copie os arquivos da pasta do dia de volta para `/data` (eles já têm os nomes originais), apague os `-wal` e `-shm` que sobrarem em `/data` e suba de novo.

## Cuidados

- O login vem ligado (`AUTH_ENABLED=true`). Hoje ele aceita uma única conta. Não exponha o painel sem login: ele gasta crédito da DataForSEO.
- A senha da DataForSEO fica no banco do servidor; a do SMTP fica só no `.env`. Não envie o `.env` para o Git.
- Os tetos de gasto em R$ são calculados pelo Nexo com a cotação configurada. Eles não são um limite aplicado pela DataForSEO: confira também o saldo na conta da DataForSEO.
- Mapas: as telas usam os tiles do OpenStreetMap, que não permite uso comercial pesado. Para muitos clientes, troque por um provedor de tiles próprio ou pago.
