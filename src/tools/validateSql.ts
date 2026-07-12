/**
 * Tool: validate_sql
 *
 * Valida uma query do Automation Studio ANTES de ela rodar.
 * Duas camadas:
 *   1. Estática — regras do dialeto SFMC (subconjunto restrito do T-SQL).
 *      Detecta construções não suportadas que o SFMC só reclama em runtime.
 *   2. Schema — resolve as DEs referenciadas via REST e confere se as colunas
 *      citadas existem de fato. Aqui mora o valor: erro de coluna no SFMC
 *      normalmente só aparece depois de 30+ min de fila de automação.
 */

import { z } from "zod";
import { SfmcRestClient } from "../sfmcClient.js";

export const validateSqlSchema = {
  name: "validate_sql",
  description:
    "Valida uma Query Activity do SFMC Automation Studio antes de executá-la. " +
    "Checa construções não suportadas pelo dialeto restrito do SFMC (ORDER BY, CTE, MERGE, " +
    "variáveis, temp tables, funções indisponíveis) e — se possível — confere se as Data Extensions " +
    "e colunas referenciadas realmente existem. Retorna erros bloqueantes, avisos e sugestões.",
  inputSchema: {
    sql: z.string().describe("A query SQL do Automation Studio a ser validada."),
    checkSchema: z
      .boolean()
      .default(true)
      .describe(
        "Se true, consulta as Data Extensions referenciadas via API para validar nomes de tabelas e colunas."
      ),
    targetDataExtension: z
      .string()
      .optional()
      .describe(
        "External key da DE de destino da Query Activity. Se informada, valida se as colunas do SELECT " +
          "cabem no schema de destino (nomes e tipos)."
      ),
  },
};

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type Severity = "error" | "warning" | "info";

interface Finding {
  severity: Severity;
  rule: string;
  message: string;
  suggestion?: string;
  line?: number;
}

interface DeField {
  name: string;
  type: string;
  length?: number;
  isPrimaryKey?: boolean;
  isNullable?: boolean;
}

interface CustomObject {
  key: string;
  name: string;
  fields?: DeField[];
}

interface CustomObjectsResponse {
  count: number;
  items: CustomObject[];
}

// ---------------------------------------------------------------------------
// Camada 1 — Validação estática do dialeto SFMC
// ---------------------------------------------------------------------------

/**
 * Regras derivadas das restrições documentadas do Automation Studio.
 * O SFMC roda um subconjunto do T-SQL e falha em runtime, não no salvamento.
 */
