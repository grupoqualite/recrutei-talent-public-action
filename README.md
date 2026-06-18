# Recrutei Talent Public Action

Middleware somente leitura para conectar um GPT Action à Base Pública de Talentos do Recrutei.

## O que este pacote entrega

- API HTTP pronta para o GPT Action:
  - `POST /recrutei/talent/public/search`
  - `GET /recrutei/talent/public/{talentoId}/profile`
  - `GET /recrutei/talent/public/{talentoId}/resume`
- OpenAPI schema em `openapi.yaml`
- Sanitização básica de dados sensíveis antes do retorno ao GPT
- Modo `mock` para testar a Action imediatamente
- Modo `api` para conectar à API real/oficial do Recrutei ou a um backend interno

## O que ele NÃO faz

Ele não faz scraping da tela `https://app.recrutei.com.br/talent/public`.
Ele precisa de uma API JSON real por trás para consultar a mesma base dessa tela.

## Como rodar localmente

```bash
npm install
cp .env.example .env
npm start
```

Teste:

```bash
curl -X POST http://localhost:3000/recrutei/talent/public/search \
  -H "Content-Type: application/json" \
  -H "X-API-Key: troque-por-uma-chave-forte" \
  -d '{"base":"talent_public","palavrasChave":"Python OpenAI LLM","limite":5}'
```

## Como publicar

Publique em qualquer ambiente com HTTPS, por exemplo Render, Railway, Fly.io, AWS, Azure, GCP ou servidor próprio.

Depois altere no `openapi.yaml`:

```yaml
servers:
  - url: https://SEU-DOMINIO-DO-MIDDLEWARE
```

## Como conectar à base real

No servidor, configure:

```env
RECRUTEI_MODE=api
RECRUTEI_SEARCH_URL=https://URL-REAL-DA-API-RECRUTEI/search
RECRUTEI_PROFILE_URL_TEMPLATE=https://URL-REAL-DA-API-RECRUTEI/{talentoId}/profile
RECRUTEI_RESUME_URL_TEMPLATE=https://URL-REAL-DA-API-RECRUTEI/{talentoId}/resume
RECRUTEI_AUTH_HEADER_NAME=Authorization
RECRUTEI_API_TOKEN=Bearer token-seguro
```

Esses endpoints precisam consultar a mesma base exibida em `/talent/public`.

## Como configurar no GPT

1. Abra o editor do GPT.
2. Vá em Configure > Actions.
3. Importe ou cole o conteúdo de `openapi.yaml`.
4. Configure a autenticação como API Key.
5. Header: `X-API-Key`.
6. Valor: o mesmo configurado em `ACTION_API_KEY` no servidor.
7. Teste a operação `buscarTalentosNaBasePublica`.
