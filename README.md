# SFMC MCP Server

> Conecte o Claude (ou qualquer client MCP) ao Salesforce Marketing Cloud. Explore Data Extensions, consulte registros e **valide queries do Automation Studio antes de rodá-las**.

[![npm version](https://img.shields.io/npm/v/sfmc-mcp-server.svg)](https://www.npmjs.com/package/sfmc-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## O problema

Quem opera SFMC conhece a rotina: você escreve uma Query Activity, salva, roda a automação — e **30 minutos depois** descobre que digitou `EmailAdress` em vez de `EmailAddress`. Ou que usou um `ORDER BY`, que o dialeto do Automation Studio não suporta. Ou que a coluna de saída não existe na DE de destino.

O feedback loop do SFMC é medido em dezenas de minutos. Este servidor MCP reduz para segundos.

## O que ele faz

| Tool | O que resolve |
|---|---|
| `validate_sql` | Valida uma Query Activity **antes** de executar: regras do dialeto restrito do SFMC + checagem de que as DEs e colunas realmente existem |
| `list_data_extensions` | Lista DEs com metadados, filtro por nome, paginação e schema completo |
| `query_data_extension` | Consulta registros com filtro, ordenação e paginação |

### `validate_sql` em ação

```
Você: valide essa query pra mim

SELECT c.SubscriberKey, c.EmailAdress, c.LastPurchaseDate
FROM Customers_Master c
ORDER BY c.CreatedDate DESC
```

```
❌ INVÁLIDA — 3 erro(s) bloqueante(s).

1. ORDER BY não é suportado em Query Activities do SFMC. [linha ~3]
   → Se precisar de ranking, use ROW_NUMBER() OVER (ORDER BY ...) em subquery.

2. A coluna "EmailAdress" não existe na DE "Customers_Master".
   → Você quis dizer "EmailAddress"?

3. A coluna "LastPurchaseDate" não existe na DE "Customers_Master".
   → Campos disponíveis: SubscriberKey, EmailAddress, FirstName, Status, CreatedDate
```

**O que ele detecta:**

*Regras do dialeto* — `ORDER BY`, CTEs (`WITH`), `MERGE`, DML/DDL, variáveis (`DECLARE @`), temp tables (`#temp`), cursores, stored procedures, `FULL OUTER JOIN`, parênteses desbalanceados, `SELECT *` arriscado, `GETDATE()` em fuso do servidor.

*Contra o schema real* — DEs inexistentes, colunas inexistentes (com sugestão de correção via distância de edição), aliases não declarados, colunas de saída incompatíveis com a DE de destino, **PK do destino ausente no SELECT** (a falha silenciosa mais cara do SFMC).

---

## Instalação

```bash
npx sfmc-mcp-server
```

Ou instalando localmente:

```bash
npm install -g sfmc-mcp-server
```

## Configuração

### 1. Crie um Installed Package no SFMC

**Setup → Apps → Installed Packages → New → Add Component → API Integration (Server-to-Server)**

Permissões mínimas (somente leitura):
- **Data Extensions**: Read
- **Automations**: Read

Anote o **Client ID**, o **Client Secret** e o **subdomínio** (a parte antes de `.auth.marketingcloudapis.com`).

### 2. Configure o Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
`%APPDATA%\Claude\claude_desktop_config.json` (Windows)

```json
{
  "mcpServers": {
    "sfmc": {
      "command": "npx",
      "args": ["-y", "sfmc-mcp-server"],
      "env": {
        "SFMC_SUBDOMAIN": "mcXXXXXXXXXXXXXXXXXXXXXX",
        "SFMC_CLIENT_ID": "seu_client_id",
        "SFMC_CLIENT_SECRET": "seu_client_secret",
        "SFMC_MODE": "read"
      }
    }
  }
}
```

Reinicie o Claude Desktop. Pronto.

### Múltiplas Business Units

Uma entrada por BU, cada uma com seu `SFMC_ACCOUNT_ID` (o MID):

```json
{
  "mcpServers": {
    "sfmc-varejo": {
      "command": "npx",
      "args": ["-y", "sfmc-mcp-server"],
      "env": { "SFMC_ACCOUNT_ID": "1234567", "...": "..." }
    },
    "sfmc-b2b": {
      "command": "npx",
      "args": ["-y", "sfmc-mcp-server"],
      "env": { "SFMC_ACCOUNT_ID": "7654321", "...": "..." }
    }
  }
}
```

---

## Exemplos de uso

- *"Valide essa query contra a DE de destino `Active_Buyers`"* → aponta erros antes de você perder 30 min
- *"Liste as DEs que têm 'master' no nome, com os campos"* → schema completo sem abrir o Contact Builder
- *"Quantos registros ativos tem a `Customers_Master`?"* → consulta direta com filtro
- *"Essa DE tem chave primária? Quais campos são NOT NULL?"* → auditoria de schema em segundos

---

## Segurança

- **Somente leitura por padrão.** `SFMC_MODE=read` é o default. Tools de escrita (roadmap) só serão registradas com `SFMC_MODE=write`.
- **Credenciais apenas via variáveis de ambiente.** Nunca commitadas, nunca em disco.
- **Log de auditoria.** Toda tool call vai para stderr com timestamp e argumentos — redirecione para arquivo ou coletor conforme sua política.
- **Sem retenção.** O servidor não persiste dados do SFMC.

---

## Arquitetura

```
src/
├── index.ts               # Entry point — registra tools, transporte stdio
├── auth.ts                # OAuth client_credentials, cache de token (~20 min)
├── sfmcClient.ts          # REST client com retry exponencial (429/5xx)
└── tools/
    ├── validateSql.ts     # Regras do dialeto + validação contra schema real
    ├── listDataExtensions.ts
    └── queryDataExtension.ts
```

**Detalhes de implementação:**
- Token com cache e margem de 60s antes da expiração (SFMC expira em ~18-20 min)
- Retry exponencial em 429/5xx — o SFMC estrangula com facilidade sob carga
- Auth lazy: o servidor sobe mesmo sem credenciais, valida na primeira tool call
- Paginação forçada nas consultas (máx 50 linhas) para não estourar o contexto do modelo

---

## Roadmap

- [ ] `get_automation_status` — status e histórico de execução
- [ ] `list_journeys` — journeys ativas, versões, métricas
- [ ] `get_send_stats` — opens, clicks, bounces
- [ ] `upsert_rows` — gravação com padrão checkpoint/resume (modo write)
- [ ] Suporte a Shared Data Extensions do Parent BU via SOAP

---

## Limitações conhecidas

- A `validate_sql` cobre as restrições **conhecidas** do Automation Studio e a existência de tabelas/colunas. Não garante correção lógica nem performance.
- DEs compartilhadas (`ENT.`) não são validadas contra schema — vivem no Parent BU, fora do alcance da REST da BU atual.
- Colunas não qualificadas (sem prefixo `alias.`) não são validadas em queries com múltiplos JOINs — resolver isso exigiria um parser SQL completo.
- O endpoint `/data/v1/customobjects` é relativamente recente. Instâncias em releases antigas podem precisar do fallback SOAP.

---

## Contribuindo

PRs bem-vindos. As áreas de maior impacto são as tools do roadmap e novas regras de validação do dialeto SFMC — se você já perdeu tempo com uma construção que o Automation Studio rejeita, abra uma issue com o caso.

## Licença

MIT
