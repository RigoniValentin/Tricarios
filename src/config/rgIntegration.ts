/**
 * Configuración de la integración con Río Gestión (ERP).
 *
 * Centraliza la lectura de variables de entorno y expone un flag
 * `enabled` para que cualquier consumidor pueda hacer "no-op" si la
 * integración no está configurada (evita romper deploys legacy).
 */

const truthy = (v: string | undefined): boolean =>
  typeof v === "string" && ["1", "true", "yes", "on"].includes(v.toLowerCase());

const baseUrlRaw = (process.env.RG_API_BASE_URL || "").trim().replace(/\/+$/, "");
const apiKey = (process.env.RG_API_KEY || "").trim();
const webhookSecret = (process.env.RG_WEBHOOK_SECRET || "").trim();
const defaultCategoryId = (process.env.RG_DEFAULT_CATEGORY_ID || "").trim();
const requestTimeoutMs = Number.parseInt(
  process.env.RG_REQUEST_TIMEOUT_MS || "15000",
  10
);

// Si el operador no setea RG_INTEGRATION_ENABLED, asumimos habilitado cuando
// existan URL base + API key. Permite forzar OFF con RG_INTEGRATION_ENABLED=false.
const explicitFlag = process.env.RG_INTEGRATION_ENABLED;
const enabled =
  typeof explicitFlag === "string"
    ? truthy(explicitFlag)
    : Boolean(baseUrlRaw && apiKey);

export const rgIntegrationConfig = {
  enabled,
  baseUrl: baseUrlRaw,
  apiKey,
  webhookSecret,
  defaultCategoryId,
  requestTimeoutMs: Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0
    ? requestTimeoutMs
    : 15000,
} as const;

export type RGIntegrationConfig = typeof rgIntegrationConfig;

/**
 * Devuelve los faltantes principales para diagnóstico de salud.
 */
export function getRGConfigStatus() {
  return {
    enabled: rgIntegrationConfig.enabled,
    hasBaseUrl: Boolean(rgIntegrationConfig.baseUrl),
    hasApiKey: Boolean(rgIntegrationConfig.apiKey),
    hasWebhookSecret: Boolean(rgIntegrationConfig.webhookSecret),
    baseUrl: rgIntegrationConfig.baseUrl || null,
  };
}
