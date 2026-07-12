# Post de lançamento — X/Twitter

> Adaptado de `post-linkedin.md` para o formato de thread. Cada tweet abaixo já está dentro do limite de 280 caracteres.

---

## Thread (recomendada)

**1/6**
Você escreve uma Query Activity no Automation Studio (SFMC). Salva. Roda a automação. 30 minutos depois: descobre que digitou EmailAdress em vez de EmailAddress. 🧵

**2/6**
Corrige. Roda de novo. Mais 30 min de fila. Agora é um ORDER BY — que o dialeto do SFMC não suporta. Uma tarde inteira perdida numa query de 15 linhas.

**3/6**
Construí um MCP Server que conecta o Claude direto ao SFMC. Ele valida a query ANTES de você rodar: regras do dialeto restrito + confere se as Data Extensions e colunas existem de verdade.

**4/6**
Detecta ORDER BY, CTE, MERGE, variáveis, temp tables. Aponta typo de coluna e sugere a correção. Avisa se a PK da DE de destino não está no SELECT — a falha silenciosa mais cara do SFMC.

**5/6**
Feedback loop caiu de 30 min pra 3 segundos. Open source, MIT: `npx sfmc-mcp-server`
GitHub: https://github.com/Inefavel/sfmc-mcp-server

**6/6**
Se você opera SFMC e já perdeu uma tarde com um typo, testa e comenta. Achou uma construção que o Automation Studio rejeita e eu não cobri? Abre uma issue.

#SFMC #SalesforceMarketingCloud #MCP #ClaudeAI #MarTech

---

## Tweet único (alternativa mais curta)

ORDER BY não funciona no Automation Studio. Nem CTE, MERGE, variável ou temp table — e o SFMC só avisa depois de 30 min de fila. Criei um MCP Server que valida a query antes de rodar. Open source: `npx sfmc-mcp-server`
github.com/Inefavel/sfmc-mcp-server
#SFMC #MCP

---

## Notas de execução

- **Link no npm** (`npmjs.com/package/sfmc-mcp-server`) cabe como reply/quote-tweet se quiser reforçar instalação via npx sem repetir o link do GitHub.
- Diferente do LinkedIn, no X o link **pode** ir direto no tweet — não há penalidade de alcance por isso.
- Publique a thread e depois faça *quote* dela (não um reply solto) se quiser dar um "bump" no dia seguinte — mantém o thread vivo no algoritmo.
- Mesma regra de ouro do LinkedIn: lidere com a dor (o typo, os 30 minutos), não com "lancei um MCP server".
