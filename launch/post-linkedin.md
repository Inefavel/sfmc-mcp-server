# Post de lançamento — LinkedIn

> Lidere com a dor, não com o produto. Quem opera SFMC reconhece o problema em 3 segundos.

---

## Versão 1 — A dor (recomendada)

Todo mundo que trabalha com Salesforce Marketing Cloud já passou por isso:

Você escreve uma Query Activity no Automation Studio. Salva. Roda a automação.

E 30 minutos depois descobre que digitou `EmailAdress` em vez de `EmailAddress`.

Corrige. Roda de novo. Mais 30 minutos.

Agora descobre que usou `ORDER BY` — que o dialeto do SFMC não suporta.

Uma tarde inteira para uma query de 15 linhas.

---

Passei o fim de semana resolvendo isso.

Construí um servidor MCP (Model Context Protocol) que conecta o Claude direto ao SFMC. A ferramenta principal valida a query **antes** de você rodar:

→ Regras do dialeto restrito do Automation Studio (ORDER BY, CTE, MERGE, variáveis, temp tables)
→ Confere se as Data Extensions existem de verdade
→ Confere se cada coluna existe — e sugere a correção quando é typo
→ Avisa se a chave primária da DE de destino não está no SELECT (a falha silenciosa mais cara do SFMC)

O feedback loop caiu de 30 minutos para 3 segundos.

---

Está open source, MIT, no npm:

`npx sfmc-mcp-server`

Link nos comentários.

Se você opera SFMC e já perdeu uma tarde com um typo, testa e me conta. Se tiver alguma construção que o Automation Studio rejeita e eu não cobri, abre uma issue — quero mapear todas.

#SalesforceMarketingCloud #SFMC #MarketingCloud #MCP #Claude #MarTech

---

## Versão 2 — Mais curta e direta

`ORDER BY` não funciona no Automation Studio.

Nem CTE. Nem MERGE. Nem variável. Nem temp table.

E o SFMC só te avisa disso **depois** de 30 minutos de fila de automação.

Cansei.

Construí um MCP Server que conecta o Claude ao Salesforce Marketing Cloud e valida a query antes de rodar — checando tanto as regras do dialeto quanto se as Data Extensions e colunas realmente existem.

Typo em nome de campo? Ele aponta e sugere a correção. Esqueceu a PK da DE de destino no SELECT? Ele avisa.

Open source, MIT: `npx sfmc-mcp-server`

Link nos comentários 👇

#SFMC #SalesforceMarketingCloud #MarTech #MCP

---

## Comentário fixado (postar imediatamente após)

GitHub: https://github.com/Inefavel/sfmc-mcp-server
npm: https://www.npmjs.com/package/sfmc-mcp-server

Roadmap: status de automações, journeys ativas, métricas de envio, e gravação em DE com checkpoint/resume.

Aceito sugestão de qual vem primeiro.

---

## Notas de execução

**Quando postar:** terça ou quarta, 8h-10h (horário de Brasília). Segunda tem ruído, sexta tem baixo alcance.

**Nas primeiras 2 horas:** responda todo comentário. O algoritmo do LinkedIn pesa engajamento inicial, e essas respostas são onde as conversas comerciais começam.

**O que NÃO fazer:**
- Não coloque link no corpo do post (o LinkedIn reduz o alcance). Link vai no primeiro comentário.
- Não venda nada. O objetivo aqui é autoridade e distribuição. Quem quiser contratar vai te procurar no DM.
- Não use emoji em excesso. Público técnico rejeita.

**Sinal de que funcionou:** DMs perguntando "vocês fazem implantação?". É aí que a conversa vira receita.
