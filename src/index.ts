#!/usr/bin/env node
/**
 * SFMC MCP Server — entry point.
 * Transporte: stdio (padrão para Claude Desktop / Claude Code).
 *
 * Tools do MVP:
 *   - list_data_extensions
 *   - query_data_extension
 *
 * Próximas (fase 2): get_automation_status, list_journeys, get_send_stats,
 * validate_sql, upsert_rows (atrás de SFMC_MODE=write).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { AuthManager, credsFromEnv } from "./auth.js";
import { SfmcRestClient } from "./sfmcClient.js";
import {
  listDataExtensionsSchema,
  listDataExtensions,
} from "./tools/listDataExtensions.js";
import {
  queryDataExtensionSchema,
  queryDataExtension,
} from "./tools/queryDataExtension.js";
import { validateSqlSchema, validateSql } from "./tools/validateSql.js";

async function main() {
  // Auth é lazy: só valida credenciais na primeira tool call,
  // para o servidor subir mesmo antes do .env estar completo.
  let client: SfmcRestClient | null = null;

  function getClient(): SfmcRestClient {
    if (!client) {
      const creds = credsFromEnv();
      client = new SfmcRestClient(new AuthManager(creds));
    }
    return client;
  }

  const server = new McpServer({
    name: "sfmc-mcp-server",
    version: "0.1.0",
  });

  // Log de auditoria simples (stderr para não poluir o protocolo stdio)
  function audit(tool: string, args: unknown) {
    console.error(
      JSON.stringify({ ts: new Date().toISOString(), tool, args })
    );
  }

  server.registerTool(
    listDataExtensionsSchema.name,
    {
      description: listDataExtensionsSchema.description,
      inputSchema: listDataExtensionsSchema.inputSchema,
    },
    async (args) => {
      audit("list_data_extensions", args);
      try {
        const result = await listDataExtensions(getClient(), args);
        return { content: [{ type: "text", text: result }] };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    queryDataExtensionSchema.name,
    {
      description: queryDataExtensionSchema.description,
      inputSchema: queryDataExtensionSchema.inputSchema,
    },
    async (args) => {
      audit("query_data_extension", args);
      try {
        const result = await queryDataExtension(getClient(), args);
        return { content: [{ type: "text", text: result }] };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    validateSqlSchema.name,
    {
      description: validateSqlSchema.description,
      inputSchema: validateSqlSchema.inputSchema,
    },
    async (args) => {
      audit("validate_sql", { ...args, sql: `<${args.sql.length} chars>` });
      try {
        const result = await validateSql(getClient(), args);
        return { content: [{ type: "text", text: result }] };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SFMC MCP Server rodando (stdio). Modo:", process.env.SFMC_MODE ?? "read");
}

function errorResult(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: `Erro: ${msg}` }],
    isError: true,
  };
}

main().catch((err) => {
  console.error("Falha fatal ao iniciar o servidor:", err);
  process.exit(1);
});
