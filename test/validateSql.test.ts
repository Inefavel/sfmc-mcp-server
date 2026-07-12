/**
 * Teste manual da validateSql com um SfmcRestClient mockado.
 * Roda com: npx tsx test/validateSql.test.ts
 */

import { validateSql } from "../src/tools/validateSql.js";
import type { SfmcRestClient } from "../src/sfmcClient.js";

// --- Mock: simula duas DEs reais ---------------------------------------------
const FAKE_DES: Record<string, any> = {
  customers_master: {
    key: "CUST_MASTER_KEY",
    name: "Customers_Master",
    fields: [
      { name: "SubscriberKey", type: "Text", length: 50, isPrimaryKey: true, isNullable: false },
      { name: "EmailAddress", type: "EmailAddress", isNullable: false },
      { name: "FirstName", type: "Text", length: 100, isNullable: true },
      { name: "Status", type: "Text", length: 20, isNullable: true },
      { name: "CreatedDate", type: "Date", isNullable: true },
    ],
  },
  orders: {
    key: "ORDERS_KEY",
    name: "Orders",
    fields: [
      { name: "OrderId", type: "Text", length: 30, isPrimaryKey: true, isNullable: false },
      { name: "SubscriberKey", type: "Text", length: 50, isNullable: false },
      { name: "OrderTotal", type: "Decimal", isNullable: true },
      { name: "OrderDate", type: "Date", isNullable: true },
    ],
  },
  active_buyers: {
    key: "ACTIVE_BUYERS_KEY",
    name: "Active_Buyers",
    fields: [
      { name: "SubscriberKey", type: "Text", length: 50, isPrimaryKey: true, isNullable: false },
      { name: "EmailAddress", type: "EmailAddress", isNullable: false },
      { name: "TotalSpent", type: "Decimal", isNullable: true },
    ],
  },
};

const mockClient = {
  async get(_path: string, params?: Record<string, string | number>) {
    const filter = String(params?.$filter ?? "");
    const m = /(?:name|key)\s+eq\s+'([^']+)'/.exec(filter);
    if (!m) return { count: 0, items: [] };
    const needle = m[1].toLowerCase();

    const found = Object.values(FAKE_DES).find(
      (de: any) => de.name.toLowerCase() === needle || de.key.toLowerCase() === needle
    );
    return found ? { count: 1, items: [found] } : { count: 0, items: [] };
  },
} as unknown as SfmcRestClient;

// --- Casos de teste -----------------------------------------------------------
const CASES: Array<{ title: string; sql: string; target?: string }> = [
  {
    title: "1. Query correta (deve passar limpo)",
    sql: `
SELECT
    c.SubscriberKey,
    c.EmailAddress,
    SUM(o.OrderTotal) AS TotalSpent
FROM Customers_Master c
INNER JOIN Orders o
    ON c.SubscriberKey = o.SubscriberKey
WHERE c.Status = 'Active'
GROUP BY c.SubscriberKey, c.EmailAddress
    `.trim(),
    target: "Active_Buyers",
  },
  {
    title: "2. ORDER BY + SELECT * (erros clássicos do dialeto)",
    sql: `
SELECT *
FROM Customers_Master
WHERE Status = 'Active'
ORDER BY CreatedDate DESC
    `.trim(),
  },
  {
    title: "3. Coluna inexistente + typo (validação de schema)",
    sql: `
SELECT
    c.SubscriberKey,
    c.EmailAdress,
    c.LastPurchaseDate
FROM Customers_Master c
    `.trim(),
  },
  {
    title: "4. CTE + DE inexistente",
    sql: `
WITH recent AS (
    SELECT SubscriberKey FROM Pedidos_Recentes
)
SELECT r.SubscriberKey
FROM recent r
    `.trim(),
  },
  {
    title: "5. Colunas de saída não batem com a DE de destino (PK faltando)",
    sql: `
SELECT
    c.EmailAddress,
    c.FirstName AS Nome
FROM Customers_Master c
    `.trim(),
    target: "Active_Buyers",
  },
];

// --- Execução -----------------------------------------------------------------
for (const c of CASES) {
  console.log("=".repeat(78));
  console.log(c.title);
  console.log("=".repeat(78));
  const result = await validateSql(mockClient, {
    sql: c.sql,
    checkSchema: true,
    targetDataExtension: c.target,
  });
  console.log(result);
  console.log("");
}
