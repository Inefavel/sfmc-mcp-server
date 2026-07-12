# Guia de Publicação

Checklist prático para colocar o `sfmc-mcp-server` no ar e começar a gerar descoberta orgânica.

---

## 1. GitHub

```bash
cd sfmc-mcp-server
git init
git add .
git commit -m "feat: MCP server para SFMC com validate_sql, list e query de Data Extensions"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/sfmc-mcp-server.git
git push -u origin main
```

**Antes de publicar, confira:**
- [ ] `.gitignore` inclui `.env`, `node_modules/`, `dist/`
- [ ] Nenhuma credencial real commitada (`git log -p | grep -i secret`)
- [ ] Substituiu `SEU_USUARIO` no `package.json` (campos `repository`, `bugs`, `homepage`)
- [ ] Substituiu `Luiz Claudio` no LICENSE se quiser outro nome/entidade

**Configuração do repositório (aba Settings):**
- **Description**: "MCP Server para Salesforce Marketing Cloud — valide queries do Automation Studio antes de rodar"
- **Topics**: `mcp`, `model-context-protocol`, `salesforce-marketing-cloud`, `sfmc`, `claude`, `automation-studio`
- Ative **Issues** (é seu canal de feedback e de leads)

---

## 2. npm

```bash
npm login
npm publish --access public
```

Se o nome `sfmc-mcp-server` estiver ocupado, use scoped: `@seuusuario/sfmc-mcp-server` (altere o campo `name` no `package.json`).

**Teste a instalação limpa antes de divulgar:**
```bash
cd /tmp && npx sfmc-mcp-server
# deve subir e imprimir: "SFMC MCP Server rodando (stdio). Modo: read"
```

Para versões seguintes: `npm version patch|minor|major && npm publish`.

---

## 3. Diretórios de MCP

Onde submeter (checar os requisitos atuais de cada um antes):

| Diretório | O que é |
|---|---|
| `modelcontextprotocol/servers` (GitHub) | Repositório oficial da comunidade — a lista de referência |
| Smithery | Registry com instalação automatizada |
| mcp.so / PulseMCP | Agregadores de descoberta |
| Diretório de conectores da Anthropic | Processo próprio, critérios variam — consulte a documentação atual |

O padrão em todos: repositório público, README claro, instruções de instalação que funcionam de primeira. Se o `npx` falhar para um avaliador, você é rejeitado.

---

## 4. Divulgação

**LinkedIn** (seu canal mais forte — audiência de martech no Brasil):
Use o post em `launch/post-linkedin.md`. Publique em terça ou quarta, entre 8h e 10h.

**dev.to / Medium**:
Versão técnica mais longa. Título sugerido: *"Conectei o Claude ao Salesforce Marketing Cloud — e o feedback loop de queries caiu de 30 minutos para 3 segundos"*.

**Comunidades**:
- Salesforce Trailblazer Community (grupos de Marketing Cloud)
- Subreddit r/SalesforceMC
- Grupos de SFMC no WhatsApp/Telegram no Brasil
- Reddit r/mcp e r/ClaudeAI

**Regra de ouro**: em comunidade técnica, lidere com o problema, não com o produto. "Cansei de esperar 30 min pra descobrir um typo" gera mais engajamento que "lancei um MCP server".

---

## 5. Do open source para a receita

O código aberto é o topo do funil. A conversão acontece assim:

| Etapa | Sinal | Ação |
|---|---|---|
| Instalação | Downloads no npm, stars | Nada — só observe |
| Interesse | Issues, perguntas, "funciona com X?" | Responda rápido e público. Isso constrói autoridade. |
| Intenção | "Vocês fazem implantação?", DM no LinkedIn | **Aqui você cobra.** Implantação: R$ 3-8k. |
| Recorrência | Cliente pede tools customizadas | Retainer mensal ou licença |

**Métrica de validação:** se em 60 dias você tiver 3+ conversas com intenção comercial, o Modelo C (SaaS hospedado) passa a valer o investimento. Se não tiver nenhuma, o problema não dói o suficiente — e você economizou meses.

**Prepare com antecedência:**
- Uma página simples (Notion ou landing) com "Precisa de implantação, customização ou suporte? Fale comigo" + link
- Coloque essa linha no rodapé do README
- Documente **um caso concreto com número** assim que rodar em produção. "Auditoria de 200 DEs em 10 minutos, contra 2 dias de trabalho manual" é o que fecha venda — não a lista de features.

---

## 6. Aviso sobre credenciais

Se você evoluir para o Modelo C (SaaS hospedado, você guarda as credenciais dos clientes), lembre que estará custodiando `client_secret` de SFMC de terceiros. Isso exige:

- Secret manager com criptografia em repouso (não banco comum)
- Contrato explícito de tratamento de dados
- Avaliação de LGPD — você vira operador de dados
- Plano de resposta a incidente

**Alternativa de menor risco:** o cliente hospeda a instância dele, você licencia o software e cobra pela licença + suporte. Você nunca toca nas credenciais. Para um produto solo, esse desenho é bem mais defensável.
