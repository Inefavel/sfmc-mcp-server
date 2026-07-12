/**
 * Tool: query_data_extension
 * Busca registros de uma Data Extension via REST
 * (/data/v1/customobjectdata/key/{key}/rowset) com filtro, ordenação e paginação.
 */

import { z } from "zod";
import { SfmcRestClient } from "../sfmcClient.js";

export const queryDataExtensionSchema = {
  name: "query_data_extension",
  description:
    "Consulta registros de uma Data Extension pelo external key (customerKey). " +
    "Suporta filtro simples (ex: \"Status eq 'Active'\"), ordenação e paginação. " +
    "Retorna no máximo 50 linhas por chamada para não estourar o contexto.",
  inputSchema: {
    externalKey: z.string().describe("External key (customerKey) da Data Extension."),
    filter: z
      .string()
      .optional()
      .describe(
        "Filtro no formato do SFMC: campo operador valor. Operadores: eq, ne, gt, lt, ge, le, like. " +
          "Ex: \"EmailAddress like '%gmail%'\" ou \"SubscriberKey eq '12345'\"."
      ),
    orderBy: z
      .string()
      .optional()
      .describe("Campo e direção de ordenação. Ex: 'CreatedDate desc'."),
    page: z.number().int().min(1).default(1).describe("Página de resultados."),
    pageSize: z.number().int().min(1).max(50).default(20).describe("Linhas por página (máx 50)."),
  },
};

interface RowsetItem {
  keys: Record<string, unknown>;
  values: Record<string, unknown>;
}

interface RowsetResponse {
  count: number;
  page: number;
  pageSize: number;
  items: RowsetItem[];
}

export async function queryDataExtension(
  client: SfmcRestClient,
  args: { externalKey: string; filter?: string; orderBy?: string; page: number; pageSize: number }
): Promise<string> {
  const params: Record<string, string | number> = {
    $page: args.page,
    $pageSize: args.pageSize,
  };
  if (args.filter) params.$filter = args.filter;
  if (args.orderBy) params.$orderBy = args.orderBy;

  const path = `/data/v1/customobjectdata/key/${encodeURIComponent(args.externalKey)}/rowset`;

  let data: RowsetResponse;
  try {
    data = await client.get<RowsetResponse>(path, params);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("404")) {
      return (
        `Data Extension com external key "${args.externalKey}" não encontrada. ` +
        `Use list_data_extensions para conferir a key correta (é o customerKey, não o nome).`
      );
    }
    throw err;
  }

  if (!data.items || data.items.length === 0) {
    return args.filter
      ? `Nenhum registro encontrado em "${args.externalKey}" com o filtro: ${args.filter}`
      : `A Data Extension "${args.externalKey}" está vazia.`;
  }

  // Monta uma tabela compacta: cabeçalho a partir da primeira linha
  const firstRow = { ...data.items[0].keys, ...data.items[0].values };
  const columns = Object.keys(firstRow);

  const lines: string[] = [
    `${data.count} registro(s) no total — página ${data.page}, exibindo ${data.items.length}:`,
    "",
    columns.join(" | "),
    columns.map(() => "---").join(" | "),
  ];

  for (const item of data.items) {
    const row = { ...item.keys, ...item.values };
    lines.push(columns.map((c) => formatCell(row[c])).join(" | "));
  }

  const totalPages = Math.ceil(data.count / args.pageSize);
  if (totalPages > args.page) {
    lines.push("");
    lines.push(`(página ${args.page} de ${totalPages} — use page=${args.page + 1} para continuar)`);
  }

  return lines.join("\n");
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return s.length > 80 ? s.slice(0, 77) + "..." : s;
}
