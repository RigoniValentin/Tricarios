import { Request, Response } from "express";
import Product from "@models/Product";
import { getRGConfigStatus } from "@config/rgIntegration";
import { IntegrationLog } from "@models/IntegrationLog";
import { pullCatalog } from "@services/rgIntegration.service";

/**
 * Controladores wrapper para que el panel admin (autenticado con JWT)
 * pueda consultar y disparar la integración RG WEB sin necesitar la
 * api-key compartida que usa el módulo `/external/rg/*`.
 *
 * Estos endpoints normalizan la respuesta al shape que consume el
 * frontend (`RGWebStatus` y `RGWebSyncResult`).
 */

interface RGAdminStatus {
  configured: boolean;
  online: boolean;
  baseUrl?: string;
  lastSyncAt?: string;
  lastSyncDurationMs?: number;
  errors?: string[];
  totals?: {
    linkedProducts: number;
    unlinkedProducts: number;
    totalProducts: number;
  };
}

interface RGAdminSyncResult {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  updatedProducts: number;
  createdProducts: number;
  failedProducts: number;
  message?: string;
}

/**
 * GET /api/v1/integrations/rgweb/status
 * Devuelve estado de configuración + últimas estadísticas + conteos de
 * productos vinculados (los que tienen `managementId`).
 */
export const getRGWebStatusForAdmin = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const config = getRGConfigStatus();
    const configured = Boolean(
      config?.enabled && config?.hasBaseUrl && config?.hasApiKey
    );

    const [lastOutbound, totalProducts, linkedProducts] = await Promise.all([
      IntegrationLog.findOne({ direction: "OUTBOUND" })
        .sort({ createdAt: -1 })
        .lean(),
      Product.countDocuments({}),
      Product.countDocuments({
        managementId: { $exists: true, $ne: null, $gt: 0 },
      }),
    ]);

    const status: RGAdminStatus = {
      configured,
      online: configured,
      baseUrl: config?.baseUrl || undefined,
      lastSyncAt: lastOutbound?.createdAt
        ? new Date(lastOutbound.createdAt as unknown as string).toISOString()
        : undefined,
      totals: {
        totalProducts,
        linkedProducts,
        unlinkedProducts: totalProducts - linkedProducts,
      },
    };

    if (!configured) {
      status.errors = [
        "Faltan variables de entorno: RG_API_BASE_URL y/o RG_API_KEY",
      ];
    }

    res.json({ success: true, data: status });
  } catch (err) {
    console.error("[rgWebAdmin] getStatus error", err);
    const status: RGAdminStatus = {
      configured: false,
      online: false,
      errors: [err instanceof Error ? err.message : "Error desconocido"],
    };
    res.status(200).json({ success: false, data: status });
  }
};

/**
 * POST /api/v1/integrations/rgweb/sync
 * Body: { direction: "pull" | "push" | "both" }
 *
 * Por ahora solo soporta "pull" (RG → Tienda) usando `pullCatalog`.
 * Para "push" y "both" devuelve un mensaje informando que está en
 * roadmap, pero conserva el contrato del frontend para no romper UI.
 */
export const triggerRGWebSyncForAdmin = async (
  req: Request,
  res: Response
): Promise<void> => {
  const startedAt = new Date().toISOString();
  const direction = String(req.body?.direction || "pull").toLowerCase();

  if (direction !== "pull" && direction !== "push" && direction !== "both") {
    const result: RGAdminSyncResult = {
      ok: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      updatedProducts: 0,
      createdProducts: 0,
      failedProducts: 0,
      message: `Dirección inválida: ${direction}`,
    };
    res.status(400).json({ success: false, data: result });
    return;
  }

  if (direction === "push" || direction === "both") {
    const result: RGAdminSyncResult = {
      ok: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      updatedProducts: 0,
      createdProducts: 0,
      failedProducts: 0,
      message:
        "Push y bidireccional aún no implementados. Por ahora solo está disponible RG → Tienda (pull).",
    };
    res.status(200).json({ success: false, data: result });
    return;
  }

  try {
    const pull = await pullCatalog();
    const report = pull.report;
    const result: RGAdminSyncResult = {
      ok: Boolean(pull.ok),
      startedAt,
      finishedAt: new Date().toISOString(),
      updatedProducts: report?.updated ?? 0,
      createdProducts: 0,
      failedProducts: report?.errors ?? 0,
      message: pull.message,
    };
    res.status(pull.ok ? 200 : 502).json({ success: pull.ok, data: result });
  } catch (err) {
    console.error("[rgWebAdmin] triggerSync error", err);
    const result: RGAdminSyncResult = {
      ok: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      updatedProducts: 0,
      createdProducts: 0,
      failedProducts: 0,
      message: err instanceof Error ? err.message : "Error desconocido",
    };
    res.status(500).json({ success: false, data: result });
  }
};
