import mongoose, { Document, Schema } from "mongoose";

/**
 * Bitácora de eventos de integración con sistemas externos (Río Gestión, etc.).
 *
 * - direction: INBOUND  → recibido desde un sistema externo (webhook, request)
 *              OUTBOUND → enviado hacia un sistema externo (push de orden, pull de catálogo)
 * - status:    SUCCESS / ERROR / PARTIAL
 * - eventType: clave descriptiva (ej: `stock.updated`, `order.pushed`, `catalog.pulled`)
 *
 * Los documentos expiran automáticamente a los 30 días.
 */
export interface IIntegrationLog extends Document {
  source: "rio_gestion" | "other";
  direction: "INBOUND" | "OUTBOUND";
  eventType: string;
  status: "SUCCESS" | "ERROR" | "PARTIAL";
  httpStatus?: number | null;
  targetUrl?: string | null;
  payload?: any;
  responseBody?: any;
  errorMessage?: string | null;
  durationMs?: number | null;
  createdAt: Date;
}

const IntegrationLogSchema: Schema = new Schema<IIntegrationLog>(
  {
    source: {
      type: String,
      enum: ["rio_gestion", "other"],
      default: "rio_gestion",
      index: true,
    },
    direction: {
      type: String,
      enum: ["INBOUND", "OUTBOUND"],
      required: true,
      index: true,
    },
    eventType: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["SUCCESS", "ERROR", "PARTIAL"],
      required: true,
      index: true,
    },
    httpStatus: { type: Number, default: null },
    targetUrl: { type: String, default: null },
    payload: { type: Schema.Types.Mixed, default: null },
    responseBody: { type: Schema.Types.Mixed, default: null },
    errorMessage: { type: String, default: null },
    durationMs: { type: Number, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// TTL: 30 días
IntegrationLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export const IntegrationLog = mongoose.model<IIntegrationLog>(
  "IntegrationLog",
  IntegrationLogSchema
);

/**
 * Helper "fire and forget" para escribir un log sin propagar errores.
 */
export async function logIntegrationEvent(
  entry: Omit<Partial<IIntegrationLog>, keyof Document> & {
    direction: IIntegrationLog["direction"];
    eventType: string;
    status: IIntegrationLog["status"];
  }
): Promise<void> {
  try {
    await IntegrationLog.create({ source: "rio_gestion", ...entry });
  } catch (err) {
    // Nunca debe afectar el flujo principal.
    console.error("[IntegrationLog] error guardando log:", (err as Error).message);
  }
}