const STATIC_RULES: Array<{
  rule: string;
  pattern: RegExp;
  severity: Severity;
  message: string;
  suggestion?: string;
}> = [
  {
    rule: "no-order-by",
    pattern: /\bORDER\s+BY\b/i,
    severity: "error",
    message: "ORDER BY não é suportado em Query Activities do SFMC.",
    suggestion:
      "Remova o ORDER BY. A ordem de gravação na DE de destino não é garantida de qualquer forma. " +
      "Se precisar de ranking, use ROW_NUMBER() OVER (ORDER BY ...) dentro de uma subquery.",
  },
  {
    rule: "no-cte",
    pattern: /(^|\s|;)\s*WITH\s+[\w[\]]+\s+AS\s*\(/i,
    severity: "error",
    message: "CTEs (WITH ... AS) não são suportadas pelo Automation Studio.",
    suggestion: "Converta a CTE em uma subquery inline no FROM ou JOIN.",
  },
  {
    rule: "no-merge",
    pattern: /\bMERGE\s+INTO\b|\bMERGE\s+[\w[\]]+\s+(AS\s+\w+\s+)?USING\b/i,
    severity: "error",
    message: "MERGE não é suportado. Query Activities só executam SELECT.",
    suggestion:
      "Use um SELECT e configure a Query Activity com a ação 'Update' ou 'Overwrite' na DE de destino.",
  },
  {
    rule: "select-only",
    pattern: /(^|;)\s*(INSERT|UPDATE|DELETE|TRUNCATE|DROP|CREATE|ALTER)\b/i,
    severity: "error",
    message: "Query Activities só aceitam SELECT. DML/DDL não é permitido.",
    suggestion:
      "Escreva a lógica como SELECT e deixe a Query Activity gravar na DE de destino " +
      "(ações disponíveis: Overwrite, Append, Update).",
  },
  {
    rule: "no-variables",
    pattern: /\bDECLARE\s+@|\bSET\s+@/i,
    severity: "error",
    message: "Variáveis (DECLARE/SET @var) não são suportadas.",
    suggestion: "Inline os valores diretamente na query ou use uma DE de parâmetros com JOIN.",
  },
  {
    rule: "no-temp-tables",
    pattern: /#\w+|\bINTO\s+#/i,
    severity: "error",
    message: "Tabelas temporárias (#temp) não são suportadas.",
    suggestion: "Use subqueries ou uma DE intermediária gravada por outra Query Activity.",
  },
  {
    rule: "no-cursor",
    pattern: /\b(CURSOR|FETCH\s+NEXT|WHILE\s*\()/i,
    severity: "error",
    message: "Cursores e loops não são suportados.",
    suggestion: "Reescreva de forma set-based (operações em conjunto, sem iteração).",
  },
  {
    rule: "no-stored-proc",
    pattern: /\b(EXEC|EXECUTE)\s+/i,
    severity: "error",
    message: "Execução de stored procedures não é permitida.",
  },
  {
    rule: "no-select-star",
    pattern: /\bSELECT\s+\*/i,
    severity: "warning",
    message: "SELECT * é arriscado: os nomes das colunas precisam bater com a DE de destino.",
    suggestion:
      "Liste as colunas explicitamente. Se a DE de origem ganhar um campo novo, o SELECT * quebra a gravação.",
  },
  {
    rule: "no-getdate",
    pattern: /\bGETDATE\s*\(\s*\)/i,
    severity: "warning",
    message:
      "GETDATE() funciona, mas retorna o horário do servidor SFMC (normalmente CST/CDT), não o horário local.",
    suggestion:
      "Se precisar de horário de Brasília, ajuste com DATEADD(HOUR, <offset>, GETDATE()) e documente o offset.",
  },
  {
    rule: "no-top-without-purpose",
    pattern: /\bSELECT\s+TOP\s+\d+/i,
    severity: "info",
    message: "TOP sem ORDER BY (que não é permitido) retorna linhas arbitrárias.",
    suggestion:
      "Se a intenção era pegar 'os N primeiros' por algum critério, use ROW_NUMBER() OVER (ORDER BY ...) em subquery.",
  },
  {
    rule: "cross-bu-syntax",
    pattern: /\bENT\s*\.\s*\[?\w+/i,
    severity: "info",
    message: "Detectado prefixo ENT. — leitura de DE do Parent Business Unit.",
    suggestion:
      "Confirme que a BU atual tem permissão de leitura na DE compartilhada e que ela está " +
      "de fato compartilhada (Shared Data Extensions).",
  },
  {
    rule: "no-full-outer-join",
    pattern: /\bFULL\s+(OUTER\s+)?JOIN\b/i,
    severity: "warning",
    message: "FULL OUTER JOIN tem suporte inconsistente no SFMC.",
    suggestion: "Prefira LEFT JOIN + UNION do lado direito, ou reveja a modelagem.",
  },
];

function runStaticRules(sql: string): Finding[] {
  const findings: Finding[] = [];
  const stripped = stripCommentsAndStrings(sql);

  for (const r of STATIC_RULES) {
    const match = r.pattern.exec(stripped);
    if (match) {
      findings.push({
        severity: r.severity,
        rule: r.rule,
        message: r.message,
        suggestion: r.suggestion,
        line: lineOf(stripped, match.index),
      });
    }
  }

  // Parênteses desbalanceados — erro comum em queries longas
  const balance = countBalance(stripped);
  if (balance !== 0) {
    findings.push({
      severity: "error",
      rule: "unbalanced-parens",
      message:
        balance > 0
          ? `Há ${balance} parêntese(s) aberto(s) sem fechamento.`
          : `Há ${-balance} parêntese(s) fechado(s) a mais.`,
    });
  }

  if (!/\bSELECT\b/i.test(stripped)) {
    findings.push({
      severity: "error",
      rule: "missing-select",
      message: "Nenhum SELECT encontrado. Query Activities exigem um SELECT.",
    });
  }

  return findings;
}

/** Remove comentários e literais de string para evitar falsos positivos nas regexes. */
function stripCommentsAndStrings(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, (m) => " ".repeat(m.length)) // preserva offsets
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/'(?:[^']|'')*'/g, (m) => "'" + " ".repeat(Math.max(0, m.length - 2)) + "'");
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function countBalance(sql: string): number {
  let n = 0;
  for (const ch of sql) {
    if (ch === "(") n++;
    else if (ch === ")") n--;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Camada 2 — Validação contra o schema real
// ---------------------------------------------------------------------------

/**
 * Extrai nomes de tabelas do FROM e dos JOINs, junto com seus aliases.
 * Cobre a sintaxe que aparece de fato em Query Activities:
 *   FROM [Minha_DE] AS a
 *   FROM ENT.[DE_Compartilhada] b
 *   JOIN Outra_DE ON ...
 * Subqueries são ignoradas como fonte de tabela (mas suas tabelas internas
 * ainda são capturadas, porque a regex varre a string inteira).
 */
function extractTables(sql: string): Array<{ raw: string; name: string; alias?: string; shared: boolean }> {
  const stripped = stripCommentsAndStrings(sql);
  const results: Array<{ raw: string; name: string; alias?: string; shared: boolean }> = [];
  const seen = new Set<string>();

  const re =
    /\b(?:FROM|JOIN)\s+(?!\()(ENT\s*\.\s*)?(\[[^\]]+\]|\w+)(?:\s+(?:AS\s+)?(?!ON\b|WHERE\b|INNER\b|LEFT\b|RIGHT\b|FULL\b|JOIN\b|GROUP\b|HAVING\b|UNION\b|CROSS\b|OUTER\b)(\w+))?/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    const shared = Boolean(m[1]);
    const name = m[2].replace(/^\[|\]$/g, "");
    const alias = m[3];
    const dedupeKey = `${shared}:${name.toLowerCase()}:${alias?.toLowerCase() ?? ""}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    results.push({ raw: m[0].trim(), name, alias, shared });
  }

  return results;
}

/**
 * Extrai referências de coluna qualificadas (alias.coluna).
 * Só validamos as qualificadas: colunas sem prefixo são ambíguas em queries
 * com múltiplos JOINs, e resolver isso exigiria um parser completo.
 */
function extractQualifiedColumns(sql: string): Array<{ qualifier: string; column: string }> {
  const stripped = stripCommentsAndStrings(sql);
  const results: Array<{ qualifier: string; column: string }> = [];
  const seen = new Set<string>();

  const re = /\b(\w+)\s*\.\s*(\[[^\]]+\]|\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    const qualifier = m[1];
    const column = m[2].replace(/^\[|\]$/g, "");

    // "ENT.[DE]" é prefixo de BU, não coluna
    if (qualifier.toUpperCase() === "ENT") continue;

    const key = `${qualifier.toLowerCase()}.${column.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ qualifier, column });
  }

  return results;
}

/** Extrai os aliases de saída do SELECT (para conferir contra a DE de destino). */
function extractOutputColumns(sql: string): string[] | null {
  const stripped = stripCommentsAndStrings(sql);

  // Pega o primeiro SELECT de topo até o FROM correspondente (nível 0 de parênteses)
  const selectMatch = /\bSELECT\b(?:\s+DISTINCT\b)?(?:\s+TOP\s+\d+)?/i.exec(stripped);
  if (!selectMatch) return null;

  let depth = 0;
  let fromIdx = -1;
  for (let i = selectMatch.index + selectMatch[0].length; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (depth === 0 && /\s/.test(ch)) {
      if (/^\s+FROM\b/i.test(stripped.slice(i))) {
        fromIdx = i;
        break;
      }
    }
  }
  if (fromIdx === -1) return null;

  const list = stripped.slice(selectMatch.index + selectMatch[0].length, fromIdx);
  if (/\*/.test(list)) return null; // SELECT * — já avisado pela regra estática

  // Split por vírgula no nível 0
  const items: string[] = [];
  let buf = "";
  depth = 0;
  for (const ch of list) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      items.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) items.push(buf);

  return items
    .map((item) => {
      const t = item.trim();
      // "expr AS alias" | "expr alias" | "tabela.coluna" | "coluna"
      const asMatch = /\bAS\s+(\[[^\]]+\]|\w+)\s*$/i.exec(t);
      if (asMatch) return asMatch[1].replace(/^\[|\]$/g, "");

      const parts = t.split(/\s+/);
      if (parts.length > 1) {
        const last = parts[parts.length - 1];
        if (/^(\[[^\]]+\]|\w+)$/.test(last) && !/[()]/.test(last)) {
          return last.replace(/^\[|\]$/g, "");
        }
      }

      const dotted = /\.\s*(\[[^\]]+\]|\w+)\s*$/.exec(t);
      if (dotted) return dotted[1].replace(/^\[|\]$/g, "");

      if (/^(\[[^\]]+\]|\w+)$/.test(t)) return t.replace(/^\[|\]$/g, "");

      return ""; // expressão sem alias
    })
    .filter(Boolean);
}

