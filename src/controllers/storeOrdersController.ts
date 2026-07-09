import { Request, Response } from "express";
import {
  getRioGestionClient,
  RGIntegrationDisabledError,
  RGUpstreamError,
} from "../integrations/rg/RioGestionClient";
import { domainBus } from "../realtime/domainBus";
import { logIntegrationEvent } from "@models/IntegrationLog";

/**
 * BFF: punto único de entrada del frontend para crear pedidos.
 *
 * El front NO conoce ni la URL ni la API key de RG WEB. Todo el contrato
 * con el ERP se mantiene aquí.
 *
 * - Idempotencia: se propaga `externalOrderId` como `Idempotency-Key`.
 * - Auditoría: cada intento queda en `IntegrationLog`.
 * - Notificación: éxito dispara `orders.created` en el domainBus.
 */

interface StoreOrderItemDTO {
  productoId?: number;
  sku?: string;
  nombre?: string;
  cantidad: number;
  precioUnitario: number;
  descuento?: number;
  ivaAlicuota?: number;
  subtotal?: number;
}

interface StoreOrderDTO {
  externalOrderId: string;
  tiendaOrigen?: string;
  fechaPedido?: string;
  moneda?: "ARS" | "USD";
  cliente?: Record<string, unknown>;
  items: StoreOrderItemDTO[];
  pago?: Record<string, unknown>;
  envio?: Record<string, unknown>;
  totales?: { subtotal?: number; descuentos?: number; costoEnvio?: number; ivaTotal?: number; total?: number };
  observaciones?: string;
}

interface RGStoreOrderResponse {
  status: "RECEIVED" | "DUPLICATE" | "SKIPPED" | "INVALID";
  tiendaOrderId?: number;
  estado?: "PENDIENTE" | "PROCESADO" | "FACTURADO" | "CANCELADO";
  message?: string;
}

const DEFAULT_TIENDA_ORIGEN = process.env.RG_TIENDA_ORIGEN || "tricarios";

function validatePayload(body: unknown): { ok: true; data: StoreOrderDTO } | { ok: false; message: string } {
  if (!body || typeof body !== "object") return { ok: false, message: "Body inválido" };
  const b = body as Partial<StoreOrderDTO>;

  if (!b.externalOrderId || typeof b.externalOrderId !== "string" || b.externalOrderId.length > 80) {
    return { ok: false, message: "externalOrderId requerido (string, 1-80)" };
  }
  if (!Array.isArray(b.items) || b.items.length === 0) {
    return { ok: false, message: "items requerido (array no vacío)" };
  }
  for (const it of b.items) {
    if (!it || typeof it !== "object") return { ok: false, message: "items: elemento inválido" };
    if (typeof it.cantidad !== "number" || it.cantidad <= 0) {
      return { ok: false, message: "items[].cantidad debe ser número positivo" };
    }
    if (typeof it.precioUnitario !== "number" || it.precioUnitario < 0) {
      return { ok: false, message: "items[].precioUnitario debe ser número >= 0" };
    }
  }
  return { ok: true, data: b as StoreOrderDTO };
}

export async function createStoreOrder(req: Request, res: Response): Promise<void> {
  const validation = validatePayload(req.body);
  if (!validation.ok) {
    res.status(400).json({ success: false, message: validation.message });
    return;
  }

  const payload: StoreOrderDTO = {
    tiendaOrigen: DEFAULT_TIENDA_ORIGEN,
    fechaPedido: new Date().toISOString(),
    ...validation.data,
  };

  const started = Date.now();
  try {
    const client = getRioGestionClient();
    const result = await client.post<RGStoreOrderResponse>(
      "/api/external/tienda-orders",
      payload,
      { idempotencyKey: payload.externalOrderId, retries: 2 }
    );

    await logIntegrationEvent({
      direction: "OUTBOUND",
      eventType: "order.push",
      status: "SUCCESS",
      targetUrl: "/api/external/tienda-orders",
      payload: { externalOrderId: payload.externalOrderId, items: payload.items.length },
      responseBody: result,
      durationMs: Date.now() - started,
    });

    // Proyecta el evento de dominio (transports se encargan de Socket.IO).
    domainBus.emit("orders.created", {
      externalOrderId: payload.externalOrderId,
      tiendaOrderId: result?.tiendaOrderId,
      userId: (req as any).user?.id,
      total: payload.totales?.total,
      status: result?.status ?? "RECEIVED",
      occurredAt: new Date().toISOString(),
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    const isDisabled = err instanceof RGIntegrationDisabledError;
    const isUpstream = err instanceof RGUpstreamError;
    const status = isDisabled ? 503 : isUpstream ? 502 : 500;
    const message = (err as Error)?.message ?? "Error desconocido";

    await logIntegrationEvent({
      direction: "OUTBOUND",
      eventType: "order.push",
      status: "ERROR",
      httpStatus: isUpstream ? (err as RGUpstreamError).status ?? null : null,
      targetUrl: "/api/external/tienda-orders",
      payload: { externalOrderId: payload.externalOrderId, items: payload.items.length },
      responseBody: isUpstream ? (err as RGUpstreamError).body : null,
      errorMessage: message,
      durationMs: Date.now() - started,
    });

    res.status(status).json({ success: false, message });
  }
}
