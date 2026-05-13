import { Request, Response } from "express";
import { ExternalAuthRequest } from "@middlewares/externalAuth";
import {
  pullCatalog,
  upsertProductsFromRG,
  RGStockSyncItem,
} from "@services/rgIntegration.service";
import { logIntegrationEvent, IntegrationLog } from "@models/IntegrationLog";
import { getRGConfigStatus, rgIntegrationConfig } from "@config/rgIntegration";

/**
 * Endpoints del módulo de integración con Río Gestión.
 *
 *  - POST /external/rg/webhook/stock  → recibe webhooks de RG (HMAC verificado)
 *  - POST /external/rg/pull           → fuerza un pull manual (api-key)
 *  - GET  /external/rg/status         → diagnóstico (api-key)
 *  - GET  /external/rg/logs           → últimos eventos (api-key)
 */

/**
 * Recibe webhooks de RG con eventos:
 *   - `stock.updated`    → { items: [...] }
 *   - `stock.full_sync`  → { items: [...] }
 *
 * Requiere firma HMAC válida (chequeada en el middleware).
 */
export const receiveStockWebhook = async (
  req: ExternalAuthRequest,
  res: Response
): Promise<void> => {
  const body = req.body || {};
  const event = String(body.event || "").trim();
  const data = body.data || {};
  const items: RGStockSyncItem[] = Array.isArray(data.items) ? data.items : [];

  // Aceptamos solo eventos conocidos pero respondemos 200 a cualquiera
  // (RG no debería reintentar webhooks por eventos desconocidos).
  if (!event || (event !== "stock.updated" && event !== "stock.full_sync")) {
    await logIntegrationEvent({
      direction: "INBOUND",
      eventType: event || "unknown",
      status: "PARTIAL",
      payload: { received: items.length },
      errorMessage: "Evento ignorado",
    });
    res.status(200).json({ ok: true, ignored: true, event });
    return;
  }

  const report = await upsertProductsFromRG(items);

  await logIntegrationEvent({
    direction: "INBOUND",
    eventType: event,
    status: report.errors > 0 ? "PARTIAL" : "SUCCESS",
    payload: { received: items.length, timestamp: body.timestamp || null },
    responseBody: report,
  });

  res.status(200).json({ ok: true, event, report });
};

/**
 * Dispara un pull completo del catálogo desde RG.
 */
export const triggerManualPull = async (
  _req: Request,
  res: Response
): Promise<void> => {
  const result = await pullCatalog();
  res.status(result.ok ? 200 : 502).json({ success: result.ok, ...result });
};

/**
 * Devuelve el estado de configuración del módulo (sin filtrar secretos).
 */
export const getIntegrationStatus = async (
  _req: Request,
  res: Response
): Promise<void> => {
  const config = getRGConfigStatus();
  const [lastInbound, lastOutbound] = await Promise.all([
    IntegrationLog.findOne({ direction: "INBOUND" }).sort({ createdAt: -1 }).lean(),
    IntegrationLog.findOne({ direction: "OUTBOUND" }).sort({ createdAt: -1 }).lean(),
  ]);
  res.json({
    success: true,
    config,
    timeoutMs: rgIntegrationConfig.requestTimeoutMs,
    lastInbound: lastInbound
      ? {
          eventType: lastInbound.eventType,
          status: lastInbound.status,
          createdAt: lastInbound.createdAt,
        }
      : null,
    lastOutbound: lastOutbound
      ? {
          eventType: lastOutbound.eventType,
          status: lastOutbound.status,
          httpStatus: lastOutbound.httpStatus,
          createdAt: lastOutbound.createdAt,
        }
      : null,
  });
};

/**
 * Lista los últimos N eventos de integración (default 50, máx 200).
 */
export const listIntegrationLogs = async (
  req: Request,
  res: Response
): Promise<void> => {
  const limit = Math.min(
    Math.max(parseInt(String(req.query.limit || "50"), 10) || 50, 1),
    200
  );
  const direction = req.query.direction
    ? String(req.query.direction).toUpperCase()
    : null;

  const filter: any = {};
  if (direction === "INBOUND" || direction === "OUTBOUND") {
    filter.direction = direction;
  }

  const logs = await IntegrationLog.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  res.json({ success: true, count: logs.length, logs });
};