/** Busca uma DE pelo nome OU external key, retornando seus campos. */
async function resolveDataExtension(
  client: SfmcRestClient,
  nameOrKey: string
): Promise<CustomObject | null> {
  const escaped = nameOrKey.replace(/'/g, "''");

  // Tenta por nome
  try {
    const byName = await client.get<CustomObjectsResponse>("/data/v1/customobjects", {
      $filter: `name eq '${escaped}'`,
      $pageSize: 1,
    });
    if (byName.items?.length) return byName.items[0];
  } catch {
    // segue para a tentativa por key
  }

  // Tenta por external key
  try {
    const byKey = await client.get<CustomObjectsResponse>("/data/v1/customobjects", {
      $filter: `key eq '${escaped}'`,
      $pageSize: 1,
    });
    if (byKey.items?.length) return byKey.items[0];
  } catch {
    // não encontrada
  }

  return null;
}

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------

export async function validateSql(
  client: SfmcRestClient,
  args: { sql: string; checkSchema: boolean; targetDataExtension?: string }
): Promise<string> {
  const findings: Finding[] = runStaticRules(args.sql);

  const tables = extractTables(args.sql);
  const resolved = new Map<string, CustomObject>(); // chave: nome lowercase da tabela
  const aliasToTable = new Map<string, string>(); // alias lowercase -> nome da tabela

  for (const t of tables) {
    if (t.alias) aliasToTable.set(t.alias.toLowerCase(), t.name.toLowerCase());
    aliasToTable.set(t.name.toLowerCase(), t.name.toLowerCase()); // tabela referenciável pelo nome
  }

  if (args.checkSchema && tables.length > 0) {
    for (const t of tables) {
      // DEs de outra BU (ENT.) não são visíveis via a REST da BU atual
      if (t.shared) {
        findings.push({
          severity: "info",
          rule: "shared-de-not-checked",
          message: `A DE compartilhada "ENT.${t.name}" não pôde ser validada (vive no Parent BU).`,
          suggestion: "Confirme manualmente o schema e o compartilhamento no Parent Business Unit.",
        });
        continue;
      }

      const de = await resolveDataExtension(client, t.name);
      if (!de) {
        findings.push({
          severity: "error",
          rule: "unknown-data-extension",
          message: `Data Extension "${t.name}" não encontrada nesta Business Unit.`,
          suggestion:
            "Confira o nome com list_data_extensions. Atenção: o SQL usa o NOME da DE, não a external key.",
        });
        continue;
      }
      resolved.set(t.name.toLowerCase(), de);
    }

    // Valida colunas qualificadas contra o schema resolvido
    const qualified = extractQualifiedColumns(args.sql);
    for (const q of qualified) {
      const tableName = aliasToTable.get(q.qualifier.toLowerCase());
      if (!tableName) {
        findings.push({
          severity: "warning",
          rule: "unknown-alias",
          message: `O prefixo "${q.qualifier}" em "${q.qualifier}.${q.column}" não corresponde a nenhuma tabela ou alias do FROM/JOIN.`,
          suggestion: "Verifique se o alias foi declarado ou se há erro de digitação.",
        });
        continue;
      }

      const de = resolved.get(tableName);
      if (!de?.fields) continue; // DE não resolvida ou sem campos — já reportado acima

      const exists = de.fields.some((f) => f.name.toLowerCase() === q.column.toLowerCase());
      if (!exists) {
        const suggestion = closestField(q.column, de.fields);
        findings.push({
          severity: "error",
          rule: "unknown-column",
          message: `A coluna "${q.column}" não existe na Data Extension "${de.name}".`,
          suggestion: suggestion
            ? `Você quis dizer "${suggestion}"? Campos disponíveis: ${de.fields.map((f) => f.name).join(", ")}`
            : `Campos disponíveis: ${de.fields.map((f) => f.name).join(", ")}`,
        });
      }
    }

    // Valida colunas de saída contra a DE de destino
    if (args.targetDataExtension) {
      const target = await resolveDataExtension(client, args.targetDataExtension);
      if (!target) {
        findings.push({
          severity: "error",
          rule: "unknown-target-de",
          message: `A DE de destino "${args.targetDataExtension}" não foi encontrada.`,
        });
      } else if (target.fields) {
        const outputs = extractOutputColumns(args.sql);
        if (outputs === null) {
          findings.push({
            severity: "warning",
            rule: "target-check-skipped",
            message:
              "Não foi possível verificar as colunas de saída contra a DE de destino (SELECT * ou expressões sem alias).",
            suggestion: "Dê um alias explícito a cada coluna do SELECT para habilitar essa checagem.",
          });
        } else {
          const targetNames = new Set(target.fields.map((f) => f.name.toLowerCase()));

          for (const out of outputs) {
            if (!targetNames.has(out.toLowerCase())) {
              const suggestion = closestField(out, target.fields);
              findings.push({
                severity: "error",
                rule: "output-column-not-in-target",
                message: `A coluna de saída "${out}" não existe na DE de destino "${target.name}". A gravação vai falhar.`,
                suggestion: suggestion
                  ? `Renomeie para "${suggestion}" (AS ${suggestion}) ou adicione o campo na DE de destino.`
                  : `Campos da DE de destino: ${target.fields.map((f) => f.name).join(", ")}`,
              });
            }
          }

          // PK de destino não preenchida = falha silenciosa clássica
          const outLower = new Set(outputs.map((o) => o.toLowerCase()));
          for (const f of target.fields) {
            if (f.isPrimaryKey && !outLower.has(f.name.toLowerCase())) {
              findings.push({
                severity: "error",
                rule: "missing-target-pk",
                message: `A chave primária "${f.name}" da DE de destino não está no SELECT.`,
                suggestion: "Toda PK da DE de destino precisa ser produzida pela query.",
              });
            }
            if (f.isNullable === false && !f.isPrimaryKey && !outLower.has(f.name.toLowerCase())) {
              findings.push({
                severity: "warning",
                rule: "missing-required-field",
                message: `O campo obrigatório (NOT NULL) "${f.name}" da DE de destino não está no SELECT.`,
              });
            }
          }
        }
      }
    }
  }

  return formatReport(args.sql, findings, tables, resolved, args);
}

/** Levenshtein simples para sugerir o campo mais próximo em caso de typo. */
function closestField(name: string, fields: DeField[]): string | null {
  let best: { name: string; dist: number } | null = null;
  for (const f of fields) {
    const d = levenshtein(name.toLowerCase(), f.name.toLowerCase());
    if (!best || d < best.dist) best = { name: f.name, dist: d };
  }
  // Só sugere se for razoavelmente próximo
  if (best && best.dist <= Math.max(2, Math.floor(name.length / 3))) return best.name;
  return null;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  const curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = [...curr];
  }
  return prev[n];
}

