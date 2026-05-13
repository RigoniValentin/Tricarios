import { Router } from "express";
import {
  verifyRGApiKey,
  verifyRGSignature,
} from "@middlewares/externalAuth";
import {
  receiveStockWebhook,
  triggerManualPull,
  getIntegrationStatus,
  listIntegrationLogs,
} from "@controllers/externalSyncController";

/**
 * Rutas del módulo de integración con sistemas externos.
 * Se montan en `/api/v1/external`.
 */
const router = Router();

// ── Río Gestión ─────────────────────────────────────────────────────────────

/**
 * Webhook entrante de RG.
 * Requiere firma HMAC válida (X-RG-Signature) sobre el raw body.
 * NO usa api-key porque RG puede llamar desde IPs cambiantes.
 */
router.post("/rg/webhook/stock", verifyRGSignature, receiveStockWebhook);

/**
 * Forzar pull del catálogo desde RG.
 * Protegido por api-key compartida.
 */
router.post("/rg/pull", verifyRGApiKey, triggerManualPull);

/**
 * Diagnóstico de configuración + últimos eventos.
 */
router.get("/rg/status", verifyRGApiKey, getIntegrationStatus);

/**
 * Listado paginado de eventos de bitácora.
 *  GET /rg/logs?limit=50&direction=INBOUND
 */
router.get("/rg/logs", verifyRGApiKey, listIntegrationLogs);

export default router;
