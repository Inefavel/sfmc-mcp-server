# Post de lançamento — Instagram

> Instagram não é o canal mais forte pra esse público (é B2B técnico — LinkedIn/X carregam mais peso), mas serve bem como reforço se você já tem audiência lá. Duas opções de formato: **Reels** (recomendado, o algoritmo favorece vídeo) e **Carrossel** (mais fácil de produzir, boa alternativa).
>
> Aviso técnico: Instagram **não permite link clicável na legenda** do post nem do Reels. O CTA tem que ser "link na bio" — depois explico as opções pra isso.

---

## Opção A — Reels (recomendada)

Roteiro de tela gravada (screen recording), ~20-30 segundos:

1. **(0-3s)** Tela mostrando uma Query Activity no Automation Studio com `EmailAdress` (erro proposital) — texto na tela: *"Rodou. Esperou. Falhou."*
2. **(3-8s)** Corte pro Claude Desktop: cola a mesma query, pede "valida essa query pra mim"
3. **(8-15s)** Mostra o resultado do `validate_sql` apontando o erro de typo com a sugestão de correção — dá zoom na linha "Você quis dizer EmailAddress?"
4. **(15-22s)** Corte rápido mostrando outro erro pego (ex: ORDER BY não suportado)
5. **(22-28s)** Texto na tela: *"30 minutos → 3 segundos. Open source, MIT."*
6. **(28-30s)** Call to action: *"Link na bio"*

Áudio: trending sound de "problema → solução rápida" ou só voz explicando por cima (funciona melhor pra audiência técnica — menos "viral", mais autoridade).

---

## Opção B — Carrossel (7 slides)

**Slide 1 (capa):**
Você já perdeu uma tarde inteira por causa de um typo no SFMC?

**Slide 2:**
Query Activity no Automation Studio. Salva. Roda a automação.
30 minutos depois: `EmailAdress` em vez de `EmailAddress`.

**Slide 3:**
Corrige. Roda de novo. Mais 30 minutos de fila.
Agora é um `ORDER BY` — que o dialeto do SFMC não suporta.

**Slide 4:**
Construí um MCP Server que conecta o Claude direto ao SFMC.
Ele valida a query **antes** de você rodar.

**Slide 5:**
O que ele checa:
→ Regras do dialeto (ORDER BY, CTE, MERGE, variáveis, temp tables)
→ Se as Data Extensions e colunas existem de verdade

**Slide 6:**
Bônus: avisa se a PK da DE de destino não está no SELECT —
a falha silenciosa mais cara do SFMC.

**Slide 7 (CTA):**
Feedback loop: 30 min → 3 segundos.
Open source, MIT. Link na bio 👆

---

## Legenda (para Reels ou Carrossel)

Todo mundo que trabalha com Salesforce Marketing Cloud já passou por isso: escreve uma query, roda a automação, e 30 minutos depois descobre um typo no nome de uma coluna.

Passei um fim de semana resolvendo isso. Construí um servidor MCP que conecta o Claude direto ao SFMC e valida a query do Automation Studio antes de você rodar — pega erro de dialeto (ORDER BY, CTE, MERGE...) e confere se Data Extensions e colunas realmente existem.

Open source, MIT, instala com `npx sfmc-mcp-server`. Link na bio.

Se você já perdeu uma tarde com isso, testa e me conta nos comentários 👇

.
.
.
#SFMC #SalesforceMarketingCloud #MarketingCloud #AutomationStudio #MCP #ModelContextProtocol #ClaudeAI #MarTech #Salesforce #DevTools #OpenSource #TechBrasil

---

## Notas de execução

**Resolvendo o "link na bio":**
- Mais simples: troque o link da bio para `github.com/Inefavel/sfmc-mcp-server` enquanto o post estiver no ar.
- Se a bio já tem outro link fixo, use um agregador (Linktree, bio.link, ou uma página simples sua) com as duas opções: GitHub e npm.
- Alternativa: publique em **Stories** com o sticker de link apontando direto pro GitHub — Stories permitem link clicável, o post/Reels normal não.

**Timing:** mesma lógica do LinkedIn — terça/quarta, horário comercial (9h-11h ou 18h-20h costuma performar melhor no Instagram especificamente, público checa mais fora do expediente).

**O que muda vs. LinkedIn/X:** aqui a imagem/vídeo carrega o peso, não o texto. Se só tiver tempo pra um formato, o Reels com demo real da tool rodando vale mais que qualquer carrossel bonito — mostra o produto funcionando, que é a prova mais forte pra esse público.