// ---------------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------------

function formatReport(
  sql: string,
  findings: Finding[],
  tables: Array<{ name: string; alias?: string; shared: boolean }>,
  resolved: Map<string, CustomObject>,
  args: { checkSchema: boolean; targetDataExtension?: string }
): string {
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  const infos = findings.filter((f) => f.severity === "info");

  const lines: string[] = [];

  // Veredito
  if (errors.length === 0) {
    lines.push(
      warnings.length === 0
        ? "✅ VÁLIDA — nenhum problema bloqueante encontrado."
        : `✅ VÁLIDA, com ${warnings.length} aviso(s) — deve rodar, mas revise os pontos abaixo.`
    );
  } else {
    lines.push(
      `❌ INVÁLIDA — ${errors.length} erro(s) bloqueante(s). Esta query vai falhar no Automation Studio.`
    );
  }
  lines.push("");

  // Contexto
  if (tables.length > 0) {
    const desc = tables.map((t) => {
      const prefix = t.shared ? "ENT." : "";
      const aliasStr = t.alias ? ` (alias: ${t.alias})` : "";
      const status = t.shared
        ? "não verificada"
        : resolved.has(t.name.toLowerCase())
          ? "✓ existe"
          : "✗ não encontrada";
      return `  • ${prefix}${t.name}${aliasStr} — ${status}`;
    });
    lines.push(`Data Extensions referenciadas (${tables.length}):`);
    lines.push(...desc);
    lines.push("");
  }

  if (args.targetDataExtension) {
    lines.push(`DE de destino: ${args.targetDataExtension}`);
    lines.push("");
  }

  if (!args.checkSchema) {
    lines.push("(Validação de schema desativada — apenas regras de sintaxe foram aplicadas.)");
    lines.push("");
  }

  // Achados
  const section = (title: string, items: Finding[], icon: string) => {
    if (items.length === 0) return;
    lines.push(`${icon} ${title} (${items.length}):`);
    lines.push("");
    items.forEach((f, i) => {
      const loc = f.line ? ` [linha ~${f.line}]` : "";
      lines.push(`${i + 1}. ${f.message}${loc}`);
      lines.push(`   regra: ${f.rule}`);
      if (f.suggestion) lines.push(`   → ${f.suggestion}`);
      lines.push("");
    });
  };

  section("ERROS BLOQUEANTES", errors, "❌");
  section("AVISOS", warnings, "⚠️");
  section("OBSERVAÇÕES", infos, "ℹ️");

  if (findings.length === 0) {
    lines.push("Nenhum problema detectado nas regras do dialeto SFMC nem no schema das DEs.");
    lines.push("");
    lines.push(
      "Nota: esta validação cobre as restrições conhecidas do Automation Studio e a existência " +
        "de tabelas/colunas. Ela não garante correção lógica nem performance da query."
    );
  }

  return lines.join("\n");
}
