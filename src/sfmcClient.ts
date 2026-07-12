/**
 * Cliente REST do SFMC com retry exponencial e tratamento de rate limit.
 * O SFMC retorna 429 com facilidade sob carga; tratamos com backoff.
 */

import { AuthManager } from "./auth.js";

export class SfmcRestClient {
  private auth: AuthManager;
  private static readonly MAX_RETRIES = 3;

  constructor(auth: AuthManager) {
    this.auth = auth;
  }

  async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    return this.request<T>("GET", path, undefined, params);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string | number>
  ): Promise<T> {
    const base = await this.auth.getRestBaseUrl();
    const url = new URL(path, base);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, String(v));
      }
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= SfmcRestClient.MAX_RETRIES; attempt++) {
      const token = await this.auth.getToken();

      const res = await fetch(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      // Rate limit ou instabilidade: backoff exponencial (1s, 2s, 4s)
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`SFMC HTTP ${res.status} em ${method} ${path}`);
        if (attempt < SfmcRestClient.MAX_RETRIES) {
          const waitMs = 1000 * 2 ** attempt;
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        break;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`SFMC HTTP ${res.status} em ${method} ${path}: ${text}`);
      }

      // Algumas respostas do SFMC são vazias (202/204)
      const text = await res.text();
      return (text ? JSON.parse(text) : {}) as T;
    }

    throw lastError ?? new Error("Falha desconhecida na chamada ao SFMC");
  }
}
