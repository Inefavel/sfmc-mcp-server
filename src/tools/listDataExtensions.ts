/**
 * Tool: list_data_extensions
 * Lista Data Extensions da BU com metadados (nome, external key, categoria, campos).
 * Usa o endpoint REST /data/v1/customobjects (disponível nas releases recentes).
 */

import { z } from "zod";
import { SfmcRestClient } from "../sfmcClient.js";

export const listDataExtensionsSchema = {
  name: "list_data_extensions",
  description:
    "Lista Data Extensions da Business Unit conectada, com nome, external key (customerKey), " +
    "e opcionalmente os campos de cada uma. Suporta filtro por nome e paginação.",
  inputSchema: {
    nameFilter: z
      .string()
      .optional()
      .describe("Filtro parcial por nome da DE (case-insensitive). Ex: 'master' encontra 'Master_Contacts'."),
    page: z.number().int().min(1).default(1).describe("Página de resultados (começa em 1)."),
    pageSize: z.number().int().min(1).max(100).default(25).describe("Itens por página (máx 100)."),
    includeFields: z
      .boolean()
      .default(false)
      .describe("Se true, inclui a lista de campos (nome, tipo, tamanho, PK, nullable) de cada DE."),
  },
};

interface CustomObjectField {
  name: string;
  type: string;
  length?: number;
  isPrimaryKey?: boolean;
  isNullable?: boolean;
}

interface CustomObject {
  id: string;
  key: string;
  name: string;
  description?: string;
  categoryId?: number;
  fields?: CustomObjectField[];
  isSendable?: boolean;
  rowCount?: number;
}

interface CustomObjectsResponse {
  count: number;
  page: number;
  pageSize: number;
  items: CustomObject[];
}

export async function listDataExtensions(
  client: SfmcRestClient,
  args: { nameFilter?: string; page: number; pageSize: number; includeFields: boolean }
): Promise<string> {
  const params: Record<string, string | number> = {
    $page: args.page,
    $pageSize: args.pageSize,
  };

  if (args.nameFilter) {
    params.$filter = `name like '${args.nameFilter.replace(/'/g, "''")}'`;
  }

  const data = await client.get<CustomObjectsResponse>("/data/v1/customobjects", params);

  if (!data.items || data.items.length === 0) {
    return args.nameFilter
      ? `Nenhuma Data Extension encontrada com o filtro "${args.nameFilter}".`
      : "Nenhuma Data Extension encontrada nesta Business Unit.";
  }

  const lines: string[] = [
    `Encontradas ${data.count} Data Extension(s) — página ${data.page} (${data.items.length} exibidas):`,
    "",
  ];

  for (const de of data.items) {
    lines.push(`• ${de.name}`);
    lines.push(`  externalKey: ${de.key}`);
    if (de.description) lines.push(`  descrição: ${de.description}`);
    if (de.isSendable !== undefined) lines.push(`  sendable: ${de.isSendable ? "sim" : "não"}`);

    if (args.includeFields && de.fields && de.fields.length > 0) {
      lines.push(`  campos (${de.fields.length}):`);
      for (const f of de.fields) {
        const flags = [
          f.isPrimaryKey ? "PK" : null,
          f.isNullable === false ? "NOT NULL" : null,
        ]
          .filter(Boolean)
          .join(", ");
        lines.push(
          `    - ${f.name}: ${f.type}${f.length ? `(${f.length})` : ""}${flags ? ` [${flags}]` : ""}`
        );
      }
    }
    lines.push("");
  }

  const totalPages = Math.ceil(data.count / args.pageSize);
  if (totalPages > args.page) {
    lines.push(`(página ${args.page} de ${totalPages} — use page=${args.page + 1} para continuar)`);
  }

  return lines.join("\n");
}
