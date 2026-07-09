import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from "axios";
import https from "https";
import { rgIntegrationConfig } from "@config/rgIntegration";

/**
 * Cliente HTTP de nivel producción contra Río Gestión (ERP).
 *
 * Características:
 *  - Reintentos con backoff exponencial sobre fallas transitorias.
 *  - Soporte de `Idempotency-Key` por request.
 *  - Mapeo de errores a excepciones de dominio (RGUpstreamError).
 *  - Singleton perezoso (`getRioGestionClient`).
 *
 * Nota: existe `services/rgIntegration.service.ts` legacy con su propio
 * cliente axios para flujos antiguos (push/pull). Este cliente se usa
 * para los nuevos endpoints BFF (Backend-for-Frontend).
 */

export class RGIntegrationDisabledError extends Error {
  constructor() {
    super("Integración RG WEB deshabilitada");
    this.name = "RGIntegrationDisabledError";
  }
}

export class RGUpstreamError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "RGUpstreamError";
  }
}

export interface RequestOptions extends AxiosRequestConfig {
  retries?: number;
  retryDelayMs?: number;
  idempotencyKey?: string;
}

const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 400;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class RioGestionClient {
  private readonly http: AxiosInstance;

  constructor() {
    if (!rgIntegrationConfig.enabled) throw new RGIntegrationDisabledError();
    if (!rgIntegrationConfig.baseUrl) {
      throw new RGUpstreamError("RG_API_BASE_URL no configurado");
    }

    // Cloudflare quick tunnels: algunos hosts no resuelven la CA intermedia.
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });

    this.http = axios.create({
      baseURL: rgIntegrationConfig.baseUrl,
      timeout: rgIntegrationConfig.requestTimeoutMs,
      httpsAgent,
      headers: {
        "x-api-key": rgIntegrationConfig.apiKey,
        "Content-Type": "application/json",
        "User-Agent": "TricariosBack/RioGestionClient",
      },
      // Devolvemos cualquier status para clasificar nosotros mismos.
      validateStatus: () => true,
    });
  }

  async request<T = unknown>(opts: RequestOptions): Promise<T> {
    const {
      retries = DEFAULT_RETRIES,
      retryDelayMs = DEFAULT_BACKOFF_MS,
      idempotencyKey,
      headers,
      ...axiosOpts
    } = opts;

    const finalHeaders: Record<string, string> = { ...(headers as Record<string, string>) };
    if (idempotencyKey) finalHeaders["Idempotency-Key"] = idempotencyKey;

    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const res = await this.http.request<T>({ ...axiosOpts, headers: finalHeaders });

        if (res.status >= 200 && res.status < 300) return res.data;

        if (attempt < retries && RETRYABLE_STATUS.has(res.status)) {
          await sleep(retryDelayMs * 2 ** attempt);
          attempt++;
          continue;
        }

        throw new RGUpstreamError(
          `RG WEB respondió HTTP ${res.status}`,
          res.status,
          res.data
        );
      } catch (err) {
        if (err instanceof RGUpstreamError) throw err;

        const ax = err as AxiosError;
        const transient = !ax.response || RETRYABLE_STATUS.has(ax.response.status);
        if (attempt < retries && transient) {
          await sleep(retryDelayMs * 2 ** attempt);
          attempt++;
          continue;
        }

        throw new RGUpstreamError(
          `Fallo al contactar RG WEB: ${ax.code || ax.message}`,
          ax.response?.status,
          ax.response?.data,
          err
        );
      }
    }
  }

  get<T = unknown>(url: string, opts: Omit<RequestOptions, "url" | "method"> = {}) {
    return this.request<T>({ ...opts, method: "GET", url });
  }

  post<T = unknown>(url: string, data: unknown, opts: Omit<RequestOptions, "url" | "method" | "data"> = {}) {
    return this.request<T>({ ...opts, method: "POST", url, data });
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let _instance: RioGestionClient | null = null;

export function getRioGestionClient(): RioGestionClient {
  if (!_instance) _instance = new RioGestionClient();
  return _instance;
}

export function resetRioGestionClient(): void {
  _instance = null;
}
