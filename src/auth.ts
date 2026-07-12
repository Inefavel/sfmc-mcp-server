/**
 * Auth Manager — OAuth 2.0 client_credentials do SFMC.
 * Tokens do SFMC expiram em ~20 minutos; fazemos cache com margem de segurança
 * e renovamos automaticamente. Uma instância por Business Unit (multi-tenant ready).
 */

export interface SfmcCredentials {
  subdomain: string;
  clientId: string;
  clientSecret: string;
  accountId?: string; // MID da BU (opcional)
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // segundos (normalmente 1080 = 18 min)
  scope: string;
  soap_instance_url: string;
  rest_instance_url: string;
}

export class AuthManager {
  private creds: SfmcCredentials;
  private token: string | null = null;
  private restBaseUrl: string | null = null;
  private soapBaseUrl: string | null = null;
  private expiresAt = 0; // epoch ms

  // Margem de segurança: renova 60s antes de expirar
  private static readonly SAFETY_MARGIN_MS = 60_000;

  constructor(creds: SfmcCredentials) {
    this.creds = creds;
  }

  /** Retorna um access token válido, renovando se necessário. */
  async getToken(): Promise<string> {
    if (this.token && Date.now() < this.expiresAt - AuthManager.SAFETY_MARGIN_MS) {
      return this.token;
    }
    await this.refresh();
    return this.token!;
  }

  /** URL base da REST API (ex: https://mcXXXX.rest.marketingcloudapis.com/) */
  async getRestBaseUrl(): Promise<string> {
    if (!this.restBaseUrl) await this.refresh();
    return this.restBaseUrl!;
  }

  /** URL base da SOAP API (para fase 2: queries, automations via SOAP) */
  async getSoapBaseUrl(): Promise<string> {
    if (!this.soapBaseUrl) await this.refresh();
    return this.soapBaseUrl!;
  }

  private async refresh(): Promise<void> {
    const url = `https://${this.creds.subdomain}.auth.marketingcloudapis.com/v2/token`;

    const body: Record<string, string> = {
      grant_type: "client_credentials",
      client_id: this.creds.clientId,
      client_secret: this.creds.clientSecret,
    };
    if (this.creds.accountId) body.account_id = this.creds.accountId;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Falha na autenticação SFMC (HTTP ${res.status}): ${text}. ` +
          `Verifique SFMC_SUBDOMAIN, SFMC_CLIENT_ID e SFMC_CLIENT_SECRET.`
      );
    }

    const data = (await res.json()) as TokenResponse;
    this.token = data.access_token;
    this.restBaseUrl = data.rest_instance_url;
    this.soapBaseUrl = data.soap_instance_url;
    this.expiresAt = Date.now() + data.expires_in * 1000;
  }
}

/** Carrega credenciais das variáveis de ambiente com validação. */
export function credsFromEnv(): SfmcCredentials {
  const subdomain = process.env.SFMC_SUBDOMAIN;
  const clientId = process.env.SFMC_CLIENT_ID;
  const clientSecret = process.env.SFMC_CLIENT_SECRET;

  const missing = [
    !subdomain && "SFMC_SUBDOMAIN",
    !clientId && "SFMC_CLIENT_ID",
    !clientSecret && "SFMC_CLIENT_SECRET",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Variáveis de ambiente ausentes: ${missing.join(", ")}. ` +
        `Copie .env.example para .env e preencha as credenciais do Installed Package.`
    );
  }

  return {
    subdomain: subdomain!,
    clientId: clientId!,
    clientSecret: clientSecret!,
    accountId: process.env.SFMC_ACCOUNT_ID || undefined,
  };
}
